import type { AuthenticatedUser, Env } from "./types";
import { HttpError, json, randomToken, safeEqual, sha256 } from "./security";
import { audit } from "./audit";
import { hashInviteToken, requireRole } from "./auth";

export const COMMANDER_CAPACITY = 5;

/**
 * ป้ายเรียก (call sign) — ใช้อ้างถึงผู้ประกาศโดยไม่เปิดเผยตัวตน
 * ได้จาก SHA-256 ของ identity hash จึงย้อนกลับไปหาอีเมลไม่ได้
 * ตั้งใจให้ต่างจาก identity_hash เพื่อไม่ให้ค่าที่แสดงบนจอเป็นชิ้นส่วนของกุญแจจริง
 */
export async function callSignFor(identityHash: string): Promise<string> {
  const digest = await sha256(`callsign:${identityHash}`);
  return `CMD-${digest.replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase()}`;
}

async function commanderCapacity(env: Env): Promise<{ active: number; pending: number; free: number }> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'commander' AND active = 1) AS active,
       (SELECT COUNT(*) FROM commander_invites
        WHERE used_at IS NULL AND expires_at > ?) AS pending`,
  )
    .bind(new Date().toISOString())
    .first<{ active: number; pending: number }>();
  const active = row?.active ?? 0;
  const pending = row?.pending ?? 0;
  return { active, pending, free: Math.max(0, COMMANDER_CAPACITY - active - pending) };
}

/* ─────────────────────────── ข้อ 4: หมุนเวียนผู้ประกาศ ─────────────────────────── */

/** รายชื่อผู้ประกาศในรูปป้ายเรียก — ไม่มีอีเมล ไม่มีชื่อจริง */
export async function commanderRoster(env: Env, user: AuthenticatedUser): Promise<Response> {
  requireRole(user, ["commander"]);
  const rows = await env.DB.prepare(
    `SELECT call_sign AS callSign, created_at AS createdAt, last_login_at AS lastLoginAt,
            COALESCE(commander_order, 999) AS notifyOrder
     FROM users WHERE role = 'commander' AND active = 1
     ORDER BY COALESCE(commander_order, 999), created_at`,
  ).all<{ callSign: string; createdAt: string; lastLoginAt: string; notifyOrder: number }>();
  const capacity = await commanderCapacity(env);
  const pending = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM commander_revocations WHERE created_at > ?`,
  )
    .bind(new Date(Date.now() - 7 * 86_400_000).toISOString())
    .first<{ n: number }>();
  return json({
    you: await callSignFor(user.identityHash),
    capacity,
    commanders: rows.results,
    pendingRevocationApprovals: pending?.n ?? 0,
  });
}

/**
 * ถอดถอนผู้ประกาศ — ต้องอนุมัติจากผู้ประกาศ 2 คนที่ต่างกัน
 * ใช้กติกาเดียวกับการยุติการฝึกซ้อม เพราะเป็นการเปลี่ยนโครงสร้างอำนาจสั่งการเช่นกัน
 * ถอดถอนตัวเองได้ทันทีโดยไม่ต้องรอคนที่สอง (ครูย้ายโรงเรียนควรปลดตัวเองได้)
 */
export async function revokeCommander(
  input: { callSign?: string },
  env: Env,
  user: AuthenticatedUser,
): Promise<Response> {
  requireRole(user, ["commander"]);
  const target = String(input.callSign ?? "").trim().toUpperCase();
  if (!/^CMD-[A-Z0-9]{5}$/.test(target)) throw new HttpError(400, "ป้ายเรียกไม่ถูกต้อง");

  const row = await env.DB.prepare(
    "SELECT identity_hash AS identityHash FROM users WHERE call_sign = ? AND role = 'commander' AND active = 1",
  )
    .bind(target)
    .first<{ identityHash: string }>();
  if (!row) throw new HttpError(404, "ไม่พบผู้ประกาศตามป้ายเรียกนี้");

  const selfRevoke = row.identityHash === user.identityHash;
  const now = new Date().toISOString();

  if (!selfRevoke) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO commander_revocations (target_call_sign, approver_identity_hash, created_at)
       VALUES (?, ?, ?)`,
    )
      .bind(target, user.identityHash, now)
      .run();
    const approvals = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM commander_revocations WHERE target_call_sign = ?",
    )
      .bind(target)
      .first<{ n: number }>();
    const count = approvals?.n ?? 0;
    await audit(env, user, "APPROVE_COMMANDER_REVOCATION", "user", target, { approvals: count });
    if (count < 2) {
      return json({ ok: true, revoked: false, approvals: count, approvalsRequired: 2 - count });
    }
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET role = 'member', call_sign = NULL WHERE identity_hash = ?").bind(
      row.identityHash,
    ),
    env.DB.prepare("DELETE FROM commander_revocations WHERE target_call_sign = ?").bind(target),
  ]);
  await audit(env, user, "REVOKE_COMMANDER", "user", target, { selfRevoke });
  const capacity = await commanderCapacity(env);
  return json({ ok: true, revoked: true, callSign: target, capacity });
}

/**
 * ออกรหัสเชิญทดแทนเมื่อมีที่ว่าง — ผู้ประกาศคนใดคนหนึ่งออกได้
 * ไม่ต้องใช้ 2 คน เพราะ trigger commander_capacity_on_invite เป็นเพดานที่บังคับที่ฐานข้อมูลอยู่แล้ว
 */
export async function reinviteCommander(env: Env, user: AuthenticatedUser): Promise<Response> {
  requireRole(user, ["commander"]);
  const capacity = await commanderCapacity(env);
  if (capacity.free < 1) {
    throw new HttpError(409, `ครบจำนวนแล้ว (${capacity.active} คน + รออีก ${capacity.pending}) ต้องถอดถอนก่อน`);
  }
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60_000).toISOString();
  try {
    await env.DB.prepare(
      "INSERT INTO commander_invites (token_hash, expires_at, created_at) VALUES (?, ?, ?)",
    )
      .bind(await hashInviteToken(token), expiresAt, new Date().toISOString())
      .run();
  } catch {
    throw new HttpError(409, "ฐานข้อมูลปฏิเสธ เกินจำนวนผู้ประกาศที่อนุญาต");
  }
  await audit(env, user, "CREATE_COMMANDER_REINVITE", "system", "commander-roster", {});
  return json({
    invite: token,
    expiresAt,
    warning: "รหัสจะแสดงครั้งเดียว ส่งให้ผู้รับเป็นการส่วนตัวเท่านั้น",
  });
}

/* ─────────────────────────── บทบาทครู (ยังไม่เปิดใช้) ───────────────────────────
   v0.3.0 ถอดระบบเช็กชื่อรายห้องออกเพื่อให้ระบบกระชับ ฟังก์ชันนี้จึงยังไม่ถูกผูกกับเส้นทาง API
   เก็บไว้เพื่อเปิดใช้ทันทีเมื่อนำระบบเช็กชื่อกลับมา — ดูวิธีคืนค่าใน README-LEAN.md            */

/**
 * ครูยืนยันบทบาทตนเองด้วยรหัสที่แจกในที่ประชุมบุคลากร
 *
 * เหตุผลที่ไม่ใช้วิธีให้ผู้ดูแลตั้งให้ทีละคน: ระบบนี้ไม่เก็บอีเมลเป็นข้อความธรรมดา
 * ผู้ดูแลจึงค้นหาบุคคลไม่ได้เลยตามการออกแบบเดิม
 *
 * ข้อแลกเปลี่ยนที่ต้องยอมรับ: ถ้ารหัสหลุด นักเรียนอาจได้บทบาทครู
 * จึงจำกัดสิทธิ์ของบทบาทนี้ไว้ที่ "ส่งผลเช็กชื่อรายห้อง" เท่านั้น
 * ประกาศเหตุไม่ได้ เห็นข้อมูลรายบุคคลไม่ได้ และทุกครั้งถูกบันทึกใน audit_log
 */
export async function claimTeacherRole(
  input: { code?: string },
  env: Env,
  user: AuthenticatedUser,
): Promise<Response> {
  if (user.role === "commander" || user.role === "security") {
    return json({ ok: true, role: user.role, note: "บทบาทปัจจุบันครอบคลุมสิทธิ์ครูอยู่แล้ว" });
  }
  if (!env.TEACHER_CODE) throw new HttpError(503, "ยังไม่ได้ตั้งรหัสยืนยันบทบาทครู");
  if (!input.code || !(await safeEqual(input.code, env.TEACHER_CODE))) {
    await audit(env, user, "CLAIM_TEACHER_ROLE_FAILED", "user", "self", {});
    throw new HttpError(403, "รหัสยืนยันบทบาทครูไม่ถูกต้อง");
  }
  await env.DB.prepare("UPDATE users SET role = 'teacher' WHERE identity_hash = ? AND role = 'member'")
    .bind(user.identityHash)
    .run();
  await audit(env, user, "CLAIM_TEACHER_ROLE", "user", "self", {});
  return json({ ok: true, role: "teacher" });
}

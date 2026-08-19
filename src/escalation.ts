import webpush from "web-push";
import type { AuthenticatedUser, EscalationJob, Env, PushSubscriptionRow } from "./types";
import { HttpError, json } from "./security";
import { audit } from "./audit";
import { requireRole } from "./auth";

/**
 * การไล่ระดับแจ้งเหตุถึงผู้ประกาศทีละคน
 *
 * เมื่อมีผู้ใช้ส่งรายงานเข้ามา ระบบจะแจ้งผู้ประกาศลำดับที่ 1 ก่อน
 * ถ้าไม่มีใครกด "รับเรื่อง" ภายในเวลาที่กำหนด จะไล่ไปลำดับถัดไปจนถึงคนที่ 5
 *
 * เหตุผลที่ต้องมี: ของเดิมรายงานจากผู้ใช้ถูกบันทึกลงฐานข้อมูลเฉย ๆ
 * ไม่มีใครรู้จนกว่าจะมีคนเปิดกระดานดู ซึ่งในเหตุจริงอาจสายเกินไป
 *
 * ใช้ FANOUT_QUEUE ที่มีอยู่แล้วพร้อม delaySeconds จึงไม่ต้องสร้างคิวใหม่
 * และไม่ต้องเพิ่ม Durable Object class
 */

const REPORT_LABEL: Record<string, string> = {
  VIOLENCE: "เหตุความรุนแรง",
  WEAPON: "พบสิ่งที่อาจเป็นอาวุธ",
  SUSPICIOUS: "บุคคลหรือเหตุการณ์น่าสงสัย",
  MEDICAL: "เหตุฉุกเฉินทางการแพทย์",
  OTHER: "เหตุอื่น ๆ",
};

const stepSeconds = (env: Env): number =>
  Math.max(5, Number(env.ESCALATION_STEP_SECONDS ?? "10"));

/** เริ่มไล่ระดับทันทีที่มีรายงานเข้ามา */
export async function startEscalation(env: Env, reportId: string): Promise<void> {
  await env.FANOUT_QUEUE.send({ kind: "escalate", reportId, step: 1 });
}

interface ReportRow {
  id: string;
  type: string;
  zone: string;
  note: string;
  status: string;
  created_at: string;
  claimed_at: string | null;
}

export async function handleEscalation(message: Message<EscalationJob>, env: Env): Promise<void> {
  const { reportId, step } = message.body;

  const report = await env.DB.prepare(
    `SELECT id, type, zone, note, status, created_at, claimed_at
     FROM reports WHERE id = ?`,
  )
    .bind(reportId)
    .first<ReportRow>();

  // รายงานถูกรับเรื่องแล้ว หรือถูกปิดไปแล้ว — หยุดไล่ระดับ
  if (!report || report.claimed_at || report.status !== "NEW") {
    message.ack();
    return;
  }

  // ผู้ประกาศลำดับที่ step — เรียงตาม commander_order แล้วค่อยตามเวลาที่รับสิทธิ์
  const commander = await env.DB.prepare(
    `SELECT identity_hash AS identityHash, call_sign AS callSign
     FROM users
     WHERE role = 'commander' AND active = 1
     ORDER BY COALESCE(commander_order, 999), created_at
     LIMIT 1 OFFSET ?`,
  )
    .bind(step - 1)
    .first<{ identityHash: string; callSign: string | null }>();

  // ไล่ครบทุกคนแล้ว
  if (!commander) {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor_identity_hash, action, object_type, object_id, created_at, metadata_json)
       VALUES (?, 'system:maintenance', 'ESCALATION_EXHAUSTED', 'report', ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), reportId, new Date().toISOString(), JSON.stringify({ steps: step - 1 }))
      .run();
    message.ack();
    return;
  }

  const devices = await env.DB.prepare(
    `SELECT id, endpoint, p256dh, auth, zone, active
     FROM push_subscriptions WHERE identity_hash = ? AND active = 1`,
  )
    .bind(commander.identityHash)
    .all<PushSubscriptionRow>();

  const label = REPORT_LABEL[report.type] ?? report.type;
  const payload = {
    kind: "report",
    reportId: report.id,
    title: `แจ้งเหตุจากผู้ใช้ · ${label}`,
    body: `${report.zone}${report.note ? " — " + report.note : ""}\nกดเพื่อรับเรื่อง · เหตุด่วนโทร 191`,
    tag: `report-${report.id}`,
    url: `${env.PUBLIC_ORIGIN}/?report=${encodeURIComponent(report.id)}`,
  };

  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  let delivered = 0;
  for (const device of devices.results) {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify(payload),
        { TTL: 300, urgency: "high", topic: `rep${report.id.slice(-24)}` },
      );
      delivered += 1;
    } catch (error) {
      const status = error instanceof webpush.WebPushError ? error.statusCode : 0;
      if (status === 404 || status === 410) {
        await env.DB.prepare("UPDATE push_subscriptions SET active = 0 WHERE id = ?").bind(device.id).run();
      }
    }
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO report_escalations (report_id, step, identity_hash, devices, notified_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(reportId, step, commander.identityHash, delivered, new Date().toISOString())
    .run();

  // นัดไล่ระดับคนถัดไป ถ้ายังไม่มีใครรับเรื่องภายในเวลาที่กำหนด
  await env.FANOUT_QUEUE.send(
    { kind: "escalate", reportId, step: step + 1 },
    { delaySeconds: stepSeconds(env) },
  );
  message.ack();
}

/* ─────────────────────── ฝั่งผู้ประกาศ ─────────────────────── */

/** รายงานที่ยังไม่มีใครรับเรื่อง พร้อมบอกว่าไล่ระดับไปถึงคนที่เท่าไรแล้ว */
export async function openReports(env: Env, user: AuthenticatedUser): Promise<Response> {
  requireRole(user, ["commander"]);
  const rows = await env.DB.prepare(
    `SELECT r.id, r.type, r.zone, r.note, r.created_at AS createdAt,
            (SELECT MAX(step) FROM report_escalations e WHERE e.report_id = r.id) AS step
     FROM reports r
     WHERE r.status = 'NEW' AND r.claimed_at IS NULL
     ORDER BY r.created_at DESC LIMIT 20`,
  ).all();
  return json({ reports: rows.results });
}

/** กดรับเรื่อง — หยุดการไล่ระดับทันที */
export async function claimReport(
  reportId: string,
  env: Env,
  user: AuthenticatedUser,
): Promise<Response> {
  requireRole(user, ["commander"]);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE reports SET claimed_by_identity_hash = ?, claimed_at = ?, status = 'REVIEWED'
     WHERE id = ? AND claimed_at IS NULL`,
  )
    .bind(user.identityHash, now, reportId)
    .run();
  if ((result.meta.changes ?? 0) !== 1) throw new HttpError(409, "มีผู้ประกาศคนอื่นรับเรื่องนี้ไปแล้ว");
  await audit(env, user, "CLAIM_REPORT", "report", reportId, {});
  return json({ ok: true, reportId, claimedAt: now });
}

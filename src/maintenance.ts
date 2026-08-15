import type { Env } from "./types";
import { SYSTEM_ACTOR, auditAs } from "./audit";

const DAY_MS = 86_400_000;

/**
 * งานทำความสะอาดรายวัน (แก้ข้อ 5)
 *
 * หลักการ:
 *   - audit_log ไม่ถูกแตะต้องเลย เป็น append-only ตลอดอายุระบบ
 *     (trigger audit_log_no_delete จะ ABORT ถ้ามีใครพยายามลบ)
 *   - ลบตารางลูกก่อนตารางแม่เสมอ เพื่อไม่ให้ foreign key พัง
 *   - push_subscriptions ใช้วิธี "ปิดการใช้งาน" ไม่ใช่ลบ เพราะ delivery_log อ้างถึงอยู่
 */
export async function runMaintenance(env: Env): Promise<Record<string, number>> {
  const retentionDays = Math.max(30, Number(env.LOG_RETENTION_DAYS ?? "90"));
  const staleDays = Math.max(30, Number(env.SUBSCRIPTION_STALE_DAYS ?? "180"));
  const now = Date.now();
  const cutoff = new Date(now - retentionDays * DAY_MS).toISOString();
  const nonceCutoff = new Date(now - DAY_MS).toISOString();
  const staleCutoff = new Date(now - staleDays * DAY_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  const results = await env.DB.batch([
    // nonce ที่หมดอายุไม่มีค่าเชิงหลักฐาน ลบได้ทันที (ตารางนี้โตเร็วที่สุด)
    env.DB.prepare("DELETE FROM action_nonces WHERE expires_at < ?").bind(nonceCutoff),
    // อุปกรณ์ที่เงียบนานเกินไป ถือว่าไม่พร้อมรับแจ้งเตือน
    env.DB.prepare(
      "UPDATE push_subscriptions SET active = 0 WHERE active = 1 AND last_seen_at < ?",
    ).bind(staleCutoff),
    // ข้อมูลรายเหตุการณ์ที่พ้น retention — ลูกก่อน แม่ทีหลัง
    env.DB.prepare(
      "DELETE FROM delivery_log WHERE incident_id IN (SELECT id FROM incidents WHERE issued_at < ?)",
    ).bind(cutoff),
    env.DB.prepare(
      "DELETE FROM acknowledgements WHERE incident_id IN (SELECT id FROM incidents WHERE issued_at < ?)",
    ).bind(cutoff),
    env.DB.prepare(
      "DELETE FROM roll_calls WHERE incident_id IN (SELECT id FROM incidents WHERE issued_at < ?)",
    ).bind(cutoff),
    env.DB.prepare(
      "DELETE FROM incident_events WHERE incident_id IN (SELECT id FROM incidents WHERE issued_at < ?)",
    ).bind(cutoff),
    env.DB.prepare("DELETE FROM incidents WHERE issued_at < ?").bind(cutoff),
    // รายงานที่ปิดเรื่องแล้วเท่านั้น รายงานที่ยังไม่ได้ตรวจจะไม่ถูกลบ
    env.DB.prepare(
      "DELETE FROM reports WHERE created_at < ? AND status IN ('REVIEWED', 'DISMISSED')",
    ).bind(cutoff),
    // invite ที่หมดอายุโดยไม่ถูกใช้ ต้องลบเพื่อคืนความจุให้ roster (เกี่ยวกับข้อ 4)
    env.DB.prepare(
      "DELETE FROM commander_invites WHERE used_at IS NULL AND expires_at < ?",
    ).bind(nowIso),
    // คำขอถอดถอนที่ค้างเกิน 7 วัน ถือว่าตกไป
    env.DB.prepare("DELETE FROM commander_revocations WHERE created_at < ?").bind(
      new Date(now - 7 * DAY_MS).toISOString(),
    ),
  ]);

  const labels = [
    "action_nonces",
    "push_subscriptions_deactivated",
    "delivery_log",
    "acknowledgements",
    "roll_calls",
    "incident_events",
    "incidents",
    "reports",
    "commander_invites_expired",
    "commander_revocations_stale",
  ];
  const summary: Record<string, number> = { retentionDays };
  results.forEach((result, index) => {
    summary[labels[index]!] = result.meta.changes ?? 0;
  });

  await auditAs(env, SYSTEM_ACTOR, "RETENTION_SWEEP", "system", "maintenance", summary);
  return summary;
}

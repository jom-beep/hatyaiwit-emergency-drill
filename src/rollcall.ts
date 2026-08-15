import type { AuthenticatedUser, Env } from "./types";
import { HttpError, json } from "./security";
import { audit } from "./audit";
import { requireRole } from "./auth";

/**
 * ข้อ 6: การเช็กชื่อรายห้อง
 *
 * เหตุผลที่ต้องมี: ในเหตุการณ์จริง ข้อมูล "นักเรียนกดปุ่มรับทราบมากี่คน" มีค่าน้อยกว่า
 * "ห้องไหนล็อกประตูแล้ว ห้องไหนมีคนขาด" มาก เพราะเด็กจำนวนมากจะไม่กดปุ่ม
 * ทั้งเพราะตกใจ ไม่มีเครื่อง หรือถูกสั่งให้ปิดเสียงและวางโทรศัพท์
 */

const ROLL_CALL_ROLES = ["teacher", "security", "commander"] as const;

export async function submitRollCall(
  input: {
    incidentId?: string;
    room?: string;
    present?: number;
    injured?: number;
    missing?: number;
    secured?: boolean;
    note?: string;
  },
  env: Env,
  user: AuthenticatedUser,
): Promise<Response> {
  requireRole(user, [...ROLL_CALL_ROLES]);

  const incident = await env.DB.prepare(
    "SELECT id, status FROM incidents WHERE id = ?",
  )
    .bind(String(input.incidentId ?? ""))
    .first<{ id: string; status: string }>();
  if (!incident) throw new HttpError(404, "ไม่พบเหตุการณ์นี้");
  if (incident.status === "RESOLVED") throw new HttpError(409, "เหตุการณ์นี้ปิดแล้ว");

  const room = await env.DB.prepare("SELECT id FROM rooms WHERE id = ? AND active = 1")
    .bind(String(input.room ?? ""))
    .first<{ id: string }>();
  if (!room) throw new HttpError(400, "ไม่พบห้องนี้ในผังโรงเรียน");

  const toCount = (value: unknown): number => {
    const n = Number(value ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 500) throw new HttpError(400, "จำนวนคนไม่ถูกต้อง");
    return n;
  };
  const present = toCount(input.present);
  const injured = toCount(input.injured);
  const missing = toCount(input.missing);

  await env.DB.prepare(
    `INSERT INTO roll_calls
       (incident_id, room, reporter_identity_hash, present, injured, missing, secured, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(incident_id, room) DO UPDATE SET
       reporter_identity_hash = excluded.reporter_identity_hash,
       present = excluded.present,
       injured = excluded.injured,
       missing = excluded.missing,
       secured = excluded.secured,
       note = excluded.note,
       created_at = excluded.created_at`,
  )
    .bind(
      incident.id,
      room.id,
      user.identityHash,
      present,
      injured,
      missing,
      input.secured === false ? 0 : 1,
      String(input.note ?? "").trim().slice(0, 200),
      new Date().toISOString(),
    )
    .run();

  await audit(env, user, "SUBMIT_ROLL_CALL", "incident", incident.id, {
    room: room.id,
    present,
    injured,
    missing,
  });
  return json({ ok: true, room: room.id }, { status: 201 });
}

/** สรุปรายห้องสำหรับศูนย์ควบคุม — ไม่มีชื่อผู้รายงาน มีแต่ตัวเลขเชิงปฏิบัติการ */
export async function rollCallSummary(env: Env, incidentId: string) {
  const rooms = await env.DB.prepare(
    `SELECT r.id AS room, r.name_th AS name, r.zone,
            rc.present, rc.injured, rc.missing, rc.secured, rc.note, rc.created_at AS reportedAt
     FROM rooms r
     LEFT JOIN roll_calls rc ON rc.room = r.id AND rc.incident_id = ?
     WHERE r.active = 1
     ORDER BY r.zone, r.id`,
  )
    .bind(incidentId)
    .all();

  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS roomsReported,
            COALESCE(SUM(present), 0) AS present,
            COALESCE(SUM(injured), 0) AS injured,
            COALESCE(SUM(missing), 0) AS missing,
            COALESCE(SUM(CASE WHEN secured = 0 THEN 1 ELSE 0 END), 0) AS notSecured
     FROM roll_calls WHERE incident_id = ?`,
  )
    .bind(incidentId)
    .first();

  const roomCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM rooms WHERE active = 1").first<{ n: number }>();
  return { rooms: rooms.results, totals, roomsTotal: roomCount?.n ?? 0 };
}

export async function rollCallView(env: Env, user: AuthenticatedUser): Promise<Response> {
  requireRole(user, [...ROLL_CALL_ROLES]);
  const active = await env.DB.prepare(
    "SELECT id FROM incidents WHERE status <> 'RESOLVED' ORDER BY issued_at DESC LIMIT 1",
  ).first<{ id: string }>();
  if (!active) return json({ incidentId: null, rooms: [], totals: null, roomsTotal: 0 });
  return json({ incidentId: active.id, ...(await rollCallSummary(env, active.id)) });
}

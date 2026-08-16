/**
 * สร้างข้อมูลจำลองสำหรับการนำเสนอ
 * ใช้: node gen-demo-data.mjs <incident-id> [จำนวนอุปกรณ์] > demo-data.sql
 *
 * ต้องเริ่มการฝึกซ้อมจากหน้าเว็บก่อน แล้วเอา incident id มาใส่
 * เพราะสถานะเหตุอยู่ใน Durable Object ไม่ใช่ใน D1 — สร้างจาก SQL อย่างเดียวไม่พอ
 */
const incidentId = process.argv[2];
const devices = Number(process.argv[3] ?? 3400);
if (!incidentId) { console.error("ต้องระบุ incident id เช่น DRILL-20260815103000-a1b2c3d4"); process.exit(1); }

const now = new Date().toISOString();
const out = [];
const chunk = (rows, sql, size = 400) => {
  for (let i = 0; i < rows.length; i += size)
    out.push(`${sql}\n${rows.slice(i, i + size).join(",\n")};`);
};
const pad = (n) => String(n).padStart(5, "0");

out.push("-- ข้อมูลจำลองสำหรับการนำเสนอ ลบออกด้วย demo-reset.sql");
out.push(`-- เหตุการณ์: ${incidentId} · อุปกรณ์จำลอง: ${devices.toLocaleString()}`);

// ผู้ใช้จำลอง — คำนำหน้า demo: ทำให้ลบทิ้งทีหลังได้ง่าย
const users = [];
for (let i = 1; i <= devices; i++)
  users.push(`  ('demo:u${pad(i)}', 'demo:e${pad(i)}', 'member', 1, '${now}', '${now}')`);
chunk(users, "INSERT OR IGNORE INTO users (identity_hash, email_hash, role, active, created_at, last_login_at) VALUES");

// อุปกรณ์ — ใช้ endpoint ของ FCM ที่ไม่มีจริง ถ้าเผลอยิง push จะได้ 404 แล้วระบบปิดใช้งานเอง ไม่ retry วนซ้ำ
const subs = [];
for (let i = 1; i <= devices; i++) {
  const platform = i % 5 < 2 ? "ios" : "android";
  const zone = ["ALL", "BUILDING_1", "BUILDING_2", "BUILDING_3"][i % 4];
  subs.push(`  ('demo${pad(i)}', 'demo:u${pad(i)}', 'demoh${pad(i)}', 'https://fcm.googleapis.com/fcm/send/DEMO-${pad(i)}', 'p', 'a', '${platform}', '${zone}', 1, '${now}', '${now}')`);
}
chunk(subs, "INSERT OR IGNORE INTO push_subscriptions (id, identity_hash, endpoint_hash, endpoint, p256dh, auth, platform, zone, active, created_at, last_seen_at) VALUES");

// ผลการส่ง — สำเร็จ 99.3%
const sentCount = Math.round(devices * 0.993);
const delivery = [];
for (let i = 1; i <= devices; i++) {
  const ok = i <= sentCount;
  delivery.push(`  ('${incidentId}', 1, 'demo${pad(i)}', '${ok ? "SENT" : "FAILED"}', ${ok ? 201 : 410}, '${now}')`);
}
chunk(delivery, "INSERT OR REPLACE INTO delivery_log (incident_id, version, subscription_id, status, http_status, updated_at) VALUES");

// การตอบรับ — รับทราบ 62% ขอความช่วยเหลือ 7 ราย
const ackCount = Math.round(devices * 0.62);
const acks = [];
for (let i = 1; i <= ackCount; i++)
  acks.push(`  ('${incidentId}', 'demo:u${pad(i)}', 'ACK', 'ALL', '${now}')`);
for (let i = ackCount + 1; i <= ackCount + 7; i++)
  acks.push(`  ('${incidentId}', 'demo:u${pad(i)}', 'NEED_HELP', 'BUILDING_2', '${now}')`);
chunk(acks, "INSERT OR REPLACE INTO acknowledgements (incident_id, identity_hash, response, zone, created_at) VALUES");

// เช็กชื่อ 42 จาก 66 ห้อง — ผสมสถานะให้กระดานมีทั้งเขียว ส้ม แดง
const reported = [];
let n = 0;
for (let lv = 1; lv <= 6 && n < 42; lv++) {
  for (let r = 1; r <= 11 && n < 42; r++) {
    n++;
    const room = `M${lv}-${String(r).padStart(2, "0")}`;
    const injured = n % 14 === 0 ? 1 : 0;
    const missing = n % 9 === 0 ? 2 : 0;
    const secured = n % 11 === 0 ? 0 : 1;
    const present = 28 + (n % 6);
    reported.push(`  ('${incidentId}', '${room}', 'demo:u00001', ${present}, ${injured}, ${missing}, ${secured}, '', '${now}')`);
  }
}
chunk(reported, "INSERT OR REPLACE INTO roll_calls (incident_id, room, reporter_identity_hash, present, injured, missing, secured, note, created_at) VALUES");

console.log(out.join("\n\n"));

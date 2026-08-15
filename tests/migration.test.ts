import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * ทดสอบ invariant ที่บังคับอยู่ที่ฐานข้อมูล (migration 0002)
 * ใช้ SQLite ในหน่วยความจำ จึงไม่ต้องต่อ D1 จริง
 */
const SCHEMA = ["migrations/0001_schema.sql", "migrations/0002_rotation_rollcall_retention.sql"]
  .map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
  .join("\n");

const NOW = new Date().toISOString();
const FUTURE = new Date(Date.now() + 72 * 3_600_000).toISOString();
let db: DatabaseSync;

function addUser(identityHash: string, role = "member"): void {
  db.prepare(
    `INSERT INTO users (identity_hash, email_hash, role, active, created_at, last_login_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run(identityHash, `email-${identityHash}`, role, NOW, NOW);
}

function addInvite(tokenHash: string, expiresAt = FUTURE): void {
  db.prepare("INSERT INTO commander_invites (token_hash, expires_at, created_at) VALUES (?, ?, ?)")
    .run(tokenHash, expiresAt, NOW);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
});

describe("ความจุผู้ประกาศ (ข้อ 4)", () => {
  it("ปฏิเสธรหัสเชิญเมื่อมีผู้ประกาศครบ 5 คนแล้ว", () => {
    for (let i = 1; i <= 5; i += 1) addUser(`C${i}`, "commander");
    expect(() => addInvite("t1")).toThrow(/capacity/);
  });

  it("ออกรหัสเชิญทดแทนได้หลังถอดถอนผู้ประกาศหนึ่งคน", () => {
    for (let i = 1; i <= 5; i += 1) addUser(`C${i}`, "commander");
    db.prepare("UPDATE users SET role = 'member', call_sign = NULL WHERE identity_hash = 'C5'").run();
    expect(() => addInvite("t1")).not.toThrow();
  });

  it("นับรหัสเชิญที่ยังไม่ถูกใช้เป็นความจุด้วย", () => {
    for (let i = 1; i <= 4; i += 1) addUser(`C${i}`, "commander");
    addInvite("t1");
    expect(() => addInvite("t2")).toThrow(/capacity/);
  });

  it("ไม่นับรหัสเชิญที่หมดอายุแล้ว", () => {
    for (let i = 1; i <= 4; i += 1) addUser(`C${i}`, "commander");
    addInvite("t1", new Date(Date.now() - 1000).toISOString());
    expect(() => addInvite("t2")).not.toThrow();
  });

  it("ยังกันการเลื่อนขั้นเป็นผู้ประกาศคนที่ 6", () => {
    for (let i = 1; i <= 5; i += 1) addUser(`C${i}`, "commander");
    addUser("M1");
    expect(() => db.prepare("UPDATE users SET role = 'commander' WHERE identity_hash = 'M1'").run())
      .toThrow(/commander limit/);
  });
});

describe("เช็กชื่อรายห้อง (ข้อ 6)", () => {
  beforeEach(() => {
    addUser("T1", "teacher");
    db.prepare(
      `INSERT INTO incidents (id, version, mode, type, status, zone, title, instruction,
                              issued_at, expires_at, issued_by_identity_hash)
       VALUES ('D1', 1, 'DRILL', 'LOCKDOWN', 'ACTIVE', 'ALL', 't', 'i', ?, ?, 'T1')`,
    ).run(NOW, FUTURE);
  });

  const submit = (present: number, injured: number, missing: number) =>
    db.prepare(
      `INSERT INTO roll_calls (incident_id, room, reporter_identity_hash, present, injured, missing, secured, note, created_at)
       VALUES ('D1', 'B1-101', 'T1', ?, ?, ?, 1, '', ?)
       ON CONFLICT(incident_id, room) DO UPDATE SET
         present = excluded.present, injured = excluded.injured,
         missing = excluded.missing, created_at = excluded.created_at`,
    ).run(present, injured, missing, NOW);

  it("รายงานซ้ำแล้วค่าล่าสุดทับของเดิม ไม่เกิดแถวซ้อน", () => {
    submit(30, 0, 2);
    submit(31, 1, 0);
    const rows = db.prepare("SELECT present, injured, missing FROM roll_calls").all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ present: 31, injured: 1, missing: 0 });
  });

  it("ปฏิเสธห้องที่ไม่มีในผังโรงเรียน", () => {
    expect(() =>
      db.prepare(
        `INSERT INTO roll_calls (incident_id, room, reporter_identity_hash, present, created_at)
         VALUES ('D1', 'NO-SUCH-ROOM', 'T1', 10, ?)`,
      ).run(NOW),
    ).toThrow();
  });
});

describe("การเก็บรักษาข้อมูล (ข้อ 5)", () => {
  it("ลำดับการลบของ cron ไม่ทำให้ foreign key พัง", () => {
    addUser("C1", "commander");
    db.prepare(
      `INSERT INTO incidents (id, version, mode, type, status, zone, title, instruction,
                              issued_at, expires_at, issued_by_identity_hash)
       VALUES ('D1', 1, 'DRILL', 'LOCKDOWN', 'ACTIVE', 'ALL', 't', 'i', ?, ?, 'C1')`,
    ).run(NOW, FUTURE);
    db.prepare(
      `INSERT INTO push_subscriptions (id, identity_hash, endpoint_hash, endpoint, p256dh, auth, created_at, last_seen_at)
       VALUES ('s1', 'C1', 'h', 'https://x', 'p', 'a', ?, ?)`,
    ).run(NOW, NOW);
    db.prepare(
      "INSERT INTO delivery_log (incident_id, version, subscription_id, status, updated_at) VALUES ('D1', 1, 's1', 'SENT', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO acknowledgements (incident_id, identity_hash, response, created_at) VALUES ('D1', 'C1', 'ACK', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO incident_events (id, incident_id, version, event_type, actor_identity_hash, created_at) VALUES ('e1', 'D1', 1, 'ACTIVATED', 'C1', ?)",
    ).run(NOW);

    const cutoff = new Date(Date.now() + 60_000).toISOString();
    const order = [
      "DELETE FROM delivery_log WHERE incident_id IN (SELECT id FROM incidents WHERE issued_at < ?)",
      "DELETE FROM acknowledgements WHERE incident_id IN (SELECT id FROM incidents WHERE issued_at < ?)",
      "DELETE FROM roll_calls WHERE incident_id IN (SELECT id FROM incidents WHERE issued_at < ?)",
      "DELETE FROM incident_events WHERE incident_id IN (SELECT id FROM incidents WHERE issued_at < ?)",
      "DELETE FROM incidents WHERE issued_at < ?",
    ];
    expect(() => order.forEach((sql) => db.prepare(sql).run(cutoff))).not.toThrow();
    expect(db.prepare("SELECT COUNT(*) AS n FROM incidents").get()).toMatchObject({ n: 0 });
  });

  it("audit_log ยังลบและแก้ไม่ได้แม้จะมีสิทธิ์เข้าถึงฐานข้อมูล", () => {
    addUser("C1", "commander");
    db.prepare(
      "INSERT INTO audit_log (id, actor_identity_hash, action, object_type, object_id, created_at) VALUES ('a1', 'C1', 'X', 't', 'o', ?)",
    ).run(NOW);
    expect(() => db.prepare("DELETE FROM audit_log").run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE audit_log SET action = 'Y'").run()).toThrow(/append-only/);
  });

  it("มีบัญชีระบบสำหรับ cron และบัญชีนั้นเข้าสู่ระบบไม่ได้", () => {
    const row = db.prepare("SELECT active FROM users WHERE identity_hash = 'system:maintenance'").get();
    expect(row).toMatchObject({ active: 0 });
  });
});

describe("ตัวตนที่ถูกสร้างใหม่ด้วยอีเมลเดิม (ข้อ 7)", () => {
  it("ปลดระวางแถวเดิมแล้วสร้างตัวตนใหม่ได้โดยไม่ชน UNIQUE", () => {
    addUser("OLD", "commander");
    db.prepare(
      "UPDATE users SET email_hash = 'retired:' || email_hash || ':' || ?, active = 0, call_sign = NULL WHERE identity_hash = 'OLD'",
    ).run(NOW);
    expect(() =>
      db.prepare(
        `INSERT INTO users (identity_hash, email_hash, role, active, created_at, last_login_at)
         VALUES ('NEW', 'email-OLD', 'member', 1, ?, ?)`,
      ).run(NOW, NOW),
    ).not.toThrow();
    expect(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'commander' AND active = 1").get())
      .toMatchObject({ n: 0 });
  });
});

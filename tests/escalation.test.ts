import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

/** ทดสอบตรรกะการไล่ระดับด้วย SQL ชุดเดียวกับที่ใช้จริงใน src/escalation.ts */
const SCHEMA = [
  "migrations/0001_schema.sql",
  "migrations/0002_rotation_rollcall_retention.sql",
  "migrations/0003_report_escalation.sql",
]
  .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8"))
  .join("\n");

const NOW = new Date().toISOString();
let db: DatabaseSync;

/** เลือกผู้ประกาศลำดับที่ step — ตรงกับคำสั่งใน handleEscalation */
const commanderAtStep = (step: number) =>
  db
    .prepare(
      `SELECT identity_hash AS identityHash FROM users
       WHERE role = 'commander' AND active = 1
       ORDER BY COALESCE(commander_order, 999), created_at
       LIMIT 1 OFFSET ?`,
    )
    .get(step - 1) as { identityHash: string } | undefined;

const claim = (reportId: string, who: string) =>
  db
    .prepare(
      `UPDATE reports SET claimed_by_identity_hash = ?, claimed_at = ?, status = 'REVIEWED'
       WHERE id = ? AND claimed_at IS NULL`,
    )
    .run(who, NOW, reportId).changes;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  for (let i = 1; i <= 5; i += 1) {
    db.prepare(
      `INSERT INTO users (identity_hash, email_hash, role, active, created_at, last_login_at, call_sign, commander_order)
       VALUES (?, ?, 'commander', 1, ?, ?, ?, ?)`,
    ).run(`C${i}`, `e${i}`, NOW, NOW, `CMD-000${i}`, i);
  }
  db.prepare(
    "INSERT INTO reports (id, reporter_identity_hash, type, zone, note, created_at) VALUES ('R1', 'C1', 'WEAPON', 'BUILDING_2', 'พบวัตถุคล้ายอาวุธ', ?)",
  ).run(NOW);
});

describe("การไล่ระดับแจ้งเหตุ", () => {
  it("ไล่ตามลำดับ 1 ถึง 5 ตาม commander_order", () => {
    const order = [1, 2, 3, 4, 5].map((step) => commanderAtStep(step)?.identityHash);
    expect(order).toEqual(["C1", "C2", "C3", "C4", "C5"]);
  });

  it("เคารพลำดับที่ผู้ดูแลตั้งเอง ไม่ใช่ลำดับที่สมัคร", () => {
    db.prepare("UPDATE users SET commander_order = 1 WHERE identity_hash = 'C5'").run();
    db.prepare("UPDATE users SET commander_order = 5 WHERE identity_hash = 'C1'").run();
    expect(commanderAtStep(1)?.identityHash).toBe("C5");
    expect(commanderAtStep(5)?.identityHash).toBe("C1");
  });

  it("ข้ามผู้ประกาศที่ถูกปิดใช้งาน", () => {
    db.prepare("UPDATE users SET active = 0 WHERE identity_hash = 'C2'").run();
    expect(commanderAtStep(2)?.identityHash).toBe("C3");
  });

  it("ไล่เกินคนสุดท้ายแล้วหยุด ไม่วนซ้ำ", () => {
    expect(commanderAtStep(6)).toBeUndefined();
  });

  it("รับเรื่องได้แค่ครั้งเดียว คนที่สองจะไม่ได้", () => {
    expect(claim("R1", "C1")).toBe(1);
    expect(claim("R1", "C2")).toBe(0);
  });

  it("รายงานที่รับเรื่องแล้วหลุดออกจากรายการที่ต้องไล่ระดับ", () => {
    const open = () =>
      db
        .prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'NEW' AND claimed_at IS NULL")
        .get() as { n: number };
    expect(open().n).toBe(1);
    claim("R1", "C3");
    expect(open().n).toBe(0);
  });

  it("บันทึกทุกขั้นที่แจ้งไป ใช้ทบทวนหลังเหตุการณ์ว่าใครไม่ตอบ", () => {
    for (let step = 1; step <= 3; step += 1) {
      const c = commanderAtStep(step)!;
      db.prepare(
        "INSERT OR REPLACE INTO report_escalations (report_id, step, identity_hash, devices, notified_at) VALUES ('R1', ?, ?, 1, ?)",
      ).run(step, c.identityHash, NOW);
    }
    const rows = db
      .prepare("SELECT step, identity_hash AS who FROM report_escalations ORDER BY step")
      .all() as { step: number; who: string }[];
    expect(rows.map((r) => r.who)).toEqual(["C1", "C2", "C3"]);
    const latest = db
      .prepare("SELECT MAX(step) AS step FROM report_escalations WHERE report_id = 'R1'")
      .get() as { step: number };
    expect(latest.step).toBe(3);
  });
});

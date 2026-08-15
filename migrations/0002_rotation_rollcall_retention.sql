-- 0002: หมุนเวียนผู้ประกาศ · เช็กชื่อรายห้อง · การเก็บรักษาข้อมูล
-- แก้ข้อ 4, 5, 6, 7 จากผลตรวจ v0.1.0
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────
-- ข้อ 5: บัญชีระบบสำหรับงานเบื้องหลัง
-- active = 0 เสมอ จึงเข้าสู่ระบบไม่ได้ (authenticate() บังคับ active = 1)
-- มีไว้เพื่อให้ audit_log ที่เขียนโดย cron ผ่าน foreign key ได้
-- ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO users (identity_hash, email_hash, role, active, created_at, last_login_at)
VALUES ('system:maintenance', 'system:maintenance', 'system_admin', 0, datetime('now'), datetime('now'));

-- ─────────────────────────────────────────────────────────────
-- ข้อ 4: ปลดล็อกการหมุนเวียนผู้ประกาศ
-- ของเดิม: commander_invites จำกัด 5 แถว "ตลอดกาล" → เพิ่มคนใหม่ไม่ได้เลยเมื่อครูย้าย
-- ของใหม่: จำกัดที่ "ความจุ" = commander ที่ยัง active + invite ที่ยังไม่ถูกใช้/ไม่หมดอายุ
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS commander_invite_limit;

CREATE TRIGGER IF NOT EXISTS commander_capacity_on_invite
BEFORE INSERT ON commander_invites
WHEN (
  (SELECT COUNT(*) FROM users WHERE role = 'commander' AND active = 1)
  + (SELECT COUNT(*) FROM commander_invites
     WHERE used_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) >= 5
BEGIN
  SELECT RAISE(ABORT, 'commander capacity reached');
END;

-- ป้ายเรียกแทนชื่อจริง ใช้อ้างถึงผู้ประกาศโดยไม่เปิดเผยตัวตน
ALTER TABLE users ADD COLUMN call_sign TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_call_sign
  ON users(call_sign) WHERE call_sign IS NOT NULL;

-- การถอดถอนต้องได้รับอนุมัติจากผู้ประกาศ 2 คนที่ต่างกัน (กติกาเดียวกับการยุติเหตุ)
CREATE TABLE IF NOT EXISTS commander_revocations (
  target_call_sign       TEXT NOT NULL,
  approver_identity_hash TEXT NOT NULL,
  created_at             TEXT NOT NULL,
  PRIMARY KEY (target_call_sign, approver_identity_hash),
  FOREIGN KEY (approver_identity_hash) REFERENCES users(identity_hash)
);

-- ─────────────────────────────────────────────────────────────
-- ข้อ 6: ห้องเรียนและการเช็กชื่อรายห้อง
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id      TEXT PRIMARY KEY,
  name_th TEXT NOT NULL,
  zone    TEXT NOT NULL,
  active  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  FOREIGN KEY (zone) REFERENCES zones(id)
);

-- ตัวอย่างเท่านั้น — ต้องแทนที่ด้วยผังห้องจริงของโรงเรียนก่อนซ้อม
INSERT OR IGNORE INTO rooms (id, name_th, zone) VALUES
  ('B1-101', 'อาคาร 1 ห้อง 101', 'BUILDING_1'),
  ('B1-102', 'อาคาร 1 ห้อง 102', 'BUILDING_1'),
  ('B2-201', 'อาคาร 2 ห้อง 201', 'BUILDING_2'),
  ('B2-202', 'อาคาร 2 ห้อง 202', 'BUILDING_2'),
  ('B3-301', 'อาคาร 3 ห้อง 301', 'BUILDING_3'),
  ('B3-302', 'อาคาร 3 ห้อง 302', 'BUILDING_3');

-- หนึ่งห้องต่อหนึ่งเหตุการณ์ รายงานซ้ำได้ ค่าล่าสุดทับของเดิม
CREATE TABLE IF NOT EXISTS roll_calls (
  incident_id            TEXT NOT NULL,
  room                   TEXT NOT NULL,
  reporter_identity_hash TEXT NOT NULL,
  present                INTEGER NOT NULL CHECK (present >= 0),
  injured                INTEGER NOT NULL DEFAULT 0 CHECK (injured >= 0),
  missing                INTEGER NOT NULL DEFAULT 0 CHECK (missing >= 0),
  secured                INTEGER NOT NULL DEFAULT 1 CHECK (secured IN (0, 1)),
  note                   TEXT NOT NULL DEFAULT '',
  created_at             TEXT NOT NULL,
  PRIMARY KEY (incident_id, room),
  FOREIGN KEY (incident_id) REFERENCES incidents(id),
  FOREIGN KEY (room) REFERENCES rooms(id),
  FOREIGN KEY (reporter_identity_hash) REFERENCES users(identity_hash)
);

CREATE INDEX IF NOT EXISTS idx_roll_calls_incident ON roll_calls(incident_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- ข้อ 7: รองรับบัญชี Google ที่ถูกสร้างใหม่ด้วยอีเมลเดิม
-- แถวเดิมถูกปลดระวางเป็น retired:<hash>:<เวลา> เพื่อคง foreign key ของข้อมูลเก่าไว้
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, active);

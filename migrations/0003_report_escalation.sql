-- 0003: การไล่ระดับแจ้งเหตุถึงผู้ประกาศทีละคน
PRAGMA foreign_keys = ON;

-- ลำดับการแจ้ง 1 ถึง 5 · ตั้งอัตโนมัติตอนรับรหัสเชิญ แก้ภายหลังได้ด้วย SQL
ALTER TABLE users ADD COLUMN commander_order INTEGER;

-- ผู้ประกาศที่กด "รับเรื่อง" แล้ว การไล่ระดับจะหยุดทันที
ALTER TABLE reports ADD COLUMN claimed_by_identity_hash TEXT;
ALTER TABLE reports ADD COLUMN claimed_at TEXT;

-- บันทึกว่าแจ้งใครไปแล้วบ้างเมื่อไร ใช้ทบทวนหลังเหตุการณ์ว่าใครไม่ตอบ
CREATE TABLE IF NOT EXISTS report_escalations (
  report_id     TEXT NOT NULL,
  step          INTEGER NOT NULL,
  identity_hash TEXT NOT NULL,
  devices       INTEGER NOT NULL DEFAULT 0,
  notified_at   TEXT NOT NULL,
  PRIMARY KEY (report_id, step),
  FOREIGN KEY (report_id) REFERENCES reports(id),
  FOREIGN KEY (identity_hash) REFERENCES users(identity_hash)
);

CREATE INDEX IF NOT EXISTS idx_reports_open ON reports(status, created_at);

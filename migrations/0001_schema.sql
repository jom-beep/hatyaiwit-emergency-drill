PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  identity_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'teacher', 'security', 'commander', 'system_admin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS commander_limit_on_update
BEFORE UPDATE OF role ON users
WHEN NEW.role = 'commander'
  AND OLD.role <> 'commander'
  AND (SELECT COUNT(*) FROM users WHERE role = 'commander' AND active = 1) >= 5
BEGIN
  SELECT RAISE(ABORT, 'commander limit reached');
END;

CREATE TABLE IF NOT EXISTS commander_invites (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by_identity_hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (used_by_identity_hash) REFERENCES users(identity_hash)
);

CREATE TRIGGER IF NOT EXISTS commander_invite_limit
BEFORE INSERT ON commander_invites
WHEN (SELECT COUNT(*) FROM commander_invites) >= 5
BEGIN
  SELECT RAISE(ABORT, 'commander invite limit reached');
END;

CREATE TABLE IF NOT EXISTS action_nonces (
  token_hash TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (identity_hash) REFERENCES users(identity_hash)
);

CREATE TABLE IF NOT EXISTS system_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO system_flags (key, value, updated_at)
VALUES ('commander_invites_created', 'false', datetime('now'));

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  name_th TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT OR IGNORE INTO zones (id, name_th) VALUES
  ('ALL', 'ทั้งโรงเรียน'),
  ('BUILDING_1', 'อาคาร 1'),
  ('BUILDING_2', 'อาคาร 2'),
  ('BUILDING_3', 'อาคาร 3');

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  zone TEXT NOT NULL DEFAULT 'ALL',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (identity_hash) REFERENCES users(identity_hash)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active_zone
  ON push_subscriptions(active, zone, id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_identity_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  zone TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'REVIEWED', 'DISMISSED', 'LINKED')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (reporter_identity_hash) REFERENCES users(identity_hash)
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode = 'DRILL'),
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  zone TEXT NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  issued_by_identity_hash TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (issued_by_identity_hash) REFERENCES users(identity_hash)
);

CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_identity_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (incident_id) REFERENCES incidents(id),
  FOREIGN KEY (actor_identity_hash) REFERENCES users(identity_hash)
);

CREATE INDEX IF NOT EXISTS idx_incident_events_incident
  ON incident_events(incident_id, created_at);

CREATE TABLE IF NOT EXISTS acknowledgements (
  incident_id TEXT NOT NULL,
  identity_hash TEXT NOT NULL,
  response TEXT NOT NULL CHECK (response IN ('ACK', 'NEED_HELP')),
  zone TEXT NOT NULL DEFAULT 'ALL',
  created_at TEXT NOT NULL,
  PRIMARY KEY (incident_id, identity_hash),
  FOREIGN KEY (incident_id) REFERENCES incidents(id),
  FOREIGN KEY (identity_hash) REFERENCES users(identity_hash)
);

CREATE TABLE IF NOT EXISTS delivery_log (
  incident_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  subscription_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'EXPIRED')),
  http_status INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (incident_id, version, subscription_id),
  FOREIGN KEY (incident_id) REFERENCES incidents(id),
  FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_identity_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (actor_identity_hash) REFERENCES users(identity_hash)
);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

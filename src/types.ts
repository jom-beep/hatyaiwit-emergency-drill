export type UserRole =
  | "member"
  | "teacher"
  | "security"
  | "commander"
  | "system_admin";

export type IncidentStatus = "ACTIVE" | "RESOLUTION_PENDING" | "RESOLVED";

export type AlertType =
  | "LOCKDOWN"
  | "EVACUATE"
  | "SHELTER"
  | "MEDICAL"
  | "INFORMATION";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  INCIDENT_COORDINATOR: DurableObjectNamespace;
  FANOUT_QUEUE: Queue<FanoutJob>;
  PUSH_QUEUE: Queue<PushJob>;
  ALLOWED_GOOGLE_DOMAIN: string;
  DEPLOYMENT_MODE: "DRILL";
  SCHOOL_NAME: string;
  PUBLIC_ORIGIN: string;
  COOKIE_SECURE: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  IDENTITY_HMAC_SECRET: string;
  BOOTSTRAP_CODE: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /** รหัสยืนยันบทบาทครู แจกในที่ประชุมบุคลากร (ข้อ 6) */
  TEACHER_CODE?: string;
  /** จำนวนวันที่เก็บ log รายเหตุการณ์ ค่าเริ่มต้น 90 audit_log ไม่ถูกลบไม่ว่ากรณีใด (ข้อ 5) */
  LOG_RETENTION_DAYS?: string;
  /** จำนวนวันที่ไม่มีสัญญาณแล้วถือว่าอุปกรณ์ไม่พร้อม ค่าเริ่มต้น 180 (ข้อ 5) */
  SUBSCRIPTION_STALE_DAYS?: string;
}

export interface SessionPayload {
  identityHash: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

export interface AuthenticatedUser extends SessionPayload {
  role: UserRole;
  active: boolean;
}

export interface Incident {
  id: string;
  version: number;
  mode: "DRILL";
  type: AlertType;
  status: IncidentStatus;
  zone: string;
  title: string;
  instruction: string;
  issuedAt: string;
  expiresAt: string;
  issuedBy: string;
  resolutionApprovals: string[];
  resolvedAt?: string;
}

export type PublicIncident = Omit<Incident, "issuedBy" | "resolutionApprovals">;

export interface FanoutJob {
  kind: "fanout";
  incidentId: string;
  version: number;
  cursor: string;
}

export interface PushPayload {
  incidentId: string;
  version: number;
  mode: "DRILL";
  type: AlertType;
  status: IncidentStatus;
  zone: string;
  title: string;
  body: string;
  issuedAt: string;
  expiresAt: string;
  tag: string;
  url: string;
}

export interface PushJob {
  kind: "push";
  subscriptionId: string;
  payload: PushPayload;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  zone: string;
  active: number;
}

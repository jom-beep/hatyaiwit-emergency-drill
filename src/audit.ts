import type { AuthenticatedUser, Env } from "./types";

/** บัญชีระบบสำหรับงานเบื้องหลัง — สร้างไว้ใน migration 0002 และ active = 0 เสมอ */
export const SYSTEM_ACTOR = "system:maintenance";

export async function auditAs(
  env: Env,
  actorIdentityHash: string,
  action: string,
  objectType: string,
  objectId: string,
  metadata: object = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_log
      (id, actor_identity_hash, action, object_type, object_id, created_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      actorIdentityHash,
      action,
      objectType,
      objectId,
      new Date().toISOString(),
      JSON.stringify(metadata),
    )
    .run();
}

export function audit(
  env: Env,
  user: AuthenticatedUser,
  action: string,
  objectType: string,
  objectId: string,
  metadata: object = {},
): Promise<void> {
  return auditAs(env, user.identityHash, action, objectType, objectId, metadata);
}

import type { AuthenticatedUser, Env, Incident, PublicIncident } from "./types";
import {
  authenticate,
  beginGoogleLogin,
  finishGoogleLogin,
  hashInviteToken,
  logout,
  requireRole,
} from "./auth";
import {
  HttpError,
  assertJsonSameOrigin,
  json,
  randomToken,
  safeEqual,
  securityHeaders,
  sha256,
} from "./security";
import { handleQueue } from "./push";
import { audit } from "./audit";
import { runMaintenance } from "./maintenance";
import { callSignFor, commanderRoster, reinviteCommander, revokeCommander } from "./roles";
import { claimReport, openReports, startEscalation } from "./escalation";
export { IncidentCoordinator } from "./incident-object";

const ALERT_TYPES = new Set(["LOCKDOWN", "EVACUATE", "SHELTER", "MEDICAL", "INFORMATION"]);
const REPORT_TYPES = new Set(["VIOLENCE", "WEAPON", "SUSPICIOUS", "MEDICAL", "OTHER"]);

function coordinator(env: Env): DurableObjectStub {
  return env.INCIDENT_COORDINATOR.get(env.INCIDENT_COORDINATOR.idFromName("hatyaiwit-main-campus"));
}

async function body<T>(request: Request): Promise<T> {
  assertJsonSameOrigin(request);
  return (await request.json()) as T;
}

async function zoneExists(env: Env, zone: string): Promise<boolean> {
  return Boolean(await env.DB.prepare("SELECT id FROM zones WHERE id = ? AND active = 1").bind(zone).first());
}

async function createCommanderInvites(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  const input = await body<{ bootstrapCode?: string }>(request);
  if (!input.bootstrapCode || !(await safeEqual(input.bootstrapCode, env.BOOTSTRAP_CODE))) {
    throw new HttpError(403, "รหัสเริ่มต้นไม่ถูกต้อง");
  }
  const flag = await env.DB.prepare("SELECT value FROM system_flags WHERE key = 'commander_invites_created'")
    .first<{ value: string }>();
  if (flag?.value === "true") throw new HttpError(409, "สร้างรหัสผู้ประกาศแล้ว");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60_000).toISOString();
  const tokens = Array.from({ length: 5 }, () => randomToken(24));
  const statements: D1PreparedStatement[] = [];
  for (const token of tokens) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO commander_invites (token_hash, expires_at, created_at) VALUES (?, ?, ?)",
      ).bind(await hashInviteToken(token), expiresAt, now.toISOString()),
    );
  }
  statements.push(
    env.DB.prepare(
      "UPDATE system_flags SET value = 'true', updated_at = ? WHERE key = 'commander_invites_created' AND value = 'false'",
    ).bind(now.toISOString()),
  );
  await env.DB.batch(statements);
  await audit(env, user, "CREATE_COMMANDER_INVITES", "system", "commander-roster", { count: 5 });
  return json({
    mode: "DRILL",
    expiresAt,
    warning: "รหัสจะแสดงครั้งเดียว ห้ามส่งในกลุ่มสาธารณะ",
    invites: tokens,
  });
}

async function redeemCommanderInvite(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  const input = await body<{ token?: string }>(request);
  if (!input.token || input.token.length < 20) throw new HttpError(400, "รหัสเชิญไม่ถูกต้อง");
  const tokenHash = await hashInviteToken(input.token);
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE commander_invites SET used_at = ?, used_by_identity_hash = ?
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
    ).bind(now, user.identityHash, tokenHash, now),
    env.DB.prepare(
      `UPDATE users SET role = 'commander'
       WHERE identity_hash = ?
         AND EXISTS (
           SELECT 1 FROM commander_invites
           WHERE token_hash = ? AND used_by_identity_hash = ? AND used_at IS NOT NULL
         )`,
    ).bind(user.identityHash, tokenHash, user.identityHash),
  ]);
  if ((results[0]!.meta.changes ?? 0) !== 1) throw new HttpError(409, "รหัสถูกใช้แล้วหรือหมดอายุ");
  // ข้อ 4: ตั้งป้ายเรียกให้ผู้ประกาศ เพื่อให้อ้างถึงกันได้โดยไม่ต้องเปิดเผยอีเมล
  const callSign = await callSignFor(user.identityHash);
  await env.DB.prepare(
    `UPDATE users SET call_sign = ?,
       commander_order = COALESCE(
         commander_order,
         (SELECT COALESCE(MAX(commander_order), 0) + 1 FROM users WHERE role = 'commander' AND active = 1)
       )
     WHERE identity_hash = ? AND role = 'commander'`,
  )
    .bind(callSign, user.identityHash)
    .run();
  await audit(env, user, "REDEEM_COMMANDER_INVITE", "user", callSign);
  return json({ ok: true, role: "commander", callSign });
}

async function registerPush(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  const input = await body<{
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    zone?: string;
    platform?: string;
  }>(request);
  if (!input.endpoint?.startsWith("https://") || !input.keys?.p256dh || !input.keys.auth) {
    throw new HttpError(400, "Push subscription ไม่ครบถ้วน");
  }
  const zone = input.zone ?? "ALL";
  if (!(await zoneExists(env, zone))) throw new HttpError(400, "ไม่พบพื้นที่ที่เลือก");
  const endpointHash = await sha256(input.endpoint);
  const id = endpointHash.slice(0, 32);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO push_subscriptions
      (id, identity_hash, endpoint_hash, endpoint, p256dh, auth, platform, zone, active, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(endpoint_hash) DO UPDATE SET
       identity_hash = excluded.identity_hash,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       platform = excluded.platform,
       zone = excluded.zone,
       active = 1,
       last_seen_at = excluded.last_seen_at`,
  )
    .bind(
      id,
      user.identityHash,
      endpointHash,
      input.endpoint,
      input.keys.p256dh,
      input.keys.auth,
      String(input.platform ?? "unknown").slice(0, 32),
      zone,
      now,
      now,
    )
    .run();
  return json({ ok: true, subscriptionId: id });
}

async function createReport(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM reports
     WHERE reporter_identity_hash = ? AND julianday(created_at) > julianday('now', '-5 minutes')`,
  )
    .bind(user.identityHash)
    .first<{ count: number }>();
  if ((recent?.count ?? 0) >= 5) throw new HttpError(429, "ส่งรายงานถี่เกินไป กรุณารอสักครู่");
  const input = await body<{ type?: string; zone?: string; note?: string }>(request);
  if (!input.type || !REPORT_TYPES.has(input.type)) throw new HttpError(400, "ประเภทการรายงานไม่ถูกต้อง");
  const zone = input.zone ?? "ALL";
  if (!(await zoneExists(env, zone))) throw new HttpError(400, "ไม่พบพื้นที่ที่เลือก");
  const id = `RPT-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO reports (id, reporter_identity_hash, type, zone, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, user.identityHash, input.type, zone, String(input.note ?? "").trim().slice(0, 300), now)
    .run();
  await audit(env, user, "CREATE_REPORT", "report", id, { type: input.type, zone });
  // ปลุกผู้ประกาศทันที แล้วไล่ไปคนถัดไปถ้าไม่มีใครรับเรื่อง
  await startEscalation(env, id);
  return json({ ok: true, reportId: id, status: "NEW" }, { status: 201 });
}

async function createActionToken(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  await body<Record<string, never>>(request);
  requireRole(user, ["commander"]);
  const token = randomToken(24);
  const tokenHash = await sha256(`action:${token}`);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await env.DB.prepare(
    "INSERT INTO action_nonces (token_hash, identity_hash, action, expires_at) VALUES (?, ?, 'ACTIVATE_DRILL', ?)",
  )
    .bind(tokenHash, user.identityHash, expiresAt)
    .run();
  return json({ token, expiresAt });
}

async function consumeActionToken(env: Env, user: AuthenticatedUser, token: string): Promise<void> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE action_nonces SET used_at = ?
     WHERE token_hash = ? AND identity_hash = ? AND action = 'ACTIVATE_DRILL'
       AND used_at IS NULL AND expires_at > ?`,
  )
    .bind(now, await sha256(`action:${token}`), user.identityHash, now)
    .run();
  if ((result.meta.changes ?? 0) !== 1) throw new HttpError(409, "Action token หมดอายุหรือถูกใช้แล้ว");
}

async function activateDrill(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  requireRole(user, ["commander"]);
  const input = await body<{
    actionToken?: string;
    mode?: string;
    type?: Incident["type"];
    zone?: string;
    instruction?: string;
  }>(request);
  if (env.DEPLOYMENT_MODE !== "DRILL" || input.mode !== "DRILL") {
    throw new HttpError(403, "ต้นแบบนี้อนุญาตเฉพาะการฝึกซ้อม");
  }
  if (!input.actionToken) throw new HttpError(400, "ไม่พบ Action token");
  // ตรวจข้อมูลให้ครบก่อน แล้วค่อยใช้ action token
  // ของเดิมเผา token ทิ้งก่อนตรวจ ทำให้ต้องกดค้าง 3 วินาทีใหม่ทั้งรอบเมื่อกรอกผิด
  if (!input.type || !ALERT_TYPES.has(input.type)) throw new HttpError(400, "ประเภทการแจ้งเตือนไม่ถูกต้อง");
  const zone = input.zone ?? "ALL";
  if (!(await zoneExists(env, zone))) throw new HttpError(400, "ไม่พบพื้นที่ที่เลือก");
  const instruction = String(input.instruction ?? "").trim().slice(0, 240);
  if (instruction.length < 10) throw new HttpError(400, "คำแนะนำต้องมีอย่างน้อย 10 ตัวอักษร");
  await consumeActionToken(env, user, input.actionToken);

  const response = await coordinator(env).fetch("https://incident.internal/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: input.type,
      zone,
      title: `[การฝึกซ้อม] ${labelForAlert(input.type)}`,
      instruction,
      issuedBy: user.identityHash,
      ttlSeconds: 300,
    }),
  });
  const result = (await response.json()) as { incident?: PublicIncident; error?: string };
  if (!response.ok || !result.incident) throw new HttpError(response.status, result.error ?? "ไม่สามารถเริ่มการฝึกซ้อมได้");
  const incident = result.incident;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO incidents
       (id, version, mode, type, status, zone, title, instruction, issued_at, expires_at, issued_by_identity_hash)
       VALUES (?, ?, 'DRILL', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      incident.id,
      incident.version,
      incident.type,
      incident.status,
      incident.zone,
      incident.title,
      incident.instruction,
      incident.issuedAt,
      incident.expiresAt,
      user.identityHash,
    ),
    env.DB.prepare(
      `INSERT INTO incident_events
       (id, incident_id, version, event_type, actor_identity_hash, created_at, details_json)
       VALUES (?, ?, ?, 'ACTIVATED', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      incident.id,
      incident.version,
      user.identityHash,
      incident.issuedAt,
      JSON.stringify({ zone: incident.zone, type: incident.type, mode: "DRILL" }),
    ),
  ]);
  await audit(env, user, "ACTIVATE_DRILL", "incident", incident.id, { zone, type: incident.type });
  await env.FANOUT_QUEUE.send({ kind: "fanout", incidentId: incident.id, version: incident.version, cursor: "" });
  return json({ incident }, { status: 201 });
}

function labelForAlert(type: Incident["type"]): string {
  return {
    LOCKDOWN: "ฝึกซ้อมปิดพื้นที่",
    EVACUATE: "ฝึกซ้อมอพยพ",
    SHELTER: "ฝึกซ้อมอยู่ในพื้นที่ปลอดภัย",
    MEDICAL: "ฝึกซ้อมเหตุการแพทย์",
    INFORMATION: "ประกาศการฝึกซ้อม",
  }[type];
}

async function resolveDrill(env: Env, user: AuthenticatedUser): Promise<Response> {
  requireRole(user, ["commander"]);
  const response = await coordinator(env).fetch("https://incident.internal/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commanderHash: user.identityHash }),
  });
  const result = (await response.json()) as {
    incident?: PublicIncident;
    approvalCount?: number;
    approvalsRequired?: number;
    error?: string;
  };
  if (!response.ok || !result.incident) throw new HttpError(response.status, result.error ?? "ไม่สามารถยุติการฝึกซ้อมได้");
  const incident = result.incident;
  await env.DB.prepare("UPDATE incidents SET version = ?, status = ?, resolved_at = ? WHERE id = ?")
    .bind(incident.version, incident.status, incident.resolvedAt ?? null, incident.id)
    .run();
  await env.DB.prepare(
    `INSERT INTO incident_events
     (id, incident_id, version, event_type, actor_identity_hash, created_at, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      incident.id,
      incident.version,
      incident.status === "RESOLVED" ? "RESOLVED" : "RESOLUTION_APPROVAL",
      user.identityHash,
      new Date().toISOString(),
      JSON.stringify({ approvals: result.approvalCount ?? 0 }),
    )
    .run();
  await audit(env, user, "APPROVE_DRILL_RESOLUTION", "incident", incident.id, {
    resolved: incident.status === "RESOLVED",
  });
  if (incident.status === "RESOLVED") {
    await env.FANOUT_QUEUE.send({ kind: "fanout", incidentId: incident.id, version: incident.version, cursor: "" });
  }
  return json(result);
}

async function acknowledge(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  const input = await body<{ incidentId?: string; response?: "ACK" | "NEED_HELP"; zone?: string }>(request);
  if (!input.incidentId || !["ACK", "NEED_HELP"].includes(input.response ?? "")) {
    throw new HttpError(400, "ข้อมูลตอบรับไม่ถูกต้อง");
  }
  await env.DB.prepare(
    `INSERT INTO acknowledgements (incident_id, identity_hash, response, zone, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(incident_id, identity_hash)
     DO UPDATE SET response = excluded.response, zone = excluded.zone, created_at = excluded.created_at`,
  )
    .bind(input.incidentId, user.identityHash, input.response, input.zone ?? "ALL", new Date().toISOString())
    .run();
  return json({ ok: true });
}

async function dashboard(env: Env, user: AuthenticatedUser): Promise<Response> {
  requireRole(user, ["commander"]);
  const activeResponse = await coordinator(env).fetch("https://incident.internal/active");
  const active = (await activeResponse.json()) as { incident: PublicIncident | null };
  const deviceCounts = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS ready,
            SUM(CASE WHEN active = 1 AND last_seen_at < datetime('now', '-7 days') THEN 1 ELSE 0 END) AS stale
     FROM push_subscriptions`,
  ).first();
  let delivery = null;
  let acknowledgement = null;
  if (active.incident) {
    delivery = await env.DB.prepare(
      `SELECT status, COUNT(*) AS count FROM delivery_log
       WHERE incident_id = ? AND version = ? GROUP BY status`,
    )
      .bind(active.incident.id, active.incident.version)
      .all();
    acknowledgement = await env.DB.prepare(
      `SELECT response, COUNT(*) AS count FROM acknowledgements
       WHERE incident_id = ? GROUP BY response`,
    )
      .bind(active.incident.id)
      .all();
  }
  return json({ incident: active.incident, devices: deviceCounts, delivery, acknowledgement });
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/config") {
    const zones = await env.DB.prepare("SELECT id, name_th AS name FROM zones WHERE active = 1 ORDER BY id").all();
    return json({
      schoolName: env.SCHOOL_NAME,
      mode: env.DEPLOYMENT_MODE,
      googleDomain: env.ALLOWED_GOOGLE_DOMAIN,
      version: env.APP_VERSION ?? "dev",
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
      zones: zones.results,
    });
  }
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, mode: "DRILL" });
  // เบาที่สุดเท่าที่ทำได้ ไม่แตะฐานข้อมูล เพราะทุกเครื่องเรียกเป็นระยะ
  if (request.method === "GET" && url.pathname === "/api/version") {
    return json({ version: env.APP_VERSION ?? "dev" });
  }
  const user = await authenticate(request, env);

  if (request.method === "GET" && url.pathname === "/api/me") {
    return json({
      email: user.email,
      role: user.role,
      mode: env.DEPLOYMENT_MODE,
      callSign: user.role === "commander" ? await callSignFor(user.identityHash) : null,
    });
  }
  if (request.method === "GET" && url.pathname === "/api/incidents/active") {
    return coordinator(env).fetch("https://incident.internal/active");
  }
  if (request.method === "GET" && url.pathname === "/api/dashboard") return dashboard(env, user);
  if (request.method === "POST" && url.pathname === "/api/push/subscribe") return registerPush(request, env, user);
  if (request.method === "POST" && url.pathname === "/api/reports") return createReport(request, env, user);
  if (request.method === "POST" && url.pathname === "/api/acknowledgements") return acknowledge(request, env, user);
  if (request.method === "POST" && url.pathname === "/api/commander/bootstrap") {
    return createCommanderInvites(request, env, user);
  }
  if (request.method === "POST" && url.pathname === "/api/commander/redeem") {
    return redeemCommanderInvite(request, env, user);
  }
  if (request.method === "POST" && url.pathname === "/api/commander/action-token") {
    return createActionToken(request, env, user);
  }
  if (request.method === "POST" && url.pathname === "/api/incidents/drill") {
    return activateDrill(request, env, user);
  }
  if (request.method === "POST" && url.pathname === "/api/incidents/resolve") {
    await body<Record<string, never>>(request);
    return resolveDrill(env, user);
  }
  if (request.method === "POST" && url.pathname === "/api/commander/revoke") {
    return revokeCommander(await body<{ callSign?: string }>(request), env, user);
  }
  if (request.method === "POST" && url.pathname === "/api/commander/reinvite") {
    await body<Record<string, never>>(request);
    return reinviteCommander(env, user);
  }
  if (request.method === "GET" && url.pathname === "/api/reports/open") return openReports(env, user);
  const claim = url.pathname.match(/^\/api\/reports\/([\w-]+)\/claim$/);
  if (request.method === "POST" && claim) {
    await body<Record<string, never>>(request);
    return claimReport(claim[1]!, env, user);
  }
  if (request.method === "GET" && url.pathname === "/api/commander/roster") {
    return commanderRoster(env, user);
  }
  if (request.method === "GET" && url.pathname === "/api/ws") {
    return coordinator(env).fetch(new Request("https://incident.internal/connect", request));
  }
  throw new HttpError(404, "ไม่พบ API");
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/auth/login") return beginGoogleLogin(request, env);
  if (request.method === "GET" && url.pathname === "/auth/callback") return finishGoogleLogin(request, env);
  if (request.method === "POST" && url.pathname === "/auth/logout") return logout(env);
  if (url.pathname.startsWith("/api/")) return api(request, env);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return securityHeaders(await handle(request, env));
    } catch (error) {
      if (error instanceof HttpError) return securityHeaders(json({ error: error.message }, { status: error.status }));
      console.error("Unhandled request error", error instanceof Error ? error.message : "unknown");
      return securityHeaders(json({ error: "ระบบขัดข้องชั่วคราว" }, { status: 500 }));
    }
  },
  queue: handleQueue,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runMaintenance(env).catch((error) => {
        console.error("maintenance failed", error instanceof Error ? error.message : "unknown");
      }),
    );
  },
} satisfies ExportedHandler<Env>;

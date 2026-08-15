import webpush from "web-push";
import type { Env, FanoutJob, Incident, PushJob, PushPayload, PushSubscriptionRow } from "./types";

const FANOUT_PAGE_SIZE = 200;

function payloadFor(incident: Incident, origin: string): PushPayload {
  const resolved = incident.status === "RESOLVED";
  return {
    incidentId: incident.id,
    version: incident.version,
    mode: "DRILL",
    type: incident.type,
    status: incident.status,
    zone: incident.zone,
    title: resolved ? "[การฝึกซ้อม] ยุติสถานการณ์" : incident.title,
    body: resolved ? "การฝึกซ้อมสิ้นสุดแล้ว กรุณารอคำแนะนำจากโรงเรียน" : incident.instruction,
    issuedAt: incident.issuedAt,
    expiresAt: incident.expiresAt,
    tag: `${incident.id}-${incident.version}`,
    url: `${origin}/?incident=${encodeURIComponent(incident.id)}`,
  };
}

async function handleFanout(message: Message<FanoutJob>, env: Env): Promise<void> {
  const job = message.body;
  const incident = await env.DB.prepare(
    `SELECT id, version, mode, type, status, zone, title, instruction,
            issued_at AS issuedAt, expires_at AS expiresAt,
            issued_by_identity_hash AS issuedBy, resolved_at AS resolvedAt
     FROM incidents WHERE id = ? AND version = ?`,
  )
    .bind(job.incidentId, job.version)
    .first<Omit<Incident, "resolutionApprovals">>();
  if (!incident) {
    message.ack();
    return;
  }

  const zoneClause = incident.zone === "ALL" ? "1 = 1" : "(s.zone = ? OR u.role IN ('commander', 'security'))";
  const statement = env.DB.prepare(
    `SELECT s.id, s.endpoint, s.p256dh, s.auth, s.zone, s.active
     FROM push_subscriptions s
     JOIN users u ON u.identity_hash = s.identity_hash
     WHERE s.active = 1 AND s.id > ? AND ${zoneClause}
     ORDER BY s.id LIMIT ?`,
  );
  const bound = incident.zone === "ALL"
    ? statement.bind(job.cursor, FANOUT_PAGE_SIZE)
    : statement.bind(job.cursor, incident.zone, FANOUT_PAGE_SIZE);
  const result = await bound.all<PushSubscriptionRow>();
  const subscriptions = result.results;
  const payload = payloadFor({ ...incident, resolutionApprovals: [] }, env.PUBLIC_ORIGIN);

  for (let offset = 0; offset < subscriptions.length; offset += 100) {
    const batch = subscriptions.slice(offset, offset + 100).map((subscription) => ({
      body: {
        kind: "push" as const,
        subscriptionId: subscription.id,
        payload,
      },
    }));
    if (batch.length) await env.PUSH_QUEUE.sendBatch(batch);
  }

  if (subscriptions.length === FANOUT_PAGE_SIZE) {
    await env.FANOUT_QUEUE.send({
      kind: "fanout",
      incidentId: incident.id,
      version: incident.version,
      cursor: subscriptions.at(-1)!.id,
    });
  }
  message.ack();
}

async function writeDelivery(
  env: Env,
  job: PushJob,
  status: "SENT" | "FAILED" | "EXPIRED",
  httpStatus: number | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO delivery_log
       (incident_id, version, subscription_id, status, http_status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(incident_id, version, subscription_id)
     DO UPDATE SET status = excluded.status, http_status = excluded.http_status, updated_at = excluded.updated_at`,
  )
    .bind(
      job.payload.incidentId,
      job.payload.version,
      job.subscriptionId,
      status,
      httpStatus,
      new Date().toISOString(),
    )
    .run();
}

async function handlePush(message: Message<PushJob>, env: Env): Promise<void> {
  const job = message.body;
  const prior = await env.DB.prepare(
    "SELECT status FROM delivery_log WHERE incident_id = ? AND version = ? AND subscription_id = ?",
  )
    .bind(job.payload.incidentId, job.payload.version, job.subscriptionId)
    .first<{ status: string }>();
  if (prior?.status === "SENT" || prior?.status === "EXPIRED") {
    message.ack();
    return;
  }
  if (Date.now() > new Date(job.payload.expiresAt).getTime() && job.payload.status !== "RESOLVED") {
    await writeDelivery(env, job, "EXPIRED", null);
    message.ack();
    return;
  }
  const subscription = await env.DB.prepare(
    "SELECT id, endpoint, p256dh, auth, zone, active FROM push_subscriptions WHERE id = ? AND active = 1",
  )
    .bind(job.subscriptionId)
    .first<PushSubscriptionRow>();
  if (!subscription) {
    message.ack();
    return;
  }

  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  try {
    const result = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(job.payload),
      {
        TTL: 300,
        urgency: "high",
        topic: job.payload.tag.slice(-32),
      },
    );
    await writeDelivery(env, job, "SENT", result.statusCode);
    message.ack();
  } catch (error) {
    const status = error instanceof webpush.WebPushError ? error.statusCode : 0;
    if (status === 404 || status === 410) {
      await env.DB.prepare("UPDATE push_subscriptions SET active = 0 WHERE id = ?")
        .bind(subscription.id)
        .run();
      await writeDelivery(env, job, "FAILED", status);
      message.ack();
      return;
    }
    await writeDelivery(env, job, "FAILED", status || null);
    if (status === 429 || status >= 500 || status === 0) {
      message.retry({ delaySeconds: 30 });
    } else {
      message.ack();
    }
  }
}

export async function handleQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  await Promise.all(
    batch.messages.map((unknownMessage) => {
      const message = unknownMessage as Message<FanoutJob | PushJob>;
      return message.body.kind === "fanout"
        ? handleFanout(message as Message<FanoutJob>, env)
        : handlePush(message as Message<PushJob>, env);
    }),
  );
}

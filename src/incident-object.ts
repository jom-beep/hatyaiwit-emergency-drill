import { DurableObject } from "cloudflare:workers";
import type { Env, Incident, PublicIncident } from "./types";

interface ActivateRequest {
  type: Incident["type"];
  zone: string;
  title: string;
  instruction: string;
  issuedBy: string;
  ttlSeconds: number;
}

export class IncidentCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async current(): Promise<Incident | null> {
    return (await this.ctx.storage.get<Incident>("activeIncident")) ?? null;
  }

  private publicIncident(incident: Incident): PublicIncident {
    const { issuedBy: _issuedBy, resolutionApprovals: _approvals, ...safe } = incident;
    return safe;
  }

  private broadcast(message: unknown): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(encoded);
      } catch {
        try {
          socket.close(1011, "broadcast failed");
        } catch {
          // Socket may already be closed.
        }
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") === "websocket" && url.pathname === "/connect") {
      const pair = new WebSocketPair();
      const client = Object.values(pair)[0]!;
      const server = Object.values(pair)[1]!;
      this.ctx.acceptWebSocket(server);
      const active = await this.current();
      if (active) server.send(JSON.stringify({ type: "incident_state", incident: this.publicIncident(active) }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "GET" && url.pathname === "/active") {
      const incident = await this.current();
      return Response.json({ incident: incident ? this.publicIncident(incident) : null });
    }

    if (request.method === "POST" && url.pathname === "/activate") {
      const existing = await this.current();
      if (existing && existing.status !== "RESOLVED" && new Date(existing.expiresAt).getTime() > Date.now()) {
        return Response.json({ error: "มีการฝึกซ้อมที่กำลังดำเนินอยู่" }, { status: 409 });
      }
      const body = (await request.json()) as ActivateRequest;
      const now = new Date();
      const id = `DRILL-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
      const incident: Incident = {
        id,
        version: 1,
        mode: "DRILL",
        type: body.type,
        status: "ACTIVE",
        zone: body.zone,
        title: body.title,
        instruction: body.instruction,
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + body.ttlSeconds * 1000).toISOString(),
        issuedBy: body.issuedBy,
        resolutionApprovals: [],
      };
      await this.ctx.storage.put("activeIncident", incident);
      const publicIncident = this.publicIncident(incident);
      this.broadcast({ type: "incident_state", incident: publicIncident });
      return Response.json({ incident: publicIncident }, { status: 201 });
    }

    if (request.method === "POST" && url.pathname === "/resolve") {
      const incident = await this.current();
      if (!incident || incident.status === "RESOLVED") {
        return Response.json({ error: "ไม่มีเหตุที่กำลังดำเนินอยู่" }, { status: 409 });
      }
      const { commanderHash } = (await request.json()) as { commanderHash: string };
      const approvals = Array.from(new Set([...incident.resolutionApprovals, commanderHash]));
      const resolved = approvals.length >= 2;
      const updated: Incident = {
        ...incident,
        version: incident.version + 1,
        resolutionApprovals: approvals,
        status: resolved ? "RESOLVED" : "RESOLUTION_PENDING",
        ...(resolved ? { resolvedAt: new Date().toISOString() } : {}),
      };
      await this.ctx.storage.put("activeIncident", updated);
      const publicIncident = this.publicIncident(updated);
      this.broadcast({ type: "incident_state", incident: publicIncident });
      return Response.json({
        incident: publicIncident,
        approvalCount: approvals.length,
        approvalsRequired: Math.max(0, 2 - approvals.length),
      });
    }

    return new Response("Not found", { status: 404 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string" && message === "ping") socket.send("pong");
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }
}

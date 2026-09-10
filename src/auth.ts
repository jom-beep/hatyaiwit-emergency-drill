import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthenticatedUser, Env, SessionPayload, UserRole } from "./types";
import {
  HttpError,
  base64urlDecode,
  base64urlEncode,
  hmac,
  parseCookies,
  randomToken,
  sha256,
} from "./security";
import { type LoginErrorCode, mapAuthFailure } from "./login-errors";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const SESSION_COOKIE = "hyw_session";
const OAUTH_COOKIE = "hyw_oauth";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: number;
}

async function signObject(value: object, secret: string): Promise<string> {
  const payload = base64urlEncode(encoder.encode(JSON.stringify(value)));
  return `${payload}.${await hmac(payload, secret)}`;
}

async function verifyObject<T>(value: string | undefined, secret: string): Promise<T | null> {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = await hmac(payload, secret);
  if (signature.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < signature.length; i += 1) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    return JSON.parse(decoder.decode(base64urlDecode(payload))) as T;
  } catch {
    return null;
  }
}

function cookie(name: string, value: string, env: Env, maxAge: number): string {
  const secure = env.COOKIE_SECURE !== "false";
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export async function beginGoogleLogin(request: Request, env: Env): Promise<Response> {
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const challenge = base64urlEncode(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)));
  const oauthState: OAuthState = { state, nonce, verifier, expiresAt: Date.now() + 10 * 60_000 };
  const redirectUri = `${env.PUBLIC_ORIGIN}/auth/callback`;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    hd: env.ALLOWED_GOOGLE_DOMAIN,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const headers = new Headers({ Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  headers.append("Set-Cookie", cookie(OAUTH_COOKIE, await signObject(oauthState, env.SESSION_SECRET), env, 600));
  return new Response(null, { status: 302, headers });
}

export function loginErrorRedirect(env: Env, code: LoginErrorCode): Response {
  const headers = new Headers({ Location: `/?login_error=${code}` });
  headers.append("Set-Cookie", cookie(OAUTH_COOKIE, "", env, 0));
  return new Response(null, { status: 302, headers });
}

export async function finishGoogleLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const googleError = url.searchParams.get("error");
  if (googleError) {
    return loginErrorRedirect(env, mapAuthFailure({ googleError }));
  }
  const stateCookie = await verifyObject<OAuthState>(parseCookies(request)[OAUTH_COOKIE], env.SESSION_SECRET);
  if (!stateCookie || stateCookie.expiresAt < Date.now() || stateCookie.state !== url.searchParams.get("state")) {
    throw new HttpError(400, "OAuth state ไม่ถูกต้องหรือหมดอายุ");
  }
  const code = url.searchParams.get("code");
  if (!code) throw new HttpError(400, "ไม่พบ authorization code");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.PUBLIC_ORIGIN}/auth/callback`,
      grant_type: "authorization_code",
      code_verifier: stateCookie.verifier,
    }),
  });
  if (!tokenResponse.ok) throw new HttpError(401, "Google ไม่อนุมัติการเข้าสู่ระบบ");
  const tokens = (await tokenResponse.json()) as { id_token?: string };
  if (!tokens.id_token) throw new HttpError(401, "ไม่พบ Google ID token");

  const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
    audience: env.GOOGLE_CLIENT_ID,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  if (payload.nonce !== stateCookie.nonce) throw new HttpError(401, "Google nonce ไม่ถูกต้อง");
  if (payload.hd !== env.ALLOWED_GOOGLE_DOMAIN || payload.email_verified !== true) {
    throw new HttpError(403, `อนุญาตเฉพาะบัญชี @${env.ALLOWED_GOOGLE_DOMAIN}`);
  }
  const email = String(payload.email ?? "").toLowerCase();
  const sub = String(payload.sub ?? "");
  if (!email || !sub) throw new HttpError(401, "ข้อมูลบัญชี Google ไม่ครบถ้วน");
  const identityHash = await hmac(`google:${sub}`, env.IDENTITY_HMAC_SECRET);
  const emailHash = await hmac(email, env.IDENTITY_HMAC_SECRET);
  const now = new Date().toISOString();
  await upsertUser(env, identityHash, emailHash, now);

  const session: SessionPayload = {
    identityHash,
    email,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 12 * 60 * 60_000,
  };
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, await signObject(session, env.SESSION_SECRET), env, 43_200));
  headers.append("Set-Cookie", cookie(OAUTH_COOKIE, "", env, 0));
  return new Response(null, { status: 302, headers });
}

export async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser> {
  const session = await verifyObject<SessionPayload>(parseCookies(request)[SESSION_COOKIE], env.SESSION_SECRET);
  if (!session || session.expiresAt < Date.now()) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  const row = await env.DB.prepare("SELECT role, active FROM users WHERE identity_hash = ?")
    .bind(session.identityHash)
    .first<{ role: UserRole; active: number }>();
  if (!row || row.active !== 1) throw new HttpError(403, "บัญชีนี้ไม่สามารถใช้งานได้");
  return { ...session, role: row.role, active: true };
}

export function requireRole(user: AuthenticatedUser, roles: UserRole[]): void {
  if (!roles.includes(user.role)) throw new HttpError(403, "ไม่มีสิทธิ์ดำเนินการนี้");
}

export function logout(env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": cookie(SESSION_COOKIE, "", env, 0) },
  });
}

export async function hashInviteToken(token: string): Promise<string> {
  return sha256(`invite:${token}`);
}

/**
 * ข้อ 7: บัญชี Google ที่ถูกสร้างใหม่ด้วยอีเมลเดิม
 *
 * ปัญหาเดิม: users.email_hash เป็น UNIQUE แต่ ON CONFLICT ผูกกับ identity_hash เท่านั้น
 * ถ้าโรงเรียนลบบัญชีแล้วสร้างใหม่ Google จะให้ `sub` ใหม่ → identity_hash ใหม่ + email_hash เดิม
 * → ชน UNIQUE → error หลุดเป็น 500 และคนนั้นเข้าระบบไม่ได้อีกเลย
 *
 * วิธีแก้: ไม่ย้าย primary key (จะทำให้ foreign key ของข้อมูลเก่าพัง)
 * แต่ "ปลดระวาง" แถวเดิมด้วย email_hash แบบ tombstone แล้ว active = 0
 * ข้อมูลเก่ายังอ้างถึงตัวตนเดิมได้ครบ และผู้ใช้เริ่มต้นใหม่ในฐานะสมาชิกทั่วไป
 *
 * ผลข้างเคียงที่ตั้งใจ: ถ้าแถวเดิมเป็น commander จะถูกปลดโดยอัตโนมัติ
 * ทำให้ความจุ roster ว่างลง 1 ที่ ซึ่งถูกต้องแล้ว เพราะบัญชีนั้นไม่มีตัวตนอีกต่อไป
 */
export async function upsertUser(
  env: Env,
  identityHash: string,
  emailHash: string,
  now: string,
): Promise<void> {
  const existing = await env.DB.prepare(
    "SELECT identity_hash AS identityHash, role FROM users WHERE email_hash = ?",
  )
    .bind(emailHash)
    .first<{ identityHash: string; role: UserRole }>();

  if (existing && existing.identityHash !== identityHash) {
    await env.DB.prepare(
      `UPDATE users
       SET email_hash = 'retired:' || email_hash || ':' || ?, active = 0, call_sign = NULL
       WHERE identity_hash = ?`,
    )
      .bind(now, existing.identityHash)
      .run();
    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor_identity_hash, action, object_type, object_id, created_at, metadata_json)
       VALUES (?, ?, 'RETIRE_STALE_IDENTITY', 'user', ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        existing.identityHash,
        existing.identityHash,
        now,
        JSON.stringify({ previousRole: existing.role, reason: "google_sub_changed" }),
      )
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO users (identity_hash, email_hash, role, active, created_at, last_login_at)
     VALUES (?, ?, 'member', 1, ?, ?)
     ON CONFLICT(identity_hash) DO UPDATE SET
       email_hash = excluded.email_hash,
       last_login_at = excluded.last_login_at,
       active = 1`,
  )
    .bind(identityHash, emailHash, now, now)
    .run();
}

const encoder = new TextEncoder();

export function base64urlEncode(value: Uint8Array | ArrayBuffer): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function sha256(value: string): Promise<string> {
  return base64urlEncode(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64urlEncode(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function safeEqual(left: string, right: string): Promise<boolean> {
  const leftHash = base64urlDecode(await sha256(left));
  const rightHash = base64urlDecode(await sha256(right));
  if (leftHash.byteLength !== rightHash.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < leftHash.byteLength; i += 1) diff |= leftHash[i]! ^ rightHash[i]!;
  return diff === 0;
}

export function randomToken(byteLength = 32): string {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("Cookie") ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.includes("="))
      .map((part) => {
        const separator = part.indexOf("=");
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

export function securityHeaders(response: Response): Response {
  // Reconstructing a 101 response drops Cloudflare's non-standard webSocket handle.
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://accounts.google.com",
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function assertJsonSameOrigin(request: Request): void {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "ต้องส่งข้อมูลแบบ application/json");
  }
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, "Origin ไม่ถูกต้อง");
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

import { describe, expect, it } from "vitest";
import { base64urlDecode, base64urlEncode, hmac, randomToken, sha256 } from "../src/security";

describe("security helpers", () => {
  it("round-trips base64url bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
    expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
  });

  it("creates deterministic hashes without unsafe URL characters", async () => {
    const digest = await sha256("hatyaiwit");
    expect(digest).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await sha256("hatyaiwit")).toBe(digest);
  });

  it("separates HMAC identities when secrets change", async () => {
    const first = await hmac("google:123", "secret-a");
    const second = await hmac("google:123", "secret-b");
    expect(first).not.toBe(second);
  });

  it("generates high entropy tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => randomToken(24)));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token.length).toBeGreaterThanOrEqual(32);
  });
});

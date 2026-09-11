import { describe, expect, it } from "vitest";
import { isDemoPagePath } from "../src/demo-gate";

describe("demo page gate", () => {
  it("matches /demo and trailing slash only", () => {
    expect(isDemoPagePath("/demo")).toBe(true);
    expect(isDemoPagePath("/demo/")).toBe(true);
    expect(isDemoPagePath("/demo/index.html")).toBe(false);
  });

  it("never treats production auth or API paths as demo", () => {
    expect(isDemoPagePath("/")).toBe(false);
    expect(isDemoPagePath("/api/me")).toBe(false);
    expect(isDemoPagePath("/api/dashboard")).toBe(false);
    expect(isDemoPagePath("/auth/login")).toBe(false);
    expect(isDemoPagePath("/demo-mock.js")).toBe(false);
  });
});

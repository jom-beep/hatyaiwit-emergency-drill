import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

describe("deployment invariants the school asked to keep", () => {
  it("keeps ALLOWED_GOOGLE_DOMAIN as khanchai.ac.th", () => {
    expect(wrangler).toMatch(/"ALLOWED_GOOGLE_DOMAIN": "khanchai\.ac\.th"/);
    expect(wrangler).not.toMatch(/"ALLOWED_GOOGLE_DOMAIN": "hatyaiwit\.ac\.th"/);
  });

  it("stays DRILL-only at the Worker vars layer", () => {
    expect(wrangler).toMatch(/"DEPLOYMENT_MODE": "DRILL"/);
  });
});

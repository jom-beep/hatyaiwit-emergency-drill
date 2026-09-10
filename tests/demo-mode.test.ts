import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

describe("demo mode must not weaken production auth", () => {
  it("still authenticates every /api route except config/health/version", () => {
    expect(worker).toMatch(/const user = await authenticate\(request, env\)/);
    expect(worker).toMatch(/if \(request\.method === "GET" && url\.pathname === "\/api\/me"\)/);
    const meIndex = worker.indexOf('url.pathname === "/api/me"');
    const authIndex = worker.indexOf("const user = await authenticate(request, env)");
    expect(authIndex).toBeGreaterThan(0);
    expect(authIndex).toBeLessThan(meIndex);
  });

  it("does not add a DEMO_MODE env that skips authenticate()", () => {
    expect(worker).not.toMatch(/DEMO_MODE/);
    expect(wrangler).not.toMatch(/DEMO_MODE/);
    expect(wrangler).toMatch(/"ALLOWED_GOOGLE_DOMAIN": "khanchai\.ac\.th"/);
  });

  it("loads the client mock only on /demo or ?demo=1", () => {
    expect(app).toContain('pathname.replace(/\\/+$/, "") === "/demo"');
    expect(app).toContain('get("demo") === "1"');
    expect(app).toContain('import("/demo-mock.js")');
    expect(app).toContain("if (state.demoApi) return state.demoApi.handle");
  });

  it("keeps the five mock walkthrough surfaces in the PWA shell", () => {
    expect(html).toContain("ผู้ที่ยังไม่กดรับทราบ");
    expect(html).toContain("After-action");
    expect(html).toContain("ปลอดภัย");
    expect(html).toContain("ต้องการช่วยเหลือ");
    expect(html).toContain("นี่คือการฝึกซ้อม · DRILL");
    expect(html).toContain('href="/demo"');
    expect(html).toContain("ดูโหมดสาธิต — ไม่ต้องเข้าสู่ระบบ");
  });
});

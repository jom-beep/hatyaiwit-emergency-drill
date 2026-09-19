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

  it("keeps recipient status switching unlocked in the demo shell", () => {
    expect(app).toContain('acknowledge("AWAY")');
    expect(app).toContain("กดเปลี่ยนได้ตลอดจนกว่าจะยุติ");
    expect(app).toContain("renderRecipientGuidance");
    expect(app).not.toMatch(/safeButton\.disabled = true/);
  });

  it("wires versioned command updates, lockdown silent mode, and all-clear in demo", () => {
    expect(app).toContain("/api/incidents/update");
    expect(app).toContain("pushInstructionUpdate");
    expect(app).toContain("hyw-demo-silent-lockdown");
    expect(app).toContain("isLockdownLike(incidentType)");
    expect(app).toContain("playCommandCue");
    expect(app).toContain("ยุติแล้ว / กลับสู่ปกติ");
    expect(app).toContain("คุณรับทราบครั้งแรกเมื่อ");
    expect(html).toContain("ส่งคำสั่งใหม่ (เพิ่มเวอร์ชัน)");
    expect(html).toContain("โหมดเงียบ — ปิดเสียงและสั่นของแอปนี้");
    expect(html).toContain("ค่าเริ่มต้นตอนล็อกดาวน์คือเปิดโหมดเงียบ");
    expect(html).toContain("ยุติแล้ว");
    expect(html).toContain("กลับสู่ปกติ");
    expect(html).toContain("ประวัติคำสั่งก่อนหน้า");
    expect(html).not.toContain("ของที่ยังไม่ทำในรอบนี้");
  });

  it("wires the ตรีจักร 191 demo map, red zone, and 20s admin queue", () => {
    expect(html).toContain("ตรีจักร 191");
    expect(html).toContain("campus-map");
    expect(html).toContain('width="1000" height="640"');
    const campusMap = readFileSync(new URL("../public/campus-map.svg", import.meta.url), "utf8");
    expect(campusMap).toContain('width="1000" height="640"');
    expect(campusMap).toContain("อาคาร 1");
    expect(campusMap).toContain("ตรีจักร 191");
    expect(campusMap.includes("\u0000") || /[\u0000-\u0008]/.test(campusMap)).toBe(false);
    expect(html).toContain("ยืนยันควบคุมภายใน 20 วินาที");
    expect(html).toContain('data-identity="commander5"');
    expect(html).toContain("เขตแดง");
    expect(app).toContain("/api/demo/map-pin");
    expect(app).toContain("/api/demo/red-zone");
    expect(app).toContain("/api/demo/confirm-control");
    expect(app).toContain("seedTemplateId: \"TRIJAK_191\"");
    expect(app).toContain("sharedStorage: window.localStorage");
    expect(app).toContain("BroadcastChannel");
    expect(app).not.toMatch(/RESOLUTION_APPROVALS_REQUIRED = 1/);
  });

  it("keeps the five mock walkthrough surfaces in the PWA shell", () => {
    expect(html).toContain("ผู้ที่ยังไม่กดรับทราบ");
    expect(html).toContain("After-action");
    expect(html).toContain("ปลอดภัย");
    expect(html).toContain("ต้องการช่วยเหลือ");
    expect(html).toContain("ไม่อยู่ในพื้นที่");
    expect(html).toContain("สิ่งที่ควรทำตอนนี้");
    expect(html).toContain("นี่คือการฝึกซ้อม · DRILL");
    expect(html).toContain('href="/demo"');
    expect(html).toContain("ดูโหมดสาธิต — ไม่ต้องเข้าสู่ระบบ");
  });
});

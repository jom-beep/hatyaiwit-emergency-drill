import { describe, expect, it } from "vitest";
import {
  DRILL_TEMPLATES,
  createDemoStore,
  isDemoLocation,
  seedPeople,
  summarizeRoster,
} from "../public/demo-mock.js";

const NOW = Date.parse("2026-09-10T10:00:00.000Z");

describe("isDemoLocation", () => {
  it("gates the mock to /demo or ?demo=1", () => {
    expect(isDemoLocation("/demo", "")).toBe(true);
    expect(isDemoLocation("/demo/", "")).toBe(true);
    expect(isDemoLocation("/", "?demo=1")).toBe(true);
    expect(isDemoLocation("/", "")).toBe(false);
    expect(isDemoLocation("/api/me", "")).toBe(false);
    expect(isDemoLocation("/auth/login", "?login_error=domain")).toBe(false);
  });
});

describe("drill templates", () => {
  it("covers fire, earthquake, lockdown, and threat with Thai DRILL copy", () => {
    const ids = DRILL_TEMPLATES.map((item) => item.id);
    expect(ids).toEqual(["FIRE", "EARTHQUAKE", "LOCKDOWN", "THREAT"]);
    expect(DRILL_TEMPLATES.map((item) => item.labelTh)).toEqual([
      "อพยพเหตุเพลิงไหม้",
      "แผ่นดินไหว",
      "ล็อกดาวน์ / ปิดพื้นที่",
      "ภัยคุกคาม",
    ]);
    for (const template of DRILL_TEMPLATES) {
      expect(template.instruction.startsWith("นี่คือการฝึกซ้อม")).toBe(true);
    }
  });
});

describe("seeded walkthrough roster", () => {
  it("starts with non-responders grouped by zone and ครูสมชาย still silent", () => {
    const people = seedPeople();
    const store = createDemoStore({ now: () => NOW });
    const rollup = store.getRosterSummary();
    expect(people).toHaveLength(30);
    expect(people.find((person) => person.id === "p-t01")?.initial).toBeNull();
    expect(rollup.silent).toBe(10);
    expect(rollup.responded).toBe(20);
    expect(rollup.needHelp).toBe(2);
    expect(rollup.safe).toBe(15);
    expect(rollup.nonRespondersByZone.some((group) => group.zoneName === "อาคาร 1")).toBe(true);
    expect(rollup.nonResponders.some((person) => person.name === "ครูสมชาย ใจดี")).toBe(true);
    const dashboard = store.getDashboard();
    expect(dashboard.incident.title).toContain("อพยพเหตุเพลิงไหม้");
    expect(dashboard.incident.title.startsWith("[การฝึกซ้อม]")).toBe(true);
  });
});

describe("two-way status after ack", () => {
  it("requires รับทราบ as a member, then allows ปลอดภัย / ต้องการช่วยเหลือ", () => {
    const store = createDemoStore({ now: () => NOW });
    store.setIdentity("member");
    const incidentId = store.getActive().id;
    expect(() => store.acknowledge({ incidentId, response: "ACK" })).not.toThrow();
    expect(store.getMe().ackResponse).toBe("ACK");
    store.acknowledge({ incidentId, response: "SAFE" });
    expect(store.getMe().ackResponse).toBe("SAFE");
    store.acknowledge({ incidentId, response: "NEED_HELP" });
    expect(store.getMe().ackResponse).toBe("NEED_HELP");
    const rollup = store.getRosterSummary();
    expect(rollup.nonResponders.some((person) => person.id === "p-t01")).toBe(false);
    expect(rollup.needHelp).toBe(3);
  });

  it("blocks commander identity from marking a fake person", () => {
    const store = createDemoStore({ now: () => NOW });
    expect(() => store.acknowledge({ incidentId: store.getActive().id, response: "ACK" })).toThrow(
      /ครูผู้รับแจ้ง/,
    );
  });
});

describe("after-action summary", () => {
  it("records ack rate and remaining non-responders once two commanders resolve", () => {
    const store = createDemoStore({ now: () => NOW });
    store.resolveDrill();
    expect(store.getActive().status).toBe("RESOLUTION_PENDING");
    store.setIdentity("commander2");
    const result = store.resolveDrill();
    expect(result.incident.status).toBe("RESOLVED");
    const after = store.getDashboard().afterAction;
    expect(after.ackPercent).toBe(67);
    expect(after.responded).toBe(20);
    expect(after.totalPeople).toBe(30);
    expect(after.needHelp).toBe(2);
    expect(after.silent).toBe(10);
    expect(after.nonRespondersByZone.length).toBeGreaterThan(0);
    expect(after.title).toContain("การฝึกซ้อม");
  });
});

describe("new drill from a template", () => {
  it("clears acknowledgements and uses the earthquake template", async () => {
    const store = createDemoStore({ now: () => NOW });
    store.setIdentity("commander");
    store.resolveDrill();
    store.setIdentity("commander2");
    store.resolveDrill();
    store.setIdentity("commander");
    const token = store.createActionToken().token;
    const activated = store.activateDrill({
      actionToken: token,
      mode: "DRILL",
      templateId: "EARTHQUAKE",
      zone: "BUILDING_2",
      instruction: DRILL_TEMPLATES.find((item) => item.id === "EARTHQUAKE").instruction,
    });
    expect(activated.incident.type).toBe("SHELTER");
    expect(activated.incident.title).toContain("แผ่นดินไหว");
    expect(activated.incident.instruction.startsWith("นี่คือการฝึกซ้อม")).toBe(true);
    expect(store.getRosterSummary().responded).toBe(0);
    expect(store.getRosterSummary().silent).toBe(30);
  });
});

describe("summarizeRoster", () => {
  it("treats ACK, SAFE, and NEED_HELP as responded", () => {
    const people = [
      { id: "a", name: "A", role: "ครู", zone: "BUILDING_1", room: "1" },
      { id: "b", name: "B", role: "นักเรียน", zone: "BUILDING_1", room: "1" },
      { id: "c", name: "C", role: "นักเรียน", zone: "BUILDING_2", room: "2" },
    ];
    const summary = summarizeRoster(people, [
      { personId: "a", response: "SAFE" },
      { personId: "b", response: "NEED_HELP" },
    ]);
    expect(summary.responded).toBe(2);
    expect(summary.silent).toBe(1);
    expect(summary.ackRate).toBeCloseTo(2 / 3);
    expect(summary.nonRespondersByZone).toEqual([
      {
        zoneId: "BUILDING_2",
        zoneName: "อาคาร 2",
        count: 1,
        people: [{ id: "c", name: "C", role: "นักเรียน", room: "2" }],
      },
    ]);
  });
});

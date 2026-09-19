import { describe, expect, it } from "vitest";
import {
  ADMIN_QUEUE_STEP_MS,
  DEMO_ADMINS,
  DRILL_TEMPLATES,
  RECIPIENT_GUIDANCE,
  RECIPIENT_STATUSES,
  RESOLUTION_APPROVALS_REQUIRED,
  SILENT_MODE_STORAGE_KEY,
  TRIJAK_TEMPLATE_ID,
  createDemoStore,
  isDemoLocation,
  isLockdownLike,
  isTrijak191,
  latestInstructionUpdate,
  priorInstructionUpdates,
  readSilentMode,
  seedPeople,
  summarizeRoster,
  writeSilentMode,
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
  it("covers ตรีจักร 191 plus fire, earthquake, lockdown, and threat with Thai DRILL copy", () => {
    const ids = DRILL_TEMPLATES.map((item) => item.id);
    expect(ids).toEqual(["TRIJAK_191", "FIRE", "EARTHQUAKE", "LOCKDOWN", "THREAT"]);
    expect(DRILL_TEMPLATES.map((item) => item.labelTh)).toEqual([
      "กราดยิง / ตรีจักร 191",
      "อพยพเหตุเพลิงไหม้",
      "แผ่นดินไหว",
      "ล็อกดาวน์ / ปิดพื้นที่",
      "ภัยคุกคาม",
    ]);
    for (const template of DRILL_TEMPLATES) {
      expect(template.instruction.startsWith("นี่คือการฝึกซ้อม")).toBe(true);
    }
    expect(DRILL_TEMPLATES[0].id).toBe(TRIJAK_TEMPLATE_ID);
    expect(DRILL_TEMPLATES[0].type).toBe("LOCKDOWN");
  });
});

describe("seeded walkthrough roster", () => {
  it("starts with non-responders grouped by zone and ครูสมชาย still silent", () => {
    const people = seedPeople();
    const store = createDemoStore({ now: () => NOW });
    const rollup = store.getRosterSummary();
    expect(people).toHaveLength(30);
    expect(people.find((person) => person.id === "p-t01")?.initial).toBeNull();
    expect(people.find((person) => person.id === "p-s03")?.initial).toBe("AWAY");
    expect(rollup.silent).toBe(9);
    expect(rollup.responded).toBe(21);
    expect(rollup.needHelp).toBe(2);
    expect(rollup.safe).toBe(15);
    expect(rollup.away).toBe(1);
    expect(rollup.nonRespondersByZone.some((group) => group.zoneName === "อาคาร 1")).toBe(true);
    expect(rollup.nonResponders.some((person) => person.name === "ครูสมชาย ใจดี")).toBe(true);
    expect(rollup.nonResponders.some((person) => person.id === "p-s03")).toBe(false);
    const dashboard = store.getDashboard();
    expect(dashboard.incident.title).toContain("อพยพเหตุเพลิงไหม้");
    expect(dashboard.incident.title.startsWith("[การฝึกซ้อม]")).toBe(true);
    expect(dashboard.acknowledgement.results.some((row) => row.response === "AWAY" && row.count === 1)).toBe(true);
  });
});

describe("two-way status after ack", () => {
  it("requires รับทราบ as a member, then allows ปลอดภัย / ต้องการช่วยเหลือ / ไม่อยู่ในพื้นที่", () => {
    const store = createDemoStore({ now: () => NOW });
    store.setIdentity("member");
    const incidentId = store.getActive().id;
    expect(() => store.acknowledge({ incidentId, response: "ACK" })).not.toThrow();
    expect(store.getMe().ackResponse).toBe("ACK");
    store.acknowledge({ incidentId, response: "SAFE" });
    expect(store.getMe().ackResponse).toBe("SAFE");
    store.acknowledge({ incidentId, response: "NEED_HELP" });
    expect(store.getMe().ackResponse).toBe("NEED_HELP");
    store.acknowledge({ incidentId, response: "AWAY" });
    expect(store.getMe().ackResponse).toBe("AWAY");
    const rollup = store.getRosterSummary();
    expect(rollup.nonResponders.some((person) => person.id === "p-t01")).toBe(false);
    expect(rollup.needHelp).toBe(2);
    expect(rollup.away).toBe(2);
  });

  it("does not lock status after the first tap during an active incident", () => {
    const store = createDemoStore({ now: () => NOW });
    store.setIdentity("member");
    const incidentId = store.getActive().id;
    store.acknowledge({ incidentId, response: "ACK" });
    store.acknowledge({ incidentId, response: "SAFE" });
    store.acknowledge({ incidentId, response: "AWAY" });
    store.acknowledge({ incidentId, response: "NEED_HELP" });
    store.acknowledge({ incidentId, response: "SAFE" });
    expect(store.getMe().ackResponse).toBe("SAFE");
    expect(store.getRosterSummary().nonResponders.some((person) => person.id === "p-t01")).toBe(false);
  });

  it("keeps AWAY out of the silent/non-responder dashboard", () => {
    const store = createDemoStore({ now: () => NOW });
    store.setIdentity("member");
    const incidentId = store.getActive().id;
    store.acknowledge({ incidentId, response: "ACK" });
    store.acknowledge({ incidentId, response: "AWAY" });
    const rollup = store.getRosterSummary();
    expect(rollup.away).toBe(2);
    expect(rollup.nonResponders.some((person) => person.id === "p-t01")).toBe(false);
    expect(rollup.nonResponders.some((person) => person.id === "p-s03")).toBe(false);
    expect(store.getDashboard().acknowledgement.results.find((row) => row.response === "AWAY")?.count).toBe(2);
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
    expect(after.ackPercent).toBe(70);
    expect(after.responded).toBe(21);
    expect(after.totalPeople).toBe(30);
    expect(after.needHelp).toBe(2);
    expect(after.away).toBe(1);
    expect(after.silent).toBe(9);
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
  it("treats ACK, SAFE, NEED_HELP, and AWAY as responded — not silent", () => {
    const people = [
      { id: "a", name: "A", role: "ครู", zone: "BUILDING_1", room: "1" },
      { id: "b", name: "B", role: "นักเรียน", zone: "BUILDING_1", room: "1" },
      { id: "c", name: "C", role: "นักเรียน", zone: "BUILDING_2", room: "2" },
      { id: "d", name: "D", role: "นักเรียน", zone: "BUILDING_2", room: "2" },
    ];
    const summary = summarizeRoster(people, [
      { personId: "a", response: "SAFE" },
      { personId: "b", response: "NEED_HELP" },
      { personId: "d", response: "AWAY" },
    ]);
    expect(summary.responded).toBe(3);
    expect(summary.silent).toBe(1);
    expect(summary.away).toBe(1);
    expect(summary.ackRate).toBeCloseTo(3 / 4);
    expect(summary.nonResponders.map((person) => person.id)).toEqual(["c"]);
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

describe("recipient guidance by incident type", () => {
  it("ships Thai lockdown steps: quiet, lights off, do not open the door", () => {
    expect(RECIPIENT_STATUSES).toEqual(["ACK", "SAFE", "NEED_HELP", "AWAY"]);
    expect(RECIPIENT_GUIDANCE.LOCKDOWN.title).toContain("ล็อกดาวน์");
    expect(RECIPIENT_GUIDANCE.LOCKDOWN.steps.join(" ")).toMatch(/เงียบ/);
    expect(RECIPIENT_GUIDANCE.LOCKDOWN.steps.join(" ")).toMatch(/ปิดไฟ/);
    expect(RECIPIENT_GUIDANCE.LOCKDOWN.steps.join(" ")).toMatch(/ห้ามเปิดประตู/);
    expect(RECIPIENT_GUIDANCE.EVACUATE.steps.join(" ")).toMatch(/ห้ามใช้ลิฟต์/);
    expect(createDemoStore({ now: () => NOW }).getConfig().recipientGuidance.LOCKDOWN.steps.length).toBeGreaterThan(2);
  });
});

describe("versioned command-center updates", () => {
  it("keeps the original instruction as version 1 and appends history on bump", () => {
    const store = createDemoStore({ now: () => NOW });
    const original = store.getActive().instruction;
    expect(store.getActive().version).toBe(1);
    expect(latestInstructionUpdate(store.getActive()).version).toBe(1);
    expect(priorInstructionUpdates(store.getActive())).toEqual([]);
    const bumped = store.pushUpdate({
      instruction: "นี่คือการฝึกซ้อม รอในห้องต่อไป จนกว่าศูนย์ควบคุมจะส่งคำสั่งใหม่",
    });
    expect(bumped.incident.version).toBe(2);
    expect(bumped.incident.instruction).toContain("รอในห้องต่อไป");
    expect(bumped.update.version).toBe(2);
    expect(bumped.update.publishedBy).toBe("CMD-DEMO1");
    const history = priorInstructionUpdates(bumped.incident);
    expect(history).toHaveLength(1);
    expect(history[0].version).toBe(1);
    expect(history[0].instruction).toBe(original);
    expect(latestInstructionUpdate(bumped.incident).instruction).toContain("รอในห้องต่อไป");
  });

  it("rejects short copy, members, and updates after resolve", () => {
    const store = createDemoStore({ now: () => NOW });
    expect(() => store.pushUpdate({ instruction: "สั้นไป" })).toThrow(/10/);
    store.setIdentity("member");
    expect(() => store.pushUpdate({ instruction: "นี่คือการฝึกซ้อม คำสั่งจากครูผู้รับแจ้ง" })).toThrow(/สิทธิ์/);
    store.setIdentity("commander");
    store.resolveDrill();
    store.setIdentity("commander2");
    store.resolveDrill();
    expect(() =>
      store.pushUpdate({ instruction: "นี่คือการฝึกซ้อม คำสั่งหลังยุติแล้วต้องถูกปฏิเสธ" }),
    ).toThrow(/ไม่มีเหตุ/);
  });

  it("does not treat a resolve bump as a new instruction version in history", () => {
    const store = createDemoStore({ now: () => NOW });
    store.pushUpdate({ instruction: "นี่คือการฝึกซ้อม ย้ายจุดรวมพลไปสนามหน้า" });
    expect(store.getActive().updates).toHaveLength(2);
    store.resolveDrill();
    store.setIdentity("commander2");
    store.resolveDrill();
    const incident = store.getActive();
    expect(incident.status).toBe("RESOLVED");
    expect(incident.updates).toHaveLength(2);
    expect(latestInstructionUpdate(incident).instruction).toContain("ย้ายจุดรวมพล");
    expect(incident.version).toBeGreaterThan(latestInstructionUpdate(incident).version);
  });
});

describe("lockdown silent mode preference", () => {
  it("treats LOCKDOWN templates as lockdown-like and persists the toggle in sessionStorage", () => {
    expect(isLockdownLike("LOCKDOWN")).toBe(true);
    expect(isLockdownLike("EVACUATE")).toBe(false);
    expect(DRILL_TEMPLATES.find((item) => item.id === "THREAT")?.type).toBe("LOCKDOWN");
    const mem = new Map();
    const storage = {
      getItem: (key) => (mem.has(key) ? mem.get(key) : null),
      setItem: (key, value) => mem.set(key, String(value)),
      removeItem: (key) => mem.delete(key),
    };
    expect(readSilentMode(storage)).toBe(false);
    expect(readSilentMode(storage, "LOCKDOWN")).toBe(true);
    writeSilentMode(storage, true);
    expect(storage.getItem(SILENT_MODE_STORAGE_KEY)).toBe("1");
    expect(readSilentMode(storage, "LOCKDOWN")).toBe(true);
    writeSilentMode(storage, false);
    expect(storage.getItem(SILENT_MODE_STORAGE_KEY)).toBe("0");
    expect(readSilentMode(storage, "LOCKDOWN")).toBe(false);
  });
});

describe("personal acknowledgement timestamps", () => {
  it("keeps first ack time when status changes later", () => {
    let clock = NOW;
    const store = createDemoStore({ now: () => clock });
    store.setIdentity("member");
    const incidentId = store.getActive().id;
    store.acknowledge({ incidentId, response: "ACK" });
    const first = store.getMe().ackAt;
    expect(first).toBe(new Date(NOW).toISOString());
    clock = NOW + 90_000;
    store.acknowledge({ incidentId, response: "SAFE" });
    clock = NOW + 180_000;
    store.acknowledge({ incidentId, response: "NEED_HELP" });
    const me = store.getMe();
    expect(me.ackAt).toBe(first);
    expect(me.ackUpdatedAt).toBe(new Date(NOW + 180_000).toISOString());
    expect(me.ackResponse).toBe("NEED_HELP");
    expect(me.ackUpdatedAt).not.toBe(me.ackAt);
  });
});

describe("resolution approvals stay at two commanders", () => {
  it("does not lower RESOLUTION_APPROVALS_REQUIRED in the demo mock", () => {
    expect(RESOLUTION_APPROVALS_REQUIRED).toBe(2);
    const store = createDemoStore({ now: () => NOW });
    expect(store.getConfig().resolutionApprovalsRequired).toBe(2);
    store.resolveDrill();
    expect(store.getActive().status).toBe("RESOLUTION_PENDING");
  });
});

function startTrijak(store) {
  store.resolveDrill();
  store.setIdentity("commander2");
  store.resolveDrill();
  store.setIdentity("commander");
  const token = store.createActionToken().token;
  return store.activateDrill({
    actionToken: token,
    mode: "DRILL",
    templateId: TRIJAK_TEMPLATE_ID,
    zone: "ALL",
    instruction: DRILL_TEMPLATES.find((item) => item.id === TRIJAK_TEMPLATE_ID).instruction,
  });
}

describe("ตรีจักร 191 map, red zone, and admin queue", () => {
  it("keeps five demo admins and 20-second queue steps", () => {
    expect(DEMO_ADMINS).toHaveLength(5);
    expect(ADMIN_QUEUE_STEP_MS).toBe(20_000);
    expect(createDemoStore({ now: () => NOW }).getConfig().adminQueueStepSeconds).toBe(20);
  });

  it("lets a recipient plant a timed pin and syncs it on the shared map", () => {
    const store = createDemoStore({ now: () => NOW });
    startTrijak(store);
    expect(isTrijak191(store.getActive())).toBe(true);
    expect(store.getActive().title).toContain("ตรีจักร 191");
    expect(() => store.placeMapPin({ x: 32, y: 40 })).toThrow(/ครูผู้รับแจ้ง/);
    store.setIdentity("member");
    const planted = store.placeMapPin({ x: 32, y: 40 });
    expect(planted.pin.label).toBe("ครูผู้รับแจ้ง");
    expect(planted.pin.plantedAt).toBe(new Date(NOW).toISOString());
    expect(store.getMap().pins).toHaveLength(1);
    store.placeMapPin({ x: 70, y: 55 });
    expect(store.getMap().pins).toHaveLength(1);
    expect(store.getMap().pins[0].x).toBe(70);
  });

  it("rotates control after 20 seconds and only the controller may place the red zone", () => {
    let clock = NOW;
    const store = createDemoStore({ now: () => clock });
    startTrijak(store);
    expect(() => store.setRedZone({ x: 50, y: 50 })).toThrow(/ยืนยันควบคุม/);
    store.setIdentity("commander2");
    expect(() => store.confirmControl()).toThrow(/ยังไม่ถึงคิว/);
    store.setIdentity("commander");
    clock = NOW + ADMIN_QUEUE_STEP_MS;
    const rotated = store.getAdminQueue();
    expect(rotated.currentIndex).toBe(1);
    expect(rotated.currentAdmin.id).toBe("commander2");
    expect(rotated.admins[0].state).toBe("missed");
    expect(rotated.admins[1].state).toBe("offered");
    store.setIdentity("commander2");
    const claimed = store.confirmControl();
    expect(claimed.adminQueue.controllerId).toBe("commander2");
    expect(claimed.adminQueue.admins[1].state).toBe("controller");
    const zone = store.setRedZone({ x: 48, y: 36 });
    expect(zone.redZone.movedBy).toBe("ผู้ประกาศ 2");
    expect(store.getMap().redZone.x).toBe(48);
    store.setIdentity("commander");
    expect(() => store.setRedZone({ x: 10, y: 10 })).toThrow(/ยืนยันควบคุม/);
  });

  it("clears pins and the red zone on all-clear while still requiring two resolve approvals", () => {
    const store = createDemoStore({ now: () => NOW });
    startTrijak(store);
    store.confirmControl();
    store.setRedZone({ x: 40, y: 40 });
    store.setIdentity("member");
    store.placeMapPin({ x: 22, y: 60 });
    expect(store.getMap().pins).toHaveLength(1);
    expect(store.getMap().redZone).toBeTruthy();
    store.setIdentity("commander");
    const pending = store.resolveDrill();
    expect(pending.incident.status).toBe("RESOLUTION_PENDING");
    expect(store.getMap().pins).toHaveLength(1);
    store.setIdentity("commander2");
    const resolved = store.resolveDrill();
    expect(resolved.incident.status).toBe("RESOLVED");
    expect(store.getMap().pins).toEqual([]);
    expect(store.getMap().redZone).toBeNull();
    expect(store.getAdminQueue().active).toBe(false);
    expect(RESOLUTION_APPROVALS_REQUIRED).toBe(2);
  });

  it("shares map state across two stores on the same sharedStorage", () => {
    const mem = new Map();
    const sharedStorage = {
      getItem: (key) => (mem.has(key) ? mem.get(key) : null),
      setItem: (key, value) => mem.set(key, String(value)),
      removeItem: (key) => mem.delete(key),
    };
    const identityA = new Map();
    const identityB = new Map();
    const storageA = {
      getItem: (key) => (identityA.has(key) ? identityA.get(key) : null),
      setItem: (key, value) => identityA.set(key, String(value)),
      removeItem: (key) => identityA.delete(key),
    };
    const storageB = {
      getItem: (key) => (identityB.has(key) ? identityB.get(key) : null),
      setItem: (key, value) => identityB.set(key, String(value)),
      removeItem: (key) => identityB.delete(key),
    };
    const commander = createDemoStore({ now: () => NOW, storage: storageA, sharedStorage, seedTemplateId: TRIJAK_TEMPLATE_ID });
    commander.confirmControl();
    commander.setRedZone({ x: 30, y: 30 });
    const recipient = createDemoStore({ now: () => NOW, storage: storageB, sharedStorage, seedTemplateId: TRIJAK_TEMPLATE_ID });
    recipient.setIdentity("member");
    expect(recipient.getMap().redZone.x).toBe(30);
    recipient.placeMapPin({ x: 80, y: 20 });
    const commanderAgain = createDemoStore({ now: () => NOW, storage: storageA, sharedStorage, seedTemplateId: TRIJAK_TEMPLATE_ID });
    expect(commanderAgain.getMap().pins[0].label).toBe("ครูผู้รับแจ้ง");
    expect(commanderAgain.getAdminQueue().controllerId).toBe("commander");
  });
});

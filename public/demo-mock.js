/**
 * Isolated MOCK/DEMO store. Loaded only from /demo or ?demo=1.
 * Never calls production APIs, D1, Durable Objects, or Google OAuth.
 */

export function isDemoLocation(pathname = "", search = "") {
  const path = String(pathname).replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return path === "/demo" || params.get("demo") === "1";
}

export const DRILL_TEMPLATES = [
  {
    id: "FIRE",
    type: "EVACUATE",
    labelTh: "อพยพเหตุเพลิงไหม้",
    instruction:
      "นี่คือการฝึกซ้อม อพยพตามเส้นทางหนีไฟไปยังจุดรวมพล ห้ามใช้ลิฟต์ ตรวจหัวนับแถวแล้วรอคำสั่งจากศูนย์ควบคุม",
  },
  {
    id: "EARTHQUAKE",
    type: "SHELTER",
    labelTh: "แผ่นดินไหว",
    instruction:
      "นี่คือการฝึกซ้อม หมอบ-กำบัง-ยึด ใต้โต๊ะทันที เมื่อแรงสั่นหยุดให้อพยพไปจุดรวมพลและรอการตรวจนับ",
  },
  {
    id: "LOCKDOWN",
    type: "LOCKDOWN",
    labelTh: "ล็อกดาวน์ / ปิดพื้นที่",
    instruction:
      "นี่คือการฝึกซ้อม ล็อกประตู ปิดไฟ อยู่ห่างจากหน้าต่างและประตู ห้ามเปิดห้องจนกว่าผู้ประกาศจะยุติการฝึก",
  },
  {
    id: "THREAT",
    type: "LOCKDOWN",
    labelTh: "ภัยคุกคาม",
    instruction:
      "นี่คือการฝึกซ้อม ปิดล็อกห้อง เงียบและอยู่ต่ำ ห้ามออกนอกห้อง จนกว่าศูนย์ควบคุมจะประกาศยุติการฝึกซ้อม",
  },
];

/** Explicit recipient status. AWAY is a response — not the same as silent/non-responder. */
export const RECIPIENT_STATUSES = ["ACK", "SAFE", "NEED_HELP", "AWAY"];

/** Match production: two distinct commanders must confirm resolve. Do not lower this in demo. */
export const RESOLUTION_APPROVALS_REQUIRED = 2;

export const SILENT_MODE_STORAGE_KEY = "hyw-demo-silent-lockdown";

export const RECIPIENT_STATUS_LABEL = {
  ACK: "รับทราบ",
  SAFE: "ปลอดภัย",
  NEED_HELP: "ต้องการช่วยเหลือ",
  AWAY: "ไม่อยู่ในพื้นที่",
};

/** LOCKDOWN templates (ล็อกดาวน์ / ภัยคุกคาม) share type LOCKDOWN. */
export function isLockdownLike(type) {
  return type === "LOCKDOWN";
}

export function readSilentMode(storage) {
  return storage?.getItem?.(SILENT_MODE_STORAGE_KEY) === "1";
}

export function writeSilentMode(storage, enabled) {
  if (!storage) return Boolean(enabled);
  if (enabled) storage.setItem(SILENT_MODE_STORAGE_KEY, "1");
  else storage.removeItem(SILENT_MODE_STORAGE_KEY);
  return Boolean(enabled);
}

export function latestInstructionUpdate(incident) {
  const updates = incident?.updates;
  if (Array.isArray(updates) && updates.length) return updates[updates.length - 1];
  if (!incident) return null;
  return {
    version: incident.version ?? 1,
    instruction: incident.instruction,
    publishedAt: incident.issuedAt,
    publishedBy: "ศูนย์ควบคุม",
  };
}

export function priorInstructionUpdates(incident) {
  const updates = Array.isArray(incident?.updates) ? incident.updates : [];
  return updates.slice(0, Math.max(0, updates.length - 1)).slice().reverse();
}

export const RECIPIENT_GUIDANCE = {
  LOCKDOWN: {
    title: "ขณะล็อกดาวน์ / ปิดพื้นที่",
    steps: [
      "เงียบ — ห้ามพูดคุยหรือโทรออกนอกจากจำเป็น",
      "ปิดไฟ และอยู่ห่างจากหน้าต่างกับประตู",
      "ห้ามเปิดประตูให้ใคร จนกว่าศูนย์ควบคุมจะประกาศยุติ",
      "นั่งหรือหมอบในจุดกำบังภายในห้อง",
    ],
  },
  EVACUATE: {
    title: "ขณะอพยพ",
    steps: [
      "เดินตามเส้นทางหนีไฟไปยังจุดรวมพล",
      "ห้ามใช้ลิฟต์",
      "อย่ากลับเข้าอาคารจนกว่าจะได้รับคำสั่ง",
      "รวมตัวแล้วรอตรวจนับจากครูประจำชั้น",
    ],
  },
  SHELTER: {
    title: "ขณะอยู่ในพื้นที่ปลอดภัย",
    steps: [
      "หมอบ-กำบัง-ยึด ใต้โต๊ะหรือโครงสร้างแข็ง",
      "อยู่ห่างจากกระจกและของที่อาจร่วง",
      "อย่าวิ่งออกนอกห้องจนกว่าแรงสั่นหรือภัยจะผ่าน",
      "รอคำสั่งอพยพหรือยุติจากศูนย์ควบคุม",
    ],
  },
  MEDICAL: {
    title: "ขณะมีเหตุการแพทย์",
    steps: [
      "อยู่กับที่ถ้าไม่ใช่ผู้ช่วยเหลือ",
      "เปิดทางให้เจ้าหน้าที่และความช่วยเหลือ",
      "อย่าถ่ายภาพหรือรวมตัวดูเหตุ",
      "รอคำสั่งจากศูนย์ควบคุม",
    ],
  },
  INFORMATION: {
    title: "ประกาศจากศูนย์ควบคุม",
    steps: [
      "อ่านประกาศให้ครบแล้วปฏิบัติตาม",
      "อย่าส่งต่อข่าวที่ไม่ใช่จากโรงเรียน",
      "รอการอัปเดตจากศูนย์ควบคุม",
    ],
  },
};

export const DEMO_ZONES = [
  { id: "ALL", name: "ทั้งโรงเรียน" },
  { id: "BUILDING_1", name: "อาคาร 1" },
  { id: "BUILDING_2", name: "อาคาร 2" },
  { id: "BUILDING_3", name: "อาคาร 3" },
  { id: "FIELD", name: "สนามกีฬา" },
  { id: "CANTEEN", name: "โรงอาหาร" },
];

export const DEMO_IDENTITIES = [
  {
    id: "commander",
    email: "ผู้ประกาศจำลอง (ไม่ใช่บัญชีจริง)",
    role: "commander",
    callSign: "CMD-DEMO1",
    displayName: "ผู้ประกาศ 1",
  },
  {
    id: "commander2",
    email: "ผู้ประกาศคนที่ 2 (จำลอง)",
    role: "commander",
    callSign: "CMD-DEMO2",
    displayName: "ผู้ประกาศ 2",
  },
  {
    id: "member",
    email: "ครูสมชาย ใจดี (จำลอง)",
    role: "member",
    callSign: null,
    displayName: "ครูผู้รับแจ้ง",
    personId: "p-t01",
  },
];

const ZONE_NAME = Object.fromEntries(DEMO_ZONES.map((zone) => [zone.id, zone.name]));

class DemoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function seedPeople() {
  return [
    { id: "p-t01", name: "ครูสมชาย ใจดี", role: "ครู", zone: "BUILDING_1", room: "ม.4/1 ห้อง 101", initial: null },
    { id: "p-t02", name: "ครูมาลี รักเรียน", role: "ครู", zone: "BUILDING_1", room: "ม.4/2 ห้อง 102", initial: "SAFE" },
    { id: "p-s01", name: "นายธนกร ศรีสุข", role: "นักเรียน", zone: "BUILDING_1", room: "ม.4/1", initial: "SAFE" },
    { id: "p-s02", name: "นางสาวปภาวดี ทองแท้", role: "นักเรียน", zone: "BUILDING_1", room: "ม.4/1", initial: "ACK" },
    { id: "p-s03", name: "นายกิตติพงศ์ มีชัย", role: "นักเรียน", zone: "BUILDING_1", room: "ม.4/2", initial: "AWAY" },
    { id: "p-s04", name: "นางสาวอรุณี สุขใจ", role: "นักเรียน", zone: "BUILDING_1", room: "ม.4/2", initial: "SAFE" },
    { id: "p-s05", name: "นายพีรพัฒน์ แก้วมณี", role: "นักเรียน", zone: "BUILDING_1", room: "ม.5/1 ห้อง 103", initial: "NEED_HELP" },
    { id: "p-s06", name: "นางสาวชลธิชา บุญส่ง", role: "นักเรียน", zone: "BUILDING_1", room: "ม.5/1", initial: "SAFE" },
    { id: "p-s07", name: "นายวรพล ตั้งตรง", role: "นักเรียน", zone: "BUILDING_1", room: "ม.5/2", initial: null },
    { id: "p-s08", name: "นางสาวกมลชนก เจริญ", role: "นักเรียน", zone: "BUILDING_1", room: "ม.5/2", initial: "SAFE" },
    { id: "p-t03", name: "ครูวิชัย ชาญชัย", role: "ครู", zone: "BUILDING_2", room: "ม.2/1 ห้อง 201", initial: "SAFE" },
    { id: "p-s09", name: "นายศิริพงษ์ นาคทอง", role: "นักเรียน", zone: "BUILDING_2", room: "ม.2/1", initial: null },
    { id: "p-s10", name: "นางสาวพิมพ์ใจ แสงทอง", role: "นักเรียน", zone: "BUILDING_2", room: "ม.2/1", initial: "SAFE" },
    { id: "p-s11", name: "นายณัฐวุฒิ รุ่งเรือง", role: "นักเรียน", zone: "BUILDING_2", room: "ม.2/2", initial: "SAFE" },
    { id: "p-s12", name: "นางสาวนันทิดา ใจเย็น", role: "นักเรียน", zone: "BUILDING_2", room: "ม.2/2", initial: null },
    { id: "p-t04", name: "ครูสุนิสา พูนสุข", role: "ครู", zone: "BUILDING_2", room: "ม.3/1 ห้อง 202", initial: "ACK" },
    { id: "p-s13", name: "นายอนุชา เพชรดี", role: "นักเรียน", zone: "BUILDING_2", room: "ม.3/1", initial: "SAFE" },
    { id: "p-s14", name: "นางสาวเบญจวรรณ ศรีงาม", role: "นักเรียน", zone: "BUILDING_2", room: "ม.3/2", initial: "NEED_HELP" },
    { id: "p-s15", name: "นายธีรภัทร วงศ์ใหญ่", role: "นักเรียน", zone: "BUILDING_2", room: "ม.3/2", initial: null },
    { id: "p-t05", name: "ครูประเสริฐ ยิ้มแย้ม", role: "ครู", zone: "BUILDING_3", room: "ม.6/1 ห้อง 301", initial: "SAFE" },
    { id: "p-s16", name: "นางสาวศศิธร บุญมี", role: "นักเรียน", zone: "BUILDING_3", room: "ม.6/1", initial: null },
    { id: "p-s17", name: "นายภัทรพล สว่างศรี", role: "นักเรียน", zone: "BUILDING_3", room: "ม.6/1", initial: "SAFE" },
    { id: "p-s18", name: "นางสาวจารุวรรณ ตั้งใจ", role: "นักเรียน", zone: "BUILDING_3", room: "ม.6/2", initial: "SAFE" },
    { id: "p-s19", name: "นายเอกชัย มั่นคง", role: "นักเรียน", zone: "BUILDING_3", room: "ม.6/2", initial: null },
    { id: "p-t06", name: "ครูอรทัย สายฝน", role: "ครู", zone: "BUILDING_3", room: "ห้องสมุด", initial: "ACK" },
    { id: "p-t07", name: "ครูวิชาญ แข็งแรง", role: "ครู", zone: "FIELD", room: "สนามกีฬา", initial: "SAFE" },
    { id: "p-s20", name: "นายกฤษณะ เร็ววัน", role: "นักเรียน", zone: "FIELD", room: "ม.1/1", initial: null },
    { id: "p-s21", name: "นางสาวเมธาวี ยิ้มสด", role: "นักเรียน", zone: "FIELD", room: "ม.1/2", initial: "SAFE" },
    { id: "p-t08", name: "สมปอง ดีทาน", role: "เจ้าหน้าที่", zone: "CANTEEN", room: "โรงอาหาร", initial: null },
    { id: "p-t09", name: "นางสาวขวัญใจ รักสะอาด", role: "เจ้าหน้าที่", zone: "CANTEEN", room: "โรงอาหาร", initial: "SAFE" },
  ];
}

function templateById(id) {
  return DRILL_TEMPLATES.find((item) => item.id === id) ?? DRILL_TEMPLATES[0];
}

function templateByType(type) {
  return DRILL_TEMPLATES.find((item) => item.type === type) ?? DRILL_TEMPLATES[0];
}

export function makeIncident(nowMs, template, zone = "ALL", publisher = "ศูนย์ควบคุม") {
  const issued = new Date(nowMs);
  const stamp = issued.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const issuedAt = issued.toISOString();
  return {
    id: `DEMO-${stamp}-walkthru`,
    version: 1,
    mode: "DRILL",
    type: template.type,
    status: "ACTIVE",
    zone,
    title: `[การฝึกซ้อม] ${template.labelTh}`,
    instruction: template.instruction,
    issuedAt,
    expiresAt: new Date(nowMs + 2 * 60 * 60_000).toISOString(),
    updates: [
      {
        version: 1,
        instruction: template.instruction,
        publishedAt: issuedAt,
        publishedBy: publisher,
      },
    ],
  };
}

function seedAcknowledgements(people, incidentId, nowIso) {
  const rows = [];
  for (const person of people) {
    if (!person.initial) continue;
    rows.push({
      incidentId,
      personId: person.id,
      response: person.initial,
      zone: person.zone,
      createdAt: nowIso,
      firstAckAt: nowIso,
    });
  }
  return rows;
}

export function summarizeRoster(people, acknowledgements) {
  const byPerson = new Map(acknowledgements.map((row) => [row.personId, row]));
  const responded = acknowledgements.length;
  const total = people.length;
  const safe = acknowledgements.filter((row) => row.response === "SAFE").length;
  const needHelp = acknowledgements.filter((row) => row.response === "NEED_HELP").length;
  const ackOnly = acknowledgements.filter((row) => row.response === "ACK").length;
  const away = acknowledgements.filter((row) => row.response === "AWAY").length;
  const nonResponders = people.filter((person) => !byPerson.has(person.id));
  const zoneOrder = DEMO_ZONES.filter((zone) => zone.id !== "ALL").map((zone) => zone.id);
  const nonRespondersByZone = zoneOrder
    .map((zoneId) => {
      const list = nonResponders.filter((person) => person.zone === zoneId);
      return {
        zoneId,
        zoneName: ZONE_NAME[zoneId] ?? zoneId,
        count: list.length,
        people: list.map((person) => ({
          id: person.id,
          name: person.name,
          role: person.role,
          room: person.room,
        })),
      };
    })
    .filter((group) => group.count > 0);

  return {
    totalPeople: total,
    responded,
    silent: nonResponders.length,
    ackRate: total === 0 ? 0 : responded / total,
    safe,
    needHelp,
    ackOnly,
    away,
    nonResponders,
    nonRespondersByZone,
  };
}

function afterActionSummary(incident, roster, resolvedAt) {
  if (!incident || incident.status !== "RESOLVED") return null;
  const issuedAt = new Date(incident.issuedAt).getTime();
  const endedAt = new Date(resolvedAt ?? incident.resolvedAt ?? Date.now()).getTime();
  return {
    title: incident.title,
    type: incident.type,
    issuedAt: incident.issuedAt,
    resolvedAt: incident.resolvedAt ?? new Date(endedAt).toISOString(),
    durationMinutes: Math.max(1, Math.round((endedAt - issuedAt) / 60_000)),
    totalPeople: roster.totalPeople,
    responded: roster.responded,
    silent: roster.silent,
    ackRate: roster.ackRate,
    ackPercent: Math.round(roster.ackRate * 100),
    safe: roster.safe,
    needHelp: roster.needHelp,
    ackOnly: roster.ackOnly,
    away: roster.away,
    nonRespondersByZone: roster.nonRespondersByZone,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeIncident(raw) {
  if (!raw || typeof raw !== "object") return null;
  const incident = clone(raw);
  if (!Array.isArray(incident.updates) || incident.updates.length === 0) {
    incident.updates = [
      {
        version: 1,
        instruction: incident.instruction,
        publishedAt: incident.issuedAt,
        publishedBy: "ศูนย์ควบคุม",
      },
    ];
  }
  return incident;
}

function normalizeAck(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    firstAckAt: row.firstAckAt ?? row.createdAt,
    createdAt: row.createdAt ?? row.firstAckAt,
  };
}

export function createDemoStore(options = {}) {
  const now = options.now ?? (() => Date.now());
  const storage = options.storage ?? null;
  const listeners = new Set();
  const STORAGE_KEY = "hyw-demo-v1";

  let people = seedPeople();
  let identityId = "commander";
  let incident = null;
  let acknowledgements = [];
  let actionToken = null;
  let actionTokenExpires = 0;
  let resolutionApprovals = [];
  let devices = { total: people.length, ready: people.length, stale: 0 };

  function currentIdentity() {
    const identity = DEMO_IDENTITIES.find((item) => item.id === identityId) ?? DEMO_IDENTITIES[0];
    return identity;
  }

  function persist() {
    if (!storage?.setItem) return;
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        identityId,
        incident,
        acknowledgements,
        resolutionApprovals,
      }),
    );
  }

  function restore() {
    if (!storage?.getItem) return false;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;
      identityId = parsed.identityId === "commander2" || parsed.identityId === "member" ? parsed.identityId : "commander";
      incident = parsed.incident ? normalizeIncident(parsed.incident) : null;
      acknowledgements = Array.isArray(parsed.acknowledgements) ? parsed.acknowledgements.map(normalizeAck) : [];
      resolutionApprovals = Array.isArray(parsed.resolutionApprovals) ? parsed.resolutionApprovals : [];
      return true;
    } catch {
      return false;
    }
  }

  function emit() {
    persist();
    const snapshot = getActive();
    for (const listener of listeners) listener({ type: "incident_state", incident: snapshot });
  }

  function roster() {
    return summarizeRoster(people, incident ? acknowledgements.filter((row) => row.incidentId === incident.id) : []);
  }

  function seedActiveDrill() {
    const template = templateById("FIRE");
    incident = makeIncident(now() - 4 * 60_000, template, "ALL");
    acknowledgements = seedAcknowledgements(people, incident.id, new Date(now() - 2 * 60_000).toISOString());
    resolutionApprovals = [];
  }

  function getActive() {
    return incident ? clone(incident) : null;
  }

  function dashboard() {
    const activeAcks = incident ? acknowledgements.filter((row) => row.incidentId === incident.id) : [];
    const summary = summarizeRoster(people, activeAcks);
    const ackRows = [
      { response: "ACK", count: summary.ackOnly },
      { response: "SAFE", count: summary.safe },
      { response: "NEED_HELP", count: summary.needHelp },
      { response: "AWAY", count: summary.away },
    ].filter((row) => row.count > 0);
    const sent = incident ? Math.max(0, people.length - 1) : 0;
    return {
      incident: getActive(),
      devices,
      delivery: incident ? { results: [{ status: "SENT", count: sent }, { status: "FAILED", count: 1 }] } : null,
      acknowledgement: incident ? { results: ackRows } : null,
      rollup: summary,
      afterAction: afterActionSummary(incident, summary, incident?.resolvedAt),
      demo: true,
    };
  }

  if (!restore()) seedActiveDrill();

  return {
    getConfig() {
      return {
        schoolName: "โรงเรียนหาดใหญ่วิทยาลัย (โหมดสาธิต)",
        mode: "DRILL",
        googleDomain: "khanchai.ac.th",
        version: "demo-0.8.0",
        vapidPublicKey: "",
        zones: clone(DEMO_ZONES),
        demo: true,
        templates: clone(DRILL_TEMPLATES),
        recipientGuidance: clone(RECIPIENT_GUIDANCE),
        resolutionApprovalsRequired: RESOLUTION_APPROVALS_REQUIRED,
        silentModeKey: SILENT_MODE_STORAGE_KEY,
      };
    },
    getMe() {
      const identity = currentIdentity();
      const personId = identity.personId ?? null;
      const ack =
        personId && incident
          ? acknowledgements.find((row) => row.incidentId === incident.id && row.personId === personId)
          : null;
      return {
        email: identity.email,
        role: identity.role,
        mode: "DRILL",
        callSign: identity.callSign,
        demo: true,
        displayName: identity.displayName,
        identityId: identity.id,
        personId,
        ackResponse: ack?.response ?? null,
        ackedIncidentId: ack?.incidentId ?? null,
        ackAt: ack?.firstAckAt ?? ack?.createdAt ?? null,
        ackUpdatedAt: ack?.createdAt ?? null,
      };
    },
    setIdentity(id) {
      if (!DEMO_IDENTITIES.some((item) => item.id === id)) throw new DemoError(400, "ไม่พบบทบาทจำลองนี้");
      identityId = id;
      persist();
      return this.getMe();
    },
    getIdentityId() {
      return identityId;
    },
    getActive,
    getDashboard: dashboard,
    getRosterSummary: roster,
    acknowledge({ incidentId, response, zone }) {
      if (!incident || incident.id !== incidentId || incident.status === "RESOLVED") {
        throw new DemoError(409, "ไม่มีการฝึกซ้อมที่รับทราบได้");
      }
      const identity = currentIdentity();
      const personId = identity.personId;
      if (!personId) throw new DemoError(400, "สลับเป็นครูผู้รับแจ้งก่อน จึงจะกดรับทราบในโหมดสาธิตได้");
      if (!RECIPIENT_STATUSES.includes(response)) {
        throw new DemoError(400, "ข้อมูลตอบรับไม่ถูกต้อง");
      }
      const existing = acknowledgements.find((row) => row.incidentId === incidentId && row.personId === personId);
      const stamp = new Date(now()).toISOString();
      const row = {
        incidentId,
        personId,
        response,
        zone: zone ?? people.find((person) => person.id === personId)?.zone ?? "ALL",
        createdAt: stamp,
        firstAckAt: existing?.firstAckAt ?? stamp,
      };
      if (existing) Object.assign(existing, row);
      else acknowledgements.push(row);
      emit();
      return { ok: true, response, createdAt: row.createdAt, firstAckAt: row.firstAckAt };
    },
    pushUpdate({ instruction }) {
      const identity = currentIdentity();
      if (identity.role !== "commander") throw new DemoError(403, "ไม่มีสิทธิ์ดำเนินการนี้");
      if (!incident || incident.status === "RESOLVED") {
        throw new DemoError(409, "ไม่มีเหตุที่กำลังดำเนินอยู่");
      }
      const text = String(instruction ?? "").trim().slice(0, 240);
      if (text.length < 10) throw new DemoError(400, "คำแนะนำต้องมีอย่างน้อย 10 ตัวอักษร");
      const publishedAt = new Date(now()).toISOString();
      const nextVersion = incident.version + 1;
      const updates = Array.isArray(incident.updates) ? clone(incident.updates) : [];
      updates.push({
        version: nextVersion,
        instruction: text,
        publishedAt,
        publishedBy: identity.callSign || identity.displayName,
      });
      incident = {
        ...incident,
        version: nextVersion,
        instruction: text,
        updates,
      };
      emit();
      return { incident: getActive(), update: clone(updates[updates.length - 1]) };
    },
    createActionToken() {
      const identity = currentIdentity();
      if (identity.role !== "commander") throw new DemoError(403, "ไม่มีสิทธิ์ดำเนินการนี้");
      actionToken = `demo-action-${now()}`;
      actionTokenExpires = now() + 60_000;
      return { token: actionToken, expiresAt: new Date(actionTokenExpires).toISOString() };
    },
    activateDrill({ actionToken: token, mode, type, zone, instruction, templateId }) {
      const identity = currentIdentity();
      if (identity.role !== "commander") throw new DemoError(403, "ไม่มีสิทธิ์ดำเนินการนี้");
      if (mode !== "DRILL") throw new DemoError(403, "ต้นแบบนี้อนุญาตเฉพาะการฝึกซ้อม");
      if (!token || token !== actionToken || now() > actionTokenExpires) {
        throw new DemoError(409, "Action token หมดอายุหรือถูกใช้แล้ว");
      }
      actionToken = null;
      if (incident && incident.status !== "RESOLVED") {
        throw new DemoError(409, "มีการฝึกซ้อมที่กำลังดำเนินอยู่");
      }
      const template = templateId ? templateById(templateId) : templateByType(type);
      const text = String(instruction ?? template.instruction).trim();
      if (text.length < 10) throw new DemoError(400, "คำแนะนำต้องมีอย่างน้อย 10 ตัวอักษร");
      const selectedZone = DEMO_ZONES.some((item) => item.id === zone) ? zone : "ALL";
      incident = makeIncident(now(), template, selectedZone, identity.callSign || identity.displayName);
      incident.instruction = text;
      if (incident.updates?.[0]) incident.updates[0].instruction = text;
      acknowledgements = [];
      resolutionApprovals = [];
      emit();
      return { incident: getActive() };
    },
    resolveDrill() {
      const identity = currentIdentity();
      if (identity.role !== "commander") throw new DemoError(403, "ไม่มีสิทธิ์ดำเนินการนี้");
      if (!incident || incident.status === "RESOLVED") throw new DemoError(409, "ไม่มีเหตุที่กำลังดำเนินอยู่");
      const hash = identity.callSign;
      if (!resolutionApprovals.includes(hash)) resolutionApprovals.push(hash);
      const resolved = resolutionApprovals.length >= RESOLUTION_APPROVALS_REQUIRED;
      incident = {
        ...incident,
        version: incident.version + 1,
        status: resolved ? "RESOLVED" : "RESOLUTION_PENDING",
        ...(resolved ? { resolvedAt: new Date(now()).toISOString() } : {}),
      };
      emit();
      return {
        incident: getActive(),
        approvalCount: resolutionApprovals.length,
        approvalsRequired: Math.max(0, RESOLUTION_APPROVALS_REQUIRED - resolutionApprovals.length),
      };
    },
    reset() {
      identityId = "commander";
      actionToken = null;
      actionTokenExpires = 0;
      if (storage?.removeItem) storage.removeItem(STORAGE_KEY);
      seedActiveDrill();
      emit();
      return { ok: true, incident: getActive() };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createDemoApi(options = {}) {
  const store = options.store ?? createDemoStore(options);

  async function handle(path, requestOptions = {}) {
    const url = new URL(path, "https://demo.local");
    const pathname = url.pathname;
    const method = (requestOptions.method || "GET").toUpperCase();
    const body =
      typeof requestOptions.body === "string" && requestOptions.body
        ? JSON.parse(requestOptions.body)
        : requestOptions.body ?? {};

    try {
      if (method === "GET" && pathname === "/api/config") return store.getConfig();
      if (method === "GET" && pathname === "/api/health") return { ok: true, mode: "DRILL", demo: true };
      if (method === "GET" && pathname === "/api/version") return { version: "demo-0.8.0" };
      if (method === "GET" && pathname === "/api/me") return store.getMe();
      if (method === "GET" && pathname === "/api/incidents/active") return { incident: store.getActive() };
      if (method === "GET" && pathname === "/api/dashboard") return store.getDashboard();
      if (method === "POST" && pathname === "/api/acknowledgements") return store.acknowledge(body);
      if (method === "POST" && pathname === "/api/commander/action-token") return store.createActionToken();
      if (method === "POST" && pathname === "/api/incidents/drill") return store.activateDrill(body);
      if (method === "POST" && pathname === "/api/incidents/resolve") return store.resolveDrill();
      if (method === "POST" && pathname === "/api/incidents/update") return store.pushUpdate(body);
      if (method === "GET" && pathname === "/api/commander/roster") {
        return {
          you: store.getMe().callSign,
          capacity: { active: 2, pending: 0, free: 3 },
          commanders: [
            { callSign: "CMD-DEMO1", lastLoginAt: new Date().toISOString() },
            { callSign: "CMD-DEMO2", lastLoginAt: new Date().toISOString() },
          ],
          pendingRevocationApprovals: 0,
        };
      }
      if (method === "GET" && pathname === "/api/reports/open") return { reports: [] };
      if (method === "POST" && pathname === "/api/reports") {
        return { ok: true, reportId: `RPT-DEMO-${Date.now()}`, status: "NEW" };
      }
      if (method === "POST" && pathname === "/api/push/subscribe") {
        throw new DemoError(400, "โหมดสาธิตไม่ส่ง Web Push จริง");
      }
      if (method === "POST" && pathname === "/api/demo/reset") return store.reset();
      if (method === "POST" && pathname === "/api/demo/identity") return store.setIdentity(body.id);
      throw new DemoError(404, "ไม่พบ API ในโหมดสาธิต");
    } catch (error) {
      if (error && typeof error.status === "number") throw error;
      throw error;
    }
  }

  return { handle, store, subscribe: store.subscribe.bind(store) };
}

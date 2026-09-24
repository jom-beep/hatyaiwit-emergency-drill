const LOGIN_ERRORS = {
  domain: "บัญชีนี้ไม่ใช่โดเมนที่โรงเรียนอนุญาต กรุณาใช้บัญชี Google Workspace ของโรงเรียน",
  expired: "การเข้าสู่ระบบหมดเวลาหรือไม่สมบูรณ์ กรุณากดเข้าสู่ระบบอีกครั้ง",
  denied: "ยกเลิกการเข้าสู่ระบบแล้ว กดปุ่มด้านล่างเมื่อพร้อม",
  disabled: "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลของโรงเรียน",
  generic: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้ให้ผู้ดูแลตรวจค่า OAuth",
};

const ROLE_LABEL = {
  commander: "ผู้ประกาศ",
  member: "ผู้รับแจ้ง",
  teacher: "ครู",
  security: "เจ้าหน้าที่ความปลอดภัย",
  system_admin: "ผู้ดูแลระบบ",
};

const RECIPIENT_GUIDANCE = {
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
  TRIJAK: {
    title: "ขณะฝึกซ้อมกราดยิง / ตรีจักร 191",
    steps: [
      "นี่คือการฝึกซ้อม · DRILL — ไม่ใช่เหตุจริง",
      "ล็อกประตู ปิดไฟ เงียบ และอยู่ต่ำในจุดกำบัง",
      "ห้ามเปิดประตูหรือออกนอกห้องจนกว่าศูนย์ควบคุมจะประกาศยุติ",
      "ปักหมุดบนแผนที่หากเห็นตำแหน่งเหตุ (จำลองในโหมดสาธิต)",
      "ห้ามใช้แอปนี้แทนเสียงตามสาย วิทยุสื่อสาร หรือโทร 191",
    ],
  },
};

const STATUS_TOAST = {
  ACK: "บันทึกการรับทราบแล้ว",
  SAFE: "บันทึกสถานะปลอดภัยแล้ว",
  NEED_HELP: "ส่งคำขอความช่วยเหลือไปยังศูนย์ควบคุมแล้ว",
  AWAY: "บันทึกสถานะไม่อยู่ในพื้นที่แล้ว",
};

const RECIPIENT_STATUS_LABEL = {
  ACK: "รับทราบ",
  SAFE: "ปลอดภัย",
  NEED_HELP: "ต้องการช่วยเหลือ",
  AWAY: "ไม่อยู่ในพื้นที่",
};

const SILENT_MODE_STORAGE_KEY = "hyw-demo-silent-lockdown";

const state = {
  config: null,
  me: null,
  incident: null,
  pushRegistered: false,
  holdTimer: null,
  holdActive: false,
  actionToken: null,
  socket: null,
  pingTimer: null,
  view: "admin",
  version: null,
  updatePending: false,
  reportsTimer: null,
  ackResponse: null,
  ackedIncidentId: null,
  ackAt: null,
  ackUpdatedAt: null,
  deferredInstall: null,
  demoApi: null,
  selectedTemplateId: null,
  lastInstructionKey: null,
  map: { pins: [], redZone: null },
  adminQueue: null,
  queueTimer: null,
  demoAdvancedNudged: false,
  demoScriptSignature: "",
  adminQueueSig: "",
  mapSig: "",
};

function isDemoMode() {
  return location.pathname.replace(/\/+$/, "") === "/demo" || new URLSearchParams(location.search).get("demo") === "1";
}

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  if (state.demoApi) return state.demoApi.handle(path, options);
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || "ไม่สามารถติดต่อระบบได้");
    error.status = response.status;
    throw error;
  }
  return data;
}

function toast(message, timeout = 4200) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.remove("hidden");
  window.setTimeout(() => element.classList.add("hidden"), timeout);
}

function platformName() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "web";
}

function isIos() {
  return platformName() === "ios";
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function base64urlToUint8Array(value) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function fillZones() {
  const zones = state.config?.zones || [];
  $("#zones-empty").classList.toggle("hidden", zones.length > 0);
  for (const select of [$("#device-zone"), $("#report-zone"), $("#drill-zone")]) {
    if (!select) continue;
    select.replaceChildren();
    for (const zone of zones) {
      const option = document.createElement("option");
      option.value = zone.id;
      option.textContent = zone.name;
      select.append(option);
    }
  }
}

function setConnectionStatus(live) {
  const element = $("#connection-status");
  if (!element) return;
  element.textContent = live ? "เชื่อมต่อศูนย์ควบคุมแล้ว" : "กำลังเชื่อมต่อใหม่…";
  element.classList.toggle("is-live", live);
}

function showLoginErrorFromUrl() {
  const params = new URLSearchParams(location.search);
  const code = params.get("login_error");
  const message = LOGIN_ERRORS[code];
  if (!message) return;
  const box = $("#login-error");
  box.textContent = message;
  box.classList.remove("hidden");
  params.delete("login_error");
  const next = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
  history.replaceState({}, "", next);
}

function hideBoot() {
  $("#boot-screen").classList.add("hidden");
}

function showBootError(message) {
  hideBoot();
  $("#boot-error-text").textContent = message;
  $("#boot-error").classList.remove("hidden");
  $("#login-panel").classList.add("hidden");
}

async function refreshReadiness() {
  let installed = !isIos() || isStandalone();
  const notifications = "Notification" in window && Notification.permission === "granted";
  let subscription = null;
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    subscription = registration ? await registration.pushManager.getSubscription() : null;
  }
  state.pushRegistered = Boolean(subscription);
  const checks = [
    ["#check-install", installed],
    ["#check-notification", notifications],
    ["#check-subscription", Boolean(subscription)],
  ];
  let score = 0;
  for (const [selector, ok] of checks) {
    $(selector).classList.toggle("ok", ok);
    if (ok) score += 1;
  }
  $("#readiness-score").textContent = `${score}/3`;
  $("#ios-help").classList.toggle("hidden", !isIos() || isStandalone());
  $("#enable-push").textContent = score === 3 ? "อัปเดตพื้นที่ของอุปกรณ์" : "เปิดการแจ้งเตือนเครื่องนี้";
  refreshInstallBanner(score === 3);
}

function refreshInstallBanner(ready) {
  const banner = $("#install-banner");
  if (isDemoMode()) {
    banner?.classList.add("hidden");
    document.body.classList.remove("has-install-banner");
    return;
  }
  const hide = Boolean(ready || isStandalone() || sessionStorage.getItem("hyw-install-dismissed") === "1");
  if (hide) {
    banner.classList.add("hidden");
    document.body.classList.remove("has-install-banner");
    return;
  }
  const ios = isIos();
  $("#install-banner-text").textContent = ios
    ? "iPhone/iPad: ติดตั้งลงหน้าจอโฮมด้วย Safari ก่อน จึงจะรับแจ้งเตือนได้"
    : "ติดตั้งแอปบนหน้าจอหลัก เพื่อรับแจ้งเตือนตอนซ้อม";
  $("#install-banner-action").textContent = state.deferredInstall && !ios ? "ติดตั้ง" : "ดูวิธีติดตั้ง";
  banner.classList.remove("hidden");
  document.body.classList.add("has-install-banner");
}

async function handleInstallAction() {
  if (state.deferredInstall) {
    try {
      state.deferredInstall.prompt();
      await state.deferredInstall.userChoice;
    } catch {
      openInstallGuide();
    }
    state.deferredInstall = null;
    $("#install-banner").classList.add("hidden");
    return;
  }
  openInstallGuide();
}

async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    toast("เบราว์เซอร์นี้ไม่รองรับ Web Push");
    return;
  }
  if (isIos() && !isStandalone()) {
    $("#ios-help").classList.remove("hidden");
    openInstallGuide();
    return;
  }
  const button = $("#enable-push");
  button.disabled = true;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("ยังไม่ได้อนุญาตการแจ้งเตือน");
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64urlToUint8Array(state.config.vapidPublicKey),
      });
    }
    const serialized = subscription.toJSON();
    await api("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: serialized.endpoint,
        keys: serialized.keys,
        zone: $("#device-zone").value,
        platform: platformName(),
      }),
    });
    toast("อุปกรณ์พร้อมรับการแจ้งเตือนแล้ว");
    await refreshReadiness();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function incidentIsLive(incident) {
  return Boolean(incident && incident.status !== "RESOLVED");
}

function formatAckTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatAckDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return formatAckTime(iso);
  }
}

function isLockdownLike(type) {
  return type === "LOCKDOWN";
}

function isTrijak191(incident) {
  return incident?.templateId === "TRIJAK_191";
}

function readSilentMode(incidentType) {
  try {
    const raw = sessionStorage.getItem(SILENT_MODE_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return isLockdownLike(incidentType);
  } catch {
    return isLockdownLike(incidentType);
  }
}

function writeSilentMode(enabled) {
  try {
    sessionStorage.setItem(SILENT_MODE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Private mode may block sessionStorage.
  }
  return Boolean(enabled);
}

function instructionRevisionKey(incident) {
  const latest = Array.isArray(incident?.updates) ? incident.updates[incident.updates.length - 1] : null;
  if (latest) return `${incident.id}:${latest.version}:${latest.publishedAt}`;
  return incident ? `${incident.id}:${incident.version}:${incident.instruction}` : "";
}

function playCommandCue() {
  if (!state.demoApi) return;
  if (isLockdownLike(state.incident?.type) && readSilentMode(state.incident?.type)) return;
  try {
    navigator.vibrate?.([180, 80, 180]);
  } catch {
    // Vibration is OS-gated; ignore.
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.addEventListener("ended", () => ctx.close().catch(() => {}));
  } catch {
    // Autoplay / AudioContext may be blocked.
  }
}

function renderRecipientGuidance(incident) {
  const card = $("#recipient-guidance");
  const list = $("#recipient-guidance-list");
  const title = $("#recipient-guidance-title");
  if (!card || !list || !title) return;
  const live = incidentIsLive(incident);
  if (!live) {
    card.classList.add("hidden");
    list.replaceChildren();
    return;
  }
  const catalog = state.config?.recipientGuidance || RECIPIENT_GUIDANCE;
  const guidance = isTrijak191(incident)
    ? catalog.TRIJAK || RECIPIENT_GUIDANCE.TRIJAK || catalog.LOCKDOWN || RECIPIENT_GUIDANCE.LOCKDOWN
    : catalog[incident.type] || RECIPIENT_GUIDANCE.INFORMATION;
  title.textContent = guidance.title;
  list.replaceChildren(
    ...guidance.steps.map((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      return item;
    }),
  );
  card.classList.remove("hidden");
}

function renderCommandUpdates(incident, options = {}) {
  const card = $("#command-updates");
  if (!card) return;
  const demo = Boolean(state.demoApi);
  const live = incidentIsLive(incident);
  if (!demo || !live || !incident) {
    card.classList.add("hidden");
    card.classList.remove("is-new");
    return;
  }
  const updates = Array.isArray(incident.updates) && incident.updates.length
    ? incident.updates
    : [{ version: incident.version, instruction: incident.instruction, publishedAt: incident.issuedAt, publishedBy: "ศูนย์ควบคุม" }];
  const latest = updates[updates.length - 1];
  const prior = updates.slice(0, -1).slice().reverse();
  $("#command-update-badge").textContent = `คำสั่งล่าสุด · เวอร์ชัน ${latest.version}`;
  $("#command-update-latest").textContent = latest.instruction;
  const when = formatAckDateTime(latest.publishedAt);
  const who = latest.publishedBy ? ` · โดย ${latest.publishedBy}` : "";
  $("#command-update-meta").textContent = when ? `ส่งเมื่อ ${when} น.${who}` : `เวอร์ชัน ${latest.version}${who}`;
  const history = $("#command-update-history");
  const list = $("#command-update-history-list");
  history.classList.toggle("hidden", prior.length === 0);
  list.replaceChildren(
    ...prior.map((item) => {
      const row = document.createElement("li");
      const stamp = formatAckTime(item.publishedAt);
      row.textContent = `เวอร์ชัน ${item.version}${stamp ? ` · ${stamp} น.` : ""} — ${item.instruction}`;
      return row;
    }),
  );
  card.classList.remove("hidden");
  const key = instructionRevisionKey(incident);
  const previous = state.lastInstructionKey;
  const isNew = Boolean(options.fromLive && previous && key && previous !== key);
  if (isNew) {
    card.classList.add("is-new");
    playCommandCue();
    if (state.me?.role !== "commander") {
      toast(`มีคำสั่งใหม่จากศูนย์ควบคุม · เวอร์ชัน ${latest.version}`);
    }
    window.setTimeout(() => card.classList.remove("is-new"), 4000);
  }
  state.lastInstructionKey = key || previous;
}

function renderSilentLockdown(incident) {
  const box = $("#silent-lockdown");
  const toggle = $("#silent-lockdown-toggle");
  if (!box || !toggle) return;
  const show = Boolean(state.demoApi && incidentIsLive(incident) && isLockdownLike(incident?.type));
  box.classList.toggle("hidden", !show);
  const on = readSilentMode(incident?.type);
  if (toggle.checked !== on) toggle.checked = on;
  box.classList.toggle("is-on", show && on);
}

function renderAllClear(incident) {
  const card = $("#all-clear");
  if (!card) return;
  const demo = Boolean(state.demoApi);
  const resolved = incident?.status === "RESOLVED";
  if (!demo || !resolved) {
    card.classList.add("hidden");
    return;
  }
  const resolvedAt = formatAckDateTime(incident.resolvedAt);
  $("#all-clear-resolved-at").textContent = resolvedAt
    ? `ศูนย์ควบคุมประกาศยุติเมื่อ ${resolvedAt} น.`
    : "ศูนย์ควบคุมประกาศยุติการฝึกซ้อมแล้ว";
  const sameIncident = state.ackedIncidentId === incident.id && state.ackResponse;
  if (state.me?.role === "commander") {
    $("#all-clear-ack").textContent = "เปิดแท็บผู้รับแจ้งเพื่อดูเวลาที่คนนั้นกดรับทราบ";
    $("#all-clear-status").textContent = "";
  } else if (sameIncident) {
    const first = formatAckDateTime(state.ackAt);
    $("#all-clear-ack").textContent = first
      ? `คุณรับทราบครั้งแรกเมื่อ ${first} น.`
      : "คุณกดรับทราบในรอบนี้แล้ว";
    const statusLabel = RECIPIENT_STATUS_LABEL[state.ackResponse] || state.ackResponse;
    const last = formatAckDateTime(state.ackUpdatedAt);
    if (state.ackUpdatedAt && state.ackAt && state.ackUpdatedAt !== state.ackAt) {
      $("#all-clear-status").textContent = `สถานะล่าสุด: ${statusLabel} · เปลี่ยนเมื่อ ${last} น.`;
    } else {
      $("#all-clear-status").textContent = `สถานะล่าสุด: ${statusLabel}`;
    }
  } else {
    $("#all-clear-ack").textContent = "คุณไม่ได้กดรับทราบในรอบนี้";
    $("#all-clear-status").textContent = "ไม่มีเวลาตอบรับส่วนตัวสำหรับเครื่องนี้";
  }
  card.classList.remove("hidden");
}

function renderAckStatus() {
  const box = $("#ack-status");
  const sameIncident = state.incident && state.ackedIncidentId === state.incident.id;
  const safeButton = $("#safe-button");
  const helpButton = $("#help-button");
  const awayButton = $("#away-button");
  const ackButton = $("#ack-button");
  const demo = Boolean(state.demoApi);
  const live = incidentIsLive(state.incident);

  if (state.incident?.status === "RESOLVED") {
    ackButton.disabled = true;
    if (demo) {
      box.classList.add("hidden");
      safeButton.classList.add("hidden");
      helpButton.classList.add("hidden");
      awayButton.classList.add("hidden");
      ackButton.classList.add("hidden");
      renderDemoScript();
    } else if (sameIncident && state.ackResponse) {
      const when = formatAckTime(state.ackAt);
      box.classList.remove("hidden");
      box.textContent = when ? `คุณรับทราบครั้งแรกเมื่อ ${when} น.` : "คุณตอบรับแล้วในรอบนี้";
    }
    renderDemoScript();
    return;
  }

  if (!state.incident || !live || !sameIncident || !state.ackResponse) {
    box.classList.add("hidden");
    box.textContent = "";
    ackButton.disabled = false;
    ackButton.textContent = "รับทราบ";
    ackButton.classList.remove("hidden");
    if (demo) {
      safeButton.classList.add("hidden");
      helpButton.classList.add("hidden");
      awayButton.classList.add("hidden");
    } else {
      helpButton.classList.remove("hidden");
    }
    renderDemoScript();
    return;
  }

  box.classList.remove("hidden");
  if (demo) {
    ackButton.classList.add("hidden");
    ackButton.disabled = false;
    safeButton.classList.remove("hidden");
    helpButton.classList.remove("hidden");
    awayButton.classList.remove("hidden");
    safeButton.disabled = false;
    helpButton.disabled = false;
    awayButton.disabled = false;
    helpButton.textContent = "ต้องการช่วยเหลือ";
    safeButton.classList.toggle("is-active", state.ackResponse === "SAFE");
    helpButton.classList.toggle("is-active", state.ackResponse === "NEED_HELP");
    awayButton.classList.toggle("is-active", state.ackResponse === "AWAY");
    if (state.ackResponse === "NEED_HELP") box.textContent = "สถานะปัจจุบัน: ต้องการช่วยเหลือ — กดเปลี่ยนได้ตลอดจนกว่าจะยุติ";
    else if (state.ackResponse === "SAFE") box.textContent = "สถานะปัจจุบัน: ปลอดภัย — กดเปลี่ยนได้ตลอดจนกว่าจะยุติ";
    else if (state.ackResponse === "AWAY") box.textContent = "สถานะปัจจุบัน: ไม่อยู่ในพื้นที่ — ไม่ใช่ผู้ที่ไม่ตอบ";
    else box.textContent = "รับทราบแล้ว — เลือก ปลอดภัย / ต้องการช่วยเหลือ / ไม่อยู่ในพื้นที่";
    renderDemoScript();
    return;
  }

  if (state.ackResponse === "NEED_HELP") {
    box.textContent = "ส่งคำขอความช่วยเหลือแล้ว — ศูนย์ควบคุมได้รับเรื่อง";
    ackButton.textContent = "รับทราบแล้ว";
  } else {
    box.textContent = "รับทราบแล้ว";
    ackButton.textContent = "รับทราบแล้ว";
    ackButton.disabled = true;
  }
}

function renderIncident(incident, options = {}) {
  state.incident = incident;
  const panel = $("#incident-panel");
  const response = $("#incident-response");
  const demo = Boolean(state.demoApi);
  panel.classList.remove("idle", "active", "resolved", "pending");
  const live = incidentIsLive(incident);
  document.body.classList.toggle("drill-live", live);
  document.body.classList.toggle("all-clear", Boolean(incident && incident.status === "RESOLVED" && demo));
  if (!incident) {
    panel.classList.add("idle");
    $("#incident-mode").textContent = "พร้อมรับแจ้งเตือน";
    $("#incident-title").textContent = "ขณะนี้ไม่มีการฝึกซ้อม";
    $("#incident-instruction").textContent = "ระบบเชื่อมต่อกับศูนย์ควบคุมแล้ว";
    $("#incident-meta").textContent = "";
    response.classList.add("hidden");
    $("#commander-start")?.classList.remove("hidden");
    $("#commander-end")?.classList.add("hidden");
    const heading = $("#commander-heading");
    if (heading) heading.textContent = "เริ่มการฝึกซ้อม";
    $("#dashboard-empty")?.classList.remove("hidden");
    state.ackResponse = null;
    state.ackedIncidentId = null;
    state.ackAt = null;
    state.ackUpdatedAt = null;
    state.lastInstructionKey = null;
    renderAckStatus();
    renderRecipientGuidance(null);
    renderCommandUpdates(null);
    renderSilentLockdown(null);
    renderAllClear(null);
    renderTrijakMap(null);
    renderAdminQueue(null);
    renderDemoScript();
    return;
  }
  const resolved = incident.status === "RESOLVED";
  const pending = incident.status === "RESOLUTION_PENDING";
  if (resolved && state.updatePending) window.setTimeout(applyUpdate, 3000);
  panel.classList.add(resolved ? "resolved" : pending ? "pending" : "active");
  $("#incident-mode").textContent = resolved
    ? demo
      ? "ยุติแล้ว"
      : "การฝึกซ้อมสิ้นสุดแล้ว"
    : pending
      ? "รอผู้ประกาศคนที่ 2 ยืนยันยุติ"
      : "กำลังฝึกซ้อม";
  $("#incident-title").textContent = resolved
    ? demo
      ? "ยุติแล้ว / กลับสู่ปกติ"
      : "การฝึกซ้อมสิ้นสุดแล้ว"
    : incident.title;
  $("#incident-instruction").textContent = resolved
    ? demo
      ? "สามารถกลับเข้าสู่กิจกรรมตามปกติได้ตามคำสั่งโรงเรียน"
      : "กรุณารอคำแนะนำจากโรงเรียนก่อนกลับเข้าสู่กิจกรรมตามปกติ"
    : incident.instruction;
  $("#incident-meta").textContent = `รหัส ${incident.id} · พื้นที่ ${incident.zone} · เวอร์ชัน ${incident.version}`;
  response.classList.toggle("hidden", resolved && !demo);
  $("#incident-actions")?.classList.toggle("hidden", Boolean(resolved && demo));
  if (state.ackedIncidentId !== incident.id) {
    state.ackResponse = null;
    state.ackedIncidentId = null;
    state.ackAt = null;
    state.ackUpdatedAt = null;
  }
  renderAckStatus();
  renderRecipientGuidance(incident);
  renderCommandUpdates(incident, options);
  renderSilentLockdown(incident);
  renderAllClear(incident);
  renderTrijakMap(incident);
  renderAdminQueue(incident);
  if (state.me?.role === "commander") {
    $("#commander-start")?.classList.toggle("hidden", !resolved);
    $("#commander-end")?.classList.toggle("hidden", resolved);
    const heading = $("#commander-heading");
    if (heading) heading.textContent = resolved ? "เริ่มการฝึกซ้อม" : "ยุติการฝึกซ้อม";
    const hint = $("#resolve-hint");
    if (hint) {
      hint.textContent = state.demoApi
        ? pending
          ? "คนที่ 1 ยืนยันแล้ว — เปิด «ทดสอบคิวแอดมิน (20 วิ)» เลือกคนที่ 2 แล้วกดยืนยันอีกครั้ง"
          : "การยุติต้องมีคนจากศูนย์ควบคุมยืนยัน 2 คน (คนละคน)"
        : pending
          ? "มีผู้ประกาศยืนยันแล้ว 1 คน ต้องการอีก 1 คนจึงจะยุติ"
          : "การยุติต้องได้รับการยืนยันจากผู้ประกาศ 2 คนที่ต่างกัน";
    }
    $("#dashboard-empty")?.classList.toggle("hidden", true);
  }
  if (demo) {
    const zoneName = state.config?.zones?.find((zone) => zone.id === incident.zone)?.name || incident.zone;
    $("#incident-meta").textContent = `พื้นที่ ${zoneName} · นี่คือการฝึกซ้อม`;
  }
  renderDemoScript();
}

function applyMapPayload(payload = {}) {
  if (payload.map) state.map = payload.map;
  if (payload.adminQueue) state.adminQueue = payload.adminQueue;
}

function formatPinTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function renderTrijakMap(incident) {
  const panel = $("#trijak-map-panel");
  if (!panel) return;
  const live = Boolean(state.demoApi && incidentIsLive(incident) && isTrijak191(incident));
  panel.classList.toggle("hidden", !live);
  const mapSig = `${live}|${state.me?.identityId || ""}|${state.adminQueue?.controllerId || ""}|${JSON.stringify(state.map || {})}`;
  if (state.mapSig === mapSig) return;
  state.mapSig = mapSig;
  if (!live) {
    $("#map-markers")?.replaceChildren();
    $("#map-pin-list")?.replaceChildren();
    renderDemoScript();
    return;
  }
  const map = state.map || { pins: [], redZone: null };
  const queue = state.adminQueue;
  const isCommander = state.me?.role === "commander";
  const isController = Boolean(queue?.controllerId && queue.controllerId === state.me?.identityId);
  const hint = $("#map-hint");
  const mapTitle = $("#map-title");
  if (mapTitle) mapTitle.textContent = isCommander ? "วางเขตแดงบนผัง" : "ปักหมุดบนผัง";
  if (isCommander && isController) {
    hint.textContent = "คุณควบคุมอยู่ — แตะผังเพื่อวางหรือย้ายเขตแดง";
  } else if (isCommander) {
    hint.textContent = queue?.controllerName
      ? `${queue.controllerName} กำลังวางเขตแดง — หน้านี้ดูได้อย่างเดียว`
      : "กด «ยืนยันควบคุม» ให้ทัน 20 วินาที แล้วจึงแตะผังเพื่อวางเขตแดง";
  } else {
    hint.textContent = "แตะผังเพื่อปักหมุดตำแหน่งของคุณ — แตะอีกจุดเพื่อย้ายหมุด เวลาจะติดไปกับหมุด";
  }

  const markers = $("#map-markers");
  const nodes = [];
  if (map.redZone) {
    const zone = document.createElement("div");
    zone.className = "map-red-zone";
    zone.style.left = `${map.redZone.x}%`;
    zone.style.top = `${map.redZone.y}%`;
    const size = Math.max(72, (map.redZone.radius || 10) * 8);
    zone.style.width = `${size}px`;
    zone.style.height = `${size}px`;
    zone.title = `เขตแดง · ย้ายเมื่อ ${formatPinTime(map.redZone.movedAt)} น.`;
    nodes.push(zone);
  }
  for (const pin of map.pins || []) {
    const marker = document.createElement("div");
    marker.className = "map-pin";
    marker.style.left = `${pin.x}%`;
    marker.style.top = `${pin.y}%`;
    const dot = document.createElement("i");
    const label = document.createElement("span");
    label.textContent = `${pin.label} · ${formatPinTime(pin.plantedAt)} น.`;
    marker.append(dot, label);
    nodes.push(marker);
  }
  markers.replaceChildren(...nodes);

  const list = $("#map-pin-list");
  if (!map.pins?.length && !map.redZone) {
    list.replaceChildren();
    renderDemoScript();
    return;
  }
  const items = [];
  if (map.redZone) {
    const row = document.createElement("li");
    row.textContent = `เขตแดง · ย้ายโดย ${map.redZone.movedBy || "ผู้ประกาศ"} เวลา ${formatPinTime(map.redZone.movedAt)} น.`;
    items.push(row);
  }
  for (const pin of map.pins || []) {
    const row = document.createElement("li");
    row.textContent = `${pin.label} ปักหมุดเวลา ${formatPinTime(pin.plantedAt)} น.`;
    items.push(row);
  }
  list.replaceChildren(...items);
  renderDemoScript();
}

function renderAdminQueue(incident) {
  const panel = $("#admin-queue-panel");
  if (!panel) return;
  const live = Boolean(state.demoApi && incidentIsLive(incident) && isTrijak191(incident) && state.me?.role === "commander");
  panel.classList.toggle("hidden", !live);
  $("#demo-control-action")?.classList.toggle("hidden", !live);
  if (!live) {
    if (state.queueTimer) {
      window.clearInterval(state.queueTimer);
      state.queueTimer = null;
    }
    state.adminQueueSig = "";
    renderDemoScript();
    return;
  }
  if (!state.queueTimer) {
    state.queueTimer = window.setInterval(() => {
      refreshTrijakRealtime({ silent: true });
    }, 400);
  }
  const queue = state.adminQueue;
  const list = $("#admin-queue-list");
  const timer = $("#admin-queue-timer");
  const status = $("#admin-queue-status");
  const button = $("#confirm-control");
  const second = Math.ceil((queue?.remainingMs || 0) / 1000);
  const queueSig = queue
    ? `${queue.controllerId}|${queue.currentIndex}|${queue.exhausted}|${second}|${state.me?.identityId || ""}`
    : "empty";
  if (state.adminQueueSig === queueSig) return;
  state.adminQueueSig = queueSig;
  if (!queue) {
    list.replaceChildren();
    renderDemoScript();
    return;
  }
  list.replaceChildren(
    ...queue.admins.map((admin) => {
      const item = document.createElement("li");
      item.classList.add(`is-${admin.state}`);
      if (admin.id === state.me?.identityId) item.classList.add("is-you");
      const order = document.createElement("span");
      order.className = "order";
      order.textContent = `#${admin.queueOrder}`;
      const name = document.createElement("span");
      name.textContent = admin.displayName;
      item.append(order, name);
      return item;
    }),
  );
  const controlStatus = $("#demo-control-status");
  if (queue.controllerId) {
    timer.textContent = "มีผู้ควบคุมแล้ว";
    const claimed = `${queue.controllerName || "ศูนย์ควบคุม"} ควบคุมเขตแดงแล้ว — ไปวางบนผังได้`;
    status.textContent = claimed;
    if (controlStatus) controlStatus.textContent = claimed;
    if (button) {
      button.disabled = true;
      button.textContent = "ยืนยันควบคุมแล้ว";
    }
  } else {
    const seconds = Math.ceil((queue.remainingMs || 0) / 1000);
    timer.textContent = queue.exhausted ? "ครบคิวแล้ว" : `เหลือ ${seconds} วินาที`;
    const current = queue.currentAdmin;
    const yours = current?.id === state.me?.identityId;
    const waiting = yours
      ? `${current.displayName} (คุณ) ต้องยืนยันควบคุมภายใน ${seconds} วินาที`
      : `รอ ${current?.displayName || "คนถัดไป"} — เปิด «ทดสอบคิวแอดมิน (20 วิ)» ถ้าจะกดแทน`;
    status.textContent = waiting;
    if (controlStatus) controlStatus.textContent = waiting;
    if (button) {
      button.disabled = !yours;
      button.textContent = yours ? "ยืนยันควบคุมการฝึกซ้อมนี้" : `รอคิวของ ${current?.displayName || "คนถัดไป"}`;
    }
  }
  const summary = $("#demo-advanced-summary");
  if (summary) {
    if (queue.controllerId) summary.textContent = "ทดสอบคิวแอดมิน (20 วิ) · มีคนควบคุมแล้ว";
    else if (queue.exhausted) summary.textContent = "ทดสอบคิวแอดมิน (20 วิ) · ครบคิวแล้ว";
    else summary.textContent = `ทดสอบคิวแอดมิน (20 วิ) · เหลือ ${Math.ceil((queue.remainingMs || 0) / 1000)} วิ`;
  }
  renderDemoScript();
}

async function refreshTrijakRealtime(options = {}) {
  if (!state.demoApi || !isTrijak191(state.incident) || !incidentIsLive(state.incident)) return;
  try {
    const result = await api("/api/demo/map");
    applyMapPayload(result);
    renderTrijakMap(state.incident);
    renderAdminQueue(state.incident);
  } catch (error) {
    if (!options.silent) toast(error.message);
  }
}

async function handleCampusMapClick(event) {
  if (!state.demoApi || !isTrijak191(state.incident) || !incidentIsLive(state.incident)) return;
  const map = $("#campus-map");
  const rect = map.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  const isCommander = state.me?.role === "commander";
  try {
    if (isCommander) {
      const result = await api("/api/demo/red-zone", {
        method: "POST",
        body: JSON.stringify({ x, y }),
      });
      applyMapPayload(result);
      renderTrijakMap(state.incident);
      toast("วางเขตแดงแล้ว");
    } else {
      const result = await api("/api/demo/map-pin", {
        method: "POST",
        body: JSON.stringify({ x, y }),
      });
      applyMapPayload(result);
      renderTrijakMap(state.incident);
      toast("ปักหมุดรายงานแล้ว");
    }
  } catch (error) {
    toast(error.message);
  }
}

async function confirmControl() {
  const button = $("#confirm-control");
  if (button) button.disabled = true;
  try {
    const result = await api("/api/demo/confirm-control", { method: "POST", body: "{}" });
    applyMapPayload(result);
    renderAdminQueue(state.incident);
    toast("คุณเป็นผู้ควบคุมการฝึกซ้อมตรีจักร 191 แล้ว");
  } catch (error) {
    toast(error.message);
  } finally {
    renderAdminQueue(state.incident);
  }
}

function connectRealtime() {
  if (state.demoApi) {
    setConnectionStatus(true);
    state.demoApi.subscribe((message) => {
      if (message?.type === "incident_state") {
        applyMapPayload(message);
        renderIncident(message.incident, { fromLive: true });
        if (state.me?.role === "commander") refreshDashboard();
      }
    });
    return;
  }
  if (state.socket && state.socket.readyState < 2) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/api/ws`);
  state.socket = socket;
  setConnectionStatus(false);
  socket.addEventListener("open", () => setConnectionStatus(true));
  socket.addEventListener("message", (event) => {
    if (event.data === "pong") return;
    try {
      const message = JSON.parse(event.data);
      if (message.type === "incident_state") {
        renderIncident(message.incident);
        if (state.me?.role === "commander") refreshDashboard();
      }
    } catch {
      // Ignore malformed real-time messages.
    }
  });
  socket.addEventListener("close", () => {
    setConnectionStatus(false);
    window.setTimeout(connectRealtime, 3000);
  });
  if (state.pingTimer) window.clearInterval(state.pingTimer);
  state.pingTimer = window.setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send("ping");
  }, 25_000);
}

async function submitReport(event) {
  event.preventDefault();
  const submit = event.submitter;
  submit.disabled = true;
  try {
    const result = await api("/api/reports", {
      method: "POST",
      body: JSON.stringify({
        type: $("#report-type").value,
        zone: $("#report-zone").value,
        note: $("#report-note").value,
      }),
    });
    $("#report-note").value = "";
    toast(`ส่งรายงานแล้ว (${result.reportId.slice(-8)})`);
  } catch (error) {
    toast(error.message);
  } finally {
    submit.disabled = false;
  }
}

async function acknowledge(response) {
  if (!state.incident || state.incident.status === "RESOLVED") return;
  const incidentId = state.incident.id;
  const previous = {
    response: state.ackResponse,
    id: state.ackedIncidentId,
    at: state.ackAt,
    updatedAt: state.ackUpdatedAt,
  };
  if (response === "ACK") $("#ack-button").disabled = true;
  const firstTime = !previous.response || previous.id !== incidentId;
  state.ackResponse = response;
  state.ackedIncidentId = incidentId;
  const stamp = new Date().toISOString();
  if (firstTime || !state.ackAt) state.ackAt = stamp;
  state.ackUpdatedAt = stamp;
  renderAckStatus();
  try {
    const result = await api("/api/acknowledgements", {
      method: "POST",
      body: JSON.stringify({
        incidentId,
        response,
        zone: $("#device-zone").value,
      }),
    });
    if (result?.firstAckAt) state.ackAt = result.firstAckAt;
    else if (firstTime && result?.createdAt) state.ackAt = result.createdAt;
    if (result?.createdAt) state.ackUpdatedAt = result.createdAt;
    toast(STATUS_TOAST[response] || "บันทึกสถานะแล้ว");
  } catch (error) {
    state.ackResponse = previous.response;
    state.ackedIncidentId = previous.id;
    state.ackAt = previous.at;
    state.ackUpdatedAt = previous.updatedAt;
    $("#ack-button").disabled = false;
    renderAckStatus();
    toast(error.message);
  }
}

function setInviteStatus(message, ok) {
  const box = $("#invite-status");
  box.textContent = message;
  box.classList.toggle("is-ok", ok === true);
  box.classList.toggle("is-error", ok === false);
}

async function redeemInvite(event) {
  event.preventDefault();
  const token = $("#invite-token").value.replace(/\s+/g, "");
  $("#invite-token").value = token;
  if (!token) {
    setInviteStatus("กรุณาวางรหัสเชิญ", false);
    return;
  }
  if (token.length < 20) {
    setInviteStatus("รหัสยังไม่ครบ กรุณาวางรหัสทั้งชุด", false);
    return;
  }
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  setInviteStatus("กำลังตรวจสอบรหัส…", null);
  try {
    const result = await api("/api/commander/redeem", { method: "POST", body: JSON.stringify({ token }) });
    $("#invite-token").value = "";
    const callSign = result.callSign ? ` ป้ายเรียกของคุณคือ ${result.callSign}` : "";
    setInviteStatus(`ยืนยันสิทธิ์สำเร็จ${callSign} กำลังโหลดระบบใหม่`, true);
    toast("ยืนยันสิทธิ์สำเร็จ กำลังโหลดระบบใหม่");
    window.setTimeout(() => location.reload(), 1000);
  } catch (error) {
    const message =
      error.status === 409
        ? "รหัสนี้ถูกใช้แล้วหรือหมดอายุ กรุณาขอรหัสใหม่จากผู้ดูแล"
        : error.message;
    setInviteStatus(message, false);
    toast(message);
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function beginHold(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  const button = $("#activate-drill");
  if (button.disabled || incidentIsLive(state.incident)) return;
  state.holdActive = true;
  button.disabled = true;
  try {
    const result = await api("/api/commander/action-token", { method: "POST", body: "{}" });
    if (!state.holdActive) {
      button.disabled = false;
      return;
    }
    state.actionToken = result.token;
    button.classList.add("holding");
    button.disabled = false;
    state.holdTimer = window.setTimeout(activateDrill, 3000);
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
}

function cancelHold() {
  const button = $("#activate-drill");
  state.holdActive = false;
  if (state.holdTimer) window.clearTimeout(state.holdTimer);
  state.holdTimer = null;
  state.actionToken = null;
  button.classList.remove("holding");
}

async function activateDrill() {
  state.holdActive = false;
  const token = state.actionToken;
  state.holdTimer = null;
  state.actionToken = null;
  $("#activate-drill").classList.remove("holding");
  if (!token) return;
  try {
    const result = await api("/api/incidents/drill", {
      method: "POST",
      body: JSON.stringify({
        actionToken: token,
        mode: "DRILL",
        type: $("#drill-type").value,
        zone: $("#drill-zone").value,
        instruction: $("#drill-instruction").value,
        ...(state.selectedTemplateId ? { templateId: state.selectedTemplateId } : {}),
      }),
    });
    applyMapPayload(result);
    renderIncident(result.incident);
    toast("เริ่มการฝึกซ้อมและส่งเข้าคิวแจ้งเตือนแล้ว");
  } catch (error) {
    toast(error.message);
  }
}

async function resolveDrill() {
  const button = $("#resolve-drill");
  button.disabled = true;
  try {
    const result = await api("/api/incidents/resolve", { method: "POST", body: "{}" });
    applyMapPayload(result);
    renderIncident(result.incident);
    toast(
      result.incident.status === "RESOLVED"
        ? "ยุติการฝึกซ้อมแล้ว — ล้างหมุดและเขตแดงแล้ว"
        : `บันทึกการยืนยันแล้ว ต้องการอีก ${result.approvalsRequired} คน`,
    );
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function pushInstructionUpdate() {
  if (!state.demoApi) return;
  const button = $("#push-update");
  const text = $("#update-instruction")?.value ?? "";
  if (button) button.disabled = true;
  try {
    const result = await api("/api/incidents/update", {
      method: "POST",
      body: JSON.stringify({ instruction: text }),
    });
    $("#update-instruction").value = "";
    toast(`ส่งคำสั่งเวอร์ชัน ${result.update?.version ?? result.incident.version} แล้ว`);
    if (state.me?.role === "commander") await refreshDashboard();
  } catch (error) {
    toast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function countStatus(rows, name) {
  const row = rows?.find((item) => item.status === name || item.response === name);
  return Number(row?.count || 0).toLocaleString("th-TH");
}

async function refreshDashboard() {
  if (state.me?.role !== "commander") return;
  try {
    const result = await api("/api/dashboard");
    applyMapPayload(result);
    $("#metric-ready").textContent = Number(result.devices?.ready || 0).toLocaleString("th-TH");
    $("#metric-sent").textContent = countStatus(result.delivery?.results, "SENT");
    $("#metric-ack").textContent = countStatus(result.acknowledgement?.results, "ACK");
    $("#metric-help").textContent = countStatus(result.acknowledgement?.results, "NEED_HELP");
    renderIncident(result.incident);
    renderDemoCommandCenter(result);
  } catch (error) {
    toast(error.message);
  }
}

function renderZoneGroups(selector, groups) {
  const root = $(selector);
  if (!root) return;
  if (!groups?.length) {
    root.replaceChildren();
    return;
  }
  root.replaceChildren(
    ...groups.map((group) => {
      const wrap = document.createElement("div");
      wrap.className = "zone-group";
      const heading = document.createElement("h3");
      const name = document.createElement("span");
      name.textContent = group.zoneName;
      const count = document.createElement("span");
      count.textContent = `${group.count} คน`;
      heading.append(name, count);
      const list = document.createElement("ul");
      for (const person of group.people) {
        const item = document.createElement("li");
        const who = document.createElement("span");
        who.textContent = `${person.name} · ${person.role}`;
        const room = document.createElement("span");
        room.className = "room";
        room.textContent = person.room;
        item.append(who, room);
        list.append(item);
      }
      wrap.append(heading, list);
      return wrap;
    }),
  );
}

function renderDemoCommandCenter(result) {
  if (!state.demoApi || !result?.rollup) return;
  const rollup = result.rollup;
  const format = (value) => Number(value || 0).toLocaleString("th-TH");
  $("#metric-ack").textContent = format(rollup.responded);
  $("#metric-help").textContent = format(rollup.needHelp);
  $("#metric-safe").textContent = format(rollup.safe);
  $("#metric-away").textContent = format(rollup.away);
  $("#metric-silent").textContent = format(rollup.silent);
  $("#metric-ack-rate").textContent = `${Math.round(rollup.ackRate * 100)}%`;

  const live = incidentIsLive(result.incident);
  $("#nonresponder-panel").classList.toggle("hidden", !live);
  $("#nonresponder-count").textContent = format(rollup.silent);
  renderZoneGroups("#nonresponder-zones", rollup.nonRespondersByZone);
  $("#nonresponder-empty").classList.toggle("hidden", rollup.silent > 0);

  const after = result.afterAction;
  $("#afteraction-panel").classList.toggle("hidden", !after);
  if (!after) return;
  $("#afteraction-title").textContent = `${after.title} · ${after.durationMinutes} นาที`;
  $("#afteraction-rate").textContent = `${after.ackPercent}%`;
  $("#afteraction-responded").textContent = `${format(after.responded)} / ${format(after.totalPeople)}`;
  $("#afteraction-safe").textContent = format(after.safe);
  $("#afteraction-help").textContent = format(after.needHelp);
  $("#afteraction-away").textContent = format(after.away);
  renderZoneGroups("#afteraction-silent", after.nonRespondersByZone);
}

function renderDrillTemplates() {
  const root = $("#drill-templates");
  if (!root || !state.demoApi) return;
  const templates = state.config?.templates || [];
  const primary = templates.find((item) => item.id === "TRIJAK_191") || templates[0];
  const others = templates.filter((item) => item.id !== primary?.id);
  root.replaceChildren(
    ...others.map((template) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "template-card";
      button.dataset.template = template.id;
      const title = document.createElement("span");
      title.textContent = template.labelTh;
      const hint = document.createElement("small");
      hint.textContent = "นี่คือการฝึกซ้อม · DRILL";
      button.append(title, hint);
      button.addEventListener("click", () => selectDrillTemplate(template));
      return button;
    }),
  );
  const current = templates.find((item) => item.id === state.selectedTemplateId) || primary;
  if (current) selectDrillTemplate(current);
}

function selectDrillTemplate(template) {
  state.selectedTemplateId = template.id;
  const typeSelect = $("#drill-type");
  if (typeSelect?.querySelector(`option[value="${template.type}"]`)) typeSelect.value = template.type;
  const instruction = $("#drill-instruction");
  if (instruction) instruction.value = template.instruction;
  for (const button of document.querySelectorAll(".template-card")) {
    button.classList.toggle("is-active", button.dataset.template === template.id);
  }
  const primary = template.id === "TRIJAK_191";
  const holdLabel = $("#activate-drill span");
  if (holdLabel && state.demoApi) {
    holdLabel.textContent = primary
      ? "กดค้าง 3 วินาทีเพื่อเริ่มซ้อม กราดยิง / ตรีจักร 191"
      : `กดค้าง 3 วินาทีเพื่อเริ่มซ้อม ${template.labelTh}`;
  }
  const title = $("#drill-primary-title");
  const copy = $("#drill-primary-copy");
  if (title) title.textContent = primary ? "กราดยิง / ตรีจักร 191" : template.labelTh;
  if (copy) {
    copy.textContent = primary
      ? "ปุ่มด้านล่างเริ่มเฉพาะเหตุนี้"
      : "นี่ไม่ใช่เส้นทางสาธิตหลัก — กด «กลับไปกราดยิง / ตรีจักร 191» ได้";
  }
  $("#use-trijak")?.classList.toggle("hidden", primary || !state.demoApi);
}

const CONTROL_SCRIPT = [
  { id: "start", label: "เริ่มซ้อม", hint: "กดค้างปุ่มแดง 3 วินาที เพื่อเริ่มซ้อมกราดยิง / ตรีจักร 191" },
  { id: "control", label: "ยืนยันควบคุม", hint: "กด «ยืนยันควบคุมการฝึกซ้อมนี้» ภายใน 20 วินาที" },
  { id: "zone", label: "วางเขตแดงบนผัง", hint: "แตะแผนผังเพื่อวางเขตแดง แตะอีกจุดถ้าจะย้าย" },
  { id: "watch", label: "ดูสถานะผู้รับ", hint: "ดูตัวเลขตอบกลับด้านล่าง แล้วสลับไปแท็บผู้รับแจ้ง" },
  { id: "end", label: "ยุติ (ต้องคนที่ 2 ยืนยัน)", hint: "กดยุติที่หน้านี้ แล้วเปิด «ทดสอบคิวแอดมิน (20 วิ)» เลือกคนที่ 2 แล้วกดยืนยันอีกครั้ง" },
];

const RECIPIENT_SCRIPT = [
  { id: "ack", label: "รับทราบ", hint: "พออีกแท็บเริ่มซ้อมแล้ว กดปุ่มรับทราบบนหน้านี้" },
  { id: "pin", label: "ปักหมุดบนผัง", hint: "แตะแผนผังเพื่อปักหมุดตำแหน่งของคุณ" },
  { id: "status", label: "เปลี่ยนสถานะ", hint: "กด ปลอดภัย หรือ ต้องการช่วยเหลือ หรือ ไม่อยู่ในพื้นที่" },
  { id: "zone", label: "ดูเขตแดง", hint: "ดูวงกลมเขตแดงบนผัง — มาจากแท็บศูนย์ควบคุม" },
];

function commanderScriptFlags() {
  const incident = state.incident;
  if (!incident) return ["current", "todo", "todo", "todo", "todo"];
  if (incident.status === "RESOLVED") return ["done", "done", "done", "done", "done"];
  const trijak = isTrijak191(incident);
  const controlled = !trijak || Boolean(state.adminQueue?.controllerId);
  const zoned = !trijak || Boolean(state.map?.redZone);
  if (!controlled) return ["done", "current", "todo", "todo", "todo"];
  if (!zoned) return ["done", "done", "current", "todo", "todo"];
  if (incident.status !== "RESOLUTION_PENDING") return ["done", "done", "done", "current", "todo"];
  return ["done", "done", "done", "done", "current"];
}

function recipientScriptFlags() {
  const incident = state.incident;
  if (incident?.status === "RESOLVED") return ["done", "done", "done", "done"];
  if (!incidentIsLive(incident)) return ["current", "todo", "todo", "todo"];
  const acked = Boolean(state.ackResponse);
  const pinned = (state.map?.pins || []).some((pin) => pin.id === state.me?.personId);
  const changed = acked && state.ackResponse !== "ACK";
  const seen = Boolean(state.map?.redZone);
  if (!acked) return ["current", "todo", "todo", "todo"];
  if (!pinned) return ["done", "current", "todo", "todo"];
  if (!changed) return ["done", "done", "current", "todo"];
  if (!seen) return ["done", "done", "done", "current"];
  return ["done", "done", "done", "done"];
}

function renderDemoScript() {
  const root = $("#demo-stepper");
  if (!root || !state.demoApi) return;
  const commander = state.me?.role === "commander";
  const steps = commander ? CONTROL_SCRIPT : RECIPIENT_SCRIPT;
  const flags = commander ? commanderScriptFlags() : recipientScriptFlags();
  const currentIndex = flags.indexOf("current");
  let hintText = incidentIsLive(state.incident)
    ? "ทำครบขั้นตอนบนหน้านี้แล้ว — รออีกแท็บกดยุติ"
    : commander
      ? "ซ้อมรอบนี้จบแล้ว หมุดและเขตแดงถูกล้างแล้ว — กดค้างปุ่มแดงเพื่อเริ่มรอบใหม่"
      : "ซ้อมรอบนี้จบแล้ว หมุดและเขตแดงถูกล้างแล้ว";
  if (currentIndex >= 0) {
    hintText = steps[currentIndex].hint;
    if (commander && state.incident && !isTrijak191(state.incident) && steps[currentIndex].id === "watch") {
      hintText = "เทมเพลตนี้ไม่มีเขตแดง — ดูตัวเลขสถานะ แล้วค่อยยุติ";
    }
    if (!commander && !state.incident) hintText = "รอแท็บศูนย์ควบคุมกดเริ่มซ้อม แล้วกดรับทราบบนหน้านี้";
  }
  const bannerText = commander
    ? "ข้อความที่ผู้รับแจ้งเห็นบนอีกแท็บ"
    : "หน้าผู้รับแจ้ง — กราดยิง / ตรีจักร 191";
  const signature = `${commander ? "c" : "m"}|${state.me?.identityId || ""}|${flags.join(".")}|${hintText}`;
  if (state.demoScriptSignature === signature) return;
  state.demoScriptSignature = signature;
  root.replaceChildren(
    ...steps.map((step, index) => {
      const item = document.createElement("li");
      item.dataset.step = step.id;
      const flag = flags[index] || "todo";
      item.className = flag === "done" ? "is-done" : flag === "current" ? "is-current" : "is-todo";
      const num = document.createElement("span");
      num.textContent = String(index + 1);
      item.append(num, document.createTextNode(step.label));
      return item;
    }),
  );
  const hint = $("#demo-step-hint");
  if (hint) hint.textContent = hintText;
  const banner = $("#demo-screen-banner");
  if (banner) banner.textContent = bannerText;
  const who = $("#demo-advanced-you");
  if (who && state.me) {
    const advanced = ["commander2", "commander3", "commander4", "commander5"].includes(state.me.identityId);
    who.textContent = advanced
      ? `ตอนนี้คือ${state.me.displayName} — กด «ศูนย์ควบคุม» ด้านบนเพื่อกลับเป็นคนที่ 1`
      : "คนที่ 1 คือปุ่ม «ศูนย์ควบคุม» ด้านบน";
  }
  if (commander) {
    const heading = $("#commander-heading");
    const incident = state.incident;
    if (heading) {
      if (!incident || incident.status === "RESOLVED") heading.textContent = "เริ่มซ้อมกราดยิง / ตรีจักร 191";
      else if (incident.status === "RESOLUTION_PENDING") heading.textContent = "รอยืนยันยุติจากคนที่ 2";
      else if (isTrijak191(incident) && !state.adminQueue?.controllerId) heading.textContent = "ยืนยันควบคุมภายใน 20 วินาที";
      else if (isTrijak191(incident) && !state.map?.redZone) heading.textContent = "วางเขตแดงบนผัง";
      else heading.textContent = "ดูสถานะ แล้วยุติการซ้อม";
    }
    const pending = incident?.status === "RESOLUTION_PENDING";
    const advanced = $("#demo-advanced");
    if (pending && !state.demoAdvancedNudged) {
      state.demoAdvancedNudged = true;
      advanced?.setAttribute("open", "");
    }
    if (!pending) state.demoAdvancedNudged = false;
  }
}

/* ── v0.2.0 : หมุนเวียนผู้ประกาศ (ข้อ 4) ─────────────────────── */

async function refreshRoster() {
  if (state.me?.role !== "commander") return;
  try {
    const result = await api("/api/commander/roster");
    $("#roster-capacity").textContent =
      `${result.capacity.active}/5 คน · ว่าง ${result.capacity.free}`;
    const commanders = result.commanders || [];
    $("#roster-empty").classList.toggle("hidden", commanders.length > 0);
    $("#roster-list").replaceChildren(
      ...commanders.map((commander) => {
        const item = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = commander.callSign;
        if (commander.callSign === result.you) {
          label.classList.add("you");
          label.textContent += " (คุณ)";
        }
        const seen = document.createElement("span");
        seen.textContent = `เข้าใช้ล่าสุด ${new Date(commander.lastLoginAt).toLocaleDateString("th-TH")}`;
        item.append(label, seen);
        return item;
      }),
    );
  } catch (error) {
    toast(error.message);
  }
}

async function revokeCommander() {
  const callSign = $("#revoke-callsign").value.trim().toUpperCase();
  if (!callSign) return;
  if (!window.confirm(`ยืนยันถอดถอนสิทธิ์ผู้ประกาศของ ${callSign}?`)) return;
  try {
    const result = await api("/api/commander/revoke", {
      method: "POST",
      body: JSON.stringify({ callSign }),
    });
    $("#revoke-callsign").value = "";
    toast(
      result.revoked
        ? `ถอดถอน ${callSign} แล้ว`
        : `บันทึกการอนุมัติแล้ว ต้องการอีก ${result.approvalsRequired} คน`,
    );
    await refreshRoster();
  } catch (error) {
    toast(error.message);
  }
}

async function reinviteCommander() {
  try {
    const result = await api("/api/commander/reinvite", { method: "POST", body: "{}" });
    window.prompt("คัดลอกรหัสนี้แล้วส่งให้ผู้รับเป็นการส่วนตัว รหัสจะแสดงครั้งเดียว", result.invite);
    toast(`รหัสหมดอายุ ${new Date(result.expiresAt).toLocaleString("th-TH")}`);
    await refreshRoster();
  } catch (error) {
    toast(error.message);
  }
}

/* ── รายงานจากผู้ใช้ที่รอรับเรื่อง ────────────────────────────
   ระบบจะแจ้งผู้ประกาศลำดับที่ 1 ก่อน ถ้าไม่มีใครกดรับเรื่อง
   จะไล่ไปลำดับถัดไปเรื่อย ๆ จนถึงคนที่ 5
   การกดรับเรื่องหยุดการไล่ระดับทันที                              */

const TYPE_LABEL = {
  VIOLENCE: "เหตุความรุนแรง",
  WEAPON: "พบสิ่งที่อาจเป็นอาวุธ",
  SUSPICIOUS: "บุคคลหรือเหตุการณ์น่าสงสัย",
  MEDICAL: "เหตุฉุกเฉินทางการแพทย์",
  OTHER: "เหตุอื่น ๆ",
};

async function refreshReports() {
  if (state.me?.role !== "commander") return;
  try {
    const result = await api("/api/reports/open");
    const list = result.reports || [];
    $("#reports-count").textContent = String(list.length);
    $("#reports-panel").classList.toggle("hidden", list.length === 0);
    $("#reports-empty").classList.toggle("hidden", list.length > 0);
    $("#reports-list").replaceChildren(
      ...list.map((report) => {
        const item = document.createElement("li");
        const info = document.createElement("div");
        info.className = "info";
        const title = document.createElement("strong");
        title.textContent = TYPE_LABEL[report.type] || report.type;
        const meta = document.createElement("span");
        meta.className = "meta";
        const step = report.step ? ` · แจ้งถึงผู้ประกาศลำดับที่ ${report.step} แล้ว` : " · กำลังแจ้ง";
        meta.textContent =
          `${report.zone} · ${new Date(report.createdAt).toLocaleTimeString("th-TH")}${step}`;
        info.append(title);
        if (report.note) {
          const note = document.createElement("div");
          note.textContent = report.note;
          info.append(note);
        }
        info.append(meta);
        const button = document.createElement("button");
        button.className = "button success";
        button.textContent = "รับเรื่อง";
        button.addEventListener("click", () => claimReport(report.id, button));
        item.append(info, button);
        return item;
      }),
    );
  } catch (error) {
    if (error.status !== 403) toast(error.message);
  }
}

async function claimReport(reportId, button) {
  button.disabled = true;
  try {
    await api(`/api/reports/${reportId}/claim`, { method: "POST", body: "{}" });
    toast("รับเรื่องแล้ว หยุดการแจ้งผู้ประกาศคนถัดไป");
    await refreshReports();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
    await refreshReports();
  }
}

/* ── การอัปเดตเวอร์ชัน ────────────────────────────────────────
   เครื่องที่เปิดค้างไว้ทั้งวันจะยังรันโค้ดเวอร์ชันเก่าจนกว่าจะโหลดหน้าใหม่
   ซึ่งเป็นความเสี่ยงจริงในโรงเรียน เพราะครูมักเปิดแอปทิ้งไว้บนโต๊ะ

   กติกา
     ไม่มีเหตุการณ์  → รีเฟรชเงียบ ๆ ทันที
     กำลังมีเหตุ     → ห้ามรีเฟรช ขึ้นแถบให้ผู้ใช้เลือกเอง
                       เพราะการรีโหลดอาจตัดจังหวะคนที่กำลังจะกดขอความช่วยเหลือ
     เหตุยุติแล้ว     → รีเฟรชให้อัตโนมัติ

   ตรวจตอนเปิดแอปกลับมาหน้าจอ และทุก 15 นาที
   ไม่ตรวจถี่กว่านี้เพราะ 4,000 เครื่องเรียกพร้อมกันคือค่าใช้จ่ายจริง          */

const VERSION_POLL_MS = 15 * 60 * 1000;

function incidentIsActive() {
  return incidentIsLive(state.incident);
}

function applyUpdate() {
  window.location.reload();
}

async function checkVersion() {
  try {
    const result = await api("/api/version");
    if (!state.version) {
      state.version = result.version;
      return;
    }
    if (result.version === state.version) return;
    if (incidentIsActive()) {
      state.updatePending = true;
      $("#update-banner").classList.remove("hidden");
    } else {
      applyUpdate();
    }
  } catch {
    // ออฟไลน์อยู่ ไว้ตรวจรอบหน้า
  }
}

/* ── การสลับมุมมอง ────────────────────────────────────────────
   ผู้ใช้ทั่วไปเห็นเฉพาะสิ่งที่ต้องใช้ตอนเกิดเหตุ
   ผู้ดูแลสลับไปดูมุมมองผู้ใช้ได้ เพื่อใช้ตอนอบรมและตอนสาธิต        */

/* ── คู่มือติดตั้งในแอป ─────────────────────────────────────── */
function setGuideTab(platform) {
  const ios = platform !== "android";
  $("#guide-ios").classList.toggle("hidden", !ios);
  $("#guide-android").classList.toggle("hidden", ios);
  $("#guide-tab-ios").classList.toggle("is-active", ios);
  $("#guide-tab-android").classList.toggle("is-active", !ios);
}

function openInstallGuide() {
  setGuideTab(platformName());
  const dialog = $("#install-guide");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeInstallGuide() {
  const dialog = $("#install-guide");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function setView(view) {
  state.view = view;
  const admin = view === "admin";
  $("#admin-view").classList.toggle("hidden", !admin);
  $("#user-view").classList.toggle("hidden", admin);
  $("#view-admin").classList.toggle("is-active", admin);
  $("#view-user").classList.toggle("is-active", !admin);
  if (admin) {
    refreshDashboard();
    refreshRoster();
    refreshReports();
    if (!state.reportsTimer) state.reportsTimer = window.setInterval(refreshReports, 15000);
  } else if (state.reportsTimer) {
    window.clearInterval(state.reportsTimer);
    state.reportsTimer = null;
  }
}

async function logout() {
  if (state.demoApi) {
    location.href = "/";
    return;
  }
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  location.reload();
}

function applyDemoIdentity(me) {
  state.me = me;
  state.ackResponse = me.ackResponse || null;
  state.ackedIncidentId = me.ackedIncidentId || null;
  state.ackAt = me.ackAt || null;
  state.ackUpdatedAt = me.ackUpdatedAt || me.ackAt || null;
  const queued = ["commander2", "commander3", "commander4", "commander5"].includes(me.identityId);
  const roleLabel = me.role === "commander"
    ? queued
      ? `ศูนย์ควบคุม · ${me.displayName}`
      : "ศูนย์ควบคุม · คนที่ 1"
    : "ผู้รับแจ้ง";
  $("#account-label").textContent = roleLabel;
  document.body.classList.toggle("demo-role-commander", me.role === "commander");
  document.body.classList.toggle("demo-role-member", me.role !== "commander");
  for (const button of document.querySelectorAll(".demo-mode")) {
    const active = me.role === "commander"
      ? button.dataset.identity === "commander"
      : button.dataset.identity === "member";
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  const controlHint = document.querySelector('.demo-mode[data-identity="commander"] small');
  if (controlHint) {
    controlHint.textContent = queued
      ? `กำลังใช้${me.displayName} — กดเพื่อกลับเป็นคนที่ 1`
      : "เริ่มซ้อม · ยืนยันควบคุม · วางเขตแดง";
  }
  for (const button of document.querySelectorAll(".demo-id")) {
    button.classList.toggle("is-active", button.dataset.identity === me.identityId);
  }
  if (me.role === "commander") setView("admin");
  else setView("user");
  renderAckStatus();
  renderDemoScript();
}

async function switchDemoIdentity(id) {
  try {
    const me = await api("/api/demo/identity", { method: "POST", body: JSON.stringify({ id }) });
    applyDemoIdentity(me);
    const active = await api("/api/incidents/active");
    applyMapPayload(active);
    renderIncident(active.incident);
    if (me.role === "commander") await refreshDashboard();
  } catch (error) {
    toast(error.message);
  }
}

async function resetDemo() {
  try {
    await api("/api/demo/reset", { method: "POST", body: "{}" });
    toast("รีเซ็ตข้อมูลจำลองแล้ว");
    location.reload();
  } catch (error) {
    toast(error.message);
  }
}

async function init() {
  showLoginErrorFromUrl();
  $("#login-panel").classList.add("hidden");
  if (isDemoMode()) {
    const { createDemoApi } = await import("/demo-mock.js");
    state.demoApi = createDemoApi({
      storage: window.sessionStorage,
      sharedStorage: window.localStorage,
      seedTemplateId: "TRIJAK_191",
      startIdle: true,
      broadcast: "BroadcastChannel" in window ? new BroadcastChannel("hyw-demo-v1") : null,
    });
    document.body.classList.add("demo-mode");
    $("#logout-button").textContent = "ออกจากโหมดสาธิต";
    $("#help-button").textContent = "ต้องการช่วยเหลือ";
  }
  try {
    state.config = await api("/api/config");
    $("#school-name").textContent = state.config.schoolName;
    // แสดงโดเมนที่อนุญาตจากค่าจริงของเซิร์ฟเวอร์ ไม่ฝังไว้ในหน้าเว็บ
    $("#allowed-domain").textContent = "@" + state.config.googleDomain;
    fillZones();
    if (state.demoApi) renderDrillTemplates();
  } catch (error) {
    showBootError(error.message || "เชื่อมต่อระบบไม่ได้");
    return;
  }

  try {
    state.me = await api("/api/me");
  } catch (error) {
    hideBoot();
    if (error.status === 401) {
      $("#login-panel").classList.remove("hidden");
      refreshInstallBanner(false);
      return;
    }
    showBootError(error.message);
    return;
  }

  hideBoot();
  document.body.classList.remove("is-logged-out");
  $("#login-panel").classList.add("hidden");
  $("#app-panel").classList.remove("hidden");
  $("#logout-button").classList.remove("hidden");
  if (state.demoApi) {
    applyDemoIdentity(state.me);
  } else {
    const roleLabel = ROLE_LABEL[state.me.role] || state.me.role;
    $("#account-label").textContent = `${state.me.email} · ${roleLabel}`;
    if (state.me.role === "commander") {
      $("#view-switch").classList.remove("hidden");
      setView("admin");
    } else {
      $("#admin-view").remove();
    }
  }

  if (!state.demoApi && "serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  if (!state.demoApi) await refreshReadiness();
  const active = await api("/api/incidents/active");
  applyMapPayload(active);
  renderIncident(active.incident);
  connectRealtime();
  if (state.me.role === "commander") {
    await refreshDashboard();
    if (!state.demoApi) await refreshRoster();
  }
}

$("#enable-push").addEventListener("click", enablePush);
$("#report-form").addEventListener("submit", submitReport);
$("#invite-form").addEventListener("submit", redeemInvite);
$("#invite-token").addEventListener("paste", (event) => {
  const text = event.clipboardData?.getData("text") ?? "";
  if (!text) return;
  event.preventDefault();
  $("#invite-token").value = text.replace(/\s+/g, "");
});
$("#ack-button").addEventListener("click", () => acknowledge("ACK"));
$("#safe-button").addEventListener("click", () => acknowledge("SAFE"));
$("#help-button").addEventListener("click", () => acknowledge("NEED_HELP"));
$("#away-button").addEventListener("click", () => acknowledge("AWAY"));
$("#logout-button").addEventListener("click", logout);
$("#update-now").addEventListener("click", applyUpdate);
$("#boot-retry").addEventListener("click", () => location.reload());
$("#login-open-guide").addEventListener("click", openInstallGuide);
$("#install-banner-action").addEventListener("click", handleInstallAction);
$("#install-banner-dismiss").addEventListener("click", () => {
  sessionStorage.setItem("hyw-install-dismissed", "1");
  $("#install-banner").classList.add("hidden");
  document.body.classList.remove("has-install-banner");
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstall = event;
  refreshInstallBanner(state.pushRegistered);
});
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.payload?.kind === "report") refreshReports();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkVersion();
});
window.setInterval(checkVersion, VERSION_POLL_MS);
$("#view-user").addEventListener("click", () => setView("user"));
$("#view-admin").addEventListener("click", () => setView("admin"));
$("#resolve-drill").addEventListener("click", resolveDrill);
$("#push-update")?.addEventListener("click", pushInstructionUpdate);
$("#silent-lockdown-toggle")?.addEventListener("change", (event) => {
  writeSilentMode(event.target.checked);
  renderSilentLockdown(state.incident);
  toast(
    event.target.checked
      ? "โหมดเงียบ: ปิดเสียงและสั่นที่แอปจำลองขณะล็อกดาวน์"
      : "เปิดเสียงและสั่นจำลองของแอปแล้ว",
  );
});
$("#refresh-dashboard").addEventListener("click", () => {
  refreshDashboard();
  refreshRoster();
});
$("#revoke-button").addEventListener("click", revokeCommander);
$("#reinvite-button").addEventListener("click", reinviteCommander);
$("#open-guide").addEventListener("click", openInstallGuide);
$("#guide-close").addEventListener("click", closeInstallGuide);
$("#guide-tab-ios").addEventListener("click", () => setGuideTab("ios"));
$("#guide-tab-android").addEventListener("click", () => setGuideTab("android"));
$("#demo-reset").addEventListener("click", resetDemo);
function onDemoIdentityClick(event) {
  const button = event.target.closest("[data-identity]");
  if (button) switchDemoIdentity(button.dataset.identity);
}
$("#demo-identities")?.addEventListener("click", onDemoIdentityClick);
$("#demo-mode-switch")?.addEventListener("click", onDemoIdentityClick);
$("#use-trijak")?.addEventListener("click", () => {
  const template = state.config?.templates?.find((item) => item.id === "TRIJAK_191");
  if (template) selectDrillTemplate(template);
});
$("#campus-map")?.addEventListener("click", handleCampusMapClick);
$("#confirm-control")?.addEventListener("click", confirmControl);

const holdButton = $("#activate-drill");
holdButton.addEventListener("pointerdown", beginHold);
holdButton.addEventListener("pointerup", cancelHold);
holdButton.addEventListener("pointercancel", cancelHold);
holdButton.addEventListener("pointerleave", cancelHold);

init();

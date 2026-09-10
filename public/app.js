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
  deferredInstall: null,
  demoApi: null,
  selectedTemplateId: null,
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

function renderAckStatus() {
  const box = $("#ack-status");
  const sameIncident = state.incident && state.ackedIncidentId === state.incident.id;
  const safeButton = $("#safe-button");
  const helpButton = $("#help-button");
  const ackButton = $("#ack-button");
  const demo = Boolean(state.demoApi);

  if (!state.incident || state.incident.status === "RESOLVED" || !sameIncident || !state.ackResponse) {
    box.classList.add("hidden");
    box.textContent = "";
    ackButton.disabled = false;
    ackButton.textContent = "รับทราบ";
    ackButton.classList.remove("hidden");
    if (demo) {
      safeButton.classList.add("hidden");
      helpButton.classList.add("hidden");
    } else {
      helpButton.classList.remove("hidden");
    }
    return;
  }

  box.classList.remove("hidden");
  if (demo) {
    ackButton.classList.add("hidden");
    safeButton.classList.remove("hidden");
    helpButton.classList.remove("hidden");
    helpButton.textContent = "ต้องการช่วยเหลือ";
    safeButton.classList.toggle("is-active", state.ackResponse === "SAFE");
    helpButton.classList.toggle("is-active", state.ackResponse === "NEED_HELP");
    if (state.ackResponse === "NEED_HELP") box.textContent = "ส่งคำขอความช่วยเหลือแล้ว — ศูนย์ควบคุมได้รับเรื่อง";
    else if (state.ackResponse === "SAFE") box.textContent = "บันทึกสถานะ ปลอดภัย แล้ว";
    else box.textContent = "รับทราบแล้ว — เลือก ปลอดภัย หรือ ต้องการช่วยเหลือ";
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

function renderIncident(incident) {
  state.incident = incident;
  const panel = $("#incident-panel");
  const actions = $("#incident-actions");
  panel.classList.remove("idle", "active", "resolved", "pending");
  const live = incidentIsLive(incident);
  document.body.classList.toggle("drill-live", live);
  if (!incident) {
    panel.classList.add("idle");
    $("#incident-mode").textContent = "พร้อมรับแจ้งเตือน";
    $("#incident-title").textContent = "ขณะนี้ไม่มีการฝึกซ้อม";
    $("#incident-instruction").textContent = "ระบบเชื่อมต่อกับศูนย์ควบคุมแล้ว";
    $("#incident-meta").textContent = "";
    actions.classList.add("hidden");
    $("#commander-start")?.classList.remove("hidden");
    $("#commander-end")?.classList.add("hidden");
    const heading = $("#commander-heading");
    if (heading) heading.textContent = "เริ่มการฝึกซ้อม";
    $("#dashboard-empty")?.classList.remove("hidden");
    state.ackResponse = null;
    state.ackedIncidentId = null;
    renderAckStatus();
    return;
  }
  const resolved = incident.status === "RESOLVED";
  const pending = incident.status === "RESOLUTION_PENDING";
  if (resolved && state.updatePending) window.setTimeout(applyUpdate, 3000);
  panel.classList.add(resolved ? "resolved" : pending ? "pending" : "active");
  $("#incident-mode").textContent = resolved
    ? "การฝึกซ้อมสิ้นสุดแล้ว"
    : pending
      ? "รอผู้ประกาศคนที่ 2 ยืนยันยุติ"
      : "กำลังฝึกซ้อม";
  $("#incident-title").textContent = resolved ? "การฝึกซ้อมสิ้นสุดแล้ว" : incident.title;
  $("#incident-instruction").textContent = resolved
    ? "กรุณารอคำแนะนำจากโรงเรียนก่อนกลับเข้าสู่กิจกรรมตามปกติ"
    : incident.instruction;
  $("#incident-meta").textContent = `รหัส ${incident.id} · พื้นที่ ${incident.zone} · เวอร์ชัน ${incident.version}`;
  actions.classList.toggle("hidden", resolved);
  if (state.ackedIncidentId !== incident.id) {
    state.ackResponse = null;
    state.ackedIncidentId = null;
  }
  renderAckStatus();
  if (state.me?.role === "commander") {
    $("#commander-start")?.classList.toggle("hidden", !resolved);
    $("#commander-end")?.classList.toggle("hidden", resolved);
    const heading = $("#commander-heading");
    if (heading) heading.textContent = resolved ? "เริ่มการฝึกซ้อม" : "ยุติการฝึกซ้อม";
    const hint = $("#resolve-hint");
    if (hint) hint.textContent = pending
      ? "มีผู้ประกาศยืนยันแล้ว 1 คน ต้องการอีก 1 คนจึงจะยุติ"
      : "การยุติต้องได้รับการยืนยันจากผู้ประกาศ 2 คนที่ต่างกัน";
    $("#dashboard-empty")?.classList.toggle("hidden", true);
  }
}

function connectRealtime() {
  if (state.demoApi) {
    setConnectionStatus(true);
    state.demoApi.subscribe((message) => {
      if (message?.type === "incident_state") {
        renderIncident(message.incident);
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
  $("#ack-button").disabled = response === "ACK";
  try {
    await api("/api/acknowledgements", {
      method: "POST",
      body: JSON.stringify({
        incidentId,
        response,
        zone: $("#device-zone").value,
      }),
    });
    state.ackResponse = response;
    state.ackedIncidentId = incidentId;
    renderAckStatus();
    toast(response === "ACK" ? "บันทึกการรับทราบแล้ว" : "ส่งคำขอความช่วยเหลือไปยังศูนย์ควบคุมแล้ว");
  } catch (error) {
    $("#ack-button").disabled = false;
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
    renderIncident(result.incident);
    toast(
      result.incident.status === "RESOLVED"
        ? "ยุติการฝึกซ้อมแล้ว"
        : `บันทึกการยืนยันแล้ว ต้องการอีก ${result.approvalsRequired} คน`,
    );
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
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
  renderZoneGroups("#afteraction-silent", after.nonRespondersByZone);
}

function renderDrillTemplates() {
  const root = $("#drill-templates");
  if (!root || !state.demoApi) return;
  const templates = state.config?.templates || [];
  root.replaceChildren(
    ...templates.map((template) => {
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
  const current = templates.find((item) => item.id === state.selectedTemplateId) || templates[0];
  if (current) selectDrillTemplate(current);
}

function selectDrillTemplate(template) {
  state.selectedTemplateId = template.id;
  const typeSelect = $("#drill-type");
  if (typeSelect.querySelector(`option[value="${template.type}"]`)) typeSelect.value = template.type;
  $("#drill-instruction").value = template.instruction;
  for (const button of document.querySelectorAll(".template-card")) {
    button.classList.toggle("is-active", button.dataset.template === template.id);
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
  const roleLabel = ROLE_LABEL[me.role] || me.role;
  $("#account-label").textContent = `${me.displayName || me.email} · ${roleLabel}`;
  for (const button of document.querySelectorAll(".demo-id")) {
    button.classList.toggle("is-active", button.dataset.identity === me.identityId);
  }
  $("#view-switch").classList.remove("hidden");
  if (me.role === "commander") setView("admin");
  else setView("user");
  renderAckStatus();
}

async function switchDemoIdentity(id) {
  try {
    const me = await api("/api/demo/identity", { method: "POST", body: JSON.stringify({ id }) });
    applyDemoIdentity(me);
    const active = await api("/api/incidents/active");
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
    state.demoApi = createDemoApi({ storage: window.sessionStorage });
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
$("#demo-identities").addEventListener("click", (event) => {
  const button = event.target.closest("[data-identity]");
  if (button) switchDemoIdentity(button.dataset.identity);
});

const holdButton = $("#activate-drill");
holdButton.addEventListener("pointerdown", beginHold);
holdButton.addEventListener("pointerup", cancelHold);
holdButton.addEventListener("pointercancel", cancelHold);
holdButton.addEventListener("pointerleave", cancelHold);

init();

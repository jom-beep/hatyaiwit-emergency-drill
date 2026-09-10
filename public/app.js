const state = {
  config: null,
  me: null,
  incident: null,
  pushRegistered: false,
  holdTimer: null,
  holdActive: false,
  actionToken: null,
  socket: null,
  view: "admin",
  version: null,
  updatePending: false,
  reportsTimer: null,
};

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
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
  for (const select of [$("#device-zone"), $("#report-zone"), $("#drill-zone")]) {
    select.replaceChildren();
    for (const zone of state.config.zones) {
      const option = document.createElement("option");
      option.value = zone.id;
      option.textContent = zone.name;
      select.append(option);
    }
  }
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

function renderIncident(incident) {
  state.incident = incident;
  const panel = $("#incident-panel");
  const actions = $("#incident-actions");
  panel.classList.remove("idle", "active", "resolved");
  if (!incident) {
    panel.classList.add("idle");
    $("#incident-mode").textContent = "พร้อมรับแจ้งเตือน";
    $("#incident-title").textContent = "ขณะนี้ไม่มีการฝึกซ้อม";
    $("#incident-instruction").textContent = "ระบบเชื่อมต่อกับศูนย์ควบคุมแล้ว";
    $("#incident-meta").textContent = "";
    actions.classList.add("hidden");
    $("#resolve-drill").classList.add("hidden");
    return;
  }
  const resolved = incident.status === "RESOLVED";
  if (resolved && state.updatePending) window.setTimeout(applyUpdate, 3000);
  panel.classList.add(resolved ? "resolved" : "active");
  $("#incident-mode").textContent = resolved ? "DRILL ENDED" : "DRILL ACTIVE";
  $("#incident-title").textContent = resolved ? "การฝึกซ้อมสิ้นสุดแล้ว" : incident.title;
  $("#incident-instruction").textContent = resolved
    ? "กรุณารอคำแนะนำจากโรงเรียนก่อนกลับเข้าสู่กิจกรรมตามปกติ"
    : incident.instruction;
  $("#incident-meta").textContent = `รหัส ${incident.id} · พื้นที่ ${incident.zone} · เวอร์ชัน ${incident.version}`;
  actions.classList.toggle("hidden", resolved);
  if (state.me?.role === "commander") $("#resolve-drill").classList.toggle("hidden", resolved);
}

function connectRealtime() {
  if (state.socket && state.socket.readyState < 2) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/api/ws`);
  state.socket = socket;
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
  socket.addEventListener("close", () => window.setTimeout(connectRealtime, 3000));
  window.setInterval(() => {
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
  if (!state.incident) return;
  try {
    await api("/api/acknowledgements", {
      method: "POST",
      body: JSON.stringify({
        incidentId: state.incident.id,
        response,
        zone: $("#device-zone").value,
      }),
    });
    toast(response === "ACK" ? "บันทึกการรับทราบแล้ว" : "ส่งคำขอความช่วยเหลือไปยังศูนย์ควบคุมแล้ว");
  } catch (error) {
    toast(error.message);
  }
}

async function redeemInvite(event) {
  event.preventDefault();
  const token = $("#invite-token").value.trim();
  if (!token) return;
  try {
    await api("/api/commander/redeem", { method: "POST", body: JSON.stringify({ token }) });
    $("#invite-token").value = "";
    toast("ยืนยันสิทธิ์สำเร็จ กำลังโหลดระบบใหม่");
    window.setTimeout(() => location.reload(), 1000);
  } catch (error) {
    toast(error.message);
  }
}

async function beginHold(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  const button = $("#activate-drill");
  if (button.disabled || state.incident?.status === "ACTIVE") return;
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
      }),
    });
    renderIncident(result.incident);
    toast("เริ่มการฝึกซ้อมและส่งเข้าคิวแจ้งเตือนแล้ว");
  } catch (error) {
    toast(error.message);
  }
}

async function resolveDrill() {
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
  } catch (error) {
    toast(error.message);
  }
}

/* ── v0.2.0 : หมุนเวียนผู้ประกาศ (ข้อ 4) ─────────────────────── */

async function refreshRoster() {
  if (state.me?.role !== "commander") return;
  try {
    const result = await api("/api/commander/roster");
    $("#roster-capacity").textContent =
      `${result.capacity.active}/5 คน · ว่าง ${result.capacity.free}`;
    $("#roster-list").replaceChildren(
      ...result.commanders.map((commander) => {
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
  return Boolean(state.incident && state.incident.status !== "RESOLVED");
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
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  location.reload();
}

async function init() {
  try {
    state.config = await api("/api/config");
    $("#school-name").textContent = state.config.schoolName;
    // แสดงโดเมนที่อนุญาตจากค่าจริงของเซิร์ฟเวอร์ ไม่ฝังไว้ในหน้าเว็บ
    // ทำให้สลับโดเมนทดลองกับโดเมนใช้งานจริงได้โดยแก้แค่ wrangler.jsonc
    $("#allowed-domain").textContent = "@" + state.config.googleDomain;
    fillZones();
  } catch (error) {
    toast(error.message);
    return;
  }

  try {
    state.me = await api("/api/me");
  } catch (error) {
    if (error.status === 401) return;
    toast(error.message);
    return;
  }

  $("#login-panel").classList.add("hidden");
  $("#app-panel").classList.remove("hidden");
  $("#logout-button").classList.remove("hidden");
  $("#account-label").textContent = `${state.me.email} · ${state.me.role}`;
  if (state.me.role === "commander") {
    $("#view-switch").classList.remove("hidden");
    setView("admin");
  } else {
    $("#admin-view").remove();
  }

  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await refreshReadiness();
  const active = await api("/api/incidents/active");
  renderIncident(active.incident);
  connectRealtime();
  if (state.me.role === "commander") {
    await refreshDashboard();
    await refreshRoster();
  }
}

$("#enable-push").addEventListener("click", enablePush);
$("#report-form").addEventListener("submit", submitReport);
$("#invite-form").addEventListener("submit", redeemInvite);
$("#ack-button").addEventListener("click", () => acknowledge("ACK"));
$("#help-button").addEventListener("click", () => acknowledge("NEED_HELP"));
$("#logout-button").addEventListener("click", logout);
$("#update-now").addEventListener("click", applyUpdate);
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

const holdButton = $("#activate-drill");
holdButton.addEventListener("pointerdown", beginHold);
holdButton.addEventListener("pointerup", cancelHold);
holdButton.addEventListener("pointercancel", cancelHold);
holdButton.addEventListener("pointerleave", cancelHold);

init();

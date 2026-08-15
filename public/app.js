const state = {
  config: null,
  me: null,
  incident: null,
  pushRegistered: false,
  holdTimer: null,
  holdActive: false,
  actionToken: null,
  socket: null,
  rollCallIncidentId: null,
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
    toast("กรุณาเพิ่มเว็บไปยังหน้าจอโฮม แล้วเปิดจากไอคอนที่ติดตั้ง");
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
        refreshRollCall();
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
    $("#metric-rooms").textContent =
      `${result.rollCall?.totals?.roomsReported || 0}/${result.rollCall?.roomsTotal || 0}`;
    $("#metric-missing").textContent = Number(result.rollCall?.totals?.missing || 0).toLocaleString("th-TH");
    renderRoomBoard(result.rollCall);
    renderIncident(result.incident);
  } catch (error) {
    toast(error.message);
  }
}

/* ── v0.2.0 : เช็กชื่อรายห้อง (ข้อ 6) ─────────────────────────── */

const CAN_ROLL_CALL = new Set(["teacher", "security", "commander"]);

function renderRoomBoard(rollCall) {
  const board = $("#rollcall-board");
  if (!board) return;
  if (!rollCall?.rooms?.length) {
    board.replaceChildren();
    return;
  }
  board.replaceChildren(
    ...rollCall.rooms.map((room) => {
      const chip = document.createElement("div");
      const reported = room.reportedAt != null;
      const tone = !reported
        ? "none"
        : room.injured > 0
          ? "bad"
          : room.missing > 0 || room.secured === 0
            ? "warn"
            : "ok";
      chip.className = `room-chip ${tone}`;
      const title = document.createElement("strong");
      title.textContent = room.name;
      chip.append(title);
      chip.append(
        document.createTextNode(
          reported
            ? `${room.present} คน` +
              (room.injured ? ` · เจ็บ ${room.injured}` : "") +
              (room.missing ? ` · ขาด ${room.missing}` : "") +
              (room.secured === 0 ? " · ยังไม่ล็อก" : "")
            : "ยังไม่รายงาน",
        ),
      );
      return chip;
    }),
  );
}

async function refreshRollCall() {
  if (!CAN_ROLL_CALL.has(state.me?.role)) return;
  try {
    const result = await api("/api/rollcall");
    state.rollCallIncidentId = result.incidentId;
    $("#rollcall-progress").textContent = `${result.totals?.roomsReported || 0}/${result.roomsTotal || 0}`;
    const select = $("#rollcall-room");
    if (select && !select.options.length && result.rooms?.length) {
      select.replaceChildren(
        ...result.rooms.map((room) => {
          const option = document.createElement("option");
          option.value = room.room;
          option.textContent = room.name;
          return option;
        }),
      );
    }
  } catch (error) {
    if (error.status !== 403) toast(error.message);
  }
}

async function submitRollCall(event) {
  event.preventDefault();
  if (!state.rollCallIncidentId) {
    toast("ยังไม่มีการฝึกซ้อมที่เปิดอยู่");
    return;
  }
  const submit = event.submitter;
  submit.disabled = true;
  try {
    await api("/api/rollcall", {
      method: "POST",
      body: JSON.stringify({
        incidentId: state.rollCallIncidentId,
        room: $("#rollcall-room").value,
        present: Number($("#rollcall-present").value),
        injured: Number($("#rollcall-injured").value),
        missing: Number($("#rollcall-missing").value),
        secured: $("#rollcall-secured").checked,
        note: $("#rollcall-note").value,
      }),
    });
    toast("ส่งผลเช็กชื่อแล้ว ศูนย์ควบคุมเห็นข้อมูลนี้ทันที");
    await refreshRollCall();
  } catch (error) {
    toast(error.message);
  } finally {
    submit.disabled = false;
  }
}

async function claimTeacher(event) {
  event.preventDefault();
  const code = $("#teacher-code").value.trim();
  if (!code) return;
  try {
    await api("/api/roles/teacher", { method: "POST", body: JSON.stringify({ code }) });
    $("#teacher-code").value = "";
    toast("ยืนยันบทบาทครูสำเร็จ กำลังโหลดระบบใหม่");
    window.setTimeout(() => location.reload(), 1000);
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

async function logout() {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  location.reload();
}

async function init() {
  try {
    state.config = await api("/api/config");
    $("#school-name").textContent = state.config.schoolName;
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
    $("#commander-panel").classList.remove("hidden");
    $("#dashboard-panel").classList.remove("hidden");
    $("#roster-panel").classList.remove("hidden");
  }
  if (CAN_ROLL_CALL.has(state.me.role)) $("#rollcall-panel").classList.remove("hidden");

  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await refreshReadiness();
  const active = await api("/api/incidents/active");
  renderIncident(active.incident);
  connectRealtime();
  await refreshRollCall();
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
$("#resolve-drill").addEventListener("click", resolveDrill);
$("#refresh-dashboard").addEventListener("click", () => {
  refreshDashboard();
  refreshRoster();
});
$("#rollcall-form").addEventListener("submit", submitRollCall);
$("#teacher-form").addEventListener("submit", claimTeacher);
$("#revoke-button").addEventListener("click", revokeCommander);
$("#reinvite-button").addEventListener("click", reinviteCommander);

const holdButton = $("#activate-drill");
holdButton.addEventListener("pointerdown", beginHold);
holdButton.addEventListener("pointerup", cancelHold);
holdButton.addEventListener("pointercancel", cancelHold);
holdButton.addEventListener("pointerleave", cancelHold);

init();

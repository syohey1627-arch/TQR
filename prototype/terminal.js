import { supabase } from "./supabase-client.js";

const modes = {
  clockIn: {
    label: "出勤",
    pill: "出勤モード",
    color: "#11834f",
    dark: "#0a5c37",
    caption: "00:00-13:30は出勤モードです。",
    punchType: "clock_in",
    temporary: false
  },
  clockOut: {
    label: "退勤",
    pill: "退勤モード",
    color: "#c92d2d",
    dark: "#8f1f1f",
    caption: "13:31-23:59は退勤モードです。",
    punchType: "clock_out",
    temporary: false
  },
  breakIn: {
    label: "休憩入り",
    pill: "休憩入りモード",
    color: "#2563eb",
    dark: "#1e3f9c",
    caption: "5分後に通常モードへ戻ります。",
    punchType: "break_start",
    temporary: true
  },
  breakOut: {
    label: "休憩戻り",
    pill: "休憩戻りモード",
    color: "#0f766e",
    dark: "#0c4d48",
    caption: "5分後に通常モードへ戻ります。",
    punchType: "break_end",
    temporary: true
  },
  leave: {
    label: "中抜け",
    pill: "中抜けモード",
    color: "#c45f10",
    dark: "#8b4109",
    caption: "5分後に通常モードへ戻ります。",
    punchType: "leave_start",
    temporary: true
  },
  return: {
    label: "中戻り",
    pill: "中戻りモード",
    color: "#6d3bbd",
    dark: "#4c2788",
    caption: "5分後に通常モードへ戻ります。",
    punchType: "leave_end",
    temporary: true
  }
};

const deviceCode = "TQR-TAB-001";
const demoDeviceSecret = "0000";
const demoQrToken = "tqr-demo-qr-token-change-before-production";
const demoEmployee = {
  companyId: "TOTAL-001",
  employeeId: "E-0007",
  employeeName: "山田 太郎"
};

const elements = {
  topbar: document.getElementById("topbar"),
  modePanel: document.getElementById("modePanel"),
  modeLabel: document.getElementById("modeLabel"),
  modeCaption: document.getElementById("modeCaption"),
  modePill: document.getElementById("modePill"),
  countdown: document.getElementById("countdown"),
  clock: document.getElementById("clock"),
  dateText: document.getElementById("dateText"),
  resultKicker: document.getElementById("resultKicker"),
  resultMain: document.getElementById("resultMain"),
  resultSub: document.getElementById("resultSub"),
  buttons: Array.from(document.querySelectorAll(".mode-button")),
  scanButton: document.getElementById("scanButton"),
  normalButton: document.getElementById("normalButton"),
  passPunchForm: document.getElementById("passPunchForm"),
  companyIdInput: document.getElementById("companyIdInput"),
  employeeIdInput: document.getElementById("employeeIdInput"),
  employeePassInput: document.getElementById("employeePassInput"),
  adminButton: document.getElementById("adminButton"),
  adminModal: document.getElementById("adminModal"),
  closeAdminButton: document.getElementById("closeAdminButton"),
  pinInput: document.getElementById("pinInput"),
  unlockButton: document.getElementById("unlockButton"),
  pinArea: document.getElementById("pinArea"),
  adminArea: document.getElementById("adminArea"),
  offlineToggle: document.getElementById("offlineToggle"),
  exportCsvButton: document.getElementById("exportCsvButton"),
  syncButton: document.getElementById("syncButton"),
  clearLogButton: document.getElementById("clearLogButton"),
  lockButton: document.getElementById("lockButton"),
  logTableWrap: document.getElementById("logTableWrap"),
  networkValue: document.getElementById("networkValue"),
  unsyncedValue: document.getElementById("unsyncedValue"),
  retentionValue: document.getElementById("retentionValue"),
  adminUnsynced: document.getElementById("adminUnsynced"),
  adminPunchCount: document.getElementById("adminPunchCount")
};

let currentMode = getAutoMode();
let temporaryUntil = null;
let countdownTimer = null;
let manualModeOverride = false;
let isOffline = false;
let punchLogs = loadLogs();
let audioContext = null;

function getAutoMode() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes <= 13 * 60 + 30 ? "clockIn" : "clockOut";
}

function formatTime(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(date);
}

function formatDay(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function loadLogs() {
  try {
    return JSON.parse(localStorage.getItem("tqrPunchLogs") ?? "[]");
  } catch {
    return [];
  }
}

function saveLogs() {
  localStorage.setItem("tqrPunchLogs", JSON.stringify(punchLogs));
}

function renderMode(modeKey) {
  const mode = modes[modeKey];
  currentMode = modeKey;
  document.documentElement.style.setProperty("--active", mode.color);
  document.documentElement.style.setProperty("--active-dark", mode.dark);
  elements.topbar.style.background = `linear-gradient(90deg, ${mode.dark}, ${mode.color})`;
  elements.modePanel.style.background = mode.color;
  elements.modeLabel.textContent = mode.label;
  elements.modeCaption.textContent = mode.caption;
  elements.modePill.textContent = mode.pill;
  elements.buttons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === modeKey);
  });
}

function setMode(modeKey) {
  clearInterval(countdownTimer);
  const mode = modes[modeKey];
  if (mode.temporary) {
    temporaryUntil = Date.now() + 5 * 60 * 1000;
    countdownTimer = setInterval(updateCountdown, 250);
    updateCountdown();
  } else {
    temporaryUntil = null;
    elements.countdown.textContent = "通常モードで待機中";
  }
  renderMode(modeKey);
}

function updateCountdown() {
  if (!temporaryUntil) return;
  const remaining = Math.max(0, temporaryUntil - Date.now());
  if (remaining === 0) {
    manualModeOverride = false;
    setMode(getAutoMode());
    return;
  }
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  elements.countdown.textContent =
    `あと ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} で通常モードへ戻ります`;
}

function tickClock() {
  const now = new Date();
  elements.clock.textContent = formatTime(now);
  elements.dateText.textContent = formatDate(now);
  if (!temporaryUntil && !manualModeOverride && currentMode !== getAutoMode()) {
    setMode(getAutoMode());
  }
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

function playTone(frequency, startTime, duration, volume) {
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function playSuccessSound() {
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;
  playTone(880, now, 0.16, 0.16);
  playTone(1175, now + 0.18, 0.22, 0.15);
}

function playWarningSound() {
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;
  playTone(180, now, 0.11, 0.18);
  playTone(145, now + 0.13, 0.16, 0.18);
}

function createLocalLog({ employee, authMethod, synced, recordId }) {
  const now = new Date();
  const mode = modes[currentMode];
  return {
    id: recordId || crypto.randomUUID?.() || String(Date.now()),
    companyId: employee.companyId,
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    mode: mode.label,
    punchType: mode.punchType,
    authMethod,
    date: formatDay(now),
    time: formatTime(now),
    deviceId: deviceCode,
    synced
  };
}

function findDuplicatePunch(employee, mode, now) {
  const punchDate = formatDay(now);
  return punchLogs
    .slice()
    .reverse()
    .find((log) =>
      log.companyId === employee.companyId &&
      log.employeeId === employee.employeeId &&
      log.date === punchDate &&
      log.punchType === mode.punchType &&
      log.synced === false
    );
}

function updateStatus() {
  const unsyncedCount = punchLogs.filter((log) => !log.synced).length;
  elements.networkValue.textContent = isOffline ? "オフライン" : "Wi-Fi";
  elements.unsyncedValue.textContent = `${unsyncedCount}件`;
  elements.retentionValue.textContent = isOffline ? "2週間" : "7日";
  elements.adminUnsynced.textContent = `${unsyncedCount}件`;
  elements.adminPunchCount.textContent = `${punchLogs.length}件`;
  elements.offlineToggle.checked = isOffline;
  document.querySelector(".sync-pill").textContent = isOffline
    ? `オフライン / 未同期 ${unsyncedCount}件`
    : `同期済み / 未同期 ${unsyncedCount}件`;
  renderLogTable();
  saveLogs();
}

function renderLogTable() {
  if (!punchLogs.length) {
    elements.logTableWrap.innerHTML = '<div class="empty-log">まだ打刻ログがありません。読み取りテストを実行するとここに表示されます。</div>';
    return;
  }

  const rows = punchLogs.slice().reverse().map((log) => `
    <tr>
      <td>${log.date}</td>
      <td>${log.time}</td>
      <td>${log.employeeName}</td>
      <td>${log.mode}</td>
      <td>${log.authMethod}</td>
      <td>${log.deviceId}</td>
      <td>${log.synced ? "同期済み" : "未同期"}</td>
    </tr>
  `).join("");

  elements.logTableWrap.innerHTML = `
    <table class="log-table">
      <thead>
        <tr>
          <th>日付</th>
          <th>時刻</th>
          <th>社員名</th>
          <th>種別</th>
          <th>認証</th>
          <th>端末</th>
          <th>状態</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function showRecorded(employee, authMethod, synced, recordId) {
  const mode = modes[currentMode];
  const now = new Date();
  punchLogs.push(createLocalLog({ employee, authMethod, synced, recordId }));
  playSuccessSound();
  elements.resultKicker.textContent = synced ? "打刻完了" : "端末内に保存";
  elements.resultMain.textContent = `${employee.employeeName}さん ${mode.label}`;
  elements.resultSub.textContent = synced
    ? `${formatTime(now)} に${authMethod}で認証し、クラウドへ保存しました。`
    : `${formatTime(now)} に${authMethod}で認証し、端末内へ保存しました。通信復帰後に同期します。`;
  updateStatus();
}

function showDuplicate(employee, mode, duplicate, authMethod) {
  playWarningSound();
  elements.resultKicker.textContent = "二重打刻の可能性";
  elements.resultMain.textContent = `${employee.employeeName}さんは本日すでに${mode.label}済みです`;
  elements.resultSub.textContent =
    `${formatTime(new Date(duplicate.punchedAt ?? Date.now()))} に${authMethod}で${mode.label}記録があります。今回の打刻は保存していません。`;
}

function showError(message) {
  playWarningSound();
  elements.resultKicker.textContent = "認証エラー";
  elements.resultMain.textContent = "打刻できませんでした";
  elements.resultSub.textContent = message;
}

async function submitPunch({ authMethod, employeeCode, employeePass, qrToken }) {
  const companyCode = elements.companyIdInput.value.trim();
  const mode = modes[currentMode];
  const localEmployee = {
    companyId: companyCode,
    employeeId: employeeCode || demoEmployee.employeeId,
    employeeName: demoEmployee.employeeName
  };

  if (isOffline) {
    const duplicate = findDuplicatePunch(localEmployee, mode, new Date());
    if (duplicate) {
      showDuplicate(localEmployee, mode, { punchedAt: Date.now() }, authMethod.toUpperCase());
      return;
    }
    showRecorded(localEmployee, authMethod.toUpperCase(), false);
    return;
  }

  try {
    const { data, error } = await supabase.functions.invoke("record-punch", {
      body: {
        companyCode,
        deviceCode,
        deviceSecret: demoDeviceSecret,
        punchType: mode.punchType,
        authMethod,
        employeeCode,
        employeePass,
        qrToken,
        clientRecordId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
      }
    });

    if (error) throw error;

    const employee = {
      companyId: companyCode,
      employeeId: data.employeeCode ?? localEmployee.employeeId,
      employeeName: data.employeeName ?? localEmployee.employeeName
    };

    if (data.status === "duplicate") {
      showDuplicate(employee, mode, data, authMethod.toUpperCase());
      return;
    }

    if (!data.ok) {
      showError(data.message ?? "入力内容を確認してください。");
      return;
    }

    showRecorded(employee, authMethod.toUpperCase(), true, data.recordId);
  } catch (error) {
    console.warn("record-punch is unavailable; falling back to local demo mode.", error);
    const duplicate = findDuplicatePunch(localEmployee, mode, new Date());
    if (duplicate) {
      showDuplicate(localEmployee, mode, { punchedAt: Date.now() }, authMethod.toUpperCase());
      return;
    }
    showRecorded(localEmployee, authMethod.toUpperCase(), false);
  }
}

function openAdmin() {
  elements.adminModal.classList.add("is-open");
  elements.pinInput.value = "";
  elements.pinInput.focus();
}

function closeAdmin() {
  elements.adminModal.classList.remove("is-open");
}

function unlockAdmin() {
  if (elements.pinInput.value !== "0000") {
    elements.pinInput.select();
    showError("プロトタイプではPIN 0000を入力してください。");
    return;
  }
  elements.pinArea.style.display = "none";
  elements.adminArea.classList.add("is-unlocked");
}

function lockAdmin() {
  elements.pinArea.style.display = "grid";
  elements.adminArea.classList.remove("is-unlocked");
  elements.pinInput.value = "";
}

function exportCsv() {
  const header = ["会社ID", "社員ID", "社員名", "日付", "時刻", "打刻種別", "認証方式", "端末ID", "同期状態"];
  const lines = punchLogs.map((log) => [
    log.companyId,
    log.employeeId,
    log.employeeName,
    log.date,
    log.time,
    log.mode,
    log.authMethod,
    log.deviceId,
    log.synced ? "同期済み" : "未同期"
  ]);
  const csv = [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tqr-punch-log-sample.csv";
  link.click();
  URL.revokeObjectURL(url);
}

elements.buttons.forEach((button) => {
  button.addEventListener("click", () => {
    manualModeOverride = true;
    setMode(button.dataset.mode);
  });
});

elements.scanButton.addEventListener("click", () => {
  void submitPunch({
    authMethod: "qr",
    qrToken: demoQrToken
  });
});

elements.passPunchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitPunch({
    authMethod: "pass",
    employeeCode: elements.employeeIdInput.value.trim(),
    employeePass: elements.employeePassInput.value
  });
});

elements.normalButton.addEventListener("click", () => {
  manualModeOverride = false;
  setMode(getAutoMode());
});
elements.adminButton.addEventListener("click", openAdmin);
elements.closeAdminButton.addEventListener("click", closeAdmin);
elements.unlockButton.addEventListener("click", unlockAdmin);
elements.lockButton.addEventListener("click", lockAdmin);
elements.pinInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlockAdmin();
});
elements.adminModal.addEventListener("click", (event) => {
  if (event.target === elements.adminModal) closeAdmin();
});
elements.offlineToggle.addEventListener("change", () => {
  isOffline = elements.offlineToggle.checked;
  updateStatus();
});
elements.syncButton.addEventListener("click", () => {
  if (isOffline) {
    elements.resultKicker.textContent = "同期できません";
    elements.resultMain.textContent = "オフラインモードです";
    elements.resultSub.textContent = "オフラインモードを解除してから同期してください。";
    return;
  }
  punchLogs = punchLogs.map((log) => ({ ...log, synced: true }));
  elements.resultKicker.textContent = "同期完了";
  elements.resultMain.textContent = "未同期データを同期済みにしました";
  elements.resultSub.textContent = "本番では未同期データをEdge Functionへ再送します。";
  updateStatus();
});
elements.clearLogButton.addEventListener("click", () => {
  punchLogs = [];
  elements.resultKicker.textContent = "ログをリセット";
  elements.resultMain.textContent = "打刻履歴を空にしました";
  elements.resultSub.textContent = "端末内のプロトタイプ用データのみ削除しています。";
  updateStatus();
});
elements.exportCsvButton.addEventListener("click", exportCsv);

setMode(currentMode);
tickClock();
updateStatus();
setInterval(tickClock, 1000);

import { supabase } from "./supabase-client.js";

const attendanceBody = document.getElementById("attendanceBody");
const editModal = document.getElementById("editModal");
const exportCsvButton = document.getElementById("exportCsvButton");
const addCorrectionButton = document.getElementById("addCorrectionButton");
const closeModalButton = document.getElementById("closeModalButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const saveEditButton = document.getElementById("saveEditButton");
const openTerminalButton = document.getElementById("openTerminalButton");
const logoutButton = document.getElementById("logoutButton");
const filterForm = document.getElementById("filterForm");
const dateInput = document.getElementById("dateInput");
const employeeSearch = document.getElementById("employeeSearch");
const statusSelect = document.getElementById("statusSelect");
const presentCount = document.getElementById("presentCount");
const openCount = document.getElementById("openCount");
const warningCount = document.getElementById("warningCount");
const unsyncedCount = document.getElementById("unsyncedCount");

let rows = [];
let companyId = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  })[character]);
}

function formatTime(timestamp) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo"
  }).format(new Date(timestamp));
}

function startAndEndOfDay(value) {
  const start = new Date(`${value}T00:00:00+09:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function renderRows() {
  const query = employeeSearch.value.trim().toLowerCase();
  const status = statusSelect.value;
  const filteredRows = rows.filter((row) => {
    const matchesQuery = !query || `${row.employeeId} ${row.name}`.toLowerCase().includes(query);
    const matchesStatus = status === "すべて" || row.status === status;
    return matchesQuery && matchesStatus;
  });

  attendanceBody.innerHTML = filteredRows.length
    ? filteredRows.map((row, index) => `
      <tr>
        <td>${escapeHtml(row.employeeId)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.clockIn)}</td>
        <td>${escapeHtml(row.clockOut)}</td>
        <td>${escapeHtml(row.breakTime)}</td>
        <td>${escapeHtml(row.workTime)}</td>
        <td>${escapeHtml(row.auth)}</td>
        <td><span class="status ${row.statusType}">${escapeHtml(row.status)}</span></td>
        <td><button class="button" type="button" data-edit="${index}">修正</button></td>
      </tr>
    `).join("")
    : '<tr><td colspan="9">対象の勤怠データはありません。</td></tr>';
}

function updateSummary() {
  presentCount.textContent = rows.filter((row) => row.clockIn !== "-").length;
  openCount.textContent = rows.filter((row) => row.clockIn !== "-" && row.clockOut === "-").length;
  warningCount.textContent = rows.filter((row) => row.statusType !== "ok").length;
  unsyncedCount.textContent = "0";
}

function openEditModal(index) {
  const row = rows[index] || rows[0];
  if (!row) return;
  document.getElementById("editEmployee").value = row.name;
  document.getElementById("editClockIn").value = row.clockIn === "-" ? "" : row.clockIn;
  document.getElementById("editClockOut").value = row.clockOut === "-" ? "" : row.clockOut;
  editModal.classList.add("is-open");
}

function closeEditModal() {
  editModal.classList.remove("is-open");
}

function exportCsv() {
  const header = ["社員ID", "社員名", "出勤", "退勤", "休憩", "実働", "認証", "状態"];
  const csv = [header, ...rows.map((row) => [
    row.employeeId,
    row.name,
    row.clockIn,
    row.clockOut,
    row.breakTime,
    row.workTime,
    row.auth,
    row.status
  ])].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tqr-attendance-${dateInput.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildRows(employees, punches) {
  const punchGroups = new Map();
  for (const punch of punches) {
    const group = punchGroups.get(punch.employee_id) ?? [];
    group.push(punch);
    punchGroups.set(punch.employee_id, group);
  }

  return employees.map((employee) => {
    const employeePunches = (punchGroups.get(employee.id) ?? []).sort(
      (a, b) => new Date(a.punched_at) - new Date(b.punched_at)
    );
    const clockIn = employeePunches.find((punch) => punch.punch_type === "clock_in");
    const clockOut = employeePunches.filter((punch) => punch.punch_type === "clock_out").at(-1);
    const invalidPunch = employeePunches.find((punch) => punch.status !== "valid");
    const status = invalidPunch ? "要確認" : clockIn ? (clockOut ? "正常" : "未退勤") : "未打刻";
    const statusType = status === "正常" ? "ok" : "warn";

    return {
      employeeId: employee.employee_code,
      name: employee.display_name,
      clockIn: formatTime(clockIn?.punched_at),
      clockOut: formatTime(clockOut?.punched_at),
      breakTime: "-",
      workTime: "-",
      auth: employeePunches.at(-1)?.auth_method?.toUpperCase() ?? "-",
      status,
      statusType
    };
  });
}

async function loadDashboard() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.replace("./login.html");
    return;
  }

  const { data: membership, error: membershipError } = await supabase
    .rpc("current_company_membership")
    .maybeSingle();

  if (membershipError || !membership) {
    alert(`このアカウントには会社の管理権限がありません。\nログイン中: ${user.email ?? "-"}\n${membershipError?.message ?? ""}`);
    await supabase.auth.signOut();
    window.location.replace("./login.html");
    return;
  }

  companyId = membership.company_id;
  document.querySelector(".company-id").textContent = membership.company_code ?? "-";
  document.querySelector(".sidebar-meta").innerHTML =
    `管理者: ${escapeHtml(membership.display_name)}<br>権限: ${escapeHtml(membership.role)}`;

  await loadAttendance();
}

async function loadAttendance() {
  const { start, end } = startAndEndOfDay(dateInput.value);
  const [employeesResponse, punchesResponse] = await Promise.all([
    supabase
      .from("employees")
      .select("id, employee_code, display_name")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("employee_code"),
    supabase
      .from("punch_records")
      .select("employee_id, punch_type, auth_method, status, punched_at")
      .eq("company_id", companyId)
      .gte("punched_at", start)
      .lt("punched_at", end)
      .order("punched_at")
  ]);

  if (employeesResponse.error || punchesResponse.error) {
    alert("勤怠データを読み込めませんでした。ログインし直してください。");
    return;
  }

  rows = buildRows(employeesResponse.data, punchesResponse.data);
  updateSummary();
  renderRows();
}

attendanceBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit]");
  if (button) openEditModal(Number(button.dataset.edit));
});
addCorrectionButton.addEventListener("click", () => openEditModal(0));
closeModalButton.addEventListener("click", closeEditModal);
cancelEditButton.addEventListener("click", closeEditModal);
saveEditButton.addEventListener("click", closeEditModal);
editModal.addEventListener("click", (event) => {
  if (event.target === editModal) closeEditModal();
});
exportCsvButton.addEventListener("click", exportCsv);
openTerminalButton.addEventListener("click", () => {
  window.location.href = "./index.html";
});
logoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("tqrSession");
  window.location.replace("./login.html");
});
filterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadAttendance();
});

dateInput.value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
await loadDashboard();

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
const departmentSelect = document.getElementById("departmentSelect");
const employeeSearch = document.getElementById("employeeSearch");
const statusSelect = document.getElementById("statusSelect");
const presentCount = document.getElementById("presentCount");
const openCount = document.getElementById("openCount");
const warningCount = document.getElementById("warningCount");
const unsyncedCount = document.getElementById("unsyncedCount");
const pageTitle = document.querySelector(".page-title");
const pageSub = document.querySelector(".page-sub");
const navButtons = Array.from(document.querySelectorAll(".nav button"));
const attendanceSections = [
  document.getElementById("filterForm"),
  document.querySelector(".summary-grid"),
  document.querySelector(".grid-two")
];

let rows = [];
let employees = [];
let companyId = null;
let editingRow = null;

const employeePanel = document.createElement("section");
employeePanel.className = "panel";
employeePanel.style.display = "none";
employeePanel.innerHTML = `
  <div class="panel-header">
    <h2 class="panel-title">従業員一覧</h2>
    <button class="button" type="button" id="reloadEmployeesButton">再読み込み</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>社員ID</th>
          <th>社員名</th>
          <th>所属</th>
          <th>PASS打刻</th>
          <th>状態</th>
          <th>登録日</th>
        </tr>
      </thead>
      <tbody id="employeeBody"></tbody>
    </table>
  </div>
`;
document.querySelector(".content").append(employeePanel);
const employeeBody = document.getElementById("employeeBody");
const reloadEmployeesButton = document.getElementById("reloadEmployeesButton");

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

function formatMinutes(minutes, { zeroAsDash = false, compact = false } = {}) {
  if (minutes === null || minutes === undefined) return "-";
  const safeMinutes = Math.max(0, Number(minutes));
  if (zeroAsDash && safeMinutes === 0) return "-";
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return compact
    ? `${hours}:${String(rest).padStart(2, "0")}`
    : `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function getFilteredRows() {
  const query = employeeSearch.value.trim().toLowerCase();
  const department = departmentSelect.value;
  const status = statusSelect.value;
  return rows.filter((row) => {
    const matchesQuery = !query || `${row.employeeId} ${row.name} ${row.department}`.toLowerCase().includes(query);
    const matchesDepartment = department === "すべて" || row.department === department;
    const matchesStatus = status === "すべて" || row.status === status;
    return matchesQuery && matchesDepartment && matchesStatus;
  });
}

function renderRows() {
  const filteredRows = getFilteredRows();

  attendanceBody.innerHTML = filteredRows.length
    ? filteredRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.employeeId)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.department)}</td>
        <td>${escapeHtml(row.clockIn)}</td>
        <td>${escapeHtml(row.clockOut)}</td>
        <td>${escapeHtml(row.breakTime)}</td>
        <td>${escapeHtml(row.leaveTime)}</td>
        <td>${escapeHtml(row.workTime)}</td>
        <td>${escapeHtml(row.auth)}</td>
        <td><span class="status ${row.statusType}">${escapeHtml(row.status)}</span></td>
        <td><button class="button" type="button" data-edit="${escapeHtml(row.employeeId)}">修正</button></td>
      </tr>
    `).join("")
    : '<tr><td colspan="11">対象の勤怠データはありません。</td></tr>';
}

function updateDepartmentOptions() {
  const currentValue = departmentSelect.value || "すべて";
  const departments = Array.from(
    new Set(rows.map((row) => row.department).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "ja"));

  departmentSelect.innerHTML = [
    '<option>すべて</option>',
    ...departments.map((department) => `<option>${escapeHtml(department)}</option>`)
  ].join("");

  departmentSelect.value = departments.includes(currentValue) ? currentValue : "すべて";
}

function updateSummary() {
  const filteredRows = getFilteredRows();
  presentCount.textContent = filteredRows.filter((row) => row.clockIn !== "-").length;
  openCount.textContent = filteredRows.filter((row) => row.clockIn !== "-" && row.clockOut === "-").length;
  warningCount.textContent = filteredRows.filter((row) => row.statusType !== "ok").length;
  unsyncedCount.textContent = "0";
}

function formatDateTime(timestamp) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo"
  }).format(new Date(timestamp));
}

function renderEmployees() {
  employeeBody.innerHTML = employees.length
    ? employees.map((employee) => `
      <tr>
        <td>${escapeHtml(employee.employee_code)}</td>
        <td>${escapeHtml(employee.employee_name)}</td>
        <td>${escapeHtml(employee.department_name ?? "未設定")}</td>
        <td>${employee.pass_punch_enabled ? "有効" : "無効"}</td>
        <td><span class="status ${employee.is_active ? "ok" : "warn"}">${employee.is_active ? "有効" : "停止"}</span></td>
        <td>${escapeHtml(formatDateTime(employee.created_at))}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="6">従業員が登録されていません。</td></tr>';
}

function setView(view) {
  const isEmployees = view === "employees";
  attendanceSections.forEach((section) => {
    if (section) section.style.display = isEmployees ? "none" : "";
  });
  employeePanel.style.display = isEmployees ? "" : "none";
  navButtons.forEach((button) => button.classList.remove("is-active"));

  if (isEmployees) {
    navButtons[2]?.classList.add("is-active");
    pageTitle.textContent = "従業員";
    pageSub.textContent = "登録済みの従業員ID、PASS打刻可否、利用状態を確認します。";
    void loadEmployees();
    return;
  }

  navButtons[0]?.classList.add("is-active");
  pageTitle.textContent = "日次集計";
  pageSub.textContent = "打刻端末から同期された勤怠を確認・修正・CSV出力します。";
}

function openEditModal(employeeId) {
  const row = employeeId
    ? rows.find((candidate) => candidate.employeeId === employeeId)
    : rows[0];
  if (!row) return;
  editingRow = row;
  document.getElementById("editEmployee").value = row.name;
  document.getElementById("editClockIn").value = row.clockIn === "-" ? "" : row.clockIn;
  document.getElementById("editClockOut").value = row.clockOut === "-" ? "" : row.clockOut;
  document.getElementById("editReason").value = "";
  editModal.classList.add("is-open");
}

function closeEditModal() {
  editModal.classList.remove("is-open");
  editingRow = null;
}

function exportCsv() {
  const exportRows = getFilteredRows();
  const header = ["社員ID", "社員名", "所属", "出勤", "退勤", "休憩", "中抜け", "実働", "認証", "状態"];
  const csv = [header, ...exportRows.map((row) => [
    row.employeeId,
    row.name,
    row.department,
    row.clockIn,
    row.clockOut,
    formatMinutes(row.breakMinutes, { compact: true }),
    formatMinutes(row.leaveMinutes, { compact: true }),
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

function buildRows(attendanceRows) {
  return attendanceRows.map((attendanceRow) => {
    const status = attendanceRow.has_invalid_punch
      ? "要確認"
      : attendanceRow.clock_in_at
        ? (attendanceRow.clock_out_at ? "正常" : "未退勤")
        : "未打刻";
    const statusType = status === "正常" ? "ok" : "warn";

    return {
      employeeId: attendanceRow.employee_code,
      name: attendanceRow.employee_name,
      department: attendanceRow.department_name ?? "未設定",
      clockIn: formatTime(attendanceRow.clock_in_at),
      clockOut: formatTime(attendanceRow.clock_out_at),
      breakMinutes: attendanceRow.break_minutes,
      leaveMinutes: attendanceRow.leave_minutes,
      breakTime: formatMinutes(attendanceRow.break_minutes, { zeroAsDash: true }),
      leaveTime: formatMinutes(attendanceRow.leave_minutes, { zeroAsDash: true }),
      workTime: formatMinutes(attendanceRow.work_minutes),
      auth: attendanceRow.latest_auth_method?.toUpperCase() ?? "-",
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
  const { data, error } = await supabase.rpc("current_attendance_rows", {
    p_target_date: dateInput.value
  });

  if (error) {
    alert(`勤怠データを読み込めませんでした。\n${error.message}`);
    return;
  }

  rows = buildRows(data ?? []);
  updateDepartmentOptions();
  updateSummary();
  renderRows();
}

async function loadEmployees() {
  const { data, error } = await supabase.rpc("current_employees");

  if (error) {
    alert(`従業員データを読み込めませんでした。\n${error.message}`);
    return;
  }

  employees = data ?? [];
  renderEmployees();
}

async function saveManualCorrection() {
  if (!editingRow) return;

  const clockIn = document.getElementById("editClockIn").value || null;
  const clockOut = document.getElementById("editClockOut").value || null;
  const reason = document.getElementById("editReason").value.trim();

  if (!reason) {
    alert("修正理由を入力してください。");
    return;
  }

  if (!clockIn && !clockOut) {
    alert("出勤または退勤のどちらかを入力してください。");
    return;
  }

  saveEditButton.disabled = true;
  saveEditButton.textContent = "保存中...";

  const { error } = await supabase.rpc("admin_save_attendance_correction", {
    p_target_date: dateInput.value,
    p_employee_code: editingRow.employeeId,
    p_clock_in: clockIn,
    p_clock_out: clockOut,
    p_reason: reason
  });

  saveEditButton.disabled = false;
  saveEditButton.textContent = "保存";

  if (error) {
    alert(`修正を保存できませんでした。\n${error.message}`);
    return;
  }

  closeEditModal();
  await loadAttendance();
}

attendanceBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit]");
  if (button) openEditModal(button.dataset.edit);
});
addCorrectionButton.addEventListener("click", () => openEditModal());
closeModalButton.addEventListener("click", closeEditModal);
cancelEditButton.addEventListener("click", closeEditModal);
saveEditButton.addEventListener("click", saveManualCorrection);
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
departmentSelect.addEventListener("change", () => {
  updateSummary();
  renderRows();
});
employeeSearch.addEventListener("input", () => {
  updateSummary();
  renderRows();
});
statusSelect.addEventListener("change", () => {
  updateSummary();
  renderRows();
});
reloadEmployeesButton.addEventListener("click", loadEmployees);
navButtons[0]?.addEventListener("click", () => setView("attendance"));
navButtons[1]?.addEventListener("click", () => setView("attendance"));
navButtons[2]?.addEventListener("click", () => setView("employees"));
navButtons.slice(3).forEach((button) => {
  button.addEventListener("click", () => {
    alert("このメニューは次の開発ステップで実装します。");
  });
});

dateInput.value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
await loadDashboard();

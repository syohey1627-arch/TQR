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
const employeeSelect = document.getElementById("employeeSelect");
const employeeSearch = document.getElementById("employeeSearch");
const statusSelect = document.getElementById("statusSelect");
const presentCount = document.getElementById("presentCount");
const openCount = document.getElementById("openCount");
const warningCount = document.getElementById("warningCount");
const unsyncedCount = document.getElementById("unsyncedCount");
const pageTitle = document.querySelector(".page-title");
const pageSub = document.querySelector(".page-sub");
const content = document.querySelector(".content");
const navButtons = Array.from(document.querySelectorAll(".nav button"));
const attendanceSections = [
  document.getElementById("filterForm"),
  document.querySelector(".summary-grid"),
  document.querySelector(".grid-two")
];
const gridTwo = document.querySelector(".grid-two");
const sidePanel = document.querySelector(".grid-two > aside");
const sideList = document.querySelector(".side-list");

let rows = [];
let employees = [];
let companyId = null;
let editingRow = null;
let currentView = "attendance";
let attendanceSort = { key: "employeeId", direction: "asc" };
let employeeSort = { key: "employee_code", direction: "asc" };

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

const punchPanel = document.createElement("section");
punchPanel.className = "panel";
punchPanel.style.display = "none";
punchPanel.innerHTML = `
  <div class="panel-header">
    <h2 class="panel-title">打刻一覧</h2>
    <button class="button" type="button" id="reloadPunchesButton">再読み込み</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>社員ID</th>
          <th>社員名</th>
          <th>所属</th>
          <th>出勤</th>
          <th>退勤</th>
          <th>休憩</th>
          <th>中抜け</th>
          <th>実働</th>
          <th>認証</th>
          <th>状態</th>
        </tr>
      </thead>
      <tbody id="punchBody"></tbody>
    </table>
  </div>
`;
content.append(punchPanel);
const punchBody = document.getElementById("punchBody");
const reloadPunchesButton = document.getElementById("reloadPunchesButton");

const csvPanel = document.createElement("section");
csvPanel.className = "panel-stack";
csvPanel.style.display = "none";
csvPanel.innerHTML = `
  <section class="utility-grid">
    <div class="utility-card">
      <strong>表示中のCSV</strong>
      <p>日次集計のフィルター結果をCSV出力します。所属・従業員・状態の絞り込みも反映します。</p>
      <button class="button primary" type="button" id="exportFilteredCsvButton">CSV出力</button>
    </div>
    <div class="utility-card">
      <strong>所属別CSV</strong>
      <p>所属フィルターで本社営業部、A支店、B支店を選ぶと、その所属だけのCSVを出力できます。</p>
      <button class="button" type="button" id="openAttendanceFromCsvButton">日次集計で絞り込む</button>
    </div>
    <div class="utility-card">
      <strong>従業員CSV取込</strong>
      <p>MVP後半で、社員ID・社員名・所属・PASS打刻可否をCSVから一括登録/更新できるようにします。</p>
      <button class="button" type="button" id="employeeImportNoticeButton">仕様を確認</button>
    </div>
  </section>
`;
content.append(csvPanel);
const exportFilteredCsvButton = document.getElementById("exportFilteredCsvButton");
const openAttendanceFromCsvButton = document.getElementById("openAttendanceFromCsvButton");
const employeeImportNoticeButton = document.getElementById("employeeImportNoticeButton");

const settingsPanel = document.createElement("section");
settingsPanel.className = "panel";
settingsPanel.style.display = "none";
settingsPanel.innerHTML = `
  <div class="panel-header">
    <h2 class="panel-title">設定</h2>
  </div>
  <div class="settings-list">
    <div class="settings-row">
      <div class="settings-label">会社ID</div>
      <div class="settings-value" id="settingsCompanyCode">-</div>
    </div>
    <div class="settings-row">
      <div class="settings-label">所属</div>
      <div class="settings-value" id="settingsDepartments">-</div>
    </div>
    <div class="settings-row">
      <div class="settings-label">PASS打刻</div>
      <div class="settings-value">有効。端末側はEdge Function経由で保存します。</div>
    </div>
    <div class="settings-row">
      <div class="settings-label">今後追加する設定</div>
      <div class="settings-value">定刻、早出判定、二重打刻ポリシー、CSV取込設定</div>
    </div>
  </div>
`;
content.append(settingsPanel);
const settingsCompanyCode = document.getElementById("settingsCompanyCode");
const settingsDepartments = document.getElementById("settingsDepartments");

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

function getComparableValue(row, key) {
  if (["breakMinutes", "leaveMinutes", "workMinutes"].includes(key)) {
    return row[key] ?? -1;
  }

  if (["clockIn", "clockOut"].includes(key)) {
    return row[key] === "-" ? "99:99" : row[key];
  }

  return String(row[key] ?? "");
}

function sortRowsForView(rowList) {
  const { key, direction } = attendanceSort;
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rowList].sort((a, b) => {
    const left = getComparableValue(a, key);
    const right = getComparableValue(b, key);
    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * multiplier;
    }
    return String(left).localeCompare(String(right), "ja", { numeric: true }) * multiplier;
  });
}

function getFilteredRows() {
  const query = employeeSearch.value.trim().toLowerCase();
  const department = departmentSelect.value;
  const selectedEmployeeId = employeeSelect.value;
  const status = statusSelect.value;
  const filteredRows = rows.filter((row) => {
    const matchesQuery = !query || `${row.employeeId} ${row.name} ${row.department}`.toLowerCase().includes(query);
    const matchesDepartment = department === "すべて" || row.department === department;
    const matchesEmployee = !selectedEmployeeId || row.employeeId === selectedEmployeeId;
    const matchesStatus = status === "すべて" || row.status === status;
    return matchesQuery && matchesDepartment && matchesEmployee && matchesStatus;
  });
  return sortRowsForView(filteredRows);
}

function updateSortButtons() {
  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.classList.toggle("is-asc", button.dataset.sort === attendanceSort.key && attendanceSort.direction === "asc");
    button.classList.toggle("is-desc", button.dataset.sort === attendanceSort.key && attendanceSort.direction === "desc");
  });
}

function renderRows() {
  const filteredRows = getFilteredRows();
  updateSortButtons();

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

function renderPunchRows() {
  const filteredRows = getFilteredRows();
  punchBody.innerHTML = filteredRows.length
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
      </tr>
    `).join("")
    : '<tr><td colspan="10">対象の打刻データはありません。</td></tr>';
}

function updateDepartmentOptions() {
  const currentValue = departmentSelect.value || "すべて";
  const departments = getDepartments();

  departmentSelect.innerHTML = [
    '<option>すべて</option>',
    ...departments.map((department) => `<option>${escapeHtml(department)}</option>`)
  ].join("");

  departmentSelect.value = departments.includes(currentValue) ? currentValue : "すべて";
}

function updateEmployeeOptions() {
  const currentValue = employeeSelect.value || "";
  const selectableRows = rows
    .filter((row) => departmentSelect.value === "すべて" || row.department === departmentSelect.value)
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId, "ja", { numeric: true }));

  employeeSelect.innerHTML = [
    '<option value="">すべて</option>',
    ...selectableRows.map((row) => (
      `<option value="${escapeHtml(row.employeeId)}">${escapeHtml(row.employeeId)} / ${escapeHtml(row.name)}</option>`
    ))
  ].join("");

  employeeSelect.value = selectableRows.some((row) => row.employeeId === currentValue) ? currentValue : "";
}

function updateSummary() {
  const filteredRows = getFilteredRows();
  presentCount.textContent = filteredRows.filter((row) => row.clockIn !== "-").length;
  openCount.textContent = filteredRows.filter((row) => row.clockIn !== "-" && row.clockOut === "-").length;
  warningCount.textContent = filteredRows.filter((row) => row.statusType !== "ok").length;
  unsyncedCount.textContent = "0";
}

function getDepartments() {
  return Array.from(
    new Set(rows.map((row) => row.department).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "ja"));
}

function updateSettingsPanel() {
  settingsCompanyCode.textContent = document.querySelector(".company-id").textContent || "-";
  settingsDepartments.textContent = getDepartments().join(" / ") || "-";
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
  const sortedEmployees = [...employees].sort((a, b) => {
    const left = String(a[employeeSort.key] ?? "");
    const right = String(b[employeeSort.key] ?? "");
    const multiplier = employeeSort.direction === "asc" ? 1 : -1;
    return left.localeCompare(right, "ja", { numeric: true }) * multiplier;
  });

  employeeBody.innerHTML = sortedEmployees.length
    ? sortedEmployees.map((employee) => `
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
  currentView = view;
  const isEmployees = view === "employees";
  const isAttendance = view === "attendance";
  const isPunches = view === "punches";
  const isDevices = view === "devices";
  const isCsv = view === "csv";
  const isSettings = view === "settings";

  attendanceSections.forEach((section) => {
    if (section) section.style.display = isAttendance ? "" : "none";
  });
  employeePanel.style.display = isEmployees ? "" : "none";
  punchPanel.style.display = isPunches ? "" : "none";
  csvPanel.style.display = isCsv ? "" : "none";
  settingsPanel.style.display = isSettings ? "" : "none";
  sidePanel.style.display = (isAttendance || isDevices) ? "" : "none";
  if (gridTwo && sidePanel.parentElement !== gridTwo) gridTwo.append(sidePanel);
  if (gridTwo) {
    gridTwo.style.display = (isAttendance || isDevices) ? "" : "none";
    if (gridTwo.firstElementChild) gridTwo.firstElementChild.style.display = isDevices ? "none" : "";
  }

  navButtons.forEach((button) => button.classList.remove("is-active"));

  const viewIndex = {
    attendance: 0,
    punches: 1,
    employees: 2,
    devices: 3,
    csv: 4,
    settings: 5
  }[view] ?? 0;
  navButtons[viewIndex]?.classList.add("is-active");

  if (isEmployees) {
    pageTitle.textContent = "従業員";
    pageSub.textContent = "登録済みの従業員ID、所属、PASS打刻可否、利用状態を確認します。";
    void loadEmployees();
    return;
  }

  if (isPunches) {
    pageTitle.textContent = "打刻一覧";
    pageSub.textContent = "日次集計と同じ対象日の打刻状況を一覧で確認します。";
    renderPunchRows();
    return;
  }

  if (isDevices) {
    pageTitle.textContent = "端末";
    pageSub.textContent = "打刻端末、未同期、QR発行待ち、PASS打刻許可の状態を確認します。";
    attendanceSections.forEach((section) => {
      if (section) section.style.display = "none";
    });
    punchPanel.style.display = "none";
    employeePanel.style.display = "none";
    csvPanel.style.display = "none";
    settingsPanel.style.display = "none";
    if (gridTwo) {
      gridTwo.style.display = "";
      if (gridTwo.firstElementChild) gridTwo.firstElementChild.style.display = "none";
    }
    return;
  }

  if (isCsv) {
    pageTitle.textContent = "CSV出力";
    pageSub.textContent = "表示中の日次集計データをCSVで出力します。";
    return;
  }

  if (isSettings) {
    pageTitle.textContent = "設定";
    pageSub.textContent = "MVPで必要な会社設定と今後追加する設定を確認します。";
    updateSettingsPanel();
    return;
  }

  if (gridTwo) {
    gridTwo.style.display = "";
    if (gridTwo.firstElementChild) gridTwo.firstElementChild.style.display = "";
  }
  pageTitle.textContent = "日次集計";
  pageSub.textContent = "打刻端末から同期された勤怠を確認・修正・CSV出力します。";
  renderRows();
  updateSummary();
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
  updateEmployeeOptions();
  updateSummary();
  renderRows();
  renderPunchRows();
  updateSettingsPanel();
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
exportFilteredCsvButton.addEventListener("click", exportCsv);
openAttendanceFromCsvButton.addEventListener("click", () => setView("attendance"));
employeeImportNoticeButton.addEventListener("click", () => {
  alert("CSV取込はMVP後半で実装します。社員ID、社員名、所属、PASS打刻可否を読み込む予定です。");
});
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
  updateEmployeeOptions();
  updateSummary();
  renderRows();
  renderPunchRows();
});
employeeSelect.addEventListener("change", () => {
  updateSummary();
  renderRows();
  renderPunchRows();
});
employeeSearch.addEventListener("input", () => {
  updateSummary();
  renderRows();
  renderPunchRows();
});
statusSelect.addEventListener("change", () => {
  updateSummary();
  renderRows();
  renderPunchRows();
});
reloadEmployeesButton.addEventListener("click", loadEmployees);
reloadPunchesButton.addEventListener("click", loadAttendance);
document.querySelectorAll("[data-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sort;
    attendanceSort = {
      key,
      direction: attendanceSort.key === key && attendanceSort.direction === "asc" ? "desc" : "asc"
    };
    updateSummary();
    renderRows();
    renderPunchRows();
  });
});
navButtons[0]?.addEventListener("click", () => setView("attendance"));
navButtons[1]?.addEventListener("click", () => setView("punches"));
navButtons[2]?.addEventListener("click", () => setView("employees"));
navButtons[3]?.addEventListener("click", () => setView("devices"));
navButtons[4]?.addEventListener("click", () => setView("csv"));
navButtons[5]?.addEventListener("click", () => setView("settings"));

dateInput.value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
await loadDashboard();

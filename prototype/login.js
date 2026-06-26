import { supabase } from "./supabase-client.js";

const adminTab = document.getElementById("adminTab");
const terminalTab = document.getElementById("terminalTab");
const loginForm = document.getElementById("loginForm");
const companyId = document.getElementById("companyId");
const loginId = document.getElementById("loginId");
const loginIdLabel = document.getElementById("loginIdLabel");
const password = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");
const demoAdminButton = document.getElementById("demoAdminButton");
const demoTerminalButton = document.getElementById("demoTerminalButton");

let mode = "admin";

function showError(message) {
  loginError.textContent = message;
  loginError.classList.add("is-visible");
}

function setMode(nextMode) {
  mode = nextMode;
  const isAdmin = mode === "admin";
  adminTab.classList.toggle("is-active", isAdmin);
  terminalTab.classList.toggle("is-active", !isAdmin);
  loginIdLabel.textContent = isAdmin ? "管理者メールアドレス" : "端末ID";
  loginId.value = isAdmin ? "" : "TQR-TAB-001";
  loginId.placeholder = isAdmin ? "admin@example.com" : "TQR-TAB-001";
  loginButton.textContent = isAdmin ? "管理画面へログイン" : "打刻端末へログイン";
  password.value = "";
  password.placeholder = isAdmin ? "Supabaseで登録したパスワード" : "0000";
  loginError.classList.remove("is-visible");
}

function saveTerminalSession() {
  localStorage.setItem("tqrSession", JSON.stringify({
    companyId: companyId.value.trim(),
    loginId: loginId.value.trim(),
    mode: "terminal",
    loggedInAt: new Date().toISOString()
  }));
}

async function loginAdmin() {
  if (companyId.value.trim() !== "TOTAL-001") {
    showError("会社IDを確認してください。");
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "ログイン中...";

  const { error } = await supabase.auth.signInWithPassword({
    email: loginId.value.trim(),
    password: password.value
  });

  loginButton.disabled = false;
  loginButton.textContent = "管理画面へログイン";

  if (error) {
    showError("メールアドレスまたはパスワードを確認してください。");
    return;
  }

  window.location.href = "./admin.html";
}

function loginTerminal() {
  const isValid = companyId.value.trim() === "TOTAL-001" &&
    loginId.value.trim() === "TQR-TAB-001" &&
    password.value === "0000";

  if (!isValid) {
    showError("会社ID・端末ID・PASSを確認してください。");
    return;
  }

  saveTerminalSession();
  window.location.href = "./index.html";
}

adminTab.addEventListener("click", () => setMode("admin"));
terminalTab.addEventListener("click", () => setMode("terminal"));
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (mode === "admin") {
    await loginAdmin();
  } else {
    loginTerminal();
  }
});

demoAdminButton.addEventListener("click", () => {
  setMode("admin");
  loginId.focus();
});
demoTerminalButton.addEventListener("click", () => {
  setMode("terminal");
  password.value = "0000";
  password.focus();
});

setMode("admin");

const { data: { session } } = await supabase.auth.getSession();
if (session) {
  window.location.replace("./admin.html");
}

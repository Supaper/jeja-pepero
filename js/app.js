// 화면 전환 + 로그인 게이트 진입점
import { login, logout, getSession } from "./auth.js";

const appEl = document.getElementById("app");
const loginView = document.getElementById("login-view");
const mainView = document.getElementById("main-view");

const loginForm = document.getElementById("login-form");
const idInput = document.getElementById("login-id");
const pwInput = document.getElementById("login-pw");
const submitBtn = document.getElementById("login-submit");
const errorBox = document.getElementById("login-error");

const userNameEl = document.getElementById("user-name");
const welcomeNameEl = document.getElementById("welcome-name");
const logoutBtn = document.getElementById("logout-btn");

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}
function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function showMain(session) {
  const name = session?.name || "사용자";
  userNameEl.textContent = name;
  welcomeNameEl.textContent = name;
  loginView.hidden = true;
  mainView.hidden = false;
}

function showLogin() {
  mainView.hidden = true;
  loginView.hidden = false;
}

// 세션 확인 후 첫 화면 결정
function bootstrap() {
  const session = getSession();
  if (session) showMain(session);
  else showLogin();
  appEl.classList.remove("is-loading");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  submitBtn.disabled = true;
  submitBtn.textContent = "로그인 중...";
  try {
    const session = await login(idInput.value, pwInput.value);
    pwInput.value = "";
    showMain(session);
  } catch (err) {
    showError(err.message || "로그인에 실패했습니다.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "로그인";
  }
});

logoutBtn.addEventListener("click", () => {
  logout();
  idInput.value = "";
  pwInput.value = "";
  clearError();
  showLogin();
});

bootstrap();

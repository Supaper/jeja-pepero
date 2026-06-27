// 화면 전환 + 로그인 게이트 진입점 (Google 로그인 기반)
import { signInWithGoogle, signOutUser, watchAuth } from "./auth.js";
import { initDashboard } from "./dashboard.js";

const appEl = document.getElementById("app");
const loginView = document.getElementById("login-view");
const mainView = document.getElementById("main-view");

const googleBtn = document.getElementById("google-login");
const errorBox = document.getElementById("login-error");

const userNameEl = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}
function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function showMain(profile) {
  const name = profile?.name || "사용자";
  userNameEl.textContent = name + (profile?.admin ? " (관리자)" : "");
  loginView.hidden = true;
  mainView.hidden = false;
  appEl.classList.remove("is-loading");
  initDashboard();
}

function showLogin() {
  mainView.hidden = true;
  loginView.hidden = false;
  appEl.classList.remove("is-loading");
}

// 인증 상태 구독: 새로고침해도 로그인 유지(Firebase 기본 persistence: local)
watchAuth((profile) => {
  if (profile) {
    clearError();
    showMain(profile);
  } else {
    showLogin();
  }
});

googleBtn.addEventListener("click", async () => {
  clearError();
  googleBtn.disabled = true;
  try {
    await signInWithGoogle();
    // 성공 시 watchAuth 콜백이 메인 화면으로 전환
  } catch (err) {
    showError(err.message || "로그인에 실패했습니다.");
  } finally {
    googleBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  clearError();
  try {
    await signOutUser();
  } catch (_) {
    /* 무시 */
  }
  // watchAuth 콜백이 로그인 화면으로 전환
});

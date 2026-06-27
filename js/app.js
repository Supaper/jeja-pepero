// 화면 전환 + 로그인 게이트 진입점 (Firebase Authentication 기반)
import { signIn, signOutUser, watchAuth } from "./auth.js";

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

// 로그인 폼 제출이 직접 일으킨 오류만 표시하기 위한 플래그
let attemptedSignIn = false;

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
  welcomeNameEl.textContent = name;
  loginView.hidden = true;
  mainView.hidden = false;
  appEl.classList.remove("is-loading");
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
    // 직전에 로그인 시도가 아니었던 자동 로그아웃(명단 미포함 등)에는 굳이 메시지를 띄우지 않음
    if (attemptedSignIn) {
      // signIn() 쪽 catch 에서 이미 메시지를 표시하므로 여기서는 생략
    }
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  attemptedSignIn = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "로그인 중...";
  try {
    await signIn(idInput.value, pwInput.value);
    pwInput.value = "";
    // 성공 시 watchAuth 콜백이 메인 화면으로 전환
  } catch (err) {
    showError(err.message || "로그인에 실패했습니다.");
  } finally {
    attemptedSignIn = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "로그인";
  }
});

logoutBtn.addEventListener("click", async () => {
  idInput.value = "";
  pwInput.value = "";
  clearError();
  try {
    await signOutUser();
  } catch (_) {
    /* 무시 */
  }
  // watchAuth 콜백이 로그인 화면으로 전환
});

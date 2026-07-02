// 화면 전환 + 로그인 게이트 진입점 (훈련 반 + 비밀번호 로그인).
import { signInWithClass, signOutUser, watchAuth, loadClasses, ADMIN_CLASS_ID } from "./auth.js";
import { initDashboard } from "./dashboard.js";

const appEl = document.getElementById("app");
const loginView = document.getElementById("login-view");
const mainView = document.getElementById("main-view");

const loginForm = document.getElementById("login-form");
const classSelect = document.getElementById("class-select");
const passwordInput = document.getElementById("class-password");
const loginBtn = document.getElementById("class-login");
const errorBox = document.getElementById("login-error");

const userNameEl = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}
function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function showMain(profile) {
  userNameEl.textContent = profile?.admin ? "관리자" : (profile?.label || "사용자");
  loginView.hidden = true;
  mainView.hidden = false;
  appEl.classList.remove("is-loading");
  initDashboard(profile);
}

function showLogin() {
  mainView.hidden = true;
  loginView.hidden = false;
  appEl.classList.remove("is-loading");
  populateClasses();
}

// 공개 /classes 노드로 드롭다운 채우기 + 관리자 옵션 추가.
let classesPopulated = false;
async function populateClasses() {
  if (classesPopulated) return;
  const adminOpt = `<option value="${ADMIN_CLASS_ID}">⚙️ 관리자</option>`;
  try {
    const classes = await loadClasses();
    const opts = classes.length
      ? [`<option value="" disabled selected>반을 선택하세요</option>`]
          .concat(classes.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`))
      : [`<option value="" disabled selected>개설된 반이 없습니다</option>`];
    classSelect.innerHTML = opts.concat(adminOpt).join("");
    classesPopulated = true;
  } catch (_) {
    // 목록을 못 불러와도 관리자 로그인은 가능하도록.
    classSelect.innerHTML =
      `<option value="" disabled selected>반 목록을 불러오지 못했습니다</option>` + adminOpt;
  }
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

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  loginBtn.disabled = true;
  try {
    await signInWithClass(classSelect.value, passwordInput.value);
    // 성공 시 watchAuth 콜백이 메인 화면으로 전환
  } catch (err) {
    showError(err.message || "로그인에 실패했습니다.");
  } finally {
    loginBtn.disabled = false;
    passwordInput.value = "";
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

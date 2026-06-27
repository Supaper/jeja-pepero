// 정적 프론트 — 로그인 게이트 + 대시보드 (Realtime Database 기준).
//
// 접근 제어의 실질 강제는 database.rules.json(허용목록)이다. 아래 클라이언트 로직은
// UX(권한 없으면 화면 차단)일 뿐이며, 데이터는 로그인 후 RTDB에서 로드한다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, get, query, orderByChild,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// RTDB 키에는 '.'을 쓸 수 없으므로 이메일의 '.'을 ','로 인코딩한다.
const emailKey = (email) => email.replace(/\./g, ",");

// --- 화면 전환 헬퍼 ---
const views = ["loading", "login-view", "denied-view", "app-view"];
const $ = (id) => document.getElementById(id);
function show(view) {
  for (const v of views) $(v).hidden = v !== view;
}

// --- 인증 흐름 ---
$("login-btn").onclick = async () => {
  $("login-error").hidden = true;
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    $("login-error").textContent = "로그인에 실패했습니다: " + (e?.code || e?.message || e);
    $("login-error").hidden = false;
  }
};
$("logout-btn").onclick = () => signOut(auth);
$("denied-logout-btn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if (!user) { show("login-view"); return; }
  show("loading");

  // 허용목록 확인: users/{이메일키} 노드를 읽어본다.
  // (보안 규칙은 본인 이메일 키 노드 read만 허용 → 존재하면 허용된 사용자)
  let allowed = false;
  try {
    const snap = await get(ref(db, "users/" + emailKey(user.email)));
    allowed = snap.exists();
  } catch (_) {
    allowed = false; // 규칙에 막히면 미허용으로 간주
  }

  if (!allowed) {
    $("denied-email").textContent = user.email;
    show("denied-view");
    return;
  }

  $("user-email").textContent = user.email;
  show("app-view");
  await loadPosts();
});

// --- 데이터 로드 & 렌더 ---
let allPosts = [];

async function loadPosts() {
  try {
    const snap = await get(query(ref(db, "posts"), orderByChild("posted_date")));
    const arr = [];
    snap.forEach((child) => { arr.push(child.val()); });
    allPosts = arr.reverse(); // posted_date 오름차순 → 최신순으로 뒤집기
  } catch (e) {
    allPosts = [];
    console.error("posts 로드 실패:", e);
  }
  populateCategories();
  render();
}

function populateCategories() {
  const cats = [...new Set(allPosts.map((p) => p.category).filter(Boolean))].sort();
  const sel = $("category-filter");
  sel.length = 1; // "전체 카테고리"만 남기고 초기화
  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  }
}

function render() {
  const term = $("search").value.trim().toLowerCase();
  const cat = $("category-filter").value;

  const filtered = allPosts.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (term) {
      const hay = `${p.author || ""} ${p.title || ""}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  $("count").textContent = `${filtered.length}건`;
  $("empty").hidden = filtered.length > 0;

  // 카테고리별 그룹핑
  const groups = {};
  for (const p of filtered) {
    const key = p.category || "기타";
    (groups[key] ||= []).push(p);
  }

  const container = $("posts");
  container.innerHTML = "";
  for (const name of Object.keys(groups).sort()) {
    const group = document.createElement("section");
    group.className = "cat-group";
    group.innerHTML = `<h2>${escapeHtml(name)} · ${groups[name].length}</h2>`;
    for (const p of groups[name]) {
      const el = document.createElement("article");
      el.className = "post";
      const title = p.url
        ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title || "(제목 없음)")}</a>`
        : escapeHtml(p.title || "(제목 없음)");
      el.innerHTML =
        `<div class="meta"><span class="author">${escapeHtml(p.author || "")}</span> · ${escapeHtml(p.posted_date || "")}</div>` +
        `<div>${title}</div>`;
      group.appendChild(el);
    }
    container.appendChild(group);
  }
}

$("search").addEventListener("input", render);
$("category-filter").addEventListener("change", render);

// --- 간단 이스케이프 ---
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// 메인 화면 컨트롤러: RTDB(/posts/<이름>)를 한 번 읽어
//   - 대시보드(이번 달 큐티 완주 현황 + 최근 글 피드)
//   - 멤버별 탭(그 사람의 글 목록 + 카테고리 필터)
// 를 렌더링합니다.
import { db } from "./firebase-config.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  QT_TARGET_NAMES,
  TARGET_NAMES,
  extractQtDays,
  rateColor,
  categorize,
} from "./config.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

let postsByName = {}; // { name: [post, ...] }
let loaded = false;

// /posts/<name> 전체를 한 번에 읽기. 권한 오류 등은 첫 오류를 반환.
async function loadAllPosts(names) {
  const result = {};
  let firstError = null;
  await Promise.all(
    names.map(async (name) => {
      try {
        const snap = await get(ref(db, `posts/${name}`));
        result[name] = snap.exists() ? Object.values(snap.val()) : [];
      } catch (e) {
        result[name] = [];
        if (!firstError) firstError = e;
      }
    })
  );
  return { result, firstError };
}

function showNotice(html) {
  const el = document.getElementById("notice");
  el.innerHTML = html;
  el.hidden = false;
}

/* ===================== 대시보드 ===================== */
function renderQtTable() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  document.getElementById("qt-title").textContent =
    `📊 ${year}년 ${month}월 큐티 완주 현황`;
  document.getElementById("qt-meta").textContent = `기준일수 ${daysInMonth}일`;

  const rows = QT_TARGET_NAMES.map((name) => {
    const posts = postsByName[name] || [];
    const uniqueDays = new Set();
    for (const p of posts) {
      const title = (p && p.title) || "";
      if (title.replace(/\s+/g, "").indexOf("큐티나눔") === -1) continue;
      for (const d of extractQtDays(title, year, month, daysInMonth)) uniqueDays.add(d);
    }
    const count = uniqueDays.size;
    return { name, count, rate: (count / daysInMonth) * 100 };
  });
  rows.sort((a, b) => (b.rate !== a.rate ? b.rate - a.rate : a.name.localeCompare(b.name, "ko")));

  let html = `<table class="qt-table"><thead><tr>
      <th>순위</th><th>성함</th><th>큐티 횟수</th><th>달성률</th><th></th></tr></thead><tbody>`;
  rows.forEach((r, i) => {
    const color = rateColor(r.rate);
    html += `<tr>
      <td class="rank">${i + 1}</td>
      <td class="name">${esc(r.name)}</td>
      <td>${r.count} / ${daysInMonth}</td>
      <td style="color:${color}; font-weight:700;">${r.rate.toFixed(1)}%</td>
      <td class="bar-cell"><div class="bar"><div class="bar-fill" style="width:${Math.min(r.rate, 100)}%; background:${color};"></div></div></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById("qt-table-wrap").innerHTML = html;
}

function renderFeed() {
  const all = [];
  for (const name of TARGET_NAMES) {
    for (const p of postsByName[name] || []) {
      if (p && p.title) all.push({ name, ...p });
    }
  }
  all.sort((a, b) =>
    String(b.postDate || "").localeCompare(String(a.postDate || "")) ||
    String(b.collectedAt || "").localeCompare(String(a.collectedAt || ""))
  );

  const top = all.slice(0, 20);
  const wrap = document.getElementById("feed-wrap");
  if (top.length === 0) {
    wrap.innerHTML = `<p class="muted">아직 수집된 글이 없습니다. (GitHub Actions 수집 실행 후 표시됩니다)</p>`;
    return;
  }
  wrap.innerHTML =
    `<ul class="feed">` +
    top.map((p) => `<li>
        <span class="feed-date">${esc(p.postDate || "")}</span>
        <span class="feed-name">${esc(p.name)}</span>
        <a class="feed-title" href="${esc(p.link || "#")}" target="_blank" rel="noopener">${esc(p.title)}</a>
      </li>`).join("") +
    `</ul>`;
}

/* ===================== 멤버별 글 ===================== */
let currentMember = null;
let currentCat = "__all";

function renderMember(name) {
  currentMember = name;
  currentCat = "__all";
  document.getElementById("member-title").textContent = `🙋 ${name} 님의 글`;

  const posts = (postsByName[name] || [])
    .filter((p) => p && p.title)
    .map((p) => ({ ...p, category: categorize(p.title) }))
    .sort((a, b) =>
      String(b.postDate || "").localeCompare(String(a.postDate || "")) ||
      String(b.collectedAt || "").localeCompare(String(a.collectedAt || ""))
    );

  document.getElementById("member-meta").textContent = `총 ${posts.length}건`;

  // 카테고리별 개수
  const counts = {};
  for (const p of posts) counts[p.category] = (counts[p.category] || 0) + 1;
  const cats = Object.keys(counts).sort((a, b) => a.localeCompare(b, "ko"));

  const filterEl = document.getElementById("cat-filter");
  filterEl.innerHTML =
    `<button class="chip active" data-cat="__all">전체 (${posts.length})</button>` +
    cats.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)} (${counts[c]})</button>`).join("");

  filterEl.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentCat = btn.dataset.cat;
      filterEl.querySelectorAll(".chip").forEach((b) => b.classList.toggle("active", b === btn));
      paintMemberPosts(posts);
    });
  });

  paintMemberPosts(posts);
}

function paintMemberPosts(posts) {
  const list = currentCat === "__all" ? posts : posts.filter((p) => p.category === currentCat);
  const wrap = document.getElementById("member-posts");
  if (list.length === 0) {
    wrap.innerHTML = `<p class="muted">표시할 글이 없습니다.</p>`;
    return;
  }
  wrap.innerHTML =
    `<ul class="post-list">` +
    list.map((p) => `<li>
        <span class="post-date">${esc(p.postDate || "")}</span>
        <span class="post-cat">${esc(p.category)}</span>
        <a class="post-title" href="${esc(p.link || "#")}" target="_blank" rel="noopener">${esc(p.title)}</a>
      </li>`).join("") +
    `</ul>`;
}

/* ===================== 탭 ===================== */
function buildTabs() {
  const nav = document.getElementById("tabs");
  const dashEl = document.getElementById("dashboard-view");
  const memberEl = document.getElementById("member-view");

  const tabs = [{ key: "__dash", label: "📊 대시보드" }]
    .concat(TARGET_NAMES.map((n) => ({ key: n, label: n })));

  nav.innerHTML = tabs
    .map((t, i) =>
      `<button class="tab${i === 0 ? " active" : ""}" data-key="${esc(t.key)}">${esc(t.label)}</button>`
    ).join("");

  nav.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      nav.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      const key = btn.dataset.key;
      if (key === "__dash") {
        dashEl.hidden = false;
        memberEl.hidden = true;
      } else {
        dashEl.hidden = true;
        memberEl.hidden = false;
        renderMember(key);
      }
    });
  });
}

/** 로그인 성공 후 1회 호출. */
export async function initDashboard() {
  if (loaded) return;
  loaded = true;
  try {
    const { result, firstError } = await loadAllPosts(TARGET_NAMES);
    postsByName = result;

    const total = Object.values(result).reduce((s, a) => s + a.length, 0);
    if (firstError && total === 0) {
      const msg = String(firstError && firstError.message || firstError);
      if (/permission|denied/i.test(msg)) {
        showNotice(
          "⚠️ 데이터 읽기 권한이 없습니다. <b>Realtime Database → 규칙</b>에서 " +
          "<code>posts</code>·<code>users</code> 의 <code>.read</code> 를 " +
          "<code>\"auth != null\"</code> 로 설정해 게시하세요."
        );
      } else {
        showNotice("⚠️ 데이터를 불러오지 못했습니다: " + esc(msg));
      }
    }

    buildTabs();
    renderQtTable();
    renderFeed();
  } catch (e) {
    loaded = false; // 재시도 허용
    showNotice("⚠️ 초기화 오류: " + esc(e.message));
  }
}

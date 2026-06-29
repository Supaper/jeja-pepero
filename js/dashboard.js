// 메인 화면 컨트롤러: RTDB(/posts/<이름>)를 한 번 읽어
//   - 대시보드(이번 달 큐티 완주 현황 + 최근 글 피드)
//   - 멤버별(접이식 사이드바 탭): 글 목록 + 카테고리 필터 + 색상
//   - 글 클릭 시 본문 모달(저장된 content 표시, 없으면 원문 링크 안내)
// 를 렌더링합니다.
import { db } from "./firebase-config.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  QT_TARGET_NAMES,
  TARGET_NAMES,
  extractQtDays,
  rateColor,
  categorize,
  categoryColor,
} from "./config.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function catBadge(cat) {
  const [bg, fg] = categoryColor(cat);
  return `<span class="post-cat" style="background:${bg}; color:${fg};">${esc(cat)}</span>`;
}

let postsByName = {}; // { name: [post, ...] }
let loaded = false;
let activeKey = "__dash"; // 현재 보고 있는 탭 (__dash 또는 멤버 이름)

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

/* ===================== 글 보기 모달 ===================== */
function openPostModal(post) {
  const cat = post.category || categorize(post.title);
  const [bg, fg] = categoryColor(cat);
  const catEl = document.getElementById("modal-cat");
  catEl.textContent = cat;
  catEl.style.background = bg;
  catEl.style.color = fg;
  document.getElementById("modal-title").textContent = post.title || "";
  document.getElementById("modal-meta").textContent =
    [post.name, post.postDate].filter(Boolean).join(" · ");

  const body = document.getElementById("modal-body");
  if (post.content && post.content.trim()) {
    body.className = "modal-body";
    body.textContent = post.content; // pre-wrap CSS로 줄바꿈 유지 (안전: 텍스트로 삽입)
  } else {
    body.className = "modal-body empty";
    body.textContent = "본문이 아직 저장되지 않았습니다. 아래 ‘원문 열기’로 확인하세요.";
  }

  const link = document.getElementById("modal-link");
  link.href = post.link || "#";

  const modal = document.getElementById("post-modal");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("post-modal").hidden = true;
  document.body.style.overflow = "";
}

// 클릭 시 모달을 여는 글 링크 HTML (data-key 로 위치 식별)
function postLinkHtml(listId, idx, title) {
  return `<a class="post-title" href="#" data-list="${listId}" data-idx="${idx}">${esc(title)}</a>`;
}

// 컨테이너 내 .post-title 클릭 → 모달 (이벤트 위임)
function wirePostClicks(container, list) {
  container.querySelectorAll(".post-title").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const idx = Number(a.dataset.idx);
      if (!Number.isNaN(idx) && list[idx]) openPostModal(list[idx]);
    });
  });
}

/* ===================== 대시보드 ===================== */
function renderQtTable() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayToday = Math.min(now.getDate(), daysInMonth); // 오늘까지 경과 일수

  document.getElementById("qt-title").textContent =
    `📊 ${year}년 ${month}월 큐티 완주 현황`;
  document.getElementById("qt-meta").textContent =
    `달성률 = 월 전체 (괄호: ${month}/${dayToday}까지)`;

  const rows = QT_TARGET_NAMES.map((name) => {
    const posts = postsByName[name] || [];
    const uniqueDays = new Set();
    for (const p of posts) {
      const title = (p && p.title) || "";
      if (title.replace(/\s+/g, "").indexOf("큐티나눔") === -1) continue;
      for (const d of extractQtDays(title, year, month, daysInMonth)) uniqueDays.add(d);
    }
    const count = uniqueDays.size;
    const rate = (count / daysInMonth) * 100;
    const todayRate = dayToday > 0 ? Math.min((count / dayToday) * 100, 100) : 0;
    return { name, count, rate, todayRate };
  });
  rows.sort((a, b) => (b.rate !== a.rate ? b.rate - a.rate : a.name.localeCompare(b.name, "ko")));

  let html = `<table class="qt-table"><thead><tr>
      <th>순위</th><th>성함</th><th>큐티 횟수</th><th>달성률 (오늘까지)</th><th></th></tr></thead><tbody>`;
  rows.forEach((r, i) => {
    const color = rateColor(r.rate);
    const todayColor = rateColor(r.todayRate);
    html += `<tr>
      <td class="rank">${i + 1}</td>
      <td class="name">${esc(r.name)}</td>
      <td>${r.count} / ${daysInMonth}</td>
      <td style="color:${color}; font-weight:700;">${r.rate.toFixed(1)}% <span class="rate-sub" style="color:${todayColor};">(${r.todayRate.toFixed(1)}%)</span></td>
      <td class="bar-cell"><div class="bar"><div class="bar-fill" style="width:${Math.min(r.rate, 100)}%; background:${color};"></div></div></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById("qt-table-wrap").innerHTML = html;
}

let feedList = [];
function renderFeed() {
  feedList = [];
  for (const name of TARGET_NAMES) {
    for (const p of postsByName[name] || []) {
      if (p && p.title) feedList.push({ name, category: categorize(p.title), ...p });
    }
  }
  feedList.sort((a, b) =>
    String(b.postDate || "").localeCompare(String(a.postDate || "")) ||
    String(b.collectedAt || "").localeCompare(String(a.collectedAt || ""))
  );
  feedList = feedList.slice(0, 20);

  const wrap = document.getElementById("feed-wrap");
  if (feedList.length === 0) {
    wrap.innerHTML = `<p class="muted">아직 수집된 글이 없습니다. (GitHub Actions 수집 실행 후 표시됩니다)</p>`;
    return;
  }
  wrap.innerHTML =
    `<ul class="feed">` +
    feedList.map((p, i) => `<li>
        <span class="feed-date">${esc(p.postDate || "")}</span>
        <span class="feed-name">${esc(p.name)}</span>
        ${catBadge(p.category)}
        ${postLinkHtml("feed", i, p.title)}
      </li>`).join("") +
    `</ul>`;
  wirePostClicks(wrap, feedList);
}

/* ===================== 멤버별 글 ===================== */
let memberPosts = [];
let currentCat = "__all";

function renderMember(name) {
  currentCat = "__all";
  document.getElementById("member-title").textContent = `🙋 ${name} 님의 글`;

  memberPosts = (postsByName[name] || [])
    .filter((p) => p && p.title)
    .map((p) => ({ ...p, name, category: categorize(p.title) }))
    .sort((a, b) =>
      String(b.postDate || "").localeCompare(String(a.postDate || "")) ||
      String(b.collectedAt || "").localeCompare(String(a.collectedAt || ""))
    );

  document.getElementById("member-meta").textContent = `총 ${memberPosts.length}건`;

  const counts = {};
  for (const p of memberPosts) counts[p.category] = (counts[p.category] || 0) + 1;
  const cats = Object.keys(counts).sort((a, b) => a.localeCompare(b, "ko"));

  const filterEl = document.getElementById("cat-filter");
  filterEl.innerHTML =
    `<button class="chip active" data-cat="__all">전체 (${memberPosts.length})</button>` +
    cats.map((c) => {
      const [bg, fg] = categoryColor(c);
      return `<button class="chip" data-cat="${esc(c)}" style="--chip-bg:${bg}; --chip-fg:${fg};">${esc(c)} (${counts[c]})</button>`;
    }).join("");

  filterEl.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentCat = btn.dataset.cat;
      filterEl.querySelectorAll(".chip").forEach((b) => b.classList.toggle("active", b === btn));
      paintMemberPosts();
    });
  });

  paintMemberPosts();
}

function paintMemberPosts() {
  const list = currentCat === "__all" ? memberPosts : memberPosts.filter((p) => p.category === currentCat);
  const wrap = document.getElementById("member-posts");
  if (list.length === 0) {
    wrap.innerHTML = `<p class="muted">표시할 글이 없습니다.</p>`;
    return;
  }
  wrap.innerHTML =
    `<ul class="post-list">` +
    list.map((p, i) => `<li>
        <span class="post-date">${esc(p.postDate || "")}</span>
        ${catBadge(p.category)}
        ${postLinkHtml("member", i, p.title)}
      </li>`).join("") +
    `</ul>`;
  wirePostClicks(wrap, list);
}

/* ===================== 사이드바 / 탭 ===================== */
function setSidebar(open) {
  document.getElementById("sidebar").classList.toggle("open", open);
  document.getElementById("sidebar-backdrop").hidden = !open;
}

function buildTabs() {
  const nav = document.getElementById("tabs");
  const dashEl = document.getElementById("dashboard-view");
  const memberEl = document.getElementById("member-view");

  const tabs = [{ key: "__dash", label: "📊 대시보드" }]
    .concat(TARGET_NAMES.map((n) => ({ key: n, label: n })));

  nav.innerHTML = tabs
    .map((t, i) =>
      `<button class="side-item${i === 0 ? " active" : ""}" data-key="${esc(t.key)}">${esc(t.label)}</button>`
    ).join("");

  nav.querySelectorAll(".side-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      nav.querySelectorAll(".side-item").forEach((b) => b.classList.toggle("active", b === btn));
      const key = btn.dataset.key;
      activeKey = key;
      if (key === "__dash") {
        dashEl.hidden = false;
        memberEl.hidden = true;
      } else {
        dashEl.hidden = true;
        memberEl.hidden = false;
        renderMember(key);
      }
      setSidebar(false); // 선택 후 닫기
    });
  });

  // 토글/백드롭/모달 닫기 배선
  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    const open = !document.getElementById("sidebar").classList.contains("open");
    setSidebar(open);
  });
  document.getElementById("sidebar-backdrop").addEventListener("click", () => setSidebar(false));

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("post-modal").addEventListener("click", (e) => {
    if (e.target.id === "post-modal") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); setSidebar(false); }
  });
}

// 데이터를 다시 읽어 현재 화면을 갱신 (초기 로드 + 새로고침 공용)
async function loadData() {
  const notice = document.getElementById("notice");
  notice.hidden = true;

  const { result, firstError } = await loadAllPosts(TARGET_NAMES);
  postsByName = result;

  const total = Object.values(result).reduce((s, a) => s + a.length, 0);
  if (firstError && total === 0) {
    const msg = String((firstError && firstError.message) || firstError);
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

  renderQtTable();
  renderFeed();
  if (activeKey !== "__dash") renderMember(activeKey);
}

/** 로그인 성공 후 1회 호출. */
export async function initDashboard() {
  if (loaded) return;
  loaded = true;
  try {
    buildTabs();
    await loadData();
  } catch (e) {
    loaded = false;
    showNotice("⚠️ 초기화 오류: " + esc(e.message));
  }
}

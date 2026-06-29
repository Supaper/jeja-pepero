// 메인 화면 컨트롤러: RTDB(/posts/<이름>)를 한 번 읽어
//   - 대시보드(이번 달 큐티 완주 현황 + 최근 글 피드)
//   - 멤버별(접이식 사이드바 탭): 글 목록 + 카테고리 필터 + 색상
//   - 글 클릭 시 본문 모달(저장된 content 표시, 없으면 원문 링크 안내)
// 를 렌더링합니다.
import { db } from "./firebase-config.js";
import { ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  QT_TARGET_NAMES,
  TARGET_NAMES,
  extractQtDays,
  rateColor,
  categorize,
  categoryColor,
  isNotice,
  postNum,
} from "./config.js";
import {
  COURSES,
  findCourse,
  courseAssignments,
  assignKindColor,
} from "./assignments.js";

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
let assignStatus = {}; // { name: { assignmentId: true } }
let loaded = false;
let activeKey = "__dash"; // 현재 보고 있는 탭 (__dash / __admin / 멤버 이름)
let isAdmin = false;
let memberList = []; // [{name, qt, active, course}] 전체
let memberNames = []; // 수집/표시 대상 (active)
let qtNames = []; // 큐티 집계 대상 (qt)

// RTDB /members 로드. 없으면 config 기본값으로 폴백.
async function loadMemberList() {
  try {
    const snap = await get(ref(db, "members"));
    if (snap.exists()) {
      const val = snap.val();
      const defCourse = COURSES[0] ? COURSES[0].id : "";
      const list = Object.entries(val)
        .map(([key, m]) => {
          const qt = !(m && m.qt === false);
          return {
            name: (m && m.name) || key,
            qt,
            active: !(m && m.active === false),
            // course 미지정 시: 큐티 대상은 기본 과정, 그 외(예: 다른 기수)는 미배정
            course: (m && typeof m.course === "string") ? m.course : (qt ? defCourse : ""),
          };
        })
        .filter((m) => m.name)
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
      if (list.length) return list;
    }
  } catch (_) { /* 폴백 */ }
  const defCourse = COURSES[0] ? COURSES[0].id : "";
  return TARGET_NAMES.map((n) => ({
    name: n,
    qt: QT_TARGET_NAMES.includes(n),
    active: true,
    course: QT_TARGET_NAMES.includes(n) ? defCourse : "",
  }));
}

// 공지글 제거 + 게시글 번호(num) 기준 중복 제거(본문 있는 항목 우선).
function cleanPosts(arr) {
  const byNum = new Map();
  const noNum = [];
  for (const p of arr) {
    if (!p || !p.title || isNotice(p.title)) continue;
    const num = postNum(p.link);
    if (!num) { noNum.push(p); continue; }
    const prev = byNum.get(num);
    if (!prev || (!prev.content && p.content)) byNum.set(num, p);
  }
  return [...byNum.values(), ...noNum];
}

async function loadAllPosts(names) {
  const result = {};
  let firstError = null;
  await Promise.all(
    names.map(async (name) => {
      try {
        const snap = await get(ref(db, `posts/${name}`));
        result[name] = snap.exists() ? cleanPosts(Object.values(snap.val())) : [];
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
  // 주차 목록 모달이 아직 열려 있으면 스크롤 잠금 유지
  if (document.getElementById("week-modal").hidden) document.body.style.overflow = "";
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
let selectedYM = null; // 보고 있는 달 "YYYY-MM" (기본: 이번 달)

function ymKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 글의 등록일(postDate)로부터 선택 가능한 달 목록(내림차순). 이번 달은 항상 포함.
function availableMonths() {
  const set = new Set();
  for (const arr of Object.values(postsByName)) {
    for (const p of arr || []) {
      const m = String((p && p.postDate) || "").match(/^(\d{4})\.(\d{2})/);
      if (m && m[1] !== "0000") set.add(`${m[1]}-${m[2]}`);
    }
  }
  set.add(ymKey(new Date()));
  return [...set].sort().reverse();
}

function populateMonthDropdown() {
  const sel = document.getElementById("qt-month");
  if (!sel) return;
  const months = availableMonths();
  if (!selectedYM || !months.includes(selectedYM)) selectedYM = months[0];
  sel.innerHTML = months
    .map((ym) => {
      const [y, m] = ym.split("-");
      return `<option value="${ym}"${ym === selectedYM ? " selected" : ""}>${y}년 ${Number(m)}월</option>`;
    })
    .join("");
  if (!sel.dataset.wired) {
    sel.dataset.wired = "1";
    sel.addEventListener("change", () => {
      selectedYM = sel.value;
      renderQtTable();
    });
  }
}

// 그 달을 일요일~토요일 기준 주차로 분할. 1일이 속한 주가 1주차.
function buildWeeks(year, month, daysInMonth) {
  const weeks = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=일
    if (d === 1 || dow === 0) weeks.push({ idx: weeks.length + 1, start: d, end: d, count: 0 });
    weeks[weeks.length - 1].end = d;
  }
  return weeks;
}

// 한 멤버의 선택한 달 '큐티나눔' 글과 각 글의 큐티 날짜 추출.
function memberQtData(name, year, month, daysInMonth) {
  const items = []; // { post, days: [d,...] }
  const uniqueDays = new Set();
  for (const p of postsByName[name] || []) {
    const title = (p && p.title) || "";
    if (title.replace(/\s+/g, "").indexOf("큐티나눔") === -1) continue;
    const days = [...new Set(extractQtDays(title, year, month, daysInMonth))];
    if (!days.length) continue;
    for (const d of days) uniqueDays.add(d);
    items.push({ post: { ...p, name, category: categorize(title) }, days });
  }
  return { items, uniqueDays };
}

// 주차별 클릭 시 보여줄 글 목록 저장소 ("이름|주차" → [post, ...])
let weekPostIndex = {};

function weeklyBreakdownHtml(name, year, month, daysInMonth, qtData) {
  const weeks = buildWeeks(year, month, daysInMonth);
  for (const w of weeks) {
    const daysInWeek = new Set();
    const posts = [];
    const seen = new Set();
    for (const it of qtData.items) {
      if (!it.days.some((d) => d >= w.start && d <= w.end)) continue;
      for (const d of it.days) if (d >= w.start && d <= w.end) daysInWeek.add(d);
      const key = it.post.link || it.post.title;
      if (!seen.has(key)) { seen.add(key); posts.push(it.post); }
    }
    w.count = daysInWeek.size;
    weekPostIndex[`${name}|${w.idx}`] = posts;
  }
  return (
    `<div class="week-grid">` +
    weeks
      .map((w) => {
        const clickable = w.count > 0;
        const attrs = clickable
          ? ` data-name="${esc(name)}" data-week="${w.idx}" role="button" tabindex="0"`
          : "";
        return `<div class="week-item">
          <span class="week-label">${month}월 ${w.idx}주차 <span class="week-range">(${month}월${w.start}일~${month}월${w.end}일)</span></span>
          <span class="week-count${w.count ? "" : " zero"}${clickable ? " clickable" : ""}"${attrs}>${w.count}회</span>
        </div>`;
      })
      .join("") +
    `</div>`
  );
}

function renderQtTable() {
  populateMonthDropdown();
  const now = new Date();
  const [year, month] = selectedYM.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const dayToday = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;

  document.getElementById("qt-title").textContent =
    `📊 ${year}년 ${month}월 큐티 완주 현황`;
  document.getElementById("qt-meta").textContent =
    isCurrentMonth ? `달성률 = 월 전체 (괄호: ${month}/${dayToday}까지)` : `달성률 = 월 전체`;

  weekPostIndex = {};
  const rows = qtNames.map((name) => {
    const qtData = memberQtData(name, year, month, daysInMonth);
    const count = qtData.uniqueDays.size;
    const rate = (count / daysInMonth) * 100;
    const todayRate = dayToday > 0 ? Math.min((count / dayToday) * 100, 100) : 0;
    return { name, count, rate, todayRate, qtData };
  });
  rows.sort((a, b) => (b.rate !== a.rate ? b.rate - a.rate : a.name.localeCompare(b.name, "ko")));

  let html = `<table class="qt-table"><thead><tr>
      <th class="caret-cell"></th><th>순위</th><th>성함</th><th>큐티 횟수</th><th>달성률${isCurrentMonth ? " (오늘까지)" : ""}</th><th></th></tr></thead><tbody>`;
  rows.forEach((r, i) => {
    const color = rateColor(r.rate);
    const todayColor = rateColor(r.todayRate);
    const sub = isCurrentMonth
      ? ` <span class="rate-sub" style="color:${todayColor};">(${r.todayRate.toFixed(1)}%)</span>`
      : "";
    html += `<tr class="qt-row" data-name="${esc(r.name)}" title="클릭하면 주차별 큐티 횟수">
      <td class="caret-cell"><span class="caret">▸</span></td>
      <td class="rank">${i + 1}</td>
      <td class="name">${esc(r.name)}</td>
      <td>${r.count} / ${daysInMonth}</td>
      <td style="color:${color}; font-weight:700;">${r.rate.toFixed(1)}%${sub}</td>
      <td class="bar-cell"><div class="bar"><div class="bar-fill" style="width:${Math.min(r.rate, 100)}%; background:${color};"></div></div></td>
    </tr>
    <tr class="qt-detail" hidden><td colspan="6">${weeklyBreakdownHtml(r.name, year, month, daysInMonth, r.qtData)}</td></tr>`;
  });
  html += `</tbody></table>`;
  const wrap = document.getElementById("qt-table-wrap");
  wrap.innerHTML = html;

  wrap.querySelectorAll(".qt-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const detail = tr.nextElementSibling;
      if (!detail || !detail.classList.contains("qt-detail")) return;
      const open = detail.hidden;
      detail.hidden = !open;
      tr.classList.toggle("expanded", open);
    });
  });

  wrap.querySelectorAll(".week-count.clickable").forEach((el) => {
    const open = () => openWeekModal(el.dataset.name, Number(el.dataset.week));
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
}

/* ===================== 주차별 글 목록 모달 ===================== */
function openWeekModal(name, weekIdx) {
  const posts = weekPostIndex[`${name}|${weekIdx}`] || [];
  const [, month] = selectedYM.split("-").map(Number);
  document.getElementById("week-modal-title").textContent =
    `${name} · ${month}월 ${weekIdx}주차 큐티 글`;
  document.getElementById("week-modal-meta").textContent = `${posts.length}건`;

  const body = document.getElementById("week-modal-body");
  if (!posts.length) {
    body.innerHTML = `<p class="muted" style="padding:8px 0;">표시할 글이 없습니다.</p>`;
  } else {
    body.innerHTML =
      `<ul class="post-list">` +
      posts.map((p, i) => `<li>
          <span class="post-date">${esc(p.postDate || "")}</span>
          ${catBadge(p.category || categorize(p.title))}
          ${postLinkHtml("week", i, p.title)}
        </li>`).join("") +
      `</ul>`;
    wirePostClicks(body, posts);
  }
  document.getElementById("week-modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeWeekModal() {
  document.getElementById("week-modal").hidden = true;
  if (document.getElementById("post-modal").hidden) document.body.style.overflow = "";
}

/* ===================== 과제 완주 현황 ===================== */
let autoAssign = {}; // { name: { assignmentId: matchedPost } } — 수집 글로 자동 매칭된 과제

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// 매칭용 정규화: 맨 앞 분류 태그([훈련나눔] 등)를 떼고 공백 제거·소문자.
// (태그의 "훈련나눔"이 키워드 "나눔" 등과 충돌하지 않도록 제거)
function normTitle(s) {
  return String(s ?? "")
    .replace(/^\s*[\[\(【][^\]\)】]*[\]\)】]\s*/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// 멤버의 [훈련나눔] 글 목록(정규화 포함)
function trainingPosts(name) {
  return (postsByName[name] || [])
    .filter((p) => p && p.title && categorize(p.title) === "훈련나눔")
    .map((p) => ({ post: { ...p, name, category: "훈련나눔" }, n: normTitle(p.title) }));
}

// 과정별 섹션({course, names})을 받아 멤버별 자동 매칭(autoAssign) 구성.
// 멤버는 자기 과정의 과제에 대해서만 매칭됩니다.
function buildAutoAssign(sections) {
  autoAssign = {};
  for (const { course, names } of sections) {
    const all = courseAssignments(course);
    for (const name of names) {
      const tps = trainingPosts(name);
      const map = {};
      for (const it of all) {
        if (!it.m || !it.m.length) continue;
        for (const tp of tps) {
          if (it.x && it.x.some((xk) => tp.n.includes(xk))) continue;
          if (it.m.some((k) => tp.n.includes(k))) { map[it.id] = tp.post; break; }
        }
      }
      autoAssign[name] = map;
    }
  }
}

function assignKindBadge(kind) {
  const [bg, fg] = assignKindColor(kind);
  return `<span class="assign-kind" style="background:${bg}; color:${fg};">${esc(kind)}</span>`;
}

function assignChecklistHtml(name, course, today) {
  const st = assignStatus[name] || {};
  const auto = autoAssign[name] || {};
  return course.groups.map((g) => {
    const items = g.items.map((it) => {
      const autoPost = auto[it.id];
      const manual = !!st[it.id];
      const done = !!autoPost || manual;
      const overdue = !done && it.due < today;
      const dueLabel = it.due.slice(5).replace("-", "/");
      if (autoPost) {
        return `<div class="assign-item auto" data-name="${esc(name)}" data-id="${esc(it.id)}" title="수집된 글로 자동 완료 · 클릭하면 글 보기">
          <span class="assign-box done">✓</span>
          ${assignKindBadge(it.kind)}
          <span class="assign-text">${esc(it.title)}</span>
          <span class="assign-auto">자동 ↗</span>
          <span class="assign-due">~${dueLabel}</span>
        </div>`;
      }
      return `<label class="assign-item${overdue ? " overdue" : ""}">
        <input type="checkbox" class="assign-check" data-name="${esc(name)}" data-id="${esc(it.id)}" data-due="${it.due}" ${manual ? "checked" : ""} />
        ${assignKindBadge(it.kind)}
        <span class="assign-text">${esc(it.title)}</span>
        <span class="assign-due">~${dueLabel}</span>
      </label>`;
    }).join("");
    return `<div class="assign-group"><div class="assign-group-h">${esc(g.label)}</div>${items}</div>`;
  }).join("");
}

function assignCounts(name, all, today) {
  const st = assignStatus[name] || {};
  const auto = autoAssign[name] || {};
  let done = 0, doneDue = 0;
  for (const it of all) {
    if (auto[it.id] || st[it.id]) { done++; if (it.due <= today) doneDue++; }
  }
  return { done, doneDue };
}

function updateAssignRow(name, today) {
  const wrap = document.getElementById("assign-table-wrap");
  const m = memberList.find((x) => x.name === name);
  const course = m && findCourse(m.course);
  if (!course) return;
  const all = courseAssignments(course);
  const dueSoFar = all.filter((it) => it.due <= today).length;
  const total = all.length;
  const { done, doneDue } = assignCounts(name, all, today);
  const rate = dueSoFar > 0 ? (doneDue / dueSoFar) * 100 : 0;
  const totalRate = total > 0 ? (done / total) * 100 : 0;
  for (const tr of wrap.querySelectorAll(".assign-row")) {
    if (tr.dataset.name !== name) continue;
    const doneCell = tr.querySelector(".assign-done");
    const rateCell = tr.querySelector(".assign-rate");
    if (doneCell) doneCell.textContent = `${doneDue} / ${dueSoFar}`;
    if (rateCell) {
      rateCell.style.color = rateColor(rate);
      rateCell.innerHTML = `${rate.toFixed(0)}% <span class="rate-sub">(${totalRate.toFixed(0)}%)</span>`;
    }
    break;
  }
}

async function onToggleAssign(cb, today) {
  const name = cb.dataset.name, id = cb.dataset.id, want = cb.checked;
  try {
    await set(ref(db, `assignments/${name}/${id}`), want ? true : null);
    if (!assignStatus[name]) assignStatus[name] = {};
    if (want) assignStatus[name][id] = true; else delete assignStatus[name][id];
    updateAssignRow(name, today);
    const label = cb.closest(".assign-item");
    if (label) label.classList.toggle("overdue", !want && cb.dataset.due < today);
  } catch (e) {
    cb.checked = !want;
    alert("저장 실패: " + (e.message || e) + "\n(RTDB 규칙에 assignments write 권한이 필요합니다)");
  }
}

function renderAssignTable() {
  const wrap = document.getElementById("assign-table-wrap");
  if (!wrap) return;
  const today = todayISO();

  // 수집 대상(active) 멤버를 과정별로 묶기
  const active = memberList.filter((m) => m.active);
  const sections = COURSES
    .map((course) => ({ course, names: active.filter((m) => m.course === course.id).map((m) => m.name) }))
    .filter((s) => s.names.length);

  if (!sections.length) {
    document.getElementById("assign-meta").textContent = "";
    wrap.innerHTML = `<p class="muted">과정이 배정된 멤버가 없습니다. ‘⚙️ 멤버 관리’에서 각 멤버의 과정을 지정하세요.</p>`;
    return;
  }
  document.getElementById("assign-meta").textContent =
    "수집된 [훈련나눔] 글로 자동 체크 · 완주율은 마감 도래 기준(괄호: 전체)";

  buildAutoAssign(sections);

  let html = "";
  for (const { course, names } of sections) {
    const all = courseAssignments(course);
    const dueSoFar = all.filter((it) => it.due <= today).length;
    const total = all.length;

    const rows = names.map((name) => {
      const { done, doneDue } = assignCounts(name, all, today);
      const rate = dueSoFar > 0 ? (doneDue / dueSoFar) * 100 : 0;
      const totalRate = total > 0 ? (done / total) * 100 : 0;
      return { name, doneDue, rate, totalRate };
    });
    rows.sort((a, b) => (b.rate !== a.rate ? b.rate - a.rate : a.name.localeCompare(b.name, "ko")));

    html += `<div class="assign-course">
      <h3 class="assign-course-h">${esc(course.label)} <span class="card-meta">마감 도래 ${dueSoFar} / 전체 ${total}</span></h3>
      <table class="qt-table"><thead><tr>
        <th class="caret-cell"></th><th>순위</th><th>성함</th><th>완료(마감도래)</th><th>완주율 (전체)</th></tr></thead><tbody>`;
    rows.forEach((r, i) => {
      const color = rateColor(r.rate);
      html += `<tr class="qt-row assign-row" data-name="${esc(r.name)}" title="클릭하면 과제 체크">
        <td class="caret-cell"><span class="caret">▸</span></td>
        <td class="rank">${i + 1}</td>
        <td class="name">${esc(r.name)}</td>
        <td class="assign-done">${r.doneDue} / ${dueSoFar}</td>
        <td class="assign-rate" style="color:${color}; font-weight:700;">${r.rate.toFixed(0)}% <span class="rate-sub">(${r.totalRate.toFixed(0)}%)</span></td>
      </tr>
      <tr class="qt-detail" hidden><td colspan="5">${assignChecklistHtml(r.name, course, today)}</td></tr>`;
    });
    html += `</tbody></table></div>`;
  }
  wrap.innerHTML = html;

  wrap.querySelectorAll(".assign-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const detail = tr.nextElementSibling;
      if (!detail || !detail.classList.contains("qt-detail")) return;
      const open = detail.hidden;
      detail.hidden = !open;
      tr.classList.toggle("expanded", open);
    });
  });
  wrap.querySelectorAll(".assign-check").forEach((cb) => {
    cb.addEventListener("change", () => onToggleAssign(cb, today));
  });
  wrap.querySelectorAll(".assign-item.auto").forEach((el) => {
    el.addEventListener("click", () => {
      const p = (autoAssign[el.dataset.name] || {})[el.dataset.id];
      if (p) openPostModal(p);
    });
  });
}

let feedList = [];
function renderFeed() {
  feedList = [];
  for (const name of memberNames) {
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

function showView(key) {
  document.getElementById("dashboard-view").hidden = key !== "__dash";
  document.getElementById("member-view").hidden = !(key !== "__dash" && key !== "__admin");
  document.getElementById("admin-view").hidden = key !== "__admin";
}

function buildTabs() {
  const nav = document.getElementById("tabs");

  const tabs = [{ key: "__dash", label: "📊 대시보드" }]
    .concat(memberNames.map((n) => ({ key: n, label: n })));
  if (isAdmin) tabs.push({ key: "__admin", label: "⚙️ 멤버 관리" });

  nav.innerHTML = tabs
    .map((t) =>
      `<button class="side-item${t.key === activeKey ? " active" : ""}" data-key="${esc(t.key)}">${esc(t.label)}</button>`
    ).join("");

  nav.querySelectorAll(".side-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      nav.querySelectorAll(".side-item").forEach((b) => b.classList.toggle("active", b === btn));
      const key = btn.dataset.key;
      activeKey = key;
      showView(key);
      if (key === "__admin") renderAdmin();
      else if (key !== "__dash") renderMember(key);
      setSidebar(false); // 선택 후 닫기
    });
  });
}

// 사이드바/모달 등 1회성 배선
function wireChrome() {
  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    const open = !document.getElementById("sidebar").classList.contains("open");
    setSidebar(open);
  });
  document.getElementById("sidebar-backdrop").addEventListener("click", () => setSidebar(false));
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("post-modal").addEventListener("click", (e) => {
    if (e.target.id === "post-modal") closeModal();
  });
  document.getElementById("week-modal-close").addEventListener("click", closeWeekModal);
  document.getElementById("week-modal").addEventListener("click", (e) => {
    if (e.target.id === "week-modal") closeWeekModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // 위에 떠 있는 모달부터 닫기
    if (!document.getElementById("post-modal").hidden) { closeModal(); return; }
    if (!document.getElementById("week-modal").hidden) { closeWeekModal(); return; }
    setSidebar(false);
  });
}

/* ===================== 멤버 관리 (관리자) ===================== */
function courseOptionsHtml(sel) {
  return [`<option value=""${!sel ? " selected" : ""}>해당없음</option>`]
    .concat(COURSES.map((c) =>
      `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(c.label)}</option>`))
    .join("");
}

function renderAdmin() {
  const wrap = document.getElementById("admin-view");
  wrap.innerHTML =
    `<section class="card">
      <div class="card-head"><h2>⚙️ 멤버 관리</h2>
        <span class="card-meta">총 ${memberList.length}명</span></div>
      <div class="add-row">
        <input id="new-member" type="text" placeholder="추가할 이름 (게시판 검색명과 동일)" />
        <button id="add-member" class="btn btn-primary">추가</button>
      </div>
      <div id="admin-msg" class="muted" style="margin:8px 0;"></div>
      <div class="table-wrap"><table class="qt-table"><thead><tr>
        <th>이름</th><th>큐티 집계</th><th>수집 대상</th><th>훈련과정</th><th></th>
      </tr></thead><tbody>` +
      memberList.map((m) => `<tr>
        <td class="name">${esc(m.name)}</td>
        <td><input type="checkbox" data-act="qt" data-name="${esc(m.name)}" ${m.qt ? "checked" : ""} /></td>
        <td><input type="checkbox" data-act="active" data-name="${esc(m.name)}" ${m.active ? "checked" : ""} /></td>
        <td><select class="course-select" data-name="${esc(m.name)}">${courseOptionsHtml(m.course)}</select></td>
        <td><button class="btn btn-ghost btn-del" data-name="${esc(m.name)}">삭제</button></td>
      </tr>`).join("") +
      `</tbody></table></div>
      <p class="muted" style="margin-top:12px;">※ <b>큐티 집계</b>=월간 큐티 완주 현황 대상 · <b>수집 대상</b>=글 자동 수집 ·
      <b>훈련과정</b>=과제 현황에서 채점할 과정(다른 기수는 ‘해당없음’ 또는 다른 과정 선택).
      변경은 다음 수집부터 반영됩니다. 권한 오류가 나면 관리자 클레임을 확인하세요(README).</p>
    </section>`;

  const msg = (t, ok) => {
    const el = document.getElementById("admin-msg");
    el.textContent = t; el.style.color = ok ? "#1a8a3c" : "#d93025";
  };

  document.getElementById("add-member").addEventListener("click", async () => {
    const name = document.getElementById("new-member").value.trim();
    if (!name) return;
    if (memberList.some((m) => m.name === name)) { msg("이미 있는 이름입니다.", false); return; }
    try {
      await ensureSeeded();
      const course = COURSES[0] ? COURSES[0].id : "";
      await set(ref(db, "members/" + name), { name, qt: true, active: true, course, createdAt: new Date().toISOString() });
      msg(`'${name}' 추가됨`, true);
      await reloadMembersAndUi();
    } catch (e) { msg("추가 실패: " + (e.message || e), false); }
  });

  wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", async () => {
      const name = cb.dataset.name, field = cb.dataset.act;
      try {
        await ensureSeeded();
        await update(ref(db, "members/" + name), { [field]: cb.checked });
        await reloadMembersAndUi();
      } catch (e) { cb.checked = !cb.checked; msg("변경 실패: " + (e.message || e), false); }
    });
  });

  wrap.querySelectorAll(".course-select").forEach((sel) => {
    const prev = sel.value;
    sel.addEventListener("change", async () => {
      const name = sel.dataset.name;
      try {
        await ensureSeeded();
        await update(ref(db, "members/" + name), { course: sel.value });
        await reloadMembersAndUi();
      } catch (e) { sel.value = prev; msg("변경 실패: " + (e.message || e), false); }
    });
  });

  wrap.querySelectorAll(".btn-del").forEach((b) => {
    b.addEventListener("click", async () => {
      const name = b.dataset.name;
      if (!confirm(`'${name}' 멤버를 삭제할까요? (수집한 글 기록은 유지됩니다)`)) return;
      try {
        await ensureSeeded();
        await remove(ref(db, "members/" + name));
        msg(`'${name}' 삭제됨`, true);
        await reloadMembersAndUi();
      } catch (e) { msg("삭제 실패: " + (e.message || e), false); }
    });
  });
}

// /members 가 비어 있으면(폴백 표시 중) 현재 전체 명단을 먼저 통째로 저장.
// 한 명만 토글했을 때 나머지가 사라지는 문제 방지.
async function ensureSeeded() {
  const snap = await get(ref(db, "members"));
  if (snap.exists()) return;
  const updates = {};
  for (const m of memberList) {
    updates[m.name] = { name: m.name, qt: m.qt, active: m.active, course: m.course || "" };
  }
  if (Object.keys(updates).length) await update(ref(db, "members"), updates);
}

async function reloadMembersAndUi() {
  memberList = await loadMemberList();
  memberNames = memberList.filter((m) => m.active).map((m) => m.name);
  qtNames = memberList.filter((m) => m.qt).map((m) => m.name);
  buildTabs();
  renderQtTable();
  renderAssignTable();
  if (activeKey === "__admin") renderAdmin();
}

// 데이터를 다시 읽어 현재 화면을 갱신
async function loadData() {
  document.getElementById("notice").hidden = true;

  memberList = await loadMemberList();
  memberNames = memberList.filter((m) => m.active).map((m) => m.name);
  qtNames = memberList.filter((m) => m.qt).map((m) => m.name);

  const { result, firstError } = await loadAllPosts(memberNames);
  postsByName = result;

  try {
    const aSnap = await get(ref(db, "assignments"));
    assignStatus = aSnap.exists() ? aSnap.val() : {};
  } catch (_) { assignStatus = {}; }

  const total = Object.values(result).reduce((s, a) => s + a.length, 0);
  if (firstError && total === 0) {
    const msg = String((firstError && firstError.message) || firstError);
    if (/permission|denied/i.test(msg)) {
      showNotice(
        "⚠️ 데이터 읽기 권한이 없습니다. <b>Realtime Database → 규칙</b>에서 " +
        "<code>posts</code>·<code>members</code>·<code>users</code> 의 <code>.read</code> 를 " +
        "<code>\"auth != null\"</code> 로 설정해 게시하세요."
      );
    } else {
      showNotice("⚠️ 데이터를 불러오지 못했습니다: " + esc(msg));
    }
  }

  buildTabs();
  renderQtTable();
  renderAssignTable();
  renderFeed();
  if (activeKey === "__admin") renderAdmin();
  else if (activeKey !== "__dash") renderMember(activeKey);
}

/** 로그인 성공 후 1회 호출. */
export async function initDashboard(profile) {
  if (loaded) return;
  loaded = true;
  isAdmin = !!(profile && profile.admin);
  try {
    wireChrome();
    await loadData();
  } catch (e) {
    loaded = false;
    showNotice("⚠️ 초기화 오류: " + esc(e.message));
  }
}

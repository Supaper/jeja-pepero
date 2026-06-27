// 대시보드 렌더링: RTDB(/posts/<이름>)를 읽어
//  ① 이번 달 큐티 완주 현황 표  ② 최근 수집된 글 피드 를 그립니다.
import { db } from "./firebase-config.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { QT_TARGET_NAMES, TARGET_NAMES, extractQtDays, rateColor } from "./config.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// /posts/<name> 전체를 한 번에 읽어 { name: [post,...] } 로 반환
async function loadAllPosts(names) {
  const result = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        const snap = await get(ref(db, `posts/${name}`));
        const val = snap.exists() ? snap.val() : {};
        result[name] = Object.values(val);
      } catch (_) {
        result[name] = [];
      }
    })
  );
  return result;
}

function renderQtTable(postsByName) {
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
    const rate = (count / daysInMonth) * 100;
    return { name, count, rate };
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

function renderFeed(postsByName) {
  const all = [];
  for (const name of TARGET_NAMES) {
    for (const p of postsByName[name] || []) {
      if (p && p.title) all.push({ name, ...p });
    }
  }
  // 작성일 → 수집일시 순으로 최신 정렬
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

let loaded = false;

/** 로그인 성공 후 1회 호출하여 대시보드를 채웁니다. */
export async function initDashboard() {
  if (loaded) return;
  loaded = true;
  try {
    const postsByName = await loadAllPosts(TARGET_NAMES);
    renderQtTable(postsByName);
    renderFeed(postsByName);
  } catch (e) {
    document.getElementById("qt-table-wrap").innerHTML =
      `<p class="muted">데이터를 불러오지 못했습니다: ${esc(e.message)}</p>`;
    document.getElementById("feed-wrap").innerHTML = "";
    loaded = false; // 재시도 허용
  }
}

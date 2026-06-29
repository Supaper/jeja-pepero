// 과거 글(올해치) 수집: 게시판 목록을 페이지 단위로 거슬러 올라가며
// cutoff(기본 올해 1/1) 이후 글을 모두 RTDB(/posts/<이름>)에 채웁니다.
// 이미 있는 글은 link 로 중복 제거하므로 여러 번 돌려도 안전(멱등).
//
// 환경변수:
//   PROBE=1       목록 페이지 구조(페이지네이션 링크/글 수/날짜범위)만 출력, 저장 안 함
//   MEMBER=이름    특정 멤버만 (생략 시 active 멤버 전체)
//   CUTOFF=YYYY.MM.DD  이 날짜 이후만 수집 (기본: 올해 1/1)
//   PAGE_PARAM=page    페이지 파라미터명 (PROBE 로 확인 후 조정)
//   MAX_PAGES=60   안전 상한
import { initDb } from "./lib/firebase.js";
import { loadMembers } from "./lib/members.js";
import { fetchListHtml, parseList, fetchPostContent } from "./lib/scrape.js";

const PROBE = process.env.PROBE === "1";
const PAGE_PARAM = process.env.PAGE_PARAM || "page";
const MAX_PAGES = process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES, 10) : 60;
const CUTOFF = process.env.CUTOFF || `${new Date().getFullYear()}.01.01`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nowKst() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date()).replace("T", " ");
}

async function probe(name) {
  const html = await fetchListHtml(name, 1, PAGE_PARAM);
  const { posts } = parseList(html);
  console.log(`[PROBE] ${name}: 1페이지 글 ${posts.length}건`);
  if (posts.length) {
    console.log(`  날짜범위: ${posts[posts.length - 1].date} ~ ${posts[0].date}`);
  }

  // 1) 페이지 파라미터 후보가 HTML 본문에 등장하는지
  const paramCandidates = ["page", "pageNo", "curPage", "startPage", "nowPage", "pageNum", "offset", "startNum", "p"];
  const found = paramCandidates.filter((p) => new RegExp("[?&]" + p + "=", "i").test(html));
  console.log("  본문에 등장하는 page 파라미터 후보:", found.length ? found.join(", ") : "(없음)");

  // 2) 페이지네이션 영역으로 보이는 곳의 anchor href/onclick 덤프
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  const hits = [];
  for (const a of anchors) {
    const attrs = a[1];
    const text = a[2].replace(/<[^>]+>/g, "").trim();
    const href = (attrs.match(/href="([^"]*)"/) || [])[1] || "";
    const onclick = (attrs.match(/onclick="([^"]*)"/) || [])[1] || "";
    const blob = (href + " " + onclick).replace(/&amp;/g, "&");
    if (/page|list|go|p=|\bp\b|paging|next|다음/i.test(blob) || /^\d{1,3}$/.test(text)) {
      hits.push(`text="${text}" href="${href}" onclick="${onclick}"`);
    }
  }
  console.log("  페이지네이션 의심 앵커(상위 25개):");
  [...new Set(hits)].slice(0, 25).forEach((h) => console.log("   ", h));

  // 3) "다음"/페이징 관련 스크립트 함수 흔적
  const fns = [...html.matchAll(/(go\w*Page\w*|fn\w*[Pp]age\w*|paging\w*|goList)\s*\(/g)].map((m) => m[1]);
  console.log("  페이징 관련 함수 흔적:", [...new Set(fns)].slice(0, 10).join(", ") || "(없음)");
}

async function collectMember(db, name, checkedAt) {
  const postsRef = db.ref(`posts/${name}`);
  const existingSnap = await postsRef.get();
  const existingLinks = new Set();
  if (existingSnap.exists()) {
    for (const v of Object.values(existingSnap.val())) if (v && v.link) existingLinks.add(v.link);
  }

  let added = 0;
  let newestTitle = "";
  let prevFirst = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let parsed;
    try {
      parsed = parseList(await fetchListHtml(name, page, PAGE_PARAM));
    } catch (e) {
      console.error(`  ${name} p${page} 오류: ${e.message}`);
      break;
    }
    const { posts, firstTitle } = parsed;
    if (posts.length === 0) break;
    if (firstTitle && firstTitle === prevFirst) break; // 페이지가 안 넘어감(끝/파라미터 무효)
    prevFirst = firstTitle;
    if (page === 1) newestTitle = firstTitle;

    let stop = false;
    for (const p of posts) {
      if (p.date < CUTOFF) { stop = true; break; } // 더 과거 → 중단(최신순 가정)
      if (existingLinks.has(p.link)) continue;
      let content = "";
      try { content = await fetchPostContent(p.link); } catch (_) {}
      await postsRef.push({ collectedAt: checkedAt, postDate: p.date, title: p.title, link: p.link, content });
      existingLinks.add(p.link);
      added++;
      await sleep(400);
    }
    if (stop) break;
    await sleep(700);
  }

  if (newestTitle) await db.ref(`state/${name}/lastTitle`).set(newestTitle);
  console.log(`  ${name}: 신규 ${added}건 (cutoff ${CUTOFF} 이후)`);
  return added;
}

async function main() {
  const db = initDb();
  let names;
  if (process.env.MEMBER) names = [process.env.MEMBER];
  else names = (await loadMembers(db)).filter((m) => m.active).map((m) => m.name);

  if (PROBE) {
    await probe(names[0]);
    process.exit(0);
  }

  const checkedAt = nowKst();
  let total = 0;
  for (const name of names) {
    total += await collectMember(db, name, checkedAt);
  }
  console.log(`\n완료. 총 신규 ${total}건.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

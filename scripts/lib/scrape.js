// 게시판 스크래핑 / 큐티 날짜 파싱 공용 로직.
// 기존 Google Apps Script(monitorDailyCollectionOnly / sendMonthlyQTReport)의
// 알고리즘을 Node 환경으로 충실히 이식한 것입니다.
import * as cheerio from "cheerio";

// 응답 지연으로 작업이 멈추지 않도록 타임아웃이 있는 fetch.
async function fetchWithTimeout(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export const TARGET_NAMES = [
  "강성건", "서승민", "양지혜", "유정인", "이재황", "이소현", "임채환",
  "최연희", "최지인", "한상필", "한수종", "홍종성", "황미진", "백지연",
];

// 월간 리포트 대상(백지연 제외 — 기존 스크립트와 동일)
export const QT_TARGET_NAMES = [
  "강성건", "서승민", "양지혜", "유정인", "이소현", "이재황", "임채환",
  "최연희", "최지인", "한상필", "한수종", "홍종성", "황미진",
];

export const START_DATE_STRING = "2026.02.01";
export const BASE_URL =
  "http://www.thelifechurch.kr/main/sub.html?boardID=www56&Mode=list&keyfield=name&key=";
export const DOMAIN = "http://www.thelifechurch.kr";

/**
 * 한 멤버의 게시판 페이지를 가져와 게시물 목록을 파싱.
 * 반환: { posts: [{date,title,link}], firstTitle } (posts 는 페이지 표시 순서 = 최신 우선)
 */
// 목록 HTML 파싱 → { posts:[{date,title,link}], firstTitle } (페이지 표시 순서 = 최신 우선)
export function parseList(html) {
  const articles = html.split('class="mdDefaultW100 mdWebzinecon');
  const posts = [];
  let firstTitle = "";
  let isFirstValid = true;

  for (let j = 1; j < articles.length; j++) {
    const articleHtml = articles[j];
    const linkMatch = articleHtml.match(
      /mdWebzineSbj"[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/
    );
    if (!linkMatch) continue;

    const relativeLink = linkMatch[1];
    const cleanTitle = linkMatch[2]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const dateMatch = articleHtml.match(/등록일\s*:\s*(\d{4}\.\d{2}\.\d{2})/);
    const postDate = dateMatch ? dateMatch[1] : "0000.00.00";

    if (cleanTitle.indexOf("공지") !== -1) continue; // 공지글 제외

    if (isFirstValid) {
      firstTitle = cleanTitle;
      isFirstValid = false;
    }
    posts.push({
      date: postDate,
      title: cleanTitle,
      link: DOMAIN + relativeLink.replace(/&amp;/g, "&"),
    });
  }
  return { posts, firstTitle };
}

// 특정 멤버의 목록 페이지 HTML 가져오기 (page>1 이면 pageParam 추가)
export async function fetchListHtml(name, page = 1, pageParam = "page") {
  let url = BASE_URL + encodeURIComponent(name);
  if (page && page > 1) url += `&${pageParam}=${page}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`${name} 목록 응답 오류: ${res.status}`);
  return res.text();
}

export async function fetchPosts(name) {
  return parseList(await fetchListHtml(name, 1));
}

// 링크에서 글 고유번호(num) 추출 — 중복 판정 키(파라미터 순서/형식 차이에 강건).
export function postNum(link) {
  const m = String(link || "").match(/[?&]num=(\d+)/);
  return m ? m[1] : "";
}

/**
 * 제목 문자열에서 해당 연/월에 속하는 '일(day)' 들을 추출 (중복 가능, 호출측에서 Set 처리).
 * 지원 형식: YYMMDD / 20YYMMDD / MMDD / M월DD / M.DD / M/DD 등 (기존 스크립트 정규식 이식)
 */
export function extractQtDays(title, year, month, daysInMonth) {
  const shortYear = year.toString().slice(-2);
  const mm = (month < 10 ? "0" : "") + month;
  const m = month.toString();

  const regexStr =
    "(?<!\\d)(?:(?:20)?" + shortYear + mm + "(\\d{2})|" + mm + "(\\d{2})|0?" + m + "[월./-](\\d{1,2}))";
  const pattern = new RegExp(regexStr, "g");

  const normalized = title.replace(/\s+/g, "");
  const days = [];
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    const dayStr = match[1] || match[2] || match[3];
    const day = parseInt(dayStr, 10);
    if (day >= 1 && day <= daysInMonth) days.push(day);
  }
  return days;
}

// 상세페이지 본문 컨테이너(앞에서부터 우선). thelifechurch.kr 구조 확인 결과 .mdView_cont.
const CONTENT_SELECTORS = [
  ".mdView_cont",
  "#AB_viewPrintArea .mdView_cont",
  "#AB_viewPrintArea",
  ".mdViewWrap",
];

function nodeToText($, el) {
  const $el = $(el).clone();
  $el.find("script, style, noscript, iframe").remove();
  $el.find("br").replaceWith("\n");
  $el.find("p, div, li, tr, h1, h2, h3, h4").append("\n");
  return $el
    .text()
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 상세페이지 본문을 텍스트로 추출. 적절한 컨테이너를 못 찾으면 "" 반환. */
export async function fetchPostContent(link) {
  const res = await fetchWithTimeout(link);
  if (!res.ok) throw new Error(`상세 응답 오류: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe").remove();

  for (const sel of CONTENT_SELECTORS) {
    const found = $(sel).first();
    if (found.length) {
      const text = nodeToText($, found);
      if (text.length >= 5) return text;
    }
  }
  return ""; // 알 수 없는 구조 → 저장 안 함(모달에서 원문 링크로 폴백)
}

/** 디버그용: 상세페이지의 본문 후보 컨테이너들을 텍스트 길이순으로 반환(로그 확인용). */
export async function probeDetail(link) {
  const res = await fetch(link);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const cands = [];
  $("div, td, article, section").each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, " ").trim();
    cands.push({
      tag: el.tagName,
      id: $el.attr("id") || "",
      cls: $el.attr("class") || "",
      len: text.length,
      kids: $el.children().length,
    });
  });
  cands.sort((a, b) => b.len - a.len);
  return { htmlLen: html.length, top: cands.slice(0, 25) };
}

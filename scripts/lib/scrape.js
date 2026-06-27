// 게시판 스크래핑 / 큐티 날짜 파싱 공용 로직.
// 기존 Google Apps Script(monitorDailyCollectionOnly / sendMonthlyQTReport)의
// 알고리즘을 Node 환경으로 충실히 이식한 것입니다.

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
export async function fetchPosts(name) {
  const url = BASE_URL + encodeURIComponent(name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} 페이지 응답 오류: ${res.status}`);
  const html = await res.text();

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

    // 공지글 제외
    if (cleanTitle.indexOf("공지") !== -1) continue;

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

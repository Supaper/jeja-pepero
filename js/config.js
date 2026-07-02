// 브라우저(대시보드)용 공용 상수/로직.
// ⚠️ scripts/lib/scrape.js 의 동일 항목과 내용을 일치시켜 주세요(수동 동기화).

export const TARGET_NAMES = [
  "강성건", "서승민", "양지혜", "유정인", "이재황", "이소현", "임채환",
  "최연희", "최지인", "한상필", "한수종", "홍종성", "황미진", "백지연",
];

// 월간 큐티 집계 대상 (백지연 제외 — 기존 스크립트와 동일)
export const QT_TARGET_NAMES = [
  "강성건", "서승민", "양지혜", "유정인", "이소현", "이재황", "임채환",
  "최연희", "최지인", "한상필", "한수종", "홍종성", "황미진",
];

/**
 * 제목에서 해당 연/월에 속하는 '일(day)' 추출 (중복 가능, 호출측에서 Set 처리).
 * 지원: YYMMDD / 20YYMMDD / MMDD / M월DD / M.DD / M/DD 등.
 */
export function extractQtDays(title, year, month, daysInMonth) {
  const shortYear = year.toString().slice(-2);
  const mm = (month < 10 ? "0" : "") + month;
  const m = month.toString();

  const regexStr =
    "(?<!\\d)(?:(?:20)?" + shortYear + mm + "(\\d{2})|" + mm + "(\\d{2})|0?" + m + "[월./-](\\d{1,2}))";
  const pattern = new RegExp(regexStr, "g");

  const normalized = (title || "").replace(/\s+/g, "");
  const days = [];
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    const dayStr = match[1] || match[2] || match[3];
    const day = parseInt(dayStr, 10);
    if (day >= 1 && day <= daysInMonth) days.push(day);
  }
  return days;
}

// 공지글 여부 (수집기는 제외하지만, 과거 이관 데이터에 섞여 있을 수 있어 표시에서 한 번 더 걸러냄)
export function isNotice(title) {
  return String(title || "").replace(/\s+/g, "").includes("공지");
}

// 글 링크에서 게시글 번호(num) 추출 — 중복 판정 기준
export function postNum(link) {
  const m = String(link || "").match(/[?&]num=(\d+)/);
  return m ? m[1] : "";
}

// 달성률 → 색상 (기존 리포트 규칙)
export function rateColor(rate) {
  return rate >= 90 ? "#1a4fd8"
    : rate >= 70 ? "#1a8a3c"
    : rate >= 50 ? "#e07b00"
    : "#d93025";
}

// 카테고리 → [배경색, 글자색]. 알려진 카테고리는 고정색, 그 외는 해시로 팔레트 배정.
const CAT_COLORS = {
  "큐티나눔": ["#eef2ff", "#3548b5"],
  "예배은혜나눔": ["#ecfdf5", "#047857"],
  "과제": ["#fef3c7", "#b45309"],
  "공지": ["#fee2e2", "#b91c1c"],
  "수동": ["#fdf2f8", "#9d174d"],
  "기타": ["#f1f5f9", "#475569"],
};
const CAT_PALETTE = [
  ["#e0f2fe", "#0369a1"], ["#fae8ff", "#a21caf"], ["#dcfce7", "#15803d"],
  ["#ffedd5", "#c2410c"], ["#e0e7ff", "#4338ca"], ["#fce7f3", "#be185d"],
  ["#cffafe", "#0e7490"], ["#fef9c3", "#a16207"],
];
export function categoryColor(cat) {
  if (CAT_COLORS[cat]) return CAT_COLORS[cat];
  let h = 0;
  for (const ch of String(cat)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CAT_PALETTE[h % CAT_PALETTE.length];
}

// 제목으로부터 카테고리 추론 (현재 데이터에 별도 카테고리 필드가 없어 제목에서 유도).
// 1) 맨 앞 대괄호/괄호 태그 → 그 값  예) "[큐티나눔] ..." → "큐티나눔"
// 2) 키워드 매칭(큐티나눔/과제/공지)  3) 그 외 "기타"
export function categorize(title) {
  const t = (title || "").trim();
  const m = t.match(/^[\[\(【]\s*([^\]\)】]+?)\s*[\]\)】]/);
  if (m) return m[1].trim();
  const norm = t.replace(/\s+/g, "");
  if (norm.includes("큐티나눔")) return "큐티나눔";
  if (norm.includes("과제")) return "과제";
  if (norm.includes("공지")) return "공지";
  return "기타";
}

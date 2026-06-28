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

// 달성률 → 색상 (기존 리포트 규칙)
export function rateColor(rate) {
  return rate >= 90 ? "#1a4fd8"
    : rate >= 70 ? "#1a8a3c"
    : rate >= 50 ? "#e07b00"
    : "#d93025";
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

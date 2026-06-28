// firebase-admin 초기화 (GitHub Actions 환경).
// 서비스 계정은 FIREBASE_SERVICE_ACCOUNT 시크릿으로 주입합니다.
//   - JSON 원문 또는 base64 인코딩 문자열 모두 허용합니다.
//   - base64 권장: GitHub Secret 에 붙여넣을 때 private_key 의 줄바꿈이
//     실제 개행으로 변형되어 JSON 파싱이 깨지는 문제를 원천 차단합니다.
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const DATABASE_URL =
  "https://jeja-pepero-default-rtdb.asia-southeast1.firebasedatabase.app";

// JSON 문자열 '안쪽(따옴표 사이)'에 들어간 raw 제어문자(진짜 줄바꿈/탭 등)를
// 올바른 이스케이프(\n, \r, \t)로 바꿔 깨진 JSON 을 복구. (구조용 공백은 건드리지 않음)
function repairControlCharsInStrings(s) {
  let out = "";
  let inStr = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === "\\") { out += ch; escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
    }
    out += ch;
  }
  return out;
}

/**
 * FIREBASE_SERVICE_ACCOUNT 를 객체로 파싱.
 * - base64 / 원문 JSON 모두 허용
 * - 붙여넣기 과정에서 private_key 줄바꿈이 깨진 JSON 도 자동 복구
 */
export function parseServiceAccount(raw) {
  if (!raw) {
    throw new Error(
      "환경변수 FIREBASE_SERVICE_ACCOUNT 가 없습니다. (서비스 계정 JSON/base64 시크릿 필요)"
    );
  }
  const trimmed = raw.trim();
  // '{' 로 시작하지 않으면 base64 로 간주하여 디코드
  let jsonStr = trimmed;
  if (!trimmed.startsWith("{")) {
    try {
      jsonStr = Buffer.from(trimmed, "base64").toString("utf8");
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT base64 디코드 실패: " + e.message);
    }
  }

  try {
    return JSON.parse(jsonStr);
  } catch (_) {
    // 깨진 줄바꿈 자동 복구 후 재시도
    try {
      return JSON.parse(repairControlCharsInStrings(jsonStr));
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT 파싱 실패: " + e.message);
    }
  }
}

export function initDb() {
  const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });
  return getDatabase();
}

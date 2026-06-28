// firebase-admin 초기화 (GitHub Actions 환경).
// 서비스 계정은 FIREBASE_SERVICE_ACCOUNT 시크릿으로 주입합니다.
//   - JSON 원문 또는 base64 인코딩 문자열 모두 허용합니다.
//   - base64 권장: GitHub Secret 에 붙여넣을 때 private_key 의 줄바꿈이
//     실제 개행으로 변형되어 JSON 파싱이 깨지는 문제를 원천 차단합니다.
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const DATABASE_URL =
  "https://jeja-pepero-default-rtdb.asia-southeast1.firebasedatabase.app";

/** FIREBASE_SERVICE_ACCOUNT(JSON 또는 base64)를 객체로 파싱. */
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
  } catch (e) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT JSON 파싱 실패: " + e.message +
        " (private_key 의 줄바꿈이 깨졌을 수 있습니다 → base64 인코딩으로 등록을 권장합니다)"
    );
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

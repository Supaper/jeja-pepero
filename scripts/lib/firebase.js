// firebase-admin 초기화 (GitHub Actions 환경).
// 서비스 계정 JSON 은 FIREBASE_SERVICE_ACCOUNT 시크릿(문자열)으로 주입합니다.
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const DATABASE_URL =
  "https://jeja-pepero-default-rtdb.asia-southeast1.firebasedatabase.app";

export function initDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "환경변수 FIREBASE_SERVICE_ACCOUNT 가 없습니다. (서비스 계정 JSON 시크릿 필요)"
    );
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT JSON 파싱 실패: " + e.message);
  }

  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });
  return getDatabase();
}

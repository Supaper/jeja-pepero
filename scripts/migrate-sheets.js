// 일회성: 기존 Google Sheets(멤버별 탭)의 데이터를 Firebase RTDB(/posts)로 이관.
//
// 시트 각 탭(멤버 이름)의 컬럼: [수집일시, 작성일, 제목, 링크]  (1행은 헤더)
//
// 준비:
//   1) 대상 스프레드시트를 서비스 계정 이메일(client_email)과 "공유"(보기 권한)
//   2) 환경변수
//        FIREBASE_SERVICE_ACCOUNT  서비스 계정 JSON (Sheets 읽기 + RTDB 쓰기에 공용 사용)
//        SPREADSHEET_ID            (선택) 기본값은 기존 스크립트의 ID
//        FORCE=1                   (선택) 이미 데이터가 있는 멤버도 덮어쓰기
//
// 실행:  cd scripts && npm install && FIREBASE_SERVICE_ACCOUNT='...' npm run migrate:sheets
import { google } from "googleapis";
import { initDb, parseServiceAccount } from "./lib/firebase.js";
import { TARGET_NAMES } from "./lib/scrape.js";

const SPREADSHEET_ID =
  process.env.SPREADSHEET_ID || "1REYNHKvoTqhre8j-Mqe2SoJBANcDmset-obY_VKaoQE";
const FORCE = process.env.FORCE === "1";

async function getSheetsClient() {
  const creds = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

async function main() {
  const db = initDb();
  const sheets = await getSheetsClient();

  let totalRows = 0;
  for (const name of TARGET_NAMES) {
    const postsRef = db.ref(`posts/${name}`);

    if (!FORCE) {
      const existing = await postsRef.get();
      if (existing.exists()) {
        console.log(`⏭️  ${name}: 이미 데이터 있음 → 건너뜀 (덮어쓰려면 FORCE=1)`);
        continue;
      }
    }

    let rows;
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${name}'!A2:D`,
      });
      rows = res.data.values || [];
    } catch (e) {
      console.warn(`⚠️  ${name}: 시트 읽기 실패(${e.message}) → 건너뜀`);
      continue;
    }

    if (rows.length === 0) {
      console.log(`–  ${name}: 데이터 없음`);
      continue;
    }

    if (FORCE) await postsRef.remove();

    let lastTitle = "";
    for (const r of rows) {
      const [collectedAt = "", postDate = "", title = "", link = ""] = r;
      if (!title) continue;
      await postsRef.push({ collectedAt, postDate, title, link });
      lastTitle = title; // 시트는 과거→현재 순 → 마지막이 최신
    }

    if (lastTitle) await db.ref(`state/${name}/lastTitle`).set(lastTitle);
    totalRows += rows.length;
    console.log(`✅ ${name}: ${rows.length}행 이관`);
  }

  console.log(`\n완료. 총 ${totalRows}행 이관.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

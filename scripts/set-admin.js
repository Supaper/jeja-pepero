// 지정한 이메일 계정에 관리자 커스텀 클레임(admin: true)을 부여/회수합니다.
// 부여 후 그 사용자는 다시 로그인(토큰 갱신)해야 적용됩니다.
//
// 환경변수:
//   ADMIN_EMAIL  대상 이메일 (Firebase Authentication 에 존재해야 함 = 한 번 로그인한 적 있어야 함)
//   REVOKE=1     (선택) 관리자 권한 회수
import { getAuth } from "firebase-admin/auth";
import { initDb } from "./lib/firebase.js";

async function main() {
  initDb(); // 기본 앱 초기화(서비스 계정)
  const email = process.env.ADMIN_EMAIL;
  const revoke = process.env.REVOKE === "1";
  if (!email) throw new Error("환경변수 ADMIN_EMAIL 이 필요합니다.");

  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (e) {
    throw new Error(
      `해당 이메일의 사용자를 찾을 수 없습니다(${email}). ` +
      `그 계정으로 웹에서 한 번 로그인한 뒤 다시 실행하세요.`
    );
  }

  await auth.setCustomUserClaims(user.uid, revoke ? {} : { admin: true });
  console.log(`${email} → admin ${revoke ? "회수" : "부여"} 완료. (해당 사용자는 재로그인 필요)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

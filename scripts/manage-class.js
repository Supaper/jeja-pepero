// 훈련 반(로그인 단위) 개설/수정/삭제 도구.
// 각 반은 Firebase Auth 이메일/비밀번호 계정 1개 + RTDB /classes/<id> 메타데이터로 구성됩니다.
// 반 로그인 이메일은 반 id 로부터 자동 생성됩니다(<id>@class.jeja-pepero.app) — js/auth.js 와 동일 규칙.
//
// 환경변수:
//   CLASS_ID        반 식별자(영소문자/숫자/-/_, 2~31자). 예: disciple11, ministry9   [필수]
//   CLASS_LABEL     화면에 보일 반 이름. 예: "제자 11기"                              [생성 시 권장]
//   CLASS_COURSE    과제 채점에 쓸 커리큘럼 id(js/assignments.js 의 COURSES id). 예: disciple11  [선택]
//   CLASS_PASSWORD  반 비밀번호(6자 이상). 생성 시 필수, 수정 시 주면 변경            [생성 필수]
//   ADMIN=1         이 계정을 '관리자'(전체 열람/관리)로 만듦. /classes 에는 넣지 않음  [선택]
//   DELETE=1        반 계정 + /classes 항목 삭제(멤버/글 기록은 유지)                  [선택]
import { getAuth } from "firebase-admin/auth";
import { initDb } from "./lib/firebase.js";

// js/auth.js 의 EMAIL_DOMAIN / ADMIN_CLASS_ID 와 반드시 동일하게 유지.
const EMAIL_DOMAIN = "class.jeja-pepero.app";
const ADMIN_CLASS_ID = "admin";
const classEmail = (id) => `${id}@${EMAIL_DOMAIN}`;

// 이메일 로컬파트로 안전한 slug (영소문자/숫자로 시작, - _ 허용)
const validId = (id) => /^[a-z0-9][a-z0-9_-]{1,30}$/.test(id);

async function main() {
  const db = initDb();
  const auth = getAuth();

  const id = (process.env.CLASS_ID || "").trim();
  const isAdmin = process.env.ADMIN === "1";
  const del = process.env.DELETE === "1";
  const label = (process.env.CLASS_LABEL || "").trim();
  const courseId = (process.env.CLASS_COURSE || "").trim();
  const password = process.env.CLASS_PASSWORD || "";

  if (!id) throw new Error("CLASS_ID 가 필요합니다.");
  if (!validId(id)) {
    throw new Error("CLASS_ID 는 영소문자/숫자로 시작하고 -,_ 만 허용, 2~31자여야 합니다. 예: disciple11, ministry9");
  }
  const email = classEmail(id);

  // ---- 삭제 ----
  if (del) {
    try {
      const u = await auth.getUserByEmail(email);
      await auth.deleteUser(u.uid);
      console.log(`계정 삭제: ${email}`);
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      console.log(`(계정 없음, 건너뜀: ${email})`);
    }
    if (!isAdmin && id !== ADMIN_CLASS_ID) {
      await db.ref(`classes/${id}`).remove();
      console.log(`/classes/${id} 제거`);
    }
    console.log(`✅ 삭제 완료: ${id} (멤버/글 기록은 유지됩니다)`);
    process.exit(0);
  }

  // ---- 생성 또는 갱신 ----
  let user;
  try {
    user = await auth.getUserByEmail(email);
    if (password) {
      if (password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다(Firebase 요건).");
      await auth.updateUser(user.uid, { password });
      console.log(`🔑 비밀번호 변경: ${id}`);
    } else {
      console.log(`(기존 계정 유지, 비밀번호 변경 없음: ${id})`);
    }
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    if (!password) throw new Error("새 계정 생성에는 CLASS_PASSWORD 가 필요합니다.");
    if (password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다(Firebase 요건).");
    user = await auth.createUser({ email, password, displayName: label || id });
    console.log(`🆕 계정 생성: ${email}`);
  }

  if (isAdmin) {
    await auth.setCustomUserClaims(user.uid, { admin: true });
    console.log(`👑 관리자 권한 부여: ${id} (해당 계정은 재로그인 필요)`);
  } else {
    const cref = db.ref(`classes/${id}`);
    const snap = await cref.get();
    const prev = snap.exists() ? snap.val() : {};
    await cref.update({
      label: label || prev.label || id,
      courseId: courseId || prev.courseId || "",
      active: true,
      createdAt: prev.createdAt || new Date().toISOString(),
    });
    console.log(`📚 반 정보 기록: ${id} (이름="${label || prev.label || id}", 커리큘럼=${courseId || prev.courseId || "(없음)"})`);
  }

  console.log(`✅ 완료: ${id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("에러:", e.message || e);
  process.exit(1);
});

// 로그인 = 훈련 반(class) 선택 + 반 비밀번호 (Firebase 이메일/비밀번호 인증).
// 각 반은 Firebase Auth 계정 하나에 대응하며, 이메일은 반 id 로부터 자동 생성됩니다
// (사용자는 이메일을 볼 필요 없이 '반 + 비밀번호'만 입력).
// 반 목록은 공개 노드 /classes 에서 읽어 드롭다운에 채웁니다(비밀번호는 여기 저장하지 않음
//  — Firebase Auth 가 보관). 관리자 계정은 커스텀 클레임 admin:true 를 가집니다.
//
// /classes 구조 (공개 읽기):
//   classes/<classId>: { label, courseId, active, createdAt }
//   예) classes/disciple11: { label: "제자 11기", courseId: "disciple11", active: true }
//
// 콘솔 설정: Authentication → 이메일/비밀번호 공급자 활성화. (README 참고)
//   계정 개설/비밀번호 설정은 관리 도구(Actions: manage-class)로 합니다.

import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 합성 이메일 도메인 (실제 메일 수신용이 아니라 Firebase 인증 식별자로만 사용).
const EMAIL_DOMAIN = "class.jeja-pepero.app";
// 관리자 전용 계정의 반 id (실제 반 목록 /classes 에는 넣지 않음).
export const ADMIN_CLASS_ID = "admin";

export function classEmail(classId) {
  return `${classId}@${EMAIL_DOMAIN}`;
}
function classIdFromEmail(email) {
  const s = String(email || "");
  const at = s.indexOf("@");
  return at > 0 ? s.slice(0, at) : "";
}

/** 공개 /classes 노드 로드 → [{ id, label, courseId, active }] (active 만, 이름순). */
export async function loadClasses() {
  const snap = await get(ref(db, "classes"));
  if (!snap.exists()) return [];
  const val = snap.val();
  return Object.entries(val)
    .map(([id, c]) => ({
      id,
      label: (c && c.label) || id,
      courseId: (c && c.courseId) || "",
      active: !(c && c.active === false),
    }))
    .filter((c) => c.active && c.id !== ADMIN_CLASS_ID)
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

// 로그인한 계정 → 프로필 { classId, admin, label } 로 변환.
async function buildProfile(user) {
  if (!user) return null;
  const classId = classIdFromEmail(user.email);
  let admin = false;
  try {
    const tok = await user.getIdTokenResult();
    admin = !!(tok.claims && tok.claims.admin === true);
  } catch (_) { /* 클레임 조회 실패는 일반 사용자로 처리 */ }

  let label = classId;
  if (admin) {
    label = "관리자";
  } else {
    try {
      const snap = await get(ref(db, `classes/${classId}/label`));
      if (snap.exists()) label = snap.val();
    } catch (_) { /* 라벨 조회 실패 시 id 사용 */ }
  }
  return { classId, admin, label };
}

/** 반 선택 + 비밀번호로 로그인. 성공 시 프로필 반환. */
export async function signInWithClass(classId, password) {
  if (!classId) throw new Error("반을 선택해주세요.");
  if (!password) throw new Error("비밀번호를 입력해주세요.");
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, classEmail(classId), password);
  } catch (e) {
    throw new Error(mapAuthError(e));
  }
  return buildProfile(cred.user);
}

export async function signOutUser() {
  await signOut(auth);
}

/**
 * 인증 상태 구독. 로그인 시 프로필, 아니면 null 을 콜백으로 전달.
 * (Firebase 기본 persistence: local → 새로고침해도 로그인 유지)
 */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { callback(null); return; }
    try {
      callback(await buildProfile(user));
    } catch (_) {
      callback(null);
    }
  });
}

function mapAuthError(e) {
  const code = e && e.code ? e.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "반 또는 비밀번호가 올바르지 않습니다.";
    case "auth/too-many-requests":
      return "로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.";
    case "auth/network-request-failed":
      return "네트워크 오류입니다. 연결을 확인해주세요.";
    case "auth/invalid-email":
      return "반 식별자가 올바르지 않습니다. 관리자에게 문의하세요.";
    case "auth/operation-not-allowed":
      return "이메일/비밀번호 로그인이 비활성화되어 있습니다. (콘솔에서 활성화 필요)";
    default:
      return "로그인에 실패했습니다. 다시 시도해주세요.";
  }
}

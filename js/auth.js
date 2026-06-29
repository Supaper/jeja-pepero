// 로그인 = Google 계정으로 인증(Firebase Authentication) 후,
// 그 이메일이 Realtime Database 의 /users 허용 명단에 있는지만 확인합니다.
// 비밀번호는 Google이 관리하므로 우리가 저장/검증하지 않습니다.
//
// /users 구조 (allowlist):
//   users/<key>: { email: "...", name: "...", admin: true|false }
//   예) users/admin001: { admin: true, email: "admin@example.com", name: "관리자" }
//
// 콘솔 설정: Authentication → Google 공급자 활성화,
//           Authentication → Settings → 승인된 도메인에 배포 도메인 추가. (README 참고)

import { auth, db } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function normEmail(v) {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * 인증된 이메일이 /users 허용 명단에 있는지 조회.
 * @returns {Promise<{key:string,email:string,name:string,admin:boolean}|null>}
 */
export async function findAllowedUser(email) {
  const target = normEmail(email);
  if (!target) return null;

  const snap = await get(ref(db, "users"));
  if (!snap.exists()) return null;

  const users = snap.val();
  const entries = Array.isArray(users)
    ? users.map((v, k) => [String(k), v])
    : Object.entries(users);

  for (const [key, val] of entries) {
    if (val == null || typeof val !== "object") continue;
    if (normEmail(val.email) === target) {
      return {
        key,
        email: target,
        name: val.name || val.email || key,
        admin: val.admin === true,
      };
    }
  }
  return null;
}

/**
 * Google 팝업으로 로그인하고 허용 명단까지 검증.
 * 명단에 없으면 즉시 로그아웃시키고 오류를 던집니다.
 */
export async function signInWithGoogle() {
  let cred;
  try {
    cred = await signInWithPopup(auth, provider);
  } catch (e) {
    throw new Error(mapAuthError(e));
  }

  const profile = await findAllowedUser(cred.user.email);
  if (!profile) {
    await signOut(auth);
    throw new Error(
      `접근 권한이 없는 계정입니다 (${cred.user.email}). 관리자에게 문의하세요.`
    );
  }
  return profile;
}

export async function signOutUser() {
  await signOut(auth);
}

/**
 * 인증 상태를 구독. 로그인 + 허용 명단 통과 시 profile, 아니면 null 을 콜백으로 전달.
 * 명단에 없는 인증 사용자는 자동 로그아웃됩니다.
 */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    try {
      const profile = await findAllowedUser(user.email);
      if (profile) {
        callback(profile);
      } else {
        await signOut(auth);
        callback(null);
      }
    } catch (_) {
      callback(null);
    }
  });
}

function mapAuthError(e) {
  const code = e && e.code ? e.code : "";
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "로그인 창이 닫혔습니다. 다시 시도해주세요.";
    case "auth/popup-blocked":
      return "팝업이 차단되었습니다. 브라우저 팝업 차단을 해제해주세요.";
    case "auth/unauthorized-domain":
      return "이 도메인은 Firebase 승인된 도메인에 등록되어 있지 않습니다.";
    case "auth/network-request-failed":
      return "네트워크 오류입니다. 연결을 확인해주세요.";
    default:
      return "로그인에 실패했습니다. 다시 시도해주세요.";
  }
}

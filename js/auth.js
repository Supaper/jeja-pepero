// 로그인 = Firebase Authentication(이메일/비밀번호)으로 인증한 뒤,
// 그 이메일이 Realtime Database 의 /users 허용 명단에 있는지 확인합니다.
//
// /users 구조 (allowlist, 비밀번호 없음):
//   users/<key>: { email: "...", name: "...", admin: true|false }
//   예) users/admin001: { admin: true, email: "tnwhd0713@gmail.com", name: "한수종" }
//
// 비밀번호는 Firebase Authentication이 관리합니다.
//   → 콘솔에서 Email/Password 공급자 활성화 + 해당 이메일 사용자 추가 필요. (README 참고)

import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
 * 이메일/비밀번호로 로그인하고 허용 명단까지 검증.
 * 명단에 없으면 즉시 로그아웃시키고 오류를 던집니다.
 */
export async function signIn(email, password) {
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (e) {
    throw new Error(mapAuthError(e));
  }

  const profile = await findAllowedUser(cred.user.email);
  if (!profile) {
    await signOut(auth);
    throw new Error("접근 권한이 없는 계정입니다. 관리자에게 문의하세요.");
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
    case "auth/invalid-email":
      return "이메일 형식이 올바르지 않습니다.";
    case "auth/user-disabled":
      return "비활성화된 계정입니다.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "auth/too-many-requests":
      return "시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
    case "auth/network-request-failed":
      return "네트워크 오류입니다. 연결을 확인해주세요.";
    default:
      return "로그인에 실패했습니다. 다시 시도해주세요.";
  }
}

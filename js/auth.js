// Realtime Database 의 /users 노드를 기준으로 로그인을 검증합니다.
//
// ⚠️ 보안 안내
//   이 방식은 클라이언트가 /users 노드를 직접 읽어 비밀번호를 비교합니다.
//   소규모 그룹 운영에는 충분하지만, 비밀번호가 평문으로 노출될 수 있으므로
//   장기적으로는 Firebase Authentication(이메일/비밀번호) 전환을 권장합니다.
//   또한 /users 노드의 read 권한은 보안 규칙으로 최소화해야 합니다. (README 참고)
//
// 지원하는 /users 데이터 형태 (필드명은 아래 후보 중 자동 인식):
//   1) users/<key>: { email|id|username: "...", password|pw: "...", name?: "..." }
//   2) users/<아이디>: "<비밀번호>"   (키가 곧 아이디, 값이 비밀번호)
//   3) 위 형태들의 배열

import { db } from "./firebase-config.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const SESSION_KEY = "jeja_pepero_session";

// 필드명이 프로젝트마다 다를 수 있어 후보를 폭넓게 인식
const ID_FIELDS = ["email", "id", "username", "userId", "userid", "loginId"];
const PW_FIELDS = ["password", "pw", "pwd", "pass"];
const NAME_FIELDS = ["name", "displayName", "이름", "nickname"];

function pick(obj, fields) {
  for (const f of fields) {
    if (obj && obj[f] != null && obj[f] !== "") return String(obj[f]);
  }
  return null;
}

function normId(v) {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * /users 노드에서 아이디/비밀번호가 일치하는 사용자를 찾습니다.
 * @returns {Promise<{key:string,id:string,name:string,profile:object}>}
 * @throws  로그인 실패 시 사용자 메시지를 담은 Error
 */
export async function login(idInput, pwInput) {
  const id = normId(idInput);
  const pw = String(pwInput ?? "");

  let snap;
  try {
    snap = await get(ref(db, "users"));
  } catch (e) {
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }

  if (!snap.exists()) throw new Error("등록된 사용자가 없습니다.");

  const users = snap.val();
  const entries = Array.isArray(users)
    ? users.map((v, k) => [String(k), v])
    : Object.entries(users);

  for (const [key, val] of entries) {
    if (val == null) continue;

    let candidateIds, candidatePw, profile;
    if (typeof val === "object") {
      profile = val;
      candidatePw = pick(val, PW_FIELDS);
      candidateIds = [pick(val, ID_FIELDS), key].filter(Boolean).map(normId);
    } else {
      // 값 자체가 비밀번호, 키가 아이디인 형태
      profile = { id: key };
      candidatePw = String(val);
      candidateIds = [normId(key)];
    }

    const idMatch = candidateIds.includes(id);
    const pwMatch = candidatePw != null && candidatePw === pw;

    if (idMatch && pwMatch) {
      const name = pick(profile, NAME_FIELDS) || pick(profile, ID_FIELDS) || key;
      const session = { key, id: candidateIds[0], name, profile };
      saveSession(session);
      return session;
    }
  }

  throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
}

export function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch (_) {
    return null;
  }
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

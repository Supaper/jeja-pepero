// /members 가 비어 있으면 기존 명단(DEFAULT_MEMBERS)으로 1회 시드.
// FORCE=1 이면 기존 값이 있어도 기본 명단을 덮어씀(없는 멤버 추가, 기존 유지).
import { initDb } from "./lib/firebase.js";
import { DEFAULT_MEMBERS } from "./lib/members.js";

const FORCE = process.env.FORCE === "1";

async function main() {
  const db = initDb();
  const ref = db.ref("members");
  const snap = await ref.get();

  if (snap.exists() && !FORCE) {
    console.log("이미 /members 가 존재합니다. 건너뜀 (덮어쓰려면 FORCE=1)");
    process.exit(0);
  }

  let n = 0;
  for (const m of DEFAULT_MEMBERS) {
    const cur = snap.exists() ? snap.child(m.name).val() : null;
    if (cur && !FORCE) continue;
    await ref.child(m.name).set({
      name: m.name,
      qt: m.qt,
      active: true,
      createdAt: new Date().toISOString(),
    });
    n++;
  }
  console.log(`멤버 시드 완료: ${n}명 기록`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

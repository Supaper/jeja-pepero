// /posts/<이름> 에서 같은 글(num 중복)을 제거하고 멤버당 1건만 남깁니다.
// 본문(content)이 있는 항목을 우선 보존. MEMBER=이름 으로 특정 멤버만 가능.
import { initDb } from "./lib/firebase.js";
import { loadMembers } from "./lib/members.js";
import { postNum } from "./lib/scrape.js";

async function dedupeMember(db, name) {
  const ref = db.ref(`posts/${name}`);
  const snap = await ref.get();
  if (!snap.exists()) return 0;

  const byNum = new Map(); // num -> [{key, hasContent}]
  for (const [key, v] of Object.entries(snap.val())) {
    const num = postNum(v && v.link) || `__${key}`; // num 없으면 고유 취급(삭제 안 함)
    if (!byNum.has(num)) byNum.set(num, []);
    byNum.get(num).push({ key, hasContent: !!(v && v.content) });
  }

  const updates = {};
  let removed = 0;
  for (const [num, items] of byNum) {
    if (items.length <= 1) continue;
    // 본문 있는 항목 우선, 그 다음 key 사전순으로 1개 보존
    items.sort((a, b) => (b.hasContent - a.hasContent) || a.key.localeCompare(b.key));
    for (const it of items.slice(1)) { updates[it.key] = null; removed++; }
  }
  if (removed > 0) await ref.update(updates);
  console.log(`${name}: 중복 ${removed}건 제거`);
  return removed;
}

async function main() {
  const db = initDb();
  const names = process.env.MEMBER
    ? [process.env.MEMBER]
    : (await loadMembers(db)).map((m) => m.name);

  let total = 0;
  for (const name of names) total += await dedupeMember(db, name);
  console.log(`\n완료. 총 중복 ${total}건 제거.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

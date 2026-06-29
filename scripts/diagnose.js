// 데이터 진단: /posts 의 월 분포, 과거(2026 이전) 글, num 중복을 출력만 합니다(쓰기 없음).
import { initDb } from "./lib/firebase.js";
import { loadMembers } from "./lib/members.js";
import { postNum } from "./lib/scrape.js";

async function main() {
  const db = initDb();
  const members = await loadMembers(db);

  const monthTotals = {}; // "YYYY-MM" -> count
  const oldSamples = []; // postDate < 2026 인 글 샘플
  let totalPosts = 0;
  let dupTotal = 0;

  for (const m of members) {
    const snap = await db.ref(`posts/${m.name}`).get();
    if (!snap.exists()) continue;
    const entries = Object.values(snap.val());
    totalPosts += entries.length;

    const numCounts = new Map();
    for (const p of entries) {
      const pd = String((p && p.postDate) || "");
      const mm = pd.match(/^(\d{4})\.(\d{2})/);
      if (mm) {
        const ym = `${mm[1]}-${mm[2]}`;
        monthTotals[ym] = (monthTotals[ym] || 0) + 1;
        if (mm[1] < "2026" && oldSamples.length < 40) {
          oldSamples.push(`${m.name} | ${pd} | ${(p.title || "").slice(0, 40)} | ${p.link || ""}`);
        }
      } else {
        monthTotals["(무효)"] = (monthTotals["(무효)"] || 0) + 1;
        if (oldSamples.length < 40) oldSamples.push(`${m.name} | [${pd}] | ${(p.title || "").slice(0, 40)}`);
      }
      const num = postNum(p && p.link);
      if (num) numCounts.set(num, (numCounts.get(num) || 0) + 1);
    }
    let dup = 0;
    for (const c of numCounts.values()) if (c > 1) dup += c - 1;
    if (dup) { dupTotal += dup; console.log(`중복(num): ${m.name} +${dup}`); }
  }

  console.log(`\n총 글 수: ${totalPosts}, 멤버: ${members.length}`);
  console.log(`\n=== 월별 글 분포 (postDate 기준) ===`);
  for (const ym of Object.keys(monthTotals).sort()) {
    console.log(`  ${ym}: ${monthTotals[ym]}`);
  }
  console.log(`\n=== 2026 이전 / 무효 postDate 샘플 (최대 40건) ===`);
  for (const s of oldSamples) console.log("  " + s);
  console.log(`\nnum 중복 합계: ${dupTotal}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

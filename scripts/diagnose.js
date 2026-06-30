// 데이터 진단(출력 전용).
// 기본: 카테고리(앞 태그) 분포.
// DAY=YYYY-MM-DD 지정 시: 그날(KST) collectedAt 된 글의 작성일(postDate) 분포와 샘플을 덤프.
import { initDb } from "./lib/firebase.js";
import { loadMembers } from "./lib/members.js";

function tagOf(title) {
  const m = String(title || "").trim().match(/^[\[\(【]\s*([^\]\)】]+?)\s*[\]\)】]/);
  return m ? m[1].trim() : "(없음)";
}
function kstDateStr(date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(date);
}

async function main() {
  const db = initDb();
  const members = await loadMembers(db);
  const DAY = process.env.DAY && /^\d{4}-\d{2}-\d{2}$/.test(process.env.DAY) ? process.env.DAY : "";

  const catCounts = {};
  const byPostDate = {}; // DAY 모드: 작성일 -> count
  const samples = [];
  let dayTotal = 0;

  for (const m of members) {
    const snap = await db.ref(`posts/${m.name}`).get();
    if (!snap.exists()) continue;
    for (const p of Object.values(snap.val())) {
      const title = (p && p.title) || "";
      if (!title) continue;
      catCounts[tagOf(title)] = (catCounts[tagOf(title)] || 0) + 1;

      if (DAY && p.collectedAt && kstDateStr(new Date(p.collectedAt)) === DAY) {
        dayTotal++;
        const pd = String(p.postDate || "").slice(0, 10);
        byPostDate[pd] = (byPostDate[pd] || 0) + 1;
        if (samples.length < 30) samples.push(`${m.name} | 작성 ${pd} | ${title.slice(0, 42)}`);
      }
    }
  }

  console.log("=== 카테고리(앞 태그) 분포 ===");
  for (const [k, v] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

  if (DAY) {
    console.log(`\n=== ${DAY}(KST) 에 collectedAt 된 글 ${dayTotal}건 · 작성일(postDate) 분포 ===`);
    for (const d of Object.keys(byPostDate).sort()) console.log(`  ${d}: ${byPostDate[d]}`);
    console.log(`\n--- 샘플(최대 30건) ---`);
    for (const s of samples) console.log("  " + s);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

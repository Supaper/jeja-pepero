// 데이터 진단(출력 전용): 카테고리 분포 + [훈련나눔] 글 제목 덤프.
// 과제 자동 매칭 규칙 설계를 위해 실제 제목 형식을 확인하는 용도.
import { initDb } from "./lib/firebase.js";
import { loadMembers } from "./lib/members.js";

// 제목 맨 앞 [태그]/(태그) 추출
function tagOf(title) {
  const m = String(title || "").trim().match(/^[\[\(【]\s*([^\]\)】]+?)\s*[\]\)】]/);
  return m ? m[1].trim() : "(없음)";
}

async function main() {
  const db = initDb();
  const members = await loadMembers(db);

  const catCounts = {};
  const trainingTitles = []; // 훈련나눔 글

  for (const m of members) {
    const snap = await db.ref(`posts/${m.name}`).get();
    if (!snap.exists()) continue;
    for (const p of Object.values(snap.val())) {
      const title = (p && p.title) || "";
      if (!title) continue;
      const tag = tagOf(title);
      catCounts[tag] = (catCounts[tag] || 0) + 1;
      const norm = title.replace(/\s+/g, "");
      if (norm.includes("훈련나눔")) {
        trainingTitles.push(`${m.name} | ${(p.postDate || "").slice(0, 10)} | ${title}`);
      }
    }
  }

  console.log(`=== 카테고리(앞 태그) 분포 ===`);
  for (const [k, v] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  trainingTitles.sort();
  console.log(`\n=== [훈련나눔] 글 제목 (총 ${trainingTitles.length}건) ===`);
  for (const t of trainingTitles) console.log("  " + t);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

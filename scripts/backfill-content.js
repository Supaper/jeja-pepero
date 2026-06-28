// 기존에 수집된 글(/posts/<이름>/<key>)에 본문(content)을 채워 넣습니다.
// 상세페이지를 서버에서 가져와 텍스트를 추출해 저장 → 웹앱 모달에서 인라인 표시.
//
// 모드:
//   PROBE=1  : 첫 글 1건의 상세 구조만 로그로 출력(저장 안 함). 본문 컨테이너 확인용.
//   기본     : content 없는 글에 본문 추출·저장. FORCE=1 이면 기존 content 도 덮어씀.
//   LIMIT=n  : 처리 최대 건수(테스트용).
import { initDb } from "./lib/firebase.js";
import { TARGET_NAMES, fetchPostContent, probeDetail } from "./lib/scrape.js";

const PROBE = process.env.PROBE === "1";
const FORCE = process.env.FORCE === "1";
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = initDb();

  if (PROBE) {
    for (const name of TARGET_NAMES) {
      const snap = await db.ref(`posts/${name}`).get();
      if (!snap.exists()) continue;
      const entries = Object.entries(snap.val());
      const withLink = entries.find(([, v]) => v && v.link);
      if (!withLink) continue;
      const link = withLink[1].link;
      console.log(`PROBE 대상: ${name} → ${link}`);
      const info = await probeDetail(link);
      console.log("htmlLen:", info.htmlLen);
      console.log("본문 후보(텍스트 길이순):");
      for (const c of info.top) {
        console.log(`  <${c.tag}> id="${c.id}" class="${c.cls}" len=${c.len} kids=${c.kids}`);
      }
      process.exit(0);
    }
    console.log("PROBE: 링크가 있는 글을 찾지 못했습니다.");
    process.exit(0);
  }

  let processed = 0;
  let filled = 0;
  for (const name of TARGET_NAMES) {
    const ref = db.ref(`posts/${name}`);
    const snap = await ref.get();
    if (!snap.exists()) continue;

    for (const [key, post] of Object.entries(snap.val())) {
      if (processed >= LIMIT) break;
      if (!post || !post.link) continue;
      if (post.content && !FORCE) continue;
      processed++;
      try {
        const content = await fetchPostContent(post.link);
        if (content) {
          await ref.child(key).update({ content });
          filled++;
        }
        await sleep(400); // 서버 부하 방지
      } catch (e) {
        console.error(`${name}/${key} 실패:`, e.message);
      }
    }
    console.log(`${name} 처리 중… (누적 ${filled}/${processed} 본문 저장)`);
    if (processed >= LIMIT) break;
  }

  console.log(`완료. 본문 저장 ${filled}건 / 시도 ${processed}건`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

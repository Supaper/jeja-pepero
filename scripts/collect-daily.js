// 일일 게시물 수집 (monitorDailyCollectionOnly 이식판).
// 게시판을 스크래핑해 신규 글을 Firebase RTDB(/posts/<이름>)에 기록합니다.
// 결과는 웹 대시보드에서 확인합니다(이메일 발송 없음). 중복 방지 기준점은 /state/<이름>/lastTitle.
import { initDb } from "./lib/firebase.js";
import { loadMembers } from "./lib/members.js";
import {
  START_DATE_STRING,
  fetchPosts,
  fetchPostContent,
} from "./lib/scrape.js";

function nowKst() {
  // Asia/Seoul 기준 "yyyy-MM-dd HH:mm:ss"
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date());
  return parts.replace("T", " ");
}

async function main() {
  const db = initDb();
  const checkedAt = nowKst();
  const members = (await loadMembers(db)).filter((m) => m.active);

  let totalNew = 0;

  for (const member of members) {
    const name = member.name;
    try {
      const { posts, firstTitle } = await fetchPosts(name);

      const stateRef = db.ref(`state/${name}/lastTitle`);
      const lastTitle = (await stateRef.get()).val() || "";

      const fresh = [];
      for (const post of posts) {
        if (post.date < START_DATE_STRING) continue;
        if (post.title === lastTitle) break;
        fresh.push(post);
      }

      if (fresh.length > 0) {
        fresh.reverse(); // 과거 → 현재 순으로 기록
        totalNew += fresh.length;

        const postsRef = db.ref(`posts/${name}`);
        for (const post of fresh) {
          let content = "";
          try {
            content = await fetchPostContent(post.link);
          } catch (_) { /* 본문 실패는 무시(제목/링크는 저장) */ }
          await postsRef.push({
            collectedAt: checkedAt,
            postDate: post.date,
            title: post.title,
            link: post.link,
            content,
          });
        }
      }

      // 기준점 최신화 (새 글 유무와 무관, 공지로 밀리는 것 방지)
      if (firstTitle && firstTitle !== lastTitle) {
        await stateRef.set(firstTitle);
      }

      // 서버 부하 방지
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`${name} 처리 중 에러:`, e.message);
    }
  }

  if (totalNew > 0) {
    console.log(`총 ${totalNew}건 수집 완료`);
  } else {
    console.log("새로 수집된 게시물이 없습니다.");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

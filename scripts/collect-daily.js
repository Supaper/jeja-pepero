// 일일 게시물 수집 (monitorDailyCollectionOnly 이식판).
// 게시판을 스크래핑해 신규 글을 Firebase RTDB(/posts/<이름>)에 기록하고,
// 신규 글이 있으면 알림 이메일을 보냅니다. 중복 방지 기준점은 /state/<이름>/lastTitle.
import { initDb } from "./lib/firebase.js";
import { sendMail } from "./lib/mailer.js";
import {
  TARGET_NAMES,
  START_DATE_STRING,
  fetchPosts,
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

  let emailBody = "";
  let totalNew = 0;

  for (const name of TARGET_NAMES) {
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

        emailBody += `<h3 style="color:#2c3e50; margin-bottom:5px;">[${name}] 새 글 ${fresh.length}건</h3><ul style="margin-top:0;">`;
        const postsRef = db.ref(`posts/${name}`);
        for (const post of fresh) {
          await postsRef.push({
            collectedAt: checkedAt,
            postDate: post.date,
            title: post.title,
            link: post.link,
          });
          emailBody += `<li>(${post.date}) <a href="${post.link}" style="text-decoration:none; color:#1a73e8;">${post.title}</a></li>`;
        }
        emailBody += `</ul><hr style="border:0; border-top:1px solid #eee; margin:15px 0;">`;
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
    await sendMail({
      subject: `📅 신규 게시물 수집 알림 (${totalNew}건)`,
      html:
        `<div style="font-family:sans-serif; padding:10px;">` +
        `<h2 style="color:#333;">📅 신규 게시물 수집 결과</h2>` +
        `<p style="color:#666;">오늘 수집되어 기록된 게시물 목록입니다.</p><br>` +
        emailBody +
        `</div>`,
    });
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

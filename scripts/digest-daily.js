// 일일 요약 이메일: 오늘(KST) 수집된 신규 글을 한 통으로 묶어 발송.
// 수집(collect-daily)은 자주 돌며 RTDB에만 저장하고, 이메일은 이 스크립트가 하루 1회 담당.
import { initDb } from "./lib/firebase.js";
import { sendMail } from "./lib/mailer.js";
import { TARGET_NAMES } from "./lib/scrape.js";

function todayKst() {
  // "yyyy-MM-dd" (Asia/Seoul)
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function main() {
  const db = initDb();
  const day = todayKst();

  let body = "";
  let total = 0;

  for (const name of TARGET_NAMES) {
    const snap = await db.ref(`posts/${name}`).get();
    if (!snap.exists()) continue;

    const todays = Object.values(snap.val())
      .filter((p) => p && p.title && String(p.collectedAt || "").slice(0, 10) === day)
      .sort((a, b) => String(a.postDate || "").localeCompare(String(b.postDate || "")));

    if (todays.length === 0) continue;
    total += todays.length;

    body += `<h3 style="color:#2c3e50; margin-bottom:5px;">[${esc(name)}] ${todays.length}건</h3><ul style="margin-top:0;">`;
    for (const p of todays) {
      body += `<li>(${esc(p.postDate || "")}) <a href="${esc(p.link || "#")}" style="text-decoration:none; color:#1a73e8;">${esc(p.title)}</a></li>`;
    }
    body += `</ul><hr style="border:0; border-top:1px solid #eee; margin:15px 0;">`;
  }

  if (total === 0) {
    console.log(`${day}: 오늘 수집된 신규 글이 없어 이메일을 보내지 않습니다.`);
    process.exit(0);
  }

  await sendMail({
    subject: `📅 [일일 요약] ${day} 신규 게시물 ${total}건`,
    html:
      `<div style="font-family:sans-serif; padding:10px;">` +
      `<h2 style="color:#333;">📅 ${day} 신규 게시물 요약</h2>` +
      `<p style="color:#666;">오늘 하루 수집된 게시물 목록입니다.</p><br>` +
      body +
      `</div>`,
  });
  console.log(`${day}: 총 ${total}건 요약 이메일 발송`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// 일일 요약 이메일: 대상 날짜(KST)에 수집된 신규 글을 한 통으로 발송.
// 수집(collect-daily)은 자주 돌며 RTDB에만 저장하고, 이메일은 이 스크립트가 하루 1회 담당.
//
// 대상 날짜 결정(예약 지연·자정 넘김에 강건):
//   - 기본은 "지금(KST)" 날짜.
//   - 단, 실행 시각이 KST 00:00~11:59 이면(예약 23:50가 자정 넘겨 밀린 경우) "전날"로 간주.
//   - DIGEST_DAY=YYYY-MM-DD 로 특정 날짜를 강제 발송할 수 있음(수동 재발송용).
// 글의 collectedAt 도 KST 날짜로 변환해 비교(UTC 슬라이스 비교의 오차 제거).
import { initDb } from "./lib/firebase.js";
import { sendMail } from "./lib/mailer.js";
import { loadMembers } from "./lib/members.js";

function kstDateStr(date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(date);
}
function kstHour(date) {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(date);
  return parseInt(s, 10) % 24;
}

// 발송 대상 KST 날짜 계산
function resolveTargetDay() {
  if (process.env.DIGEST_DAY && /^\d{4}-\d{2}-\d{2}$/.test(process.env.DIGEST_DAY)) {
    return process.env.DIGEST_DAY;
  }
  const now = new Date();
  if (kstHour(now) < 12) {
    // 자정~정오 실행(예약 지연 포함) → 전날 디제스트로 간주
    return kstDateStr(new Date(now.getTime() - 24 * 3600 * 1000));
  }
  return kstDateStr(now);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function main() {
  const db = initDb();
  const day = resolveTargetDay();
  const names = (await loadMembers(db)).filter((m) => m.active).map((m) => m.name);

  let body = "";
  let total = 0;

  for (const name of names) {
    const snap = await db.ref(`posts/${name}`).get();
    if (!snap.exists()) continue;

    const todays = Object.values(snap.val())
      .filter((p) => {
        if (!p || !p.title || !p.collectedAt) return false;
        return kstDateStr(new Date(p.collectedAt)) === day;
      })
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
    console.log(`${day}: 수집된 신규 글이 없어 이메일을 보내지 않습니다.`);
    process.exit(0);
  }

  await sendMail({
    subject: `📅 [일일 요약] ${day} 신규 게시물 ${total}건`,
    html:
      `<div style="font-family:sans-serif; padding:10px;">` +
      `<h2 style="color:#333;">📅 ${day} 신규 게시물 요약</h2>` +
      `<p style="color:#666;">${day} 하루 수집된 게시물 목록입니다.</p><br>` +
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

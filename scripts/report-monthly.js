// 월간 큐티 리포트 (sendMonthlyQTReport 이식판).
// RTDB(/posts/<이름>)에 쌓인 "큐티나눔" 글 제목에서 날짜를 분석해
// 지난달 큐티 완주 현황을 집계하고 이메일로 발송합니다.
import { initDb } from "./lib/firebase.js";
import { sendMail } from "./lib/mailer.js";
import { loadMembers } from "./lib/members.js";
import { extractQtDays } from "./lib/scrape.js";

async function main() {
  const db = initDb();

  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = lastMonth.getFullYear();
  const month = lastMonth.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const qtNames = (await loadMembers(db)).filter((m) => m.qt).map((m) => m.name);
  const reportData = [];

  const manualPrefix = `${year}-${String(month).padStart(2, "0")}-`;

  for (const name of qtNames) {
    const snap = await db.ref(`posts/${name}`).get();
    const uniqueDays = new Set();

    if (snap.exists()) {
      const posts = snap.val();
      for (const key of Object.keys(posts)) {
        const title = (posts[key]?.title || "").toString();
        if (title.replace(/\s+/g, "").indexOf("큐티나눔") === -1) continue;
        for (const day of extractQtDays(title, year, month, daysInMonth)) {
          uniqueDays.add(day);
        }
      }
    }

    // 웹 대시보드와 동일하게 수동 완주일(qtManual/<이름>/<YYYY-MM-DD>=true)도 반영
    const manualSnap = await db.ref(`qtManual/${name}`).get();
    if (manualSnap.exists()) {
      const manual = manualSnap.val();
      for (const key of Object.keys(manual)) {
        if (!manual[key] || !key.startsWith(manualPrefix)) continue;
        const day = parseInt(key.slice(manualPrefix.length), 10);
        if (day >= 1 && day <= daysInMonth) uniqueDays.add(day);
      }
    }

    const count = uniqueDays.size;
    const numRate = (count / daysInMonth) * 100;
    reportData.push({ name, count, numRate, rateText: numRate.toFixed(1) });
  }

  // 달성률 내림차순, 동률 시 이름 가나다순
  reportData.sort((a, b) =>
    b.numRate !== a.numRate ? b.numRate - a.numRate : a.name.localeCompare(b.name, "ko")
  );

  let html = `<h3>📊 ${year}년 ${month}월 큐티 완주 현황</h3>`;
  html += `<table border="1" style="border-collapse:collapse; text-align:center; width:400px; font-family:sans-serif;">`;
  html += `<tr style="background-color:#eeeeee;"><th style="padding:10px; width:25%;">성함</th><th style="padding:10px; width:45%;">지난달 큐티 횟수</th><th style="padding:10px; width:30%;">월 달성률 (%)</th></tr>`;

  for (const item of reportData) {
    const color =
      item.numRate >= 90 ? "#0000FF"
      : item.numRate >= 70 ? "#008000"
      : item.numRate >= 50 ? "#FF8C00"
      : "#FF0000";
    html += `<tr><td style="padding:10px;">${item.name}</td>`;
    html += `<td style="padding:10px;">${item.count} / ${daysInMonth}</td>`;
    html += `<td style="color:${color}; font-weight:bold; padding:10px;">${item.rateText}%</td></tr>`;
  }
  html += `</table><br><p style="font-size:13px; color:#555;">※ 제목의 날짜를 자동 분석하고 수동 완주일을 더해 중복 없이 달성도 순으로 집계했습니다.</p>`;

  await sendMail({
    subject: `[월간리포트] ${year}년 ${month}월 큐티 통계 결과`,
    html,
  });

  console.log(`${year}년 ${month}월 리포트 처리 완료`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

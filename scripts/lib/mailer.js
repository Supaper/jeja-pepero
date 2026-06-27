// 이메일 발송 (Gmail SMTP). 시크릿:
//   MAIL_USERNAME      보내는 Gmail 주소
//   MAIL_PASSWORD      Gmail 앱 비밀번호 (2단계 인증 후 발급)
//   MAIL_TO            받는 사람 (없으면 MAIL_USERNAME 으로)
import nodemailer from "nodemailer";

export async function sendMail({ subject, html }) {
  const user = process.env.MAIL_USERNAME;
  const pass = process.env.MAIL_PASSWORD;
  const to = process.env.MAIL_TO || user;

  if (!user || !pass) {
    console.warn("⚠️ MAIL_USERNAME/MAIL_PASSWORD 미설정 — 이메일 발송을 건너뜁니다.");
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({ from: user, to, subject, html });
  console.log(`📧 이메일 발송 완료 → ${to}`);
  return true;
}

// Firebase 초기화 (브라우저 ESM / CDN)
// apiKey 등 웹 설정값은 클라이언트에 공개되도록 설계된 값입니다.
// 실제 접근 제어는 Firebase 보안 규칙으로 거는 것이 원칙입니다. (README 참고)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDC9kWyETyRboX_L2Q8ulBBsB2p1ahNOQs",
  authDomain: "jeja-pepero.firebaseapp.com",
  databaseURL: "https://jeja-pepero-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jeja-pepero",
  storageBucket: "jeja-pepero.firebasestorage.app",
  messagingSenderId: "947929554171",
  appId: "1:947929554171:web:4603968635256f9edd245e",
  measurementId: "G-JHW048LDN3",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Analytics는 선택 사항이며, 일부 환경(localhost/비HTTPS)에서 실패할 수 있어 로그인 흐름과 분리합니다.
(async () => {
  try {
    const { getAnalytics, isSupported } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js"
    );
    if (await isSupported()) getAnalytics(app);
  } catch (_) {
    /* analytics 미지원 환경은 조용히 무시 */
  }
})();

export { app, db };

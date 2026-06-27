// Firebase 웹 앱 설정.
//
// 주의: 이 값들(apiKey 포함)은 "비밀"이 아니다. Firebase 웹 config는 클라이언트에
// 노출되도록 설계된 공개 식별자이므로 레포에 커밋해도 된다.
// 실제 접근 제어는 firestore.rules(허용목록)에서 강제한다.
//
// 절대 여기에 넣으면 안 되는 것: 서비스계정 키(Admin SDK), 카카오 토큰 등.
export const firebaseConfig = {
  apiKey: "AIzaSyDC9kWyETyRboX_L2Q8ulBBsB2p1ahNOQs",
  authDomain: "jeja-pepero.firebaseapp.com",
  projectId: "jeja-pepero",
  storageBucket: "jeja-pepero.firebasestorage.app",
  messagingSenderId: "947929554171",
  appId: "1:947929554171:web:4603968635256f9edd245e",
  measurementId: "G-JHW048LDN3",
};

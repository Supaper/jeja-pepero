# web/ — 정적 대시보드 (로그인 게이트 + 글 열람)

GitHub Pages에 올라가는 정적 프론트입니다. Firebase Auth(구글 로그인)로 인증하고,
`users` 허용목록에 등록된 계정만 Firestore의 데이터를 열람합니다.

## 구성
- `index.html` — 로그인/권한없음/대시보드 뷰
- `app.js` — Firebase 초기화·인증·Firestore 로드 (CDN 모듈 SDK 사용, 빌드 불필요)
- `firebase-config.js` — 웹 config (공개 식별자, 비밀 아님)
- `style.css`

> 접근 제어의 실제 강제는 레포 루트 `firestore.rules`다. 이 화면의 redirect는 UX 보조일 뿐이다.

## 배포 (GitHub Pages)
1. 레포 **Settings → Pages → Source** 를 **GitHub Actions** 로 설정.
2. `main`에 머지되면 `.github/workflows/deploy-pages.yml`가 `web/`를 배포한다.
3. 배포 URL(`https://<owner>.github.io/<repo>/`)을 Firebase 콘솔
   **Authentication → Settings → 승인된 도메인**에 추가한다. (구글 로그인 허용)

## 사전 준비 (Firebase 콘솔)
1. **Authentication → Sign-in method → Google** 사용 설정.
2. **Firestore Database** 생성.
3. `firestore.rules` 배포: `firebase deploy --only firestore:rules`
   (또는 콘솔 Rules 탭에 붙여넣기)
4. **허용목록 등록**: `users` 컬렉션에 문서 ID = 이메일로 추가
   예) 문서 `users/me@example.com` → `{ name: "...", role: "admin" }`

## 로컬 미리보기
```
cd web && python3 -m http.server 8080   # http://localhost:8080
```
구글 로그인 팝업을 쓰려면 `localhost`를 Firebase 승인된 도메인에 추가하세요.
(데이터가 비어 있으면 "표시할 글이 없습니다"가 정상 — 수집기는 Phase 1에서 구현)

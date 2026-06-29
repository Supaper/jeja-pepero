# jeja-pepero (제자 페페로)

교회 소그룹 **큐티(QT) 완주 모니터링** 서비스.

- **웹 대시보드**: 바닐라 HTML/JS + Firebase Authentication, **GitHub Pages** 호스팅
- **자동 수집/보고**: **GitHub Actions** 스케줄 → 게시판 스크래핑 → Firebase RTDB → 이메일

> 전체 재설계 방향은 [`PLAN.md`](./PLAN.md) 참고.

## 구조

```
index.html / css/style.css        로그인 + 대시보드 화면, 스타일
js/firebase-config.js             Firebase 초기화 (auth, db)
js/auth.js                        Google 로그인 + /users 허용 명단 검증
js/config.js                      대시보드 공용 상수/큐티 날짜 파싱·색상
js/dashboard.js                   대시보드/멤버 탭/멤버 관리 렌더링
js/app.js                         화면 전환 게이트
scripts/                          GitHub Actions 작업 (Node)
  lib/scrape.js                   게시판 스크래핑 / 큐티 날짜 파싱
  lib/firebase.js                 firebase-admin 초기화
  lib/members.js                  멤버 명단 로더(/members, 기본값 폴백)
  lib/mailer.js                   Gmail SMTP 발송
  collect-daily.js                신규 글 수집(본문 포함)
  collect-history.js              과거 글(올해치) 수집 — 페이지네이션
  digest-daily.js                 그날 수집분 요약 이메일
  report-monthly.js               월간 큐티 리포트
  backfill-content.js             기존 글 본문 일괄 채움
  seed-members.js / set-admin.js / dedupe-posts.js   관리 도구
  test/                           단위 테스트 (큐티 파서)
.github/workflows/
  ci.yml                          PR/푸시 검증(문법·의존성·테스트)
  daily-collect.yml               낮(06~23시) 10분마다 수집(이메일 X)
  daily-digest.yml                매일 23:50 KST 일일 요약 이메일
  monthly-report.yml              매월 1일 월간 큐티 리포트
  collect-history.yml / backfill-content.yml / admin-tools.yml   수동 도구
```

## 로그인 (Google 계정)

인증은 **Google 로그인(Firebase Authentication)** 이 담당합니다. 비밀번호는 Google이
관리하고, RTDB `/users` 노드는 **접근 허용 명단(allowlist)** 으로만 사용합니다.

`/users` 구조:
```jsonc
{
  "users": {
    "admin001": { "admin": true, "email": "admin@example.com", "name": "관리자" }
  }
}
```

흐름: ① "Google 계정으로 로그인" → ② 인증된 이메일이 `/users`에 있으면 진입,
없으면 자동 로그아웃 + "접근 권한 없음" 안내.

### Firebase 콘솔 설정 (1회)
1. **Authentication → Sign-in method → Google 공급자 사용 설정**
2. **Authentication → Settings → 승인된 도메인** 에 배포 도메인 추가 (예: `<id>.github.io`)
3. **Realtime Database 보안 규칙**:
   ```json
   {
     "rules": {
       "users":   { ".read": "auth != null", ".write": "auth.token.admin === true", ".indexOn": ["email"] },
       "members": { ".read": "auth != null", ".write": "auth.token.admin === true" },
       "posts":   { ".read": "auth != null", ".write": false },
       "state":   { ".read": false, ".write": false }
     }
   }
   ```
   (서버 작업은 서비스 계정으로 쓰므로 규칙과 무관하게 write 가능)

## 멤버 관리 (관리자)

멤버 명단은 RTDB `/members/<이름>: { name, qt, active }` 에 저장되고 **관리자가 웹에서**
추가/삭제/토글합니다 (`qt`=큐티 집계 대상, `active`=수집 대상). 비어 있으면 코드 기본값으로 동작.

- **관리자 권한 부여(1회)**: 대상 계정으로 한 번 로그인 → **Actions → Admin Tools →
  `set-admin`**(이메일 입력) → 재로그인하면 사이드바에 "⚙️ 멤버 관리" 표시.
- **명단 시드(선택)**: Admin Tools → `seed-members` (기본 명단을 `/members`에 기록).
- 멤버 추가 후 그 사람의 **과거 글**까지 채우려면 → 아래 "과거 글 수집".

## 자동 수집/보고 (GitHub Actions)

- `daily-collect.yml` — **낮(KST 06~23시) 10분마다** 신규 글 수집 → 본문 포함 `/posts/<이름>` 기록 (이메일 X)
- `daily-digest.yml` — **매일 23:50 KST** 그날 수집분을 한 통으로 이메일
- `monthly-report.yml` — 매월 1일 지난달 "큐티나눔" 날짜를 분석해 완주율 집계 → 이메일

데이터 모델: `posts/<이름>/<key>: { collectedAt, postDate, title, link, content }`,
`state/<이름>/lastTitle`(중복 방지 기준점). 큐티 집계는 **제목의 날짜** 기준(수집일 아님).

### 과거 글 수집 (수동)
**Actions → "Collect Past Posts"** — 게시판을 페이지네이션하며 올해치 과거 글을 수집합니다.
특정 멤버만 지정 가능, 글 번호(`num`) 기준 중복 제거(멱등). 새 멤버 추가 후 사용.

### 필요한 GitHub Secrets
**Settings → Secrets and variables → Actions**:

| 시크릿 | 설명 |
|--------|------|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키(JSON) 전체 (base64 도 허용) |
| `MAIL_USERNAME` | 보내는 Gmail 주소 |
| `MAIL_PASSWORD` | Gmail **앱 비밀번호** (2단계 인증 후 발급) |
| `MAIL_TO` | 받는 사람 (생략 시 `MAIL_USERNAME`) |

## 로컬 실행 / 배포

```bash
npx serve .          # ESM 모듈은 file:// 불가 → 정적 서버로 실행
```
배포: **Settings → Pages → Deploy from a branch → `main` / (root)**.
GitHub Pages는 정적 호스팅이라 수집·보고는 위 Actions가 별도로 담당합니다(배포 방식과 무관).

## 🔒 보안 안내
- `firebase-config.js`의 `apiKey` 등 웹 설정값은 공개되도록 설계된 값으로 공개 저장소에 포함되어도 안전합니다(보안은 Auth + 규칙으로).
- 서비스 계정 키·메일 비밀번호는 **반드시 GitHub Secrets** 로만 보관하세요.

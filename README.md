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
js/assignments.js                 제자반 주별 과제 정의(생활간증·독서·기타)
js/dashboard.js                   대시보드/멤버 탭/멤버 관리/과제 현황 렌더링
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
       "users":       { ".read": "auth != null", ".write": "auth.token.admin === true", ".indexOn": ["email"] },
       "members":     { ".read": "auth != null", ".write": "auth.token.admin === true" },
       "posts":       { ".read": "auth != null", ".write": false },
       "assignments": { ".read": "auth != null", ".write": "auth != null" },
       "qtManual":    { ".read": "auth != null", ".write": "auth.token.admin === true" },
       "state":       { ".read": false, ".write": false }
     }
   }
   ```
   (서버 작업은 서비스 계정으로 쓰므로 규칙과 무관하게 write 가능 ·
   `assignments`=과제 체크 현황, 로그인 멤버가 직접 체크하도록 `auth != null` write ·
   `qtManual`=글 없이 직접 기록하는 큐티 완주일, 관리자만 write)

## 멤버 관리 (관리자)

멤버 명단은 RTDB `/members/<이름>: { name, qt, active, course }` 에 저장되고 **관리자가 웹에서**
관리합니다. 비어 있으면 코드 기본값으로 동작.
- `qt` = 큐티 완주 현황 집계 대상
- `active` = 글 자동 수집 대상
- `course` = 과제 현황에서 채점할 **훈련과정 id**(예: `disciple11`). 다른 기수/과정은 ‘해당없음’ 또는 다른 과정 선택.

- **관리자 권한 부여(1회)**: 대상 계정으로 한 번 로그인 → **Actions → Admin Tools →
  `set-admin`**(이메일 입력) → 재로그인하면 사이드바에 "⚙️ 멤버 관리" 표시.
- **명단 시드(선택)**: Admin Tools → `seed-members` (기본 명단을 `/members`에 기록).
- 멤버 추가 후 그 사람의 **과거 글**까지 채우려면 → 아래 "과거 글 수집".

## 과제 현황 (훈련과정별 주별 과제)

대시보드의 **📝 과제 완주 현황** 카드에서 멤버별 과제 완료 여부를 **과정(course)별로** 보여줍니다.
훈련과정과 과제 목록(개강 전 / 1학기 / 방학 / 2학기·종강의 생활간증·독서·기타)은
[`js/assignments.js`](./js/assignments.js) 의 `COURSES` 에 정의되어 있어 **이 파일만 고치면** 됩니다.

- **새 과정 추가**: `COURSES` 배열에 `{ id, label, groups }` 한 줄 추가 → 멤버 관리에서 해당 멤버의 ‘훈련과정’을 그 과정으로 지정.
- 멤버는 자기 과정의 과제에 대해서만 자동 매칭/채점됩니다(다른 기수가 제자반 과제로 잘못 잡히지 않음).

- **자동 체크**: 수집된 **[훈련나눔]** 글 제목을 과제별 키워드로 매칭해 자동으로 완료 처리
  (`✓ 자동 ↗` 표시, 클릭하면 해당 글 본문). 키워드/마감일은 `js/assignments.js` 에서 조정.
- 매칭되는 글이 없는 항목(예: 서약서)은 **체크박스로 수동 체크** —
  저장 위치 `assignments/<이름>/<과제ID> = true` (로그인한 멤버 누구나).
- 완주율은 **마감이 도래한 과제** 기준(괄호는 전체 기준), 마감 지난 미완료는 빨갛게 표시.
- 대상 멤버는 큐티 집계 대상(`qt`)과 동일(제자반 기수).

## 자동 수집/보고 (GitHub Actions)

- `daily-collect.yml` — **낮(KST 06~23시) 10분마다** 신규 글 수집 → 본문 포함 `/posts/<이름>` 기록 (이메일 X)
- `daily-digest.yml` — **매일 23:50 KST** 그날 수집분을 한 통으로 이메일
- `monthly-report.yml` — 매월 1일 지난달 "큐티나눔" 날짜를 분석해 완주율 집계 → 이메일

데이터 모델: `posts/<이름>/<key>: { collectedAt, postDate, title, link, content }`,
`state/<이름>/lastTitle`(중복 방지 기준점). 큐티 집계는 **제목의 날짜** 기준(수집일 아님).

> **수동 완주일**: 게시판에 글을 올리지 않는 멤버는 대시보드의 큐티 완주 현황에서 멤버 행을 펼쳐
> **관리자가 완주일을 직접 추가/삭제**할 수 있습니다(`qtManual/<이름>/<YYYY-MM-DD>=true`).
> 수동 완주일은 스크래핑으로 집계된 날짜와 합쳐지며(중복 제거), 웹 대시보드와 월간 이메일 리포트에 모두 반영됩니다.

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

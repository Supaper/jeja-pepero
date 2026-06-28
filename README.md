# jeja-pepero (제자 페페로)

교회 소그룹 **큐티(QT) 완주 모니터링** 서비스.

- **웹 대시보드**: 바닐라 HTML/JS + Firebase Authentication, **GitHub Pages** 호스팅
- **일일/월간 자동 보고**: **GitHub Actions** 스케줄 → 게시판 스크래핑 → Firebase RTDB 기록 → 이메일

> 전체 재설계 방향과 로드맵은 [`PLAN.md`](./PLAN.md) 참고.

## 구조

```
index.html                     로그인 + 대시보드 화면
css/style.css                  스타일
js/firebase-config.js          Firebase 초기화 (auth, db)
js/auth.js                     Google 로그인 + /users 허용 명단 검증
js/config.js                   대시보드 공용 상수/큐티 날짜 파싱
js/dashboard.js                완주 현황 표 + 최근 글 피드 렌더링
js/app.js                      화면 전환 게이트
scripts/                       GitHub Actions 스케줄 작업 (Node)
  lib/scrape.js                게시판 스크래핑 / 큐티 날짜 파싱 (Apps Script 이식)
  lib/firebase.js              firebase-admin 초기화
  lib/mailer.js                Gmail SMTP 발송
  collect-daily.js             일일 수집
  report-monthly.js            월간 큐티 리포트
  migrate-sheets.js            기존 시트 → RTDB 일회성 이관
.github/workflows/
  daily-collect.yml            매일 07:10 KST
  monthly-report.yml           매월 1일 07:10 KST
```

## 로그인 (Google 계정)

인증은 **Google 로그인(Firebase Authentication)** 이 담당합니다. 비밀번호는 Google이
관리하므로 우리가 저장/검증하지 않고, RTDB `/users` 노드를 **접근 허용 명단(allowlist)**
으로만 사용합니다.

`/users` 구조:
```jsonc
{
  "users": {
    "admin001": { "admin": true, "email": "tnwhd0713@gmail.com", "name": "한수종" }
  }
}
```

로그인 흐름: ① "Google 계정으로 로그인" → ② 인증된 이메일이 `/users`에 있으면
메인 화면 진입, 없으면 자동 로그아웃 + "접근 권한 없음" 안내.
사용자를 추가하려면 `/users`에 해당 Google 이메일을 한 줄 넣으면 됩니다.

### Firebase 콘솔 설정 (1회)
1. **Authentication → Sign-in method → Google 공급자 사용 설정**
2. **Authentication → Settings → 승인된 도메인(Authorized domains)** 에 배포 도메인
   추가: `supaper.github.io` (로컬 테스트 시 `localhost` 는 기본 포함)
3. (권장) **Realtime Database 보안 규칙**으로 `/users` read 를 로그인 사용자로 제한:
   ```json
   {
     "rules": {
       "users":  { ".read": "auth != null", ".write": false },
       "posts":  { ".read": "auth != null", ".write": false },
       "state":  { ".read": false, ".write": false }
     }
   }
   ```
   (서버 작업은 서비스 계정으로 쓰므로 규칙과 무관하게 write 가능)

## 로컬 실행 (웹)

ESM 모듈은 `file://`에서 동작하지 않으므로 정적 서버로 띄웁니다.
```bash
npx serve .          # 또는  python3 -m http.server 8000
```

## 배포 (GitHub Pages)

Settings → Pages → **Deploy from a branch** → `main` / `/(root)` → 저장.
빌드가 없는 정적 사이트라 브랜치 배포로 충분합니다.
→ `https://supaper.github.io/jeja-pepero/`

> **중요 — 배포 방식과 보고 기능의 관계**
> GitHub Pages(브랜치/액션 배포 모두)는 *정적 호스팅*일 뿐, 예약 실행을 하지 못합니다.
> 따라서 **일일/월간 보고는 배포 방식과 무관**하며, 별도의 **GitHub Actions 스케줄
> 워크플로우**(아래)가 담당합니다. 둘은 독립적입니다.

## 일일/월간 자동 보고 (GitHub Actions)

기존 Apps Script 로직을 Node로 이식해 `scripts/`에 두고, 워크플로우가 예약 실행합니다.

- `daily-collect.yml` — 매일 게시판에서 신규 글 수집 → `/posts/<이름>` 기록 → 신규 글 있으면 이메일
- `monthly-report.yml` — 매월 1일 지난달 "큐티나눔" 글의 날짜를 분석해 완주율 집계 → 이메일

데이터 모델(RTDB):
```
posts/<이름>/<pushKey> : { collectedAt, postDate, title, link }
state/<이름>/lastTitle : 중복 방지 기준점
```

### 필요한 GitHub Secrets
저장소 **Settings → Secrets and variables → Actions** 에 등록:

| 시크릿 | 설명 |
|--------|------|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키(JSON). **base64 권장**(아래) |
| `MAIL_USERNAME` | 보내는 Gmail 주소 |
| `MAIL_PASSWORD` | Gmail **앱 비밀번호** (2단계 인증 후 발급) |
| `MAIL_TO` | 받는 사람 (생략 시 `MAIL_USERNAME`) |

### 테스트 실행
시크릿 등록 후 **Actions 탭 → 해당 워크플로우 → Run workflow** 로 수동 실행하여 동작 확인.

## 기존 Google Sheets 데이터 이관 (일회성)

`scripts/migrate-sheets.js` 가 멤버별 시트 탭(`수집일시, 작성일, 제목, 링크`)을
읽어 RTDB `/posts/<이름>` 으로 옮기고 `/state/<이름>/lastTitle` 을 최신화합니다.

### 사전 준비 (스프레드시트 ↔ 서비스 계정 연동)
1. **서비스 계정 키 발급**: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 →
   "새 비공개 키 생성"으로 JSON 다운로드. 그 안의 `client_email` 값을 확인.
2. **스프레드시트 공유**: 대상 시트를 위 `client_email` 주소로 **공유(뷰어)**.
3. **Google Sheets API 사용 설정**: [Google Cloud 콘솔](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
   에서 해당(=Firebase) 프로젝트의 Sheets API 를 **사용 설정**.
4. **GitHub Secret 등록**: 저장소 Settings → Secrets → Actions →
   `FIREBASE_SERVICE_ACCOUNT` 에 등록. **base64 인코딩 권장** —
   JSON 을 그대로 붙여넣으면 `private_key` 의 줄바꿈이 깨져 파싱 오류가 날 수 있습니다.
   ```bash
   base64 -w0 service-account.json    # 출력 전체를 시크릿 값으로 붙여넣기
   #  macOS: base64 -i service-account.json | tr -d '\n'
   ```
   (스크립트는 base64/JSON 둘 다 자동 인식합니다)

### 실행 — 방법 A: GitHub Actions (권장, 키를 로컬에 두지 않음)
**Actions 탭 → "Migrate Sheets to RTDB (one-off)" → Run workflow**
(필요 시 `spreadsheet_id` 입력 / 기존 데이터 덮어쓰려면 `force` 체크)

### 실행 — 방법 B: 로컬
```bash
cd scripts && npm install
FIREBASE_SERVICE_ACCOUNT='<서비스계정 JSON>' npm run migrate:sheets
#   SPREADSHEET_ID 로 시트 변경 가능, FORCE=1 로 기존 데이터 덮어쓰기
```

## 대시보드

로그인 후 메인 화면에서 RTDB `/posts` 를 읽어 다음을 표시합니다.
- **이번 달 큐티 완주 현황** (멤버별 완주 일수·달성률, 색상/막대, 달성률 순 정렬)
- **최근 수집된 글** 피드 (최신 20건)

> 데이터는 GitHub Actions 수집(또는 위 이관)으로 `/posts` 에 채워진 뒤 표시됩니다.

## 🔒 보안 안내
- `firebase-config.js`의 `apiKey` 등 웹 설정값은 **클라이언트에 공개되도록 설계된 값**으로
  공개 저장소에 포함되어도 안전합니다. 보안은 Auth + 보안 규칙으로 겁니다.
- 서비스 계정 키와 메일 비밀번호는 **반드시 GitHub Secrets** 로만 보관하세요(코드에 넣지 않음).

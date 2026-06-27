# jeja-pepero (제자 페페로)

교회 소그룹 **큐티(QT) 완주 모니터링** 서비스.

- **웹 대시보드**: 바닐라 HTML/JS + Firebase Authentication, **GitHub Pages** 호스팅
- **일일/월간 자동 보고**: **GitHub Actions** 스케줄 → 게시판 스크래핑 → Firebase RTDB 기록 → 이메일

> 전체 재설계 방향과 로드맵은 [`PLAN.md`](./PLAN.md) 참고.

## 구조

```
index.html                     로그인 + 메인 화면
css/style.css                  스타일
js/firebase-config.js          Firebase 초기화 (auth, db)
js/auth.js                     Firebase Auth 로그인 + /users 허용 명단 검증
js/app.js                      화면 전환 게이트
scripts/                       GitHub Actions 스케줄 작업 (Node)
  lib/scrape.js                게시판 스크래핑 / 큐티 날짜 파싱 (Apps Script 이식)
  lib/firebase.js              firebase-admin 초기화
  lib/mailer.js                Gmail SMTP 발송
  collect-daily.js             일일 수집
  report-monthly.js            월간 큐티 리포트
.github/workflows/
  daily-collect.yml            매일 07:10 KST
  monthly-report.yml           매월 1일 07:10 KST
```

## 로그인 (Firebase Authentication)

실제 인증은 Firebase Authentication(이메일/비밀번호)이 담당하고,
RTDB `/users` 노드는 **접근 허용 명단(allowlist)** 으로 사용합니다.

`/users` 구조 (비밀번호 없음):
```jsonc
{
  "users": {
    "admin001": { "admin": true, "email": "tnwhd0713@gmail.com", "name": "한수종" }
  }
}
```

로그인 흐름: ① Firebase Auth로 이메일/비밀번호 인증 → ② 인증된 이메일이 `/users`에
있으면 메인 화면 진입, 없으면 자동 로그아웃 + "접근 권한 없음" 안내.

### Firebase 콘솔 설정 (1회)
1. **Authentication → Sign-in method → 이메일/비밀번호 사용 설정**
2. **Authentication → Users → 사용자 추가**: `tnwhd0713@gmail.com` + 비밀번호
   (이 이메일이 `/users`에도 있어야 로그인 허용됨)
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
| `FIREBASE_SERVICE_ACCOUNT` | Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키(JSON) **전체 내용** |
| `MAIL_USERNAME` | 보내는 Gmail 주소 |
| `MAIL_PASSWORD` | Gmail **앱 비밀번호** (2단계 인증 후 발급) |
| `MAIL_TO` | 받는 사람 (생략 시 `MAIL_USERNAME`) |

### 테스트 실행
시크릿 등록 후 **Actions 탭 → 해당 워크플로우 → Run workflow** 로 수동 실행하여 동작 확인.

## 🔒 보안 안내
- `firebase-config.js`의 `apiKey` 등 웹 설정값은 **클라이언트에 공개되도록 설계된 값**으로
  공개 저장소에 포함되어도 안전합니다. 보안은 Auth + 보안 규칙으로 겁니다.
- 서비스 계정 키와 메일 비밀번호는 **반드시 GitHub Secrets** 로만 보관하세요(코드에 넣지 않음).

# jeja-pepero (제자 페페로)

교회 소그룹 **큐티(QT) 완주 모니터링** 웹서비스. Firebase Realtime Database와
연동되며, GitHub Pages로 배포되는 정적 웹앱입니다.

> 전체 재설계 방향과 로드맵은 [`PLAN.md`](./PLAN.md) 참고.

## 현재 구현 범위

- **로그인 게이트**: Firebase Realtime Database의 `/users` 노드를 기준으로 로그인해야
  메인 화면(대시보드)에 진입할 수 있습니다.
- 로그인/메인 화면 UI (대시보드는 `PLAN.md`에 따라 단계적으로 확장 예정)

## 파일 구조

```
index.html            로그인 + 메인 화면 마크업
css/style.css         스타일
js/firebase-config.js Firebase 초기화 (app, db export)
js/auth.js            /users 노드 기반 로그인 검증, 세션 관리
js/app.js             화면 전환 + 진입점
.nojekyll             GitHub Pages Jekyll 처리 비활성화
```

## `/users` 데이터 형태

`js/auth.js`는 아래 형태를 자동 인식합니다. 아이디 필드는
`email`/`id`/`username` 등을, 비밀번호 필드는 `password`/`pw` 등을 인식합니다.

```jsonc
// 권장 형태
{
  "users": {
    "<임의의 키>": {
      "email": "soojhann@seoulav.co.kr",
      "password": "********",
      "name": "수종"            // 선택
    }
  }
}

// 또는 간단 형태 (키=아이디, 값=비밀번호)
{ "users": { "soojhann@seoulav.co.kr": "********" } }
```

## 로컬 실행

ESM 모듈은 `file://`에서 동작하지 않으므로 간단한 정적 서버로 띄웁니다.

```bash
npx serve .
# 또는
python3 -m http.server 8000
```

## GitHub Pages 배포

1. 저장소 **Settings → Pages**
2. **Build and deployment → Source: Deploy from a branch**
3. Branch를 `main` / `/(root)` 으로 지정 후 저장
4. 잠시 후 `https://supaper.github.io/jeja-pepero/` 에서 접속

별도 빌드 과정이 없는 정적 사이트라 브랜치 배포만으로 동작합니다.

## 🔒 보안 안내 (중요)

- `firebase-config.js`의 `apiKey` 등 웹 설정값은 **클라이언트에 공개되도록 설계된 값**으로,
  공개 저장소에 포함되어도 문제되지 않습니다. 실제 보안은 **Firebase 보안 규칙**으로 겁니다.
- 현재 로그인 방식은 클라이언트가 `/users`를 직접 읽어 비밀번호를 비교합니다.
  소규모 운영에는 충분하나 **비밀번호가 평문으로 노출될 수 있습니다.** 권장 사항:
  - `/users`의 read 권한을 보안 규칙으로 최소화
  - 장기적으로 **Firebase Authentication(이메일/비밀번호)** 로 전환 (`PLAN.md` 참고)

Realtime Database 보안 규칙 예시(로그인 검증을 위해 `users` read 허용):

```json
{
  "rules": {
    "users": { ".read": true, ".write": false }
  }
}
```

# CLAUDE.md

이 파일은 Claude Code(및 기여자)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 프로젝트 개요

지정 웹 게시판을 모니터링하여 **지정된 작성자**의 글을 수집하고, **카테고리별로 취합**해
**일별 알림**·**월별 통계**를 보고하는 프로그램. 장기적으로 결과를 **한글(.hwpx/.hwp)
양식 문서**로 자동 생성한다.

요구사항·아키텍처·로드맵의 단일 출처(source of truth)는 [`docs/PRD.md`](docs/PRD.md)다.
범위/설계 관련 의사결정 전에 반드시 PRD를 먼저 확인할 것.

## 확정된 결정 (반드시 준수)

- **수집기 배포**: cron(자체 호스팅 또는 GitHub Actions). 시크릿·데이터는 레포/아티팩트에 커밋 금지.
- **저장소**: **Firebase Realtime Database(RTDB)**. 웹 열람·구글 인증·접근제어를 함께 얻기 위해 채택.
  `store` 인터페이스로 추상화(추후 교체 대비). 수집기는 **Admin SDK**로 기록.
  (RTDB 키엔 `.` 불가 → 이메일은 `.`을 `,`로 인코딩해 `users` 키로 사용)
- **웹 열람**: 정적 프론트(GitHub Pages) + **Firebase Auth(구글)** + **`users` 허용목록**.
  공개 URL이어도 데이터는 번들에 없고 로그인 후 RTDB에서 로드.
- **알림**: **카카오톡 "나에게 보내기"(memo API)**, 운영자 본인 1명. `notifier`는 채널 추상화로 둔다.
- **문서**: **`.hwpx`** 만 대상(.hwp 직접 생성 비목표). 양식 템플릿 확보 후 착수하는 **후순위(Phase 3)**.

> ⚠️ **보안 경계는 RTDB 보안 규칙**이다. "미등록 시 로그인 redirect"는 클라이언트 UX일 뿐
> 우회 가능하다. 허용목록(`users`) 기반 규칙을 **1일차에** 적용하고, 규칙 없이 데이터를 올리지 않는다.
> 상세·근거는 PRD §2.3(Decisions)·§12 참조.

## 현재 상태 (중요)

- **Phase 1 진행 중.** 수집기(`collector/`)와 웹 프론트(`web/`)·RTDB 규칙 골격이 있다.
  - 구현됨: 게시판 수집(thelifechurch www56)·카테고리 분류·집합 기반 dedupe·RTDB 기록·콘솔 알림·웹 로그인 게이트.
  - 미구현: **카카오 알림(notifier 교체)**, 월별 통계(reporter), hwpx 문서(doc).
- 기존 구현은 Google Apps Script 함수 2개(`monitorDailyCollectionOnly`, `sendMonthlyQTReport`)이며,
  이를 **참조 사양(reference behavior)** 으로 삼는다. PRD §4(현행 동작 분석)에 정리돼 있다.
- 코드를 새로 작성할 때는 PRD §8(아키텍처)·§9(로드맵)를 따르고, 임의로 범위를 키우지 말 것.

## 도메인 핵심 개념

- **Source(게시판)**: 모니터링 대상. 1차 대상은 `thelifechurch.kr` (`boardID=www56`), 작성자명 검색.
- **Author(지정 작성자)**: 추적 대상 명단. 그룹(예: 제자훈련 그룹)별로 다를 수 있어 **설정으로 분리**한다.
  (기존엔 명단이 코드에 하드코딩 + 그룹마다 스프레드시트 ID가 분리돼 있었다 — 이를 통합/외부화한다)
- **Post(글)**: `작성일·제목·링크·작성자`를 최소 추출. dedupe 키 `post_key`는 URL/ID 우선,
  없으면 `hash(author + posted_date + title)`.
- **Category(분류)**: 규칙 기반(키워드/정규식). 예: `큐티나눔`→QT, `공지`→제외. **설정 파일로 관리**.

## 핵심 원칙 (작업 시 반드시 지킬 것)

1. **읽기 전용 모니터링.** 대상 게시판에 글을 쓰거나 수정/삭제하지 않는다.
2. **정중한 크롤링.** 요청 사이 지연(기존 1초)과 재시도(backoff), User-Agent 명시. 대상 서버에 부하를 주지 않는다.
3. **멱등성.** 같은 배치를 재실행해도 중복 저장/중복 메일이 없어야 한다. dedupe는 "마지막 제목 1건"이
   아니라 **수집 글 집합** 기준으로 한다(PRD §5 FR-3).
4. **장애 격리.** 한 작성자 수집 실패가 전체 배치를 중단시키면 안 된다(기존 try/catch 동작 유지).
5. **설정·시크릿 분리.** 게시판 URL·명단·카테고리 규칙·발송 대상은 설정 파일/환경변수로,
   카카오 토큰 등 자격증명은 환경변수/시크릿으로 주입한다. **코드/커밋에 하드코딩 금지.**
6. **개인정보 최소화.** 공개 게시 정보(작성자명·제목·링크)만 다룬다.
7. **데이터·시크릿 커밋 금지.** Firebase 서비스계정 키·카카오 토큰·`.env`는 `.gitignore`로 차단하고
   레포/아티팩트에 절대 커밋하지 않는다.
8. **보안 경계는 서버 규칙.** 웹 접근 제한은 **RTDB 보안 규칙(허용목록)** 으로 강제한다.
   클라이언트 redirect/숨김은 보조 UX일 뿐이며 단독으로 신뢰하지 않는다.

## 스택 / 구조 (확정)

스택: **Python**. 수집기는 `collector/` 패키지로 구현돼 있다.

```
collector/
  adapters/    게시판별 fetch+parse (1차: thelifechurch.py www56)
  categorizer.py  규칙 기반 분류(설정)
  store/       RTDB(Admin SDK) + MemoryStore(테스트/드라이런), Store 인터페이스
  notifier/    알림 채널 추상화 (현재 ConsoleNotifier, KakaoMemoNotifier는 추후)
  config.py    YAML 설정 로더
  models.py    Post 모델 + post_key(dedupe)
  main.py      배치 진입점 (python -m collector.main)
config/        config.example.yaml (실 설정 config.yaml 은 .gitignore)
web/           정적 프론트(로그인 게이트 + 대시보드) + database.rules.json
tests/         pytest (네트워크 없이 parse/분류/run 검증)
database.rules.json  RTDB 보안 규칙(허용목록)
reporter/, doc/  월별 통계·hwpx 문서 생성 (추후)
```

> 새 게시판은 `collector/adapters/`에 어댑터를 추가하고 `main.ADAPTERS`에 등록한다.

## 빌드 / 테스트 / 실행

```bash
pip install -r requirements.txt          # 런타임(requests, PyYAML, firebase-admin)
pip install -r requirements-dev.txt       # + pytest
pytest -q                                 # 테스트 (네트워크/Firebase 불필요)

cp config/config.example.yaml config/config.yaml   # 실 설정 작성(명단 등)
export FIREBASE_CREDENTIALS=/path/to/serviceAccount.json
python -m collector.main --dry-run        # 저장 없이 콘솔 출력만 (RTDB 불필요)
python -m collector.main                  # RTDB 기록
```

테스트 없이 동작을 바꾸지 말고, 새 기능에는 테스트를 함께 추가한다.
런타임 의존성(requests/firebase-admin)은 지연 import 되어 있어 테스트는 pytest+PyYAML만으로 돈다.

## Git / 기여

- 작업 브랜치: `claude/board-monitoring-prd-docs-g54urg` (PRD/문서 작업용).
- 커밋 메시지는 명확하고 서술적으로. 사용자가 요청할 때만 commit/push 한다.
- push 후에는 해당 브랜치의 PR이 없으면 **draft PR** 을 생성한다.
- 문서 변경 시 PRD/README/CLAUDE.md 간 정합성을 함께 맞춘다.

## 참고

- 상세 요구사항·데이터모델·로드맵·미해결 질문: [`docs/PRD.md`](docs/PRD.md)
- 프로젝트 개요: [`README.md`](README.md)

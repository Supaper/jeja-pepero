# jeja-pepero

지정한 웹 게시판을 모니터링하여 **지정된 작성자**의 글을 수집하고, **카테고리별로 취합**해
**일별 알림**과 **월별 통계**를 보고하는 프로그램입니다. 알림은 **카카오톡 "나에게 보내기"** 로
받고, 결과는 **웹 대시보드**(구글 로그인 + 허용목록)로 열람하며, 장기적으로는 취합 결과를
**한글(.hwpx) 양식 문서**로 자동 생성하는 것을 목표로 합니다.

현재는 Google Sheets + Apps Script + Gmail 로 운영 중인 워크플로를, **Firebase(Realtime Database + Auth)** 와
정적 웹 프론트 기반의 독립 프로그램으로 재구축하는 프로젝트입니다.

## 무엇을 하나요

- 📥 **모니터링/수집** — 게시판에서 지정 작성자의 새 글(작성일·제목·링크)을 주기적으로 수집
- 🏷️ **카테고리 분류** — 제목/내용 규칙으로 글을 카테고리(예: 큐티나눔, 기도제목 등)에 매핑
- 💬 **일별 알림** — 새로 수집된 글을 작성자별·카테고리별로 묶어 **카카오톡 "나에게 보내기"** 로 발송
- 📊 **월별 통계** — 지난달 카테고리별 작성 횟수·달성률을 집계해 카카오 요약 + CSV 산출물로 생성
- 🌐 **웹 대시보드** — 정적 페이지 + 구글 로그인. 공개 URL이어도 **허용된 계정만** 데이터 열람
- 📄 **문서 자동화 (후순위)** — 집계 결과를 한글(.hwpx) 양식 템플릿에 채워 문서로 생성

## 현재 상태

> **Phase 1 진행 중.** 수집기(`collector/`)·웹 프론트(`web/`)·RTDB 규칙 골격이 동작합니다.
> 카카오 알림·월별 통계·hwpx 문서는 아직입니다.

| 단계 | 범위 | 상태 |
|------|------|------|
| Phase 0 | 문서화·설계 (PRD/README/CLAUDE.md) | ✅ 완료 |
| Phase 1 | MVP: 수집→RTDB→알림 + 웹 로그인 게이트 | 🚧 진행 중 (수집/웹 ✅, 카카오 알림 예정) |
| Phase 2 | 월별 통계, 대시보드 UI 보강, 설정 외부화, 다중 그룹 | 예정 |
| Phase 3 | 한글(.hwpx) 문서 자동 생성 (양식 제공 후, 후순위) | 예정 |

## 빠른 시작 (수집기)

```bash
pip install -r requirements.txt
pytest -q                                              # 테스트

cp config/config.example.yaml config/config.yaml       # 명단·규칙 작성 (config.yaml은 커밋 안 됨)
python -m collector.main --dry-run                     # 저장 없이 콘솔 출력만
export FIREBASE_CREDENTIALS=/path/to/serviceAccount.json
python -m collector.main                               # RTDB 기록
```

웹 대시보드 설정·배포는 [`web/README.md`](web/README.md) 참고.

## 문서

- [`docs/PRD.md`](docs/PRD.md) — 제품 요구사항 정의서 (배경/기능/데이터모델/로드맵)
- [`CLAUDE.md`](CLAUDE.md) — Claude / 기여자를 위한 작업 가이드
- [`web/README.md`](web/README.md) — 웹 대시보드 구성·배포

## 배경 (기존 운영 방식)

기존에는 두 개의 Apps Script 함수로 운영했습니다.

- `monitorDailyCollectionOnly()` — 게시판을 작성자명으로 검색해 신규 글을 시트에 기록하고
  일별 알림 메일을 발송 ("공지" 제외, 작성자별 "마지막 제목"으로 중복 방지).
- `sendMonthlyQTReport()` — 지난달 제목에 `큐티나눔`이 포함된 글 수를 집계해 달성률 리포트 발송.

이 프로젝트는 위 동작을 보존하면서 **카테고리 분류·견고한 중복 방지·설정 분리·문서 자동화·
테스트/버전관리**를 더하는 것을 목표로 합니다. 자세한 비교는 PRD의 "현행 대비 개선 요약" 참고.

## 주요 결정 (확정)

- **수집기**: Python 배치 + cron (자체 호스팅 또는 GitHub Actions)
- **저장소**: **Firebase Realtime Database** (수집기는 Admin SDK로 기록)
- **웹 열람**: 정적 프론트(GitHub Pages) + **Firebase Auth(구글)** + **`users` 허용목록**
- **알림**: **카카오톡 "나에게 보내기"**(memo API) — 운영자 본인 1명 수신
- **문서**: **`.hwpx`** (양식 템플릿 확보 후 착수, 후순위)

> ⚠️ 공개 URL이어도 비공개를 보장하는 핵심은 **RTDB 보안 규칙(허용목록)** 입니다.
> 화면의 로그인 redirect는 UX 보조일 뿐 보안 경계가 아니며, 규칙은 1일차에 적용합니다.

자세한 배경·남은 질문은 [`docs/PRD.md`](docs/PRD.md) §2.3, §12 참고.

## 권장 스택 (제안)

HTML 파싱과 HWPX(zip/XML) 조작, 스케줄링 생태계가 풍부한 **Python** 을 1차 제안합니다.

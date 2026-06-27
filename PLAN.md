# 제자-페페로(jeja-pepero) 큐티 모니터링 웹서비스 — 기획·설계 계획안

> 기존 Google Apps Script(일일 수집 + 월간 큐티 리포트)의 로직과 알고리즘을 분석하여
> 독립 웹서비스로 재설계하는 계획안입니다.

---

## 1. 배경 및 현재 시스템 분석

### 1.1 현재 시스템(Google Apps Script)이 하는 일

현재는 3개의 Apps Script 함수로 구성된 자동화 스크립트입니다.

| 함수 | 역할 | 트리거 |
|------|------|--------|
| `monitorDailyCollectionOnly()` | 교회 게시판에서 멤버별 신규 게시물 수집 → 구글시트 기록 → 이메일 알림 | 매일(시간 기반 트리거) |
| `resetMemory()` | 수집 기준점(ScriptProperties) 전체 초기화 | 수동 |
| `sendMonthlyQTReport()` | 시트 데이터에서 "큐티나눔" 글의 날짜를 분석해 월간 완주율 집계 → 이메일 | 매월(시간 기반 트리거) |

**도메인 요약**: 교회 소그룹 멤버들이 더라이프교회 게시판(`www56`)에 "큐티나눔" 글을 올리면,
이를 자동 수집하고 월별 큐티 완주율을 집계·랭킹하는 **신앙 훈련 출석/완주 추적 시스템**.

### 1.2 핵심 알고리즘 분석 (반드시 보존해야 할 로직)

#### (A) 게시물 수집 + 중복 방지 알고리즘
```
1. baseUrl + encodeURIComponent(이름) 으로 멤버별 검색 페이지 fetch
2. HTML을 'class="mdDefaultW100 mdWebzinecon' 기준으로 split → 게시물 단위 분리
3. 각 게시물에서 정규식으로 추출:
   - 링크/제목: /mdWebzineSbj"[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/
   - 등록일:    /등록일\s*:\s*(\d{4}\.\d{2}\.\d{2})/
4. 필터링:
   - 제목에 "공지" 포함 → skip
   - postDate < START_DATE(2026.02.01) → skip
5. 중복 방지(핵심): 멤버별 LAST_TITLE 저장.
   - 최신글이 저장된 LAST_TITLE과 같으면 break (이미 수집한 지점 도달)
   - 신규 글은 tempPosts에 push 후, reverse()로 과거→현재 순 정렬하여 기록
6. 처리 후 가장 최신 글 제목을 LAST_TITLE로 갱신
```
> **약점**: 제목 기반 중복 판정은 동일 제목 글이 두 번 올라오면 누락 위험. 개선 필요(아래 6.1).

#### (B) 큐티 날짜 파싱 알고리즘
제목 문자열에서 다양한 날짜 표기를 인식하는 복합 정규식:
```
(?<!\d)(?:(?:20)?YYMM(\d{2}) | MM(\d{2}) | 0?M[월./-](\d{1,2}))
```
- 지원 형식 예: `260215`, `20260215`, `0215`, `2월15`, `2.15`, `02/15`
- 추출한 일(day)이 `1 ~ 해당월일수` 범위면 `Set`에 추가 → **중복 없는 완주 일수** 산출
- 달성률 = (고유 일수 / 해당월 총일수) × 100

#### (C) 랭킹/색상 규칙
- 정렬: 달성률 내림차순 → 동률 시 이름 가나다순(`localeCompare(_, 'ko')`)
- 색상: ≥90% 파랑 / ≥70% 초록 / ≥50% 주황 / 그 외 빨강

### 1.3 현재 구조의 한계
1. **시각화 부재**: 결과를 이메일 HTML로만 확인. 실시간 대시보드 없음.
2. **설정 하드코딩**: 멤버 명단·기준일·스프레드시트 ID가 코드에 박혀 있음.
3. **확장성 제약**: Apps Script 실행시간/쿼터 제한, 멤버 추가 시 코드 수정 필요.
4. **데이터 신뢰성**: 제목 기반 중복 판정, 날짜 누락 시 수동 보정 불가.
5. **이력/검색 불가**: 과거 통계를 다시 보거나 멤버별 추이를 볼 수 없음.
6. **단일 게시판 종속**: 다른 그룹/게시판으로 확장 어려움.

---

## 2. 새 웹서비스 목표

기존 자동화의 **수집·집계 로직은 그대로 계승**하되, 다음을 추가한 웹서비스로 발전:

- ✅ **실시간 대시보드**: 멤버별/기간별 큐티 완주 현황을 웹에서 즉시 확인
- ✅ **월간·주간·커스텀 기간 리포트**: 이메일 발송에 더해 웹/PDF로 조회
- ✅ **설정 UI화**: 멤버 명단, 기준일, 게시판 URL을 코드 수정 없이 관리
- ✅ **데이터 보정**: 잘못 파싱된 날짜/오탐 글을 관리자가 수동 교정
- ✅ **개인별 추이**: 멤버별 월별 완주율 그래프, 연속 달성(스트릭)
- ✅ **알림 유지**: 신규 글/리포트 이메일은 옵션으로 계속 지원

---

## 3. 사용자 & 핵심 화면

| 역할 | 권한 |
|------|------|
| 관리자(리더) | 멤버/설정 관리, 수동 수집 트리거, 데이터 보정, 리포트 발송 |
| 멤버(선택) | 본인 큐티 현황 조회 |
| 비로그인 | (옵션) 공개 랭킹 보드 |

**핵심 화면**
1. **대시보드**: 이번 달 전체 완주율, 멤버 랭킹 카드/표(색상 규칙 계승), 신규 글 피드
2. **멤버 상세**: 월별 완주율 추이 그래프, 큐티 캘린더(완주 일자 히트맵), 수집 글 목록
3. **리포트**: 기간 선택 → 표/차트, 이메일 발송, CSV/PDF 내보내기
4. **수집 관리**: 마지막 수집 시각, 수동 "지금 수집" 버튼, 수집 로그
5. **설정**: 멤버 명단(추가/비활성), 기준일, 게시판 URL, 알림 수신자, 필터 키워드

---

## 4. 기술 스택 제안

가벼운 운영(소그룹 규모)을 전제로 한 권장안과 대안을 제시합니다.

### 권장안 (풀스택 단일 배포, 운영 단순)
- **프레임워크**: Next.js (App Router, TypeScript) — UI + API Route 통합
- **DB**: SQLite + Prisma (소규모) / 확장 시 PostgreSQL(Supabase/Neon)로 전환 용이
- **수집 스케줄러**: Vercel Cron 또는 GitHub Actions(`schedule`)로 일일 수집 API 호출
- **HTML 파싱**: `cheerio`(정규식보다 견고). 단, 기존 정규식 로직도 폴백으로 보존
- **차트**: Recharts / Chart.js
- **이메일**: Resend 또는 Nodemailer(SMTP) — 기존 이메일 기능 계승
- **인증**: Auth.js(NextAuth) 또는 간단한 비밀번호 보호(소그룹이면 충분)

### 대안 A — 마이그레이션 부담 최소화
Google Apps Script + Google Sheets를 **데이터 백엔드로 유지**하고, 프론트만 정적 웹앱(React)으로
구축해 Sheets API로 읽기. 기존 자산 재활용 최대, 단 기능 확장엔 한계.

### 대안 B — 풀 분리형
백엔드(FastAPI/Python or NestJS) + 프론트(React) 분리. 향후 다중 그룹/대규모 확장 대비.
초기 복잡도는 높음.

> **추천**: 소그룹·단일 운영자 기준 **권장안(Next.js + SQLite/Prisma)**.
> 데이터 규모가 작고 운영자가 1명이라 단일 배포가 유지보수에 가장 유리.

---

## 5. 데이터 모델 (권장안 기준)

```
Member            (멤버)
  id, name, isActive, externalKey(검색 이름), createdAt

Post              (수집된 게시물) — 기존 시트 1행에 해당
  id, memberId(FK), postDate(작성일), title, link(UNIQUE),
  collectedAt(수집일시), isNotice(공지여부), isQt(큐티나눔 여부), rawTitle

QtRecord          (파싱된 큐티 완주 일자) — 월간 집계 소스
  id, memberId(FK), postId(FK), year, month, day, source(auto|manual)
  UNIQUE(memberId, year, month, day)   ← Set 중복제거를 DB 제약으로 구현

CollectState      (중복 방지 상태) — 기존 ScriptProperties 대체
  memberId(FK, UNIQUE), lastTitle, lastPostDate, lastCollectedAt

Setting           (전역 설정) — 하드코딩 제거
  key, value   예: startDate, boardBaseUrl, domain, notifyEmails, filterKeywords

CollectLog        (수집 이력)
  id, runAt, newPostCount, status, message
```

**매핑(기존 → 신규)**
- 멤버별 시트 → `Member` + `Post`
- `LAST_TITLE_이름` ScriptProperty → `CollectState.lastTitle`
- 월간 리포트의 `Set<day>` → `QtRecord` 테이블의 UNIQUE 제약
- 설정 상수(SPREADSHEET_ID, START_DATE 등) → `Setting`

---

## 6. 알고리즘 이식 설계

### 6.1 수집 파이프라인 (`POST /api/collect`)
```
for each active Member:
  1. fetch(boardBaseUrl + encodeURIComponent(member.externalKey))
  2. cheerio로 게시물 노드 파싱 → {title, link, postDate} 목록
  3. 필터: isNotice(제목 "공지") 제외, postDate < setting.startDate 제외
  4. 중복 방지(개선판):
     - 1차: link UNIQUE 제약으로 DB 레벨 중복 차단 (제목 기반보다 견고)
     - 2차: CollectState.lastTitle/lastPostDate로 조기 중단(성능 최적화)
  5. 신규 Post insert (과거→현재 순)
  6. isQt(제목에 "큐티나눔") 글이면 날짜 파싱 → QtRecord upsert
  7. CollectState 갱신, CollectLog 기록
신규 글 있으면 알림 이메일(옵션) 발송
```
> 개선 포인트: 기존 "제목 일치 시 break"의 누락 위험을 **link 기준 UNIQUE**로 보강.
> lastTitle은 성능용 조기중단으로만 사용.

### 6.2 날짜 파서 (`lib/parseQtDate.ts`)
- 기존 복합 정규식을 함수로 이식하고 **단위테스트**로 모든 형식 검증
  (`260215`, `20260215`, `0215`, `2월15`, `2.15`, `02/15`, 범위 밖 일자 무시 등)
- 결과를 `QtRecord(year, month, day)`로 저장 → 월 경계/연도 정확히 반영
- 파싱 실패/모호 케이스는 `needsReview` 플래그로 관리자 보정 큐에 노출

### 6.3 집계/리포트 (`GET /api/report?year=&month=`)
- `QtRecord`에서 멤버별 distinct day 수 집계 (Set 로직을 SQL `COUNT(DISTINCT)`로 대체)
- 달성률 = count / 해당월일수 × 100
- 정렬·색상 규칙 1.2(C) 그대로 계승
- 응답을 대시보드/이메일/CSV가 공유

---

## 7. API 설계 (요약)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/collect` | 수집 실행(크론/수동) |
| GET | `/api/report` | 기간별 완주 집계 |
| GET | `/api/members` / POST/PATCH | 멤버 조회/관리 |
| GET | `/api/members/:id/stats` | 멤버별 추이·캘린더 |
| GET/PATCH | `/api/posts` | 글 목록/보정(공지·큐티 플래그) |
| GET/PATCH | `/api/qt-records` | 큐티 일자 수동 교정 |
| GET/PATCH | `/api/settings` | 전역 설정 |
| POST | `/api/report/send` | 리포트 이메일 발송 |

---

## 8. 마일스톤 (단계별 구현 계획)

### Phase 0 — 프로젝트 셋업 (0.5일)
- Next.js + TypeScript + Prisma 초기화, 린트/포맷/CI(GitHub Actions) 구성
- `.env` 설계(DB, SMTP/Resend 키, 게시판 URL)

### Phase 1 — 핵심 로직 이식 + 테스트 (2일) ⭐가장 중요
- `lib/parseQtDate.ts`, `lib/parseBoardHtml.ts`(cheerio) 구현 + 단위테스트
- DB 스키마/마이그레이션, 시드(멤버 14명, 기존 설정값)
- `/api/collect` 구현 → 실제 게시판으로 통합 테스트

### Phase 2 — 대시보드 & 리포트 UI (2~3일)
- 대시보드(랭킹 카드/표, 색상 규칙), 멤버 상세(차트·캘린더)
- 리포트 페이지 + CSV/PDF 내보내기

### Phase 3 — 관리 기능 (2일)
- 설정 UI, 멤버 관리, 데이터 보정 화면, 수동 수집 버튼, 수집 로그

### Phase 4 — 자동화 & 알림 (1일)
- Cron(일일 수집/월간 리포트) 연결, 이메일 발송(기존 기능 계승)
- 인증/접근 제어

### Phase 5 — 배포 & 데이터 이관 (1일)
- 배포(Vercel 등), 기존 구글시트 데이터 임포트 스크립트
- 운영 문서화

---

## 9. 마이그레이션 전략 (기존 시트 → 신규 DB)
1. 멤버별 시트 CSV/Sheets API로 전량 추출
2. `[수집일시, 작성일, 제목, 링크]` → `Post`로 적재
3. "큐티나눔" 글은 날짜 파서 재적용 → `QtRecord` 생성
4. 각 멤버 최신 글로 `CollectState` 초기화 → 중복 수집 방지
5. 신규/기존 한 달 병행 운영 후 전환

---

## 10. 리스크 & 고려사항
- **게시판 HTML 구조 변경**: 파서가 깨질 수 있음 → 셀렉터 설정화 + 파싱 실패 알림
- **스크래핑 정책/부하**: 기존처럼 요청 간 지연(1초) 유지, robots/이용약관 확인
- **개인정보**: 멤버 실명·신앙활동 데이터 → 접근 제어, 비공개 기본값, 보관기간 정책
- **시간대**: 날짜 경계 처리에 KST(Asia/Seoul) 고정
- **중복/오탐**: 동일 제목·비정형 날짜 → 보정 UI로 대응

---

## 11. 다음 액션 (의사결정 필요)
아래 항목을 확정하면 Phase 0부터 구현을 시작할 수 있습니다.
1. **기술 스택**: 권장안(Next.js 단일) vs 대안 A(시트 유지) vs 대안 B(분리형)?
2. **데이터 소스**: 신규 DB로 완전 이관 vs 구글시트 병행 유지?
3. **범위**: 1차 MVP를 "대시보드 + 월간 리포트"로 한정할지, 관리/보정까지 포함할지?
4. **인증**: 단순 비밀번호 보호로 충분한지, 멤버 개별 로그인이 필요한지?
5. **공개 범위**: 랭킹을 멤버 비공개로 둘지, 그룹 내 공개할지?
</content>
</invoke>

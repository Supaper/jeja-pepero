# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**jeja-pepero (제자 페페로)** is a church small-group QT (quiet-time / daily devotional) completion tracker. It has two independent halves that share one Firebase Realtime Database:

1. **Web dashboard** — vanilla HTML/CSS/JS (ES modules, no build step, no framework), loads Firebase from the gstatic CDN, hosted on **GitHub Pages**.
2. **Scheduled jobs** (`scripts/`) — Node scripts run by **GitHub Actions** that scrape a church board (`thelifechurch.kr`, `boardID=www56`), write posts to the RTDB, and send email digests/reports.

There is no server. The two halves only communicate through Firebase RTDB.

Most code comments and the README are in Korean. The domain logic (scraping + QT-date aggregation) was ported from a legacy Google Apps Script; `PLAN.md` documents that original design.

## Commands

There is **no build or bundler**. The web app is served as static files.

```bash
# Local dev (ESM cannot run from file://, so a static server is required)
npx serve .

# Scripts: all commands run from the scripts/ directory
cd scripts
npm install
npm test                       # runs node --test (unit tests)
node --test test/qt-parse.test.js   # run a single test file

# Job entry points (need env vars — see below):
npm run collect:daily          # scrape new posts → RTDB (no email)
npm run digest:daily           # email that day's collected posts
npm run report:monthly         # monthly QT completion report email
npm run collect:history        # backfill this year's past posts (paginated)
npm run backfill:content       # fill body text into existing posts
npm run seed:members / set:admin / dedupe:posts / diagnose  # admin tools
```

CI (`.github/workflows/ci.yml`) runs on every PR and push to `main`: `node --check` over all `js/` and `scripts/` JS files, then `npm test` in `scripts/`. Keep both green — `main` is what the scheduled collection workflows run from.

## Environment / secrets

Scripts read config from env vars (set as GitHub Actions secrets):
- `FIREBASE_SERVICE_ACCOUNT` — service-account JSON, raw or base64 (base64 preferred; `lib/firebase.js` auto-repairs broken `private_key` newlines).
- `MAIL_USERNAME` / `MAIL_PASSWORD` (Gmail app password) / `MAIL_TO` — for `lib/mailer.js`.
- `SEND_EMAIL=1` — makes `collect-daily.js` email on new posts (default: collect silently; the daily digest handles email).

The web app's `js/firebase-config.js` `apiKey` is a public client value by design — access is enforced by Firebase Auth + RTDB security rules (rules are documented in `README.md`), not by hiding it.

## Architecture

### Web dashboard (`js/`, loaded by `index.html`)
- `app.js` — entry point / view gate: swaps login ↔ main view based on auth state.
- `auth.js` — Google sign-in (Firebase Auth popup). RTDB `/users` is an **allowlist only**: authenticated emails not present in `/users` are signed straight back out. `admin: true` unlocks member management.
- `firebase-config.js` — Firebase init (auth + db) from CDN.
- `config.js` — shared browser constants + QT-date parsing + color rules.
- `assignments.js` — `COURSES` definition (see below).
- `dashboard.js` — the bulk of the UI: dashboard, member tabs, member management, assignment status rendering.

### Scheduled jobs (`scripts/`)
- `lib/scrape.js` — board scraping + QT-date parsing. Parses the list HTML by splitting on `class="mdDefaultW100 mdWebzinecon`, extracts title/link/date with regexes, filters out "공지" (notices) and posts before `START_DATE_STRING`. `fetchPostContent` pulls body text from detail pages.
- `lib/firebase.js` — `firebase-admin` init (service account → RTDB).
- `lib/members.js` — loads member roster from `/members`, falling back to `DEFAULT_MEMBERS`.
- `lib/mailer.js` — Gmail SMTP via nodemailer.
- `collect-daily.js` / `collect-history.js` / `digest-daily.js` / `report-monthly.js` / `backfill-content.js` — the jobs.

### RTDB data model
- `posts/<name>/<pushKey>: { collectedAt, postDate, title, link, content }`
- `state/<name>/lastTitle` — dedup checkpoint: collection walks newest→oldest and **breaks** when it hits `lastTitle`, then reverses the fresh batch to write oldest→newest.
- `members/<name>: { name, qt, active, course }` — `qt` = counts toward QT aggregation, `active` = gets scraped, `course` = training-course id for assignment grading.
- `assignments/<name>/<assignmentId>: true` — manual assignment checkboxes (any logged-in member may write).
- `users/<key>: { email, name, admin }` — access allowlist.
- `state/*` is server-only (rules deny client read/write).

## Critical invariants — read before editing

1. **`extractQtDays` is duplicated in `js/config.js` and `scripts/lib/scrape.js` and must be kept identical** (there is no shared module across the web/Node split — it's manually synced, as noted in `config.js`). The same applies to `TARGET_NAMES` / `QT_TARGET_NAMES` / `postNum`. Change both sides together.

2. **The QT-date parser is the most safety-critical logic** — it drives completion aggregation and was carefully ported from the legacy script. It recognizes many title date formats (`260215`, `20260215`, `0215`, `2월15`, `2.15`, `02/15`) for a given year/month and returns in-range days. `scripts/test/qt-parse.test.js` guards it; extend the tests when touching it.

3. **QT completion is counted by the date *in the post title*, not the collection date.** Aggregation dedups days via a `Set` (distinct days ÷ days-in-month).

4. **Assignments live entirely in `js/assignments.js`.** To add/change a training course or its weekly tasks, edit the `COURSES` array only. Each task carries keyword lists (`m` = match keywords, `x` = exclude) used to auto-match scraped `[훈련나눔]` post titles; tasks with no keywords (e.g. pledge forms) are manual checkboxes. Members are only graded against their own `course`.

5. **KST (Asia/Seoul) is the fixed timezone** for date boundaries and cron scheduling. `daily-collect.yml` cron is written in UTC but targets KST 06–23h.

6. **Dedup is title-based** (`state/<name>/lastTitle`) for daily collection but **post-number-based** (`postNum`, `num=` query param) for history/dedupe tools, which is more robust. Preserve the `num`-based idempotency in those tools.

## Deployment

GitHub Pages: Settings → Pages → deploy from `main` / root. Pages only serves the static site; collection/reporting are entirely GitHub Actions (`.github/workflows/`), independent of deployment.

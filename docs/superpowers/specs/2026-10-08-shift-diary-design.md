# Shift Diary — Design Spec

**Date:** 2026-10-08
**Author:** Kair (with Claude)
**Purpose:** Test project for arqa's "Developer (mobile + backend), working with AI tools" role — https://jobs.arqa.cc
**Status:** Approved design. Next step: implementation plan.

---

## 1. Goal and success criteria

Build "Дневник смен водителя" (driver shift diary): a web app plus API that turns a driver's trips into a daily earnings summary.

The submission succeeds when:

1. **Every mandatory requirement is met and provable.** Each one is mapped in the README to the code and the test that proves it.
2. **A reviewer installs nothing.** They open a public URL and everything works on any device. A one-command Docker run exists as a fallback.
3. **It stands out through product thinking, not stack exotica:** a driver-first UI, a visible "under the hood" panel, an end-of-shift receipt, RU/KZ/EN, an installable PWA, and an animated demo video.
4. **AI use is honest and evidenced** in `AI_LOG.md`: what AI got wrong, how it was caught, and the commit that fixed it.
5. **CI is green on every PR**, and production is smoke-tested after every deploy.

### arqa's mandatory requirements (verbatim intent)

| # | Requirement | Where it's satisfied |
|---|---|---|
| R1 | API returns trips for a chosen day + day summary: count, revenue, commission, net ("на руки"), cash/card split | `GET /api/trips?date=` |
| R2 | Client shows the summary and trip list, can switch days | `apps/web` main screen |
| R3 | Add a trip via API with validation (amount > 0, end > start); re-sending the same trip creates no duplicate | `POST /api/trips` |
| R4 | Tests for the summary calculation and the duplicate protection | `packages/core` + `apps/api` tests |

To submit: a public repo with a README (how to run + what was done); a demo link or screenshots (optional — we provide both); a note on AI usage, where it erred, and what was fixed by hand.

Reference data (from the brief):

```json
[
  {"id": "t1", "start": "2026-10-01T08:10:00+05:00", "end": "2026-10-01T08:32:00+05:00",
   "amount": 2400, "payment": "card", "commission": 360},
  {"id": "t2", "start": "2026-10-01T09:05:00+05:00", "end": "2026-10-01T09:20:00+05:00",
   "amount": 1500, "payment": "cash", "commission": 225}
]
```

Expected summary for 2026-10-01: trips 2, revenue 3 900, commission 585, net 3 315, cash 1 500, card 2 400.

### Explicitly out of scope

Authentication, multiple drivers, offline sync, editing or deleting trips, native mobile apps.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere (strict) | One language across API, client, tests, and video |
| Monorepo | pnpm workspaces | Shared `core` package |
| API | Hono | Same code runs on Cloudflare Workers and Node |
| DB | Cloudflare D1 (SQLite) in prod; better-sqlite3 locally / in Docker | Free, no cold starts; same SQL dialect everywhere |
| ORM / migrations | Drizzle ORM + drizzle-kit | Typed queries, works with D1 and better-sqlite3 |
| Validation | Zod, shared by server and client | One source of truth for the rules |
| Client | React + Vite, TanStack Query, Tailwind CSS | Fast, standard, well known to Claude |
| Animation (in-app) | Motion (motion.dev) | Count-ups, day swipes, the receipt |
| i18n | i18next + react-i18next; `Intl.NumberFormat` | RU default, KZ and EN |
| PWA | vite-plugin-pwa | Installable to the home screen |
| Unit / property tests | Vitest + fast-check | Invariants over random data |
| E2E / a11y | Playwright + @axe-core/playwright | Real browser; accessibility checks |
| Hosting | Cloudflare Workers (static assets + API in one Worker) + D1 + Cron Triggers | One URL, global, free, doesn't sleep |
| Local fallback | Docker Compose (Node + SQLite file) | Runs anywhere without Cloudflare |
| CI/CD | GitHub Actions; Claude GitHub Action for PR review | Review and auto-checks on every change |
| Demo video | Remotion + official Remotion agent skills | Animated video written as React code |

---

## 3. Architecture

```
shift-diary/
├─ packages/core/     # pure logic: schemas, day boundaries, summary — no I/O
├─ apps/api/          # Hono app; adapters for Workers (D1) and Node (SQLite)
├─ apps/web/          # React PWA, built and served as Worker static assets
├─ video/             # Remotion project
├─ e2e/               # Playwright tests + demo recording script
├─ data/trips.json    # seed data (the brief's example, extended to ~2 weeks)
├─ docs/              # this spec, AI_LOG.md, screenshots
└─ .github/workflows/ # ci.yml, deploy.yml, release-video.yml
```

**Unit boundaries**
- `core` knows nothing about HTTP or databases. It exports `TripSchema`, `summarize(trips)`, `localDateOf(instant)`, `dayRange(date)`, and `canonicalize(trip)`.
- `api` depends on `core` and a `TripRepository` interface with two implementations (D1, better-sqlite3). The route handlers never touch SQL directly.
- `web` depends on `core` for schemas and types only; all data comes through the API.

---

## 4. Domain rules

### 4.1 Money
Integer tenge only. No floats anywhere. Summaries are integer sums.

### 4.2 The "day"
- A day is a calendar date in **Kazakhstan time, a fixed UTC+05:00** (Kazakhstan has used a single UTC+5 zone with no DST since March 2024).
- Use a **fixed +05:00 offset in `core`**, not the IANA zone name. Older browsers or OS timezone data may still map `Asia/Almaty` to +06:00, which would silently shift trips between days.
- A trip belongs to the day its **start** falls on. A 23:50–00:20 trip counts toward the first day.
- `dayRange("2026-10-01")` = `[2026-10-01T00:00+05:00, 2026-10-02T00:00+05:00)`.

### 4.3 Summary
```
tripCount  = number of trips
revenue    = Σ amount
commission = Σ commission
net        = revenue − commission     ("на руки")
cash       = Σ amount where payment = cash
card       = Σ amount where payment = card
```

### 4.4 Validation (Zod, shared)
| Field | Rule | Error code |
|---|---|---|
| id | non-empty string, ≤ 64 chars, `[A-Za-z0-9_-]` | `ID_INVALID` |
| start, end | ISO 8601 with an explicit offset | `TIME_INVALID` |
| end | strictly after start | `END_BEFORE_START` |
| duration | ≤ 12 hours | `DURATION_TOO_LONG` |
| amount | integer > 0 | `AMOUNT_INVALID` |
| commission | integer, 0 ≤ commission ≤ amount | `COMMISSION_INVALID` |
| payment | `cash` or `card` | `PAYMENT_INVALID` |

**Overlapping trips** are accepted, not rejected. The response includes `warnings: [{ code: "OVERLAP", with: "<tripId>" }]`, and the UI shows a badge. Rejecting would go beyond the brief and could fail a reviewer's valid test.

### 4.5 Idempotency (duplicate protection)
The trip `id` is the idempotency key, scoped to a sandbox.

| Situation | Response |
|---|---|
| New id | **201** + trip |
| Same id, identical payload | **200** + existing trip + header `Idempotent-Replay: true` |
| Same id, different payload | **409** `{ code: "ID_CONFLICT", diff: { field: [stored, sent] } }` |
| Invalid payload | **422** `{ errors: [{ field, code }] }` |

- "Identical" means equal after `canonicalize()`: times converted to UTC instants, so `08:10+05:00` and `03:10Z` match.
- The insert is one atomic statement (`INSERT … ON CONFLICT (sandbox_id, id) DO NOTHING`, then read back and compare), so concurrent identical requests yield exactly one row.

---

## 5. Data model

```sql
CREATE TABLE sandboxes (
  id          TEXT PRIMARY KEY,         -- random, 128-bit
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL
);

CREATE TABLE trips (
  sandbox_id   TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,
  start_utc    INTEGER NOT NULL,        -- epoch ms
  end_utc      INTEGER NOT NULL,
  start_offset TEXT NOT NULL,           -- original offset, e.g. "+05:00"
  end_offset   TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  commission   INTEGER NOT NULL,
  payment      TEXT NOT NULL CHECK (payment IN ('cash','card')),
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (sandbox_id, id)
);
CREATE INDEX trips_by_day ON trips (sandbox_id, start_utc);
```

### Sandboxes
- First request without a sandbox: create one, seed it from `data/trips.json`, and set an httpOnly, SameSite=Lax cookie.
- API clients (curl, an AI evaluator) may send `X-Sandbox-Id` instead. A request with no cookie and no header gets a fresh sandbox, whose id is returned in the `X-Sandbox-Id` response header.
- A Cron Trigger deletes sandboxes not seen for 7 days.

---

## 6. API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/trips?date=YYYY-MM-DD` | `{ date, timezone: "+05:00", summary, trips[] }`, trips sorted by start |
| GET | `/api/days` | `{ days: [{ date, tripCount }] }` |
| POST | `/api/trips` | see §4.5 |
| POST | `/api/sandbox/reset` | 204; restores seed data |
| GET | `/api/health` | `{ ok: true, version, commit }` |

A missing or malformed `date` returns 422 `DATE_INVALID`. A date with no trips returns 200 with a zero summary.

---

## 7. Client

### Main screen (mobile-first, responsive to desktop)
- **Day switcher:** swipe or arrows; a date strip with dots on days that have trips (from `/api/days`); a "Today" button.
- **Summary card:** "На руки" as the hero number with a count-up animation; revenue and commission below it; a cash/card split bar.
- **Trip list:** time range, duration, amount, payment icon, overlap badge. A friendly empty state for days with no trips.
- **Add trip:** a bottom sheet with large inputs and time pickers. Live validation uses the shared Zod schema, but the server response is authoritative. Errors show inline, translated from error codes.

### End-of-shift receipt
A "Закрыть смену" button animates the day into a paper receipt that unrolls line by line. It mirrors the summary card on arqa's landing page. "Share" exports it as a PNG via the Web Share API, with a download fallback.

### "Под капотом" panel (for reviewers)
A collapsible drawer with:
1. **Repeat the last trip:** shows `200` + `Idempotent-Replay: true`; the trip count stays the same.
2. **Same id, different amount:** shows `409` + the diff.
3. **Invalid trip:** shows `422` + the error codes.
4. **Reset demo.**

Each action displays the raw request and response.

### i18n
RU (default), KZ, EN via a header toggle, persisted in localStorage (wrapped in try/catch). All strings live in `locales/{ru,kk,en}.json`. Money is formatted as `3 315 ₸`. API error codes map to translated messages.

### PWA
Manifest, icons, splash screen, and an offline shell (cached UI with a "no connection" state; no offline writes).

### Motion and accessibility
UI transitions take ≤ 300 ms (the receipt is the exception). `prefers-reduced-motion` disables animations. Tap targets are ≥ 44 px. axe reports no serious violations.

---

## 8. Error handling

- The API never leaks stack traces. Every error has a stable `code`.
- The client shows a toast on network failure and retries GETs automatically (TanStack Query). A POST retried after a network drop is safe because of idempotency; the UI states this ("Отправлено повторно — дубль не создан").
- Structured JSON logs in the Worker, viewable through Cloudflare observability.

---

## 9. Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | The brief's example (3 900 / 585 / 3 315 / 1 500 / 2 400); empty day; cash-only; card-only; midnight-crossing trip; 02:00 local vs UTC date; every validation rule |
| Property | fast-check | For random trip sets: net = revenue − commission; cash + card = revenue; Σ daily summaries = summary of all trips; `canonicalize` is idempotent and offset-insensitive |
| API | Vitest + Hono test client + in-memory SQLite | 201 → 200 replay → 409 conflict; every 422; sandbox isolation (A can't see B); reset; **20 concurrent identical POSTs → exactly 1 row** |
| E2E | Playwright (iPhone-sized + desktop) | Switch days; add a trip; duplicate attempt; under-the-hood panel; KZ toggle; receipt opens; axe scan |
| Smoke | Playwright against production | Health; seed day summary; one add-trip flow; runs after every deploy |

**Process rule:** the summary and idempotency tests are written first (TDD) and reviewed by Kair before implementation. Any AI-written test that was wrong is logged in `AI_LOG.md`.

---

## 10. CI/CD

- **`ci.yml` (every PR):** install → typecheck → lint → unit + property → API → build → E2E against a local preview → coverage comment. The Claude GitHub Action posts a review.
- **`deploy.yml` (push to main):** run D1 migrations → `wrangler deploy` → smoke test against production → fail loudly if the smoke test fails.
- **`release-video.yml` (on GitHub release):** render the Remotion video and attach the MP4 to the release.
- **Secrets:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` live in GitHub Actions secrets and are never committed.
- **Branches:** one PR per phase, squash-merged, with Conventional Commits.

---

## 11. Demo video (Remotion)

45–60 seconds, 1080×1920 (phone) plus a 1920×1080 cut, silent with RU captions.

1. **Hook (5 s):** numbers fly into a summary card.
2. **Real app (20 s):** footage recorded automatically by `pnpm demo:record`, a Playwright script with video recording on. It switches days, adds a trip, toggles KZ, and closes the shift.
3. **Idempotency explainer (15 s):** an animated request arrives twice, gets stamped "replay," and the count stays at 1; a different payload gets "409."
4. **Proof (5 s):** green test output.
5. **End card:** live URL, repo, name.

The README embeds a short GIF that links to the MP4 on the latest release.

---

## 12. Documentation

### README.md (Russian)
1. One-line description, live demo link, video, badges (CI, coverage, demo).
2. **Как запустить:** open the URL / `docker compose up` / `pnpm i && pnpm dev`.
3. **Требования → доказательства:** R1–R4, each mapped to its code and its test file.
4. **Решения:** the day rule, duplicate semantics, overlap warnings, fixed +05:00 offset — each with its reason.
5. API reference with curl examples (using `X-Sandbox-Id`).
6. Testing table and commands.
7. **Как я использовал ИИ:** a summary plus a link to `AI_LOG.md`.
8. Что бы я сделал дальше.

### AI_LOG.md
Appended during the work, never written retrospectively. Each entry records: date · task · what the AI produced · what was wrong · how it was caught (test / review / Playwright / docs) · fix commit link.

### GitHub repo
- **Name:** `shift-diary`
- **About:** `Driver shift diary — daily earnings summary, idempotent trip API, RU/KZ/EN PWA.`
- **Website:** the live URL
- **Topics:** `typescript`, `hono`, `cloudflare-workers`, `react`, `pwa`, `remotion`, `fast-check`, `playwright`

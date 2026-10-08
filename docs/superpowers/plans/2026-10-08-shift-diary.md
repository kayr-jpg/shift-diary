# Shift Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Дневник смен водителя": a Hono API + React PWA that turns trips into a daily earnings summary with idempotent trip creation, deployed to Cloudflare Workers.

**Architecture:** `packages/core` holds pure logic (schemas, day boundaries, summary, canonicalization). `apps/api` is a Hono app over a `TripRepository` interface with SQLite (better-sqlite3) and D1 implementations. `apps/web` is a React PWA that consumes the API and is served as Worker static assets. Remaining deliverables: e2e, Docker, CI/CD, Remotion video, docs.

**Tech Stack:** TypeScript strict, pnpm workspaces, Hono, Drizzle ORM + drizzle-kit, Zod, better-sqlite3, Cloudflare Workers + D1, React + Vite, TanStack Query, Tailwind, Motion, i18next, vite-plugin-pwa, Vitest, fast-check, Playwright + axe, Remotion, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-08-shift-diary-design.md`

## Global Constraints

- Money is integer tenge; no floats anywhere; format as `3 315 ₸`.
- A day is a calendar date at fixed UTC+05:00 (never an IANA zone); a trip belongs to the day of its **start**; `dayRange(d)` is half-open `[d 00:00+05:00, d+1 00:00+05:00)`.
- Error codes: `ID_INVALID`, `TIME_INVALID`, `END_BEFORE_START`, `DURATION_TOO_LONG` (>12h), `AMOUNT_INVALID`, `COMMISSION_INVALID`, `PAYMENT_INVALID`, `DATE_INVALID`, `ID_CONFLICT`.
- Idempotency statuses: new id 201; same id + identical canonical payload 200 with header `Idempotent-Replay: true`; same id + different payload 409 `{code:"ID_CONFLICT", diff:{field:[stored,sent]}}`; invalid 422 `{errors:[{field,code}]}`.
- Overlaps are accepted with `warnings:[{code:"OVERLAP", with:"<tripId>"}]`.
- Sandbox: cookie (httpOnly, SameSite=Lax) or `X-Sandbox-Id` header; new sandbox seeded from `data/trips.json`; stale (7 days) sandboxes deleted by cron.
- API never leaks stack traces; every error has a stable `code`.
- UI: RU default, KZ, EN; transitions ≤ 300 ms (receipt excepted); `prefers-reduced-motion` disables animation; tap targets ≥ 44 px; axe no serious violations; localStorage always in try/catch.
- Conventional Commits; one PR per phase, squash-merged. Secrets only in GitHub Actions.
- Brief example for 2026-10-01 must give: trips 2, revenue 3900, commission 585, net 3315, cash 1500, card 2400.

## Review Focus

- Malformed/non-object/empty JSON body on `POST /api/trips` → 422 (not 500). Pinned in Task 5.
- `date=2026-02-30`, `2026-13-01`, `26-10-01`, empty → 422 `DATE_INVALID`. Pinned in Task 3 (`isValidDate`) and Task 6.
- Boundaries: duration exactly 12h accepted, 12h+1ms rejected; commission == amount accepted; back-to-back trips (end == next start) are NOT overlaps; a trip at exactly 00:00+05:00 belongs to the new day. Pinned in Tasks 2, 3, 5.
- Wrong types: `amount: "1500"`, `1500.5`, `null`, `commission: -1`, id with spaces/unicode/65 chars → matching 422 codes, never coercion. Pinned in Task 2.
- Bogus `X-Sandbox-Id` (unknown or malformed) → treated as no sandbox (fresh sandbox created, new id returned), never an error or a read of another sandbox's data. Pinned in Task 6.

---

### Task 1: Monorepo scaffold, tooling, CI skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.gitignore`, `.github/workflows/ci.yml`
- Create: `packages/core/{package.json,tsconfig.json,src/index.ts}`, `apps/api/{package.json,tsconfig.json}`, `apps/web/{package.json,tsconfig.json}`
- Create: `data/trips.json` (the brief's two trips for 2026-10-01 + ~12 more across 2026-09-28…2026-10-08 incl. one midnight-crossing trip and one overlapping pair)
- Create: `docs/AI_LOG.md` (header + empty table)

**Interfaces:**
- Produces: workspace packages `@shift/core`, `@shift/api`, `@shift/web`; root scripts `typecheck`, `lint`, `test`, `build`; `data/trips.json` as `Trip[]` (shape in Task 2).

- [ ] **Step 1:** `git init`, set default branch `main`; create the files above. Root scripts run each package's script via `pnpm -r`. TS `strict: true`, `noUncheckedIndexedAccess: true`. Vitest in every package with a placeholder test in core (`expect(1).toBe(1)`) so CI is green.
- [ ] **Step 2:** `ci.yml` on `pull_request`: checkout → pnpm/action-setup → setup-node 22 (cache pnpm) → `pnpm i --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build`.
- [ ] **Step 3:** Run `pnpm i && pnpm typecheck && pnpm lint && pnpm test`. Expected: all exit 0.
- [ ] **Step 4:** Commit `chore: scaffold pnpm monorepo and CI`. Create GitHub repo `shift-diary` (public) with About/topics from spec §12 and push — **ask the user to confirm before creating/pushing**.

---

### Task 2: core — Trip schema and validation (TDD)

**Files:**
- Create: `packages/core/src/trip.ts`, `packages/core/src/errors.ts`
- Test: `packages/core/test/trip.test.ts`
- Modify: `packages/core/src/index.ts` (re-export)

**Interfaces:**
- Produces:
  - `type ErrorCode` (union of the codes in Global Constraints)
  - `type Trip = { id: string; start: string; end: string; amount: number; commission: number; payment: "cash" | "card" }`
  - `type FieldError = { field: keyof Trip; code: ErrorCode }`
  - `validateTrip(input: unknown): { ok: true; trip: Trip } | { ok: false; errors: FieldError[] }`
  - `TripSchema` (Zod; issue messages are the `ErrorCode`s so the web form can reuse it)

- [ ] **Step 1: Write failing tests** in `trip.test.ts` (use `it.each` tables):
  - valid brief trip `t1` → `ok: true`
  - `id`: `""`, `"a b"`, `"é"`, 65×`"a"` → `ID_INVALID`; 64×`"a"`, `"t_1-A"` ok
  - `start`/`end`: `"2026-10-01"`, `"2026-10-01T08:10:00"` (no offset), `"nope"` → `TIME_INVALID`; `"2026-10-01T03:10:00Z"` ok
  - `end == start` and `end < start` → `END_BEFORE_START`
  - duration exactly 12h ok; 12h + 1 s → `DURATION_TOO_LONG`
  - `amount`: `0`, `-5`, `1500.5`, `"1500"`, `null`, `NaN` → `AMOUNT_INVALID`
  - `commission`: `-1`, `1.5`, `amount + 1` → `COMMISSION_INVALID`; `0` and `== amount` ok
  - `payment: "crypto"` / missing → `PAYMENT_INVALID`
  - input `null`, `"x"`, `[]`, `{}` → `ok: false`, never throws, and every required field is reported with its own code (so `{}` yields errors for id, start, end, amount, commission, payment)
  - multiple bad fields → all reported, not just the first
- [ ] **Step 2:** Run `pnpm --filter @shift/core test`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `trip.ts` with Zod `.strict()` object (no coercion; `z.number().int()`), time regex requiring `Z` or `±HH:MM` plus `Date.parse` finite check, cross-field checks in `superRefine`, and a mapper from Zod issues → `FieldError[]`. Do not run cross-field checks when a participating field is already invalid.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): trip schema and validation`.

---

### Task 3: core — day boundaries, canonicalize, overlaps (TDD)

**Files:**
- Create: `packages/core/src/time.ts`, `packages/core/src/canonical.ts`
- Test: `packages/core/test/time.test.ts`, `packages/core/test/canonical.test.ts`

**Interfaces:**
- Consumes: `Trip` (Task 2).
- Produces:
  - `const KZ_OFFSET = "+05:00"`
  - `isValidDate(date: string): boolean` (strict `YYYY-MM-DD`, real calendar date)
  - `localDateOf(instantMs: number): string`
  - `dayRange(date: string): { from: number; to: number }` (epoch ms, half-open)
  - `type CanonicalTrip = { id: string; startUtc: number; endUtc: number; amount: number; commission: number; payment: "cash" | "card" }`
  - `canonicalize(trip: Trip): CanonicalTrip`
  - `diffCanonical(stored: CanonicalTrip, sent: CanonicalTrip): Record<string, [unknown, unknown]>` (empty object = identical; keys are Trip field names `start`, `end`, `amount`, …)
  - `findOverlaps(candidate: CanonicalTrip, others: CanonicalTrip[]): string[]` (ids; strict interval overlap)

- [ ] **Step 1: Write failing tests:**
  - `dayRange("2026-10-01")` → `from === Date.parse("2026-10-01T00:00:00+05:00")`, `to - from === 86_400_000`
  - `localDateOf(Date.parse("2026-10-01T00:00:00+05:00")) === "2026-10-01"`; one ms earlier → `"2026-09-30"`
  - `02:00+05:00` on Oct 1 is `2026-09-30T21:00Z` yet `localDateOf` → `"2026-10-01"`
  - `isValidDate`: `2026-02-30`, `2026-13-01`, `26-10-01`, `""`, `2026-1-1` → false; `2028-02-29` → true
  - `canonicalize` of `08:10+05:00` equals that of `03:10:00Z`; `diffCanonical` of those is `{}`; differing amount → `{amount:[2400,2500]}`
  - `findOverlaps`: partial overlap → ids; `end == other.start` → `[]`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Day arithmetic via fixed `+5h` shift on epoch ms (no `Intl`, no timezone names).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(core): fixed +05:00 day boundaries, canonicalize, overlaps`.

---

### Task 4: core — summarize with property tests (TDD, reviewed first)

**Files:**
- Create: `packages/core/src/summary.ts`
- Test: `packages/core/test/summary.test.ts`, `packages/core/test/summary.property.test.ts`

**Interfaces:**
- Consumes: `Trip`, `CanonicalTrip`, `localDateOf`.
- Produces:
  - `type Summary = { tripCount: number; revenue: number; commission: number; net: number; cash: number; card: number }`
  - `summarize(trips: ReadonlyArray<{ amount: number; commission: number; payment: "cash" | "card" }>): Summary`

- [ ] **Step 1: Write failing tests**, then **pause and ask the user to review them** (spec §9 process rule) before Step 3:
  - brief example → `{tripCount:2, revenue:3900, commission:585, net:3315, cash:1500, card:2400}`
  - empty → all zeros; cash-only; card-only
  - midnight-crossing trip (23:50→00:20) counted on its start day when grouped via `localDateOf(canonicalize(t).startUtc)`
  - fast-check (≥200 runs): `net === revenue - commission`; `cash + card === revenue`; sum of per-day summaries (grouped by `localDateOf`) equals `summarize(all)`; `canonicalize(t)` deep-equals `canonicalize` of the same trip re-expressed in UTC (offset-insensitive) and is idempotent on its own output re-expressed as a Trip. Arbitraries generate valid trips (integer amount 1..10⁷, commission 0..amount, offsets from `+05:00|Z|+03:00`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `summarize` as a single integer reduce.
- [ ] **Step 4:** Run → PASS; run `pnpm --filter @shift/core test -- --coverage` and confirm core ≥ 95% lines.
- [ ] **Step 5:** Commit `feat(core): day summary with property tests`. Open PR "phase 1: core".

---

### Task 5: api — repository, schema, idempotent POST (TDD)

**Files:**
- Create: `apps/api/drizzle.config.ts`, `apps/api/src/db/schema.ts`, `apps/api/migrations/*` (generated), `apps/api/src/repo.ts` (interface + types), `apps/api/src/repo.sqlite.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/trips.ts`
- Test: `apps/api/test/post-trips.test.ts`, `apps/api/test/helpers.ts`

**Interfaces:**
- Consumes: `validateTrip`, `canonicalize`, `diffCanonical`, `findOverlaps`, `CanonicalTrip` from `@shift/core`.
- Produces:
  - `StoredTrip = CanonicalTrip & { startOffset: string; endOffset: string }`
  - `interface TripRepository` (all async): `createSandbox(id: string, seed: StoredTrip[], now: number): Promise<void>`, `sandboxExists(id: string): Promise<boolean>`, `touchSandbox(id: string, now: number): Promise<void>`, `insertIfAbsent(sandboxId: string, trip: StoredTrip, now: number): Promise<{ created: boolean; stored: StoredTrip }>`, `listRange(sandboxId: string, from: number, to: number): Promise<StoredTrip[]>`, `listAll(sandboxId: string): Promise<StoredTrip[]>`, `resetSandbox(id: string, seed: StoredTrip[], now: number): Promise<void>`, `deleteStale(olderThan: number): Promise<number>`
  - `createSqliteRepo(db: BetterSqlite3Database): TripRepository`
  - `createApp(deps: { repo: TripRepository; seed: Trip[]; version: string; commit: string; now?: () => number }): Hono`
  - test helper `makeTestApp()` → `{ app, repo, sandboxId }` with in-memory SQLite and migrations applied.

- [ ] **Step 1:** Define Drizzle schema exactly as spec §5 DDL; run `drizzle-kit generate`; commit the migration.
- [ ] **Step 2: Write failing tests** in `post-trips.test.ts` (header `X-Sandbox-Id: <sandboxId>` on every request):
  - new trip → 201, body is the trip (original offsets preserved in response `start`/`end`)
  - same payload again → 200 + `Idempotent-Replay: true`; row count stays 1
  - same id, `03:10:00Z` instead of `08:10:00+05:00` (equal instant) → 200 replay
  - same id, amount 2500 → 409 `{code:"ID_CONFLICT", diff:{amount:[2400,2500]}}`
  - each validation rule from Task 2 over HTTP → 422 with `errors[].code`
  - body `"not json"`, `""`, `null`, `[]` → 422 (never 500)
  - overlapping trip → 201 with `warnings:[{code:"OVERLAP", with:"t1"}]`; back-to-back → no warnings
  - same id in two different sandboxes → both 201, isolated
  - **20 concurrent identical `Promise.all` POSTs → exactly one 201, nineteen 200, `listAll` length 1**
  - 500-path: a repo that throws → 500 `{code:"INTERNAL"}` with no stack in body
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement. `insertIfAbsent` uses Drizzle `onConflictDoNothing` on `(sandbox_id, id)`, then selects the row and returns `created` from the insert's changes count. Route compares via `diffCanonical`. Global `app.onError` returns the `INTERNAL` body and logs one JSON line. JSON parse failures map to 422.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `feat(api): idempotent POST /api/trips with sandbox repo`.

---

### Task 6: api — sandboxes, GET trips/days, reset, health (TDD)

**Files:**
- Create: `apps/api/src/middleware/sandbox.ts`, `apps/api/src/routes/{read,sandbox,health}.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/{get-trips,sandbox,health}.test.ts`

**Interfaces:**
- Consumes: `TripRepository`, `createApp` (Task 5); `dayRange`, `isValidDate`, `localDateOf`, `summarize`.
- Produces: `sandboxMiddleware(deps)` setting `c.var.sandboxId`; routes per spec §6; response shape `{ date, timezone: "+05:00", summary: Summary, trips: ApiTrip[] }` with `ApiTrip = Trip & { durationMinutes: number; warnings?: Warning[] }`.

- [ ] **Step 1: Write failing tests:**
  - no cookie/header → seeded sandbox created, `X-Sandbox-Id` response header set, `Set-Cookie` is `HttpOnly; SameSite=Lax`; follow-up with cookie sees same data
  - `GET /api/trips?date=2026-10-01` on a seeded sandbox → exact brief summary, trips sorted by start
  - empty date (2026-01-01) → 200 zero summary, `trips: []`
  - midnight-crossing seed trip appears on its start day only
  - `date` missing / `2026-02-30` / `26-10-01` → 422 `DATE_INVALID`
  - `/api/days` → days with `tripCount`, ascending, in local dates
  - `X-Sandbox-Id: garbage` and a well-formed unknown id → new sandbox created, id differs from the one sent, no other sandbox's data visible
  - `POST /api/sandbox/reset` → 204; previously added trip gone; seed restored
  - `/api/health` → `{ok:true, version, commit}`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Sandbox ids: 16 random bytes hex (`crypto.getRandomValues`); validate `^[0-9a-f]{32}$` before DB lookup. Seed conversion `Trip → StoredTrip` lives in one helper reused by create and reset. Compute `warnings` per trip on read via `findOverlaps` over the day's trips (so the UI badge survives reload).
- [ ] **Step 4:** Run → PASS; coverage for `apps/api` ≥ 90%.
- [ ] **Step 5:** Commit `feat(api): sandboxes, day queries, reset, health`.

---

### Task 7: api — Node server, D1 adapter, Worker entry, cron

**Files:**
- Create: `apps/api/src/node.ts`, `apps/api/src/repo.d1.ts`, `apps/api/src/worker.ts`, `wrangler.jsonc` (root), `scripts/migrate-local.ts`
- Test: `apps/api/test/repo.contract.test.ts` (shared contract suite run against sqlite repo and a D1 repo backed by Miniflare/`@cloudflare/vitest-pool-workers` or `wrangler`'s local D1)

**Interfaces:**
- Consumes: `TripRepository`, `createApp`.
- Produces: `createD1Repo(db: D1Database): TripRepository`; Worker default export `{ fetch, scheduled }`; Node entry serving `apps/web/dist` statics + API on `PORT` (default 8787) using `@hono/node-server`, DB path from `DB_PATH` (default `./data/app.db`), migrations applied on boot.

- [ ] **Step 1:** Extract the repo behavior tests from Task 5 into a `repoContract(makeRepo)` function; write the D1 run of it (failing: `createD1Repo` missing).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `createD1Repo` using Drizzle's D1 driver; atomic insert uses the same `onConflictDoNothing`; D1 batch for create/reset. `worker.ts`: `fetch` builds app with D1 repo and `ASSETS` binding falls through for non-`/api` paths; `scheduled` calls `deleteStale(now - 7d)`. `wrangler.jsonc`: assets dir `apps/web/dist` with SPA fallback, `d1_databases`, `triggers.crons: ["0 3 * * *"]`, observability enabled. `version`/`commit` injected via `--var` at deploy.
- [ ] **Step 4:** Run contract suite against both repos → PASS. Manual check: `pnpm --filter @shift/api dev:node` then `curl -s localhost:8787/api/health` returns `{"ok":true,...}`.
- [ ] **Step 5:** Commit `feat(api): D1 adapter, Worker entry, cron cleanup, Node server`. Open PR "phase 2: api".

---

### Task 8: web — scaffold, API client, i18n, main screen

**Files:**
- Create: `apps/web/{index.html,vite.config.ts,tailwind.config.ts}`, `src/{main.tsx,App.tsx,api.ts,money.ts,i18n.ts}`, `src/locales/{ru,kk,en}.json`, `src/components/{DayStrip,SummaryCard,TripList,LangToggle,Toasts}.tsx`
- Test: `apps/web/test/{money.test.ts,i18n-keys.test.ts,App.test.tsx}` (Vitest + Testing Library, MSW or fetch stub)

**Interfaces:**
- Consumes: API shapes from Task 6; `Summary`, `Trip`, `ErrorCode` from `@shift/core`.
- Produces:
  - `formatMoney(n: number, lang: "ru" | "kk" | "en"): string` → `"3 315 ₸"` (narrow no-break space grouping, ₸ suffix)
  - `api.getDay(date: string): Promise<DayResponse>`, `api.getDays(): Promise<{date:string;tripCount:number}[]>`, `api.postTrip(trip: Trip): Promise<{ status: number; replay: boolean; body: unknown }>`, `api.reset(): Promise<void>` — all send credentials (cookie); a `X-Sandbox-Id` header is not used by the web app
  - `useDay(date)`, `useDays()` TanStack Query hooks (GET retry 3 with backoff)
  - `t(`errors.${code}`)` message for every `ErrorCode`
  - Vite dev proxy `/api → http://localhost:8787`

- [ ] **Step 1: Write failing tests:** `formatMoney(3315,"ru")==="3 315 ₸"` (assert with the exact separator used); `i18n-keys.test.ts` asserts ru/kk/en have identical key sets and a key for every `ErrorCode`; `App.test.tsx` with stubbed API renders hero "На руки" = `3 315 ₸`, revenue, commission, two trips, and clicking the next-day arrow requests the next date.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Initial date = latest day with trips from `/api/days` if today has none (so reviewers never land on an empty screen); "Today" button jumps to today (KZ date via `localDateOf(Date.now())`). Language persisted in localStorage inside try/catch. Empty-day friendly state. Mobile-first Tailwind, tap targets `min-h-11`.
- [ ] **Step 4:** Run → PASS; `pnpm --filter @shift/web build` succeeds.
- [ ] **Step 5:** Commit `feat(web): main screen with summary, trip list, day switching, i18n`.

---

### Task 9: web — add-trip bottom sheet

**Files:**
- Create: `apps/web/src/components/AddTripSheet.tsx`
- Test: `apps/web/test/AddTripSheet.test.tsx`

**Interfaces:**
- Consumes: `validateTrip`, `api.postTrip`, `useDay`.
- Produces: `<AddTripSheet open date onClose />`; on 201/200 invalidates `["day", date]` and `["days"]`; shows toast "Отправлено повторно — дубль не создан" (translated) when `replay` is true; shows overlap badge via refreshed list.

- [ ] **Step 1: Write failing tests:** live validation shows translated `END_BEFORE_START` and `AMOUNT_INVALID` inline using shared schema; server 422 codes render inline and override; submit success closes the sheet and the list refetches; network-failure then retry with same generated id yields a replay toast. Generated id is created once per sheet-open (`crypto.randomUUID()`-based, `[A-Za-z0-9_-]`) and reused on retry.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with native `<input type="time">`, number input `inputMode="numeric"`, payment segmented control; times combined with the viewed date and `+05:00`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(web): add-trip sheet with shared validation`.

---

### Task 10: web — "Под капотом" panel

**Files:**
- Create: `apps/web/src/components/UnderTheHood.tsx`
- Test: `apps/web/test/UnderTheHood.test.tsx`

**Interfaces:**
- Consumes: `api.postTrip`, `api.reset`, current day's last trip.
- Produces: `<UnderTheHood date lastTrip />` — four actions (repeat last trip; same id different amount; invalid trip; reset demo), each rendering raw request and response (status, `Idempotent-Replay` header, JSON).

- [ ] **Step 1: Write failing tests** (stubbed API): repeat → shows `200` and `Idempotent-Replay: true` and trip count unchanged; conflict → `409` and the diff JSON; invalid → `422` and code list; reset → calls `api.reset` and refetches.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement as a collapsible `<details>`-based drawer (keyboard accessible); disable repeat/conflict when the day has no trips.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(web): under-the-hood idempotency panel`.

---

### Task 11: web — end-of-shift receipt and share

**Files:**
- Create: `apps/web/src/components/Receipt.tsx`, `apps/web/src/lib/receiptImage.ts`
- Test: `apps/web/test/Receipt.test.tsx`

**Interfaces:**
- Consumes: `DayResponse`, `formatMoney`.
- Produces: `<Receipt day open onClose />` (lines unroll sequentially via Motion; reduced-motion shows it instantly); `renderReceiptPng(day: DayResponse, lang): Promise<Blob>` (canvas, no extra deps); `shareReceipt(blob: Blob, filename: string): Promise<"shared" | "downloaded">` using `navigator.canShare({files})` else anchor download.

- [ ] **Step 1: Write failing tests:** receipt lists date, trip count, revenue, commission, net, cash, card with correct formatted values for the brief day; `shareReceipt` uses `navigator.share` when `canShare` is true and falls back to a download otherwise (stub both paths); under `prefers-reduced-motion` all lines are present immediately.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; "Закрыть смену" button in the summary card opens it.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(web): end-of-shift receipt with share`.

---

### Task 12: web — motion polish, PWA, accessibility

**Files:**
- Create: `apps/web/src/components/CountUp.tsx`, `apps/web/public/icons/*`, PWA config in `vite.config.ts`, `src/components/OfflineBanner.tsx`
- Modify: `SummaryCard.tsx`, `App.tsx` (day swipe animation + swipe gesture)
- Test: `apps/web/test/CountUp.test.tsx`

**Interfaces:**
- Produces: `<CountUp value format />` (≤ 300 ms; renders final value immediately under reduced motion); web manifest (name, RU short_name, theme color, 192/512/maskable icons); service worker precaching the shell only; `OfflineBanner` shown on `navigator.onLine === false`; API requests are never cached by the SW.

- [ ] **Step 1: Write failing test:** `CountUp` ends on the exact integer and, with `matchMedia('(prefers-reduced-motion: reduce)')` true, renders it on first paint.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement CountUp, swipe (horizontal drag threshold 60 px), PWA plugin config (`registerType: "autoUpdate"`, `navigateFallbackDenylist: [/^\/api/]`), offline banner; ensure no POST is queued offline.
- [ ] **Step 4:** Run unit tests → PASS; `pnpm --filter @shift/web build` and confirm `manifest.webmanifest` + `sw.js` in `dist`.
- [ ] **Step 5:** Commit `feat(web): motion, PWA shell, offline state`. Open PR "phase 3: web".

---

### Task 13: e2e — Playwright and axe

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/tests/{main-flow,idempotency,i18n,receipt,a11y}.spec.ts`
- Modify: `.github/workflows/ci.yml` (add e2e job)

**Interfaces:**
- Consumes: built web + Node server (`pnpm --filter @shift/api start:node`) on port 8787, reset via `/api/sandbox/reset`. `BASE_URL` env var selects the target (local or production; reused by Task 15 smoke).
- Produces: projects `iphone` (iPhone 14 device) and `desktop`.

- [ ] **Step 1: Write the specs:** switch days and see the brief summary `3 315 ₸` on 2026-10-01; add a trip and see count increase; open panel and assert `200` + `Idempotent-Replay: true` + count unchanged, then `409`, then `422`; toggle KZ and assert a translated heading; close shift opens receipt; axe scan on main screen, open sheet, and receipt: zero `serious|critical` violations.
- [ ] **Step 2:** Run `pnpm e2e` locally. Expected: FAIL only where real defects exist; fix any found defect in the owning component (log each AI-caused defect in `docs/AI_LOG.md` with how it was caught).
- [ ] **Step 3:** Run again → all PASS on both projects.
- [ ] **Step 4:** Add CI job: build → start Node server in background → `npx playwright install --with-deps chromium webkit` → `pnpm e2e`; upload traces on failure.
- [ ] **Step 5:** Commit `test(e2e): playwright flows and axe scans`.

---

### Task 14: Docker Compose fallback

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

**Interfaces:**
- Produces: `docker compose up` serves app + API on `http://localhost:8787`, SQLite file on a named volume.

- [ ] **Step 1:** Multi-stage Dockerfile: build web + api with pnpm, runtime stage runs `node apps/api/dist/node.js` with `DB_PATH=/data/app.db`; healthcheck hits `/api/health`.
- [ ] **Step 2:** Run `docker compose up --build -d`, then `curl -s localhost:8787/api/health` → `{"ok":true`; `BASE_URL=http://localhost:8787 pnpm e2e` → PASS; `docker compose down`.
- [ ] **Step 3:** Commit `feat: docker compose fallback`.

---

### Task 15: Cloudflare deploy and production smoke

**Files:**
- Create: `.github/workflows/deploy.yml`, `e2e/tests/smoke.spec.ts`
- Modify: `package.json` (`smoke` script)

**Interfaces:**
- Consumes: `BASE_URL`; secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Produces: production URL; `smoke.spec.ts` asserts `/api/health` ok, `2026-10-01` summary equals the brief numbers via API (fresh sandbox, `X-Sandbox-Id` absent), and one UI add-trip flow.

- [ ] **Step 1:** **Ask the user to create the D1 database and the two GitHub secrets** (never handle the token in chat); then set `database_id` in `wrangler.jsonc`.
- [ ] **Step 2:** `deploy.yml` on push to `main`: install → build → `wrangler d1 migrations apply DB --remote` → `wrangler deploy --var VERSION:${{github.ref_name}} --var COMMIT:${{github.sha}}` → `BASE_URL=<prod> pnpm smoke`; job fails if smoke fails.
- [ ] **Step 3:** Merge to `main`; verify the workflow is green and open the live URL on a phone-sized viewport.
- [ ] **Step 4:** Commit `ci: deploy to Cloudflare with post-deploy smoke test` (if not already part of the merged PR). Update repo About "Website".

---

### Task 16: Demo video (Remotion) and recorder

**Files:**
- Create: `e2e/demo/record.ts`, `video/` (Remotion project: `src/{Root,Hook,Footage,Idempotency,Proof,EndCard}.tsx`), `.github/workflows/release-video.yml`
- Modify: `package.json` (`demo:record`, `video:render`)

**Interfaces:**
- Consumes: running app at `BASE_URL`.
- Produces: `pnpm demo:record` writes `video/public/footage.webm` (Playwright video, iPhone viewport, following the flow in spec §11 step 2); `pnpm video:render` outputs `out/shift-diary-1080x1920.mp4` and `out/shift-diary-1920x1080.mp4`.

- [ ] **Step 1:** Install Remotion's agent skills per its docs; write `record.ts` with deliberate pauses (switch days → add trip → KZ → close shift).
- [ ] **Step 2:** Compose five scenes totalling 45–60 s with RU captions; the Proof scene uses captured `vitest` output text rendered as styled lines.
- [ ] **Step 3:** Run `pnpm demo:record && pnpm video:render`; Expected: both MP4s exist, durations 45–60 s (check with `ffprobe`).
- [ ] **Step 4:** `release-video.yml` on `release: published` renders and uploads the MP4 to the release.
- [ ] **Step 5:** Commit `feat(video): remotion demo and recorder`.

---

### Task 17: Documentation and submission polish

**Files:**
- Create: `README.md` (Russian, sections exactly as spec §12), finalize `docs/AI_LOG.md`, `docs/screenshots/*`
- Modify: GitHub repo metadata

**Interfaces:**
- Consumes: live URL, test file paths, release MP4 link.

- [ ] **Step 1:** README: R1–R4 table with links to `apps/api/src/routes/read.ts`, `apps/api/src/routes/trips.ts`, `apps/web/src/App.tsx`, `packages/core/test/summary.test.ts`, `apps/api/test/post-trips.test.ts`; curl examples with `X-Sandbox-Id` for 201 / 200 replay / 409 / 422; decisions section; testing table; badges (CI, deploy).
- [ ] **Step 2:** Verify every claim: run each curl example against production and paste the real outputs; run the full suite (`pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`) and copy the pass counts.
- [ ] **Step 3:** `AI_LOG.md`: confirm every entry was appended at the time (date, task, what AI produced, what was wrong, how caught, fix commit link); the README AI section summarizes it. Entries must be real — do not invent any.
- [ ] **Step 4:** Add screenshots (iPhone + desktop, receipt, under-the-hood), create a GitHub release `v1.0.0` (triggers the video attach), set Website/topics.
- [ ] **Step 5:** Commit `docs: README, AI log, screenshots`. Open the final PR "phase 4: delivery".

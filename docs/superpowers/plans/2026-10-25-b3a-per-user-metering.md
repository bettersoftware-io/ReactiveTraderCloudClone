# B3a — per-user durable AI metering on the house key — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the server-wide, in-memory five-hour Jarvis budget with a per-person daily budget kept in Supabase, enforced before every model request, falling back to the scripted brain when spent.

**Architecture:** A `SpendStore` (Supabase or in-memory, chosen like the account directory) holds one row per owner, UTC day and key kind. A `JarvisBudgetService` keeps an in-process copy of today's totals, answers "is this caller exhausted?" synchronously, and writes every request's cost through. `jarvisEffects` turns the caller's tier and budget state into a per-connection availability offer and routes each turn; the Anthropic session asks a per-turn `TurnMeter` before every further request. The availability and ops-usage wire shapes stay as they are, so the client cores need only the narrator origin field.

**Tech Stack:** TypeScript, RxJS, Node `fetch` against Supabase PostgREST, Postgres (plpgsql), Vitest, the React and Solid web clients (Ops card copy only).

**Spec:** [docs/superpowers/specs/2026-10-25-b3-ai-metering-byo-keys-design.md](../specs/2026-10-25-b3-ai-metering-byo-keys-design.md) — §3 (B3a), D1–D7, D17, D19.

## Global Constraints

- House brains: role `user` → `scripted`, `claude-haiku-4-5`, `claude-sonnet-5`; role `admin` and roster persona → all of `JARVIS_BRAINS`. Default brain `claude-haiku-4-5` (`DEFAULT_JARVIS_BRAIN`).
- `RTC_JARVIS_USER_DAILY_USD` default `0.20`; `RTC_JARVIS_HOUSE_DAILY_USD` default `3`. `0` is valid. A malformed value warns, naming the setting and the value as the gate settings do today, and uses the default.
- Admin and roster persona: no personal limit; their spend counts toward the house cap.
- Day = UTC calendar day `YYYY-MM-DD`; resets at 00:00 UTC.
- Owner keys: `account:<accountId>`, `roster:<username>`; the house total row's owner is `house`.
- Exhaustion reasons: `"user" | "house" | "unavailable" | "forced"`.
- `RTC_JARVIS_FORCE_GATE=exhausted` forces every caller to `forced`; `soft`/`hard` are retired (warn, ignore). `RTC_JARVIS_BUDGET_USD` and `RTC_JARVIS_BUDGET_SOFT_RATIO` are removed.
- `RTC_JARVIS_FAKE=1` unchanged.
- Fail closed: any store read/write failure makes house turns scripted with reason `unavailable` until a later read succeeds.
- Narrator turns (`origin: "narrator"`) on a house brain run scripted and record nothing.
- Every table and function is private to the server: RLS on, no policy, `revoke all … from anon, authenticated`, and `revoke execute … from public, anon, authenticated` on the function.
- No secret value in any doc; names and meanings only.
- Repo rules: handler names by effect (`docs/handler-naming.md`), one import per module, fake timers for timer-driven tests, Biome + ESLint clean, `.js` relative imports in server source.

## Deferred to B3b (on purpose)

- The client still renders the existing gate surfaces: the footer chip's `budget exhausted`, the picker's disabled rows and the system line "Usage budget reached — continuing on Scripted until HH:MM." The spec's new copy (§4.1, the D5 switch line) arrives with the indicators in B3b, which also retires the now-unused `"soft"` gate level from `@rtc/domain`, core-logic and both clients.
- Deleting `jarvis_spend_daily` rows older than 35 days (spec §3.2, optional) is left out; a year of rows for a few hundred people is tiny.

## Review Focus

1. **Two tabs, one person.** Both connections must read and spend the same budget, and both must flip to scripted when it is spent — test in Task 4 and Task 5.
2. **Restart mid-day.** A fresh service over a store that already holds today's spend must start exhausted, not at zero — test in Task 4.
3. **The store goes down after the request was billed.** The write fails: the next turn must be scripted (`unavailable`), and a later successful read must lift it — test in Task 4.
4. **Midnight while idle.** A gated connection that sends nothing must still receive the lifting availability frame at 00:00 UTC — fake-timer test in Task 5.
5. **The database function is callable by browsers by default.** Postgres grants EXECUTE to PUBLIC on new functions; the migration must revoke it — pinned in Task 1.

---

### Task 1: Migration — `jarvis_spend_daily` and `record_jarvis_spend`

**Files:**
- Create: `supabase/migrations/20261025000000_jarvis_spend_daily.sql`
- Modify: `packages/server/src/accounts/migrations.test.ts`

**Interfaces:**
- Produces: table `public.jarvis_spend_daily(owner text, day date, key_kind text check in ('house','own'), spend_usd numeric not null default 0, turns integer not null default 0, primary key (owner, day, key_kind))`; function `public.record_jarvis_spend(p_owner text, p_day date, p_key_kind text, p_usd numeric) returns table (owner_usd numeric, house_usd numeric)` — upserts the owner row (adds `p_usd`, `turns + 1`), and when `p_key_kind = 'house'` also upserts the `('house', p_day, 'house')` row by `p_usd`, in one statement/transaction; returns the owner's and the house row's new `spend_usd` (house `0` when no row). `security definer set search_path = ''`, like `create_profile_for_user`.

- [ ] **Step 1: Write the failing tests** in `migrations.test.ts`, a new `describe("jarvis spend migration")` reading the new file:
  - `enables row-level security on jarvis_spend_daily` — matches `/alter table public\.jarvis_spend_daily enable row level security/i`
  - `revokes table access from the anon and authenticated roles` — `/revoke all on public\.jarvis_spend_daily from anon, authenticated/i`
  - `revokes execute on record_jarvis_spend from public, anon and authenticated` — `/revoke execute on function public\.record_jarvis_spend\([^)]*\) from public, anon, authenticated/i`
  - `pins the function's search path` — `/security definer set search_path = ''/i` appears in the function
  - the existing `defines no policy at all` must cover every migration file (check it reads all files; extend if it reads only the profiles one).
- [ ] **Step 2:** `pnpm --filter @rtc/server exec vitest run src/accounts/migrations.test.ts` → FAIL (file missing).
- [ ] **Step 3:** Write the migration with a header comment in the style of `create_profiles.sql` (private to the server; pinned by the test).
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(server): B3a jarvis_spend_daily table and record function`.

### Task 2: The spend store — UTC day helpers, in-memory and Supabase stores

**Files:**
- Create: `packages/server/src/services/jarvisBudget/utcDay.ts` (+ `.test.ts`)
- Create: `packages/server/src/services/jarvisBudget/SpendStore.ts` (types only)
- Create: `packages/server/src/services/jarvisBudget/InMemorySpendStore.ts` (+ `.test.ts`)
- Create: `packages/server/src/services/jarvisBudget/SupabaseSpendStore.ts` (+ `.test.ts`)
- Create: `packages/server/src/accounts/supabaseRest.ts` — the `call()` helper and `Reply` type moved out of `SupabaseAccountDirectory.ts` unchanged; the directory imports it (its tests must stay green untouched).

**Interfaces:**
- Produces:
  - `utcDayOf(ms: number): string` (`"2026-10-25"`), `nextUtcMidnightMs(ms: number): number`.
  - `type SpendOwner = \`account:${string}\` | \`roster:${string}\``; `type KeyKind = "house" | "own"`; `interface SpendTotals { readonly ownerUsd: number; readonly houseUsd: number }`.
  - `interface SpendStore { readonly kind: "supabase" | "in-memory"; read(owner: SpendOwner, day: string, keyKind: KeyKind): Promise<SpendTotals | "unavailable">; record(owner: SpendOwner, day: string, keyKind: KeyKind, usd: number): Promise<SpendTotals | "unavailable"> }`
  - `createInMemorySpendStore(): SpendStore`; `createSupabaseSpendStore(options: SupabaseDirectoryOptions): SpendStore` (same options type as the directory).
  - `createSupabaseRestClient(options): { call(request: Call): Promise<Reply> }`.

- [ ] **Step 1: Tests.**
  - `utcDay`: `utcDayOf(Date.UTC(2026,9,25,23,59,59,999)) === "2026-10-25"`; `utcDayOf(Date.UTC(2026,9,26)) === "2026-10-26"`; `nextUtcMidnightMs(Date.UTC(2026,9,25,13)) === Date.UTC(2026,9,26)`; `nextUtcMidnightMs(Date.UTC(2026,9,26)) === Date.UTC(2026,9,27)` (exactly midnight rolls to the next one).
  - In-memory: `record` of `0.05` then `0.07` house for `account:a` returns `{ownerUsd: 0.12, houseUsd: 0.12}`; a second owner's `0.01` returns house `0.13`; `own` kind leaves house untouched; a different day starts at `0`; `read` of an unknown owner is `{0, 0}`.
  - Supabase (fake `fetchImpl`): `record` POSTs `/rest/v1/rpc/record_jarvis_spend` with body `{p_owner, p_day, p_key_kind, p_usd}` and maps `[{owner_usd, house_usd}]` to totals (numeric arrives as string or number — accept both); `read` GETs `/rest/v1/jarvis_spend_daily?select=owner,spend_usd&day=eq.<day>&key_kind=eq.<kind>&owner=in.(<owner>,house)` and sums per owner (no quotes at top level — see the PostgREST top-level-filter trap: `eq.` values are plain percent-encoded); a 5xx, 401, timeout or network error → `"unavailable"`; a non-numeric body → `"unavailable"`.
- [ ] **Step 2:** Run the four test files → FAIL.
- [ ] **Step 3:** Implement. Move `call`/`Reply`/`Call`/`readJson` into `supabaseRest.ts` without behaviour change.
- [ ] **Step 4:** `pnpm --filter @rtc/server test` → all PASS, including the untouched `SupabaseAccountDirectory.test.ts`.
- [ ] **Step 5:** Commit `feat(server): B3a spend store over Supabase and in memory`.

### Task 3: Budget settings

**Files:**
- Create: `packages/server/src/services/jarvisBudget/jarvisBudgetConfig.ts` (+ `.test.ts`)

**Interfaces:**
- Produces: `interface JarvisBudgetConfig { readonly userDailyUsd: number; readonly houseDailyUsd: number; readonly forceExhausted: boolean }`; `parseJarvisBudgetConfig(env: NodeJS.ProcessEnv): JarvisBudgetConfig`; constants `DEFAULT_JARVIS_USER_DAILY_USD = 0.2`, `DEFAULT_JARVIS_HOUSE_DAILY_USD = 3`.

- [ ] **Step 1: Tests:** defaults with empty env; `"0.5"`/`"10"` parse; `"0"` parses to `0`; `"-1"`, `"abc"`, `""` warn and default; `RTC_JARVIS_FORCE_GATE=exhausted` → `forceExhausted: true`; `soft` and `hard` warn "retired" and give `false`.
- [ ] **Step 2:** FAIL. **Step 3:** implement (pattern of `parseJarvisGateConfig`). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(server): B3a daily budget settings`.

### Task 4: `JarvisBudgetService`

**Files:**
- Create: `packages/server/src/services/jarvisBudget/JarvisBudgetService.ts` (+ `.test.ts`)
- Create: `packages/server/src/services/jarvisBudget/jarvisTier.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: Task 2 store and day helpers, Task 3 config, `JARVIS_PRICE_TABLE` / `JarvisTokenUsage` and the cost arithmetic in `UsageMeter.ts` (export `estimateUsageCostUsd(brain, usage): number` from there rather than duplicating it), `Caller` from `serviceContainer.ts`, `AccountDirectory.findAccount`.
- Produces:
  - `type JarvisTier = "member" | "operator"`; `houseBrainsFor(tier: JarvisTier): readonly JarvisBrain[]`; `createTierLookup(directory: Pick<AccountDirectory, "findAccount">): (caller: Caller) => Promise<JarvisTier>` — roster (`accountId === null`) → `operator`; `access === "admin"` → `operator`; anything else, including `missing`/`unavailable` → `member`.
  - `type BudgetExhaustion = "user" | "house" | "unavailable" | "forced"`.
  - `interface BudgetState { readonly spentUsd: number; readonly limitUsd: number | null; readonly houseSpentUsd: number; readonly houseLimitUsd: number; readonly exhausted: BudgetExhaustion | null; readonly resetsAtMs: number }`
  - `interface TurnMeter { record(brain: Exclude<JarvisBrain, "scripted">, usage: JarvisTokenUsage): void; exhausted(): boolean }`
  - `class JarvisBudgetService` — `constructor(deps: { store: SpendStore; config: JarvisBudgetConfig; now?: () => number })`; `stateFor(caller: Caller, tier: JarvisTier): Promise<BudgetState>`; `meterFor(caller: Caller, tier: JarvisTier): TurnMeter`; `houseToday(): { spentUsd: number; limitUsd: number }`; `readonly changes$: Observable<void>`; `dispose(): void`.

Rules the tests pin (fake timers, `vi.useFakeTimers()` before construction, a fixed `now`):

- [ ] **Step 1: Tests:**
  - `stateFor` on a fresh store: member → `{spentUsd: 0, limitUsd: 0.2, exhausted: null, resetsAtMs: next UTC midnight}`; operator → `limitUsd: null`.
  - **restart mid-day:** store pre-seeded with `account:a` = 0.2 house today → a new service's `stateFor` is `exhausted: "user"`.
  - house seeded at 3 → member and operator both `exhausted: "house"`.
  - `userDailyUsd: 0` → member `exhausted: "user"` with zero spend; operator `null`.
  - `forceExhausted` → `"forced"` for both tiers.
  - `meterFor(...).record("claude-haiku-4-5", usage)` updates the copy synchronously (`exhausted()` flips the moment the cost crosses `0.2`) and writes through `store.record(owner, day, "house", usd)`; the store's returned totals replace the copy.
  - **two tabs:** two meters for the same caller share one total; spending on one exhausts the other.
  - **store down after billing:** `store.record` resolves `"unavailable"` → the next `stateFor` is `exhausted: "unavailable"`; after the store recovers, a `stateFor` re-reads and lifts.
  - a failed initial read → `"unavailable"` (never `null`).
  - `changes$` emits after each record, on each availability flip of the store, and at the next UTC midnight (advance timers to midnight → one emission; the day's copy is dropped so `stateFor` reads the new day).
  - writes for one owner are serialized (two quick records resolve in order; the final copy equals the sum).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. Run a mutation check (`node scripts/mutation-check.mts`) on: the house-cap comparison (`>=` → `>`), the fail-closed branch, and the midnight drop — each must go RED.
- [ ] **Step 5:** Commit `feat(server): B3a per-user daily budget service`.

### Task 5: Route turns and availability through the budget

**Files:**
- Modify: `packages/server/src/effects/jarvis.effects.ts` (+ `jarvis.effects.test.ts`)
- Modify: `packages/server/src/agent/agentLoop.ts` (`JarvisTurnOptions` gains `meter?: TurnMeter`)
- Modify: `packages/server/src/agent/AnthropicAgentSession.ts` (+ test), `AnthropicAgentLoop.ts` (drop the `usageMeter` option)
- Modify: `packages/server/src/services/serviceContainer.ts` (`usageMeter` stays, `jarvisGate` → `jarvisBudget: JarvisBudgetService`, plus `jarvisTier: (caller: Caller) => Promise<JarvisTier>`), `UsageMeter.ts` (window = the UTC day: start = day start, end = next midnight; display only, house key only)
- Modify: `packages/server/src/effects/opsJarvisUsage.effects.ts` (+ test)
- Modify: `packages/domain/src/jarvis/jarvisEvent.ts` and `packages/shared/src/jarvis/jarvisPayloads.ts` (new optional `budget` field)
- Delete: `packages/server/src/services/JarvisGateService.ts`, the gate parts of `jarvisGate.ts` (keep and move `applyGateToOffer` only if still used; otherwise delete the file and its test)

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `JarvisAvailabilityPayload.budget?: JarvisBudgetView` with `interface JarvisBudgetView { readonly keyKind: "house"; readonly spentUsd: number; readonly limitUsd: number | null; readonly exhausted: "user" | "house" | "unavailable" | "forced" | null; readonly resetsAtMs: number }` (in `@rtc/domain` next to `JarvisAvailabilityGate`; `keyKind` widens in B3c). Clients ignore it until B3b.
  - `JarvisChatPayload.origin?: "user" | "narrator"` (parsed leniently: anything else → `"user"`).
  - Availability per connection: offer = `loops.brains ∩ houseBrainsFor(tier)`; when `state.exhausted !== null` → `brains: ["scripted"]`, `defaultBrain: "scripted"`, `gate: { level: "hard", resetsAtMs: state.resetsAtMs, gated: <offer minus scripted> }`. The existing client gate rendering keeps working unchanged.
  - Mid-turn stop copy (exact): `BUDGET_STOP_NOTICE = "\n\nToday's AI budget is used — switching to the scripted brain."`

- [ ] **Step 1: Tests (`jarvis.effects.test.ts`, fake timers, an in-memory store):**
  - a member's `JARVIS_SUBSCRIBE` → brains `["scripted","claude-haiku-4-5","claude-sonnet-5"]`, default haiku, `budget.limitUsd` 0.2; an operator's → all four, `limitUsd: null`.
  - a member asking for `claude-opus-5` runs on the default (haiku).
  - exhausted member: a chat asking for haiku runs scripted; the subscribed socket got a `gate.level: "hard"` frame.
  - **two tabs:** two sockets of one caller; spending on one pushes a gated frame to both.
  - **midnight:** a gated socket that sends nothing receives an ungated frame after `vi.advanceTimersByTimeAsync` to 00:00 UTC.
  - a narrator turn (`origin: "narrator"`) asking for haiku runs scripted and records nothing.
  - re-subscribe on one socket still holds one observer (the existing latest-subscribe-wins test keeps passing).
- [ ] **Step 2: Tests (`AnthropicAgentSession.test.ts`):** with a `meter` whose `exhausted()` turns true after the first iteration's record and a runner fixture that would run a second iteration (`stop_reason: "tool_use"`), the turn emits the delta `BUDGET_STOP_NOTICE`, then `done`, makes no second request, and `meter.record` was called once with the first iteration's usage; without a meter the existing tests pass unchanged.
- [ ] **Step 3: Tests (`opsJarvisUsage.effects.test.ts`):** payload `budgetUsd` = house limit, `softBudgetUsd: null`, `spentWindowUsd` = `jarvisBudget.houseToday().spentUsd`, `gateLevel` `"hard"` when house spent ≥ limit else `"none"`, window bounds = today's UTC day.
- [ ] **Step 4:** FAIL. **Step 5:** implement. Turn flow in `projectChatTurn`: resolve the caller's tier once per connection (first use, cached in the effect's closure), `await stateFor` (wrap the async in `defer(from(...))` inside the existing `concatMap`), resolve the brain against the per-connection offer, force scripted for narrator-on-house, pass `meterFor(caller, tier)` as `options.meter`, and `usageMeter.recordTurn/recordTokens` keep feeding the Ops display. `availability$` re-evaluates on `merge(of(undefined), jarvisBudget.changes$)` with `switchMap` and `distinctUntilChanged` on the payload.
- [ ] **Step 6:** `pnpm --filter @rtc/server test` and `pnpm --filter @rtc/server typecheck` → PASS. Mutation-check: the narrator-on-house branch and the per-iteration `exhausted()` check go RED.
- [ ] **Step 7:** Commit `feat(server): B3a per-user offers, budget-aware turns and the mid-turn stop`.

### Task 6: Narrator origin from the clients

**Files:**
- Modify: `packages/core-api/src/adapters.ts` (`JarvisAskOptions.origin?: "user" | "narrator"`)
- Modify: `packages/core-logic/src/presenters/jarvisController.ts` (the plan's `options` carries `origin: "narrator"` for a `narrate` request)
- Modify: `packages/client-adapters/src/adapters/WsJarvisAdapter.ts` (+ test) — adds `origin` to the `JARVIS_CHAT` frame when present
- Modify: `packages/core-contract/src/suites/` — the suite that covers `ask` options gains a case: a narrate request reaches `port.ask` with `options.origin === "narrator"`, a send with no origin (or `"user"`). Load the `application-core-rules` skill first.

- [ ] **Step 1:** Contract case + `WsJarvisAdapter` test (`ask("…", {brain, effort, origin: "narrator"})` sends `origin: "narrator"`; without it the frame has no `origin` key).
- [ ] **Step 2:** FAIL across all three cores (`pnpm --filter "@rtc/client-core-*" test`).
- [ ] **Step 3:** implement in core-logic and the adapter only — no core-specific edits should be needed; if one is, the core is building its own options and the contract case has found it.
- [ ] **Step 4:** PASS in all three cores and `@rtc/client-adapters`.
- [ ] **Step 5:** Commit `feat(core): B3a narrator turns say so on the wire`.

### Task 7: Ops card copy for the daily house budget

**Files:**
- Modify: `packages/client-react/src/ui/ops/jarvis/JarvisUsageCard.tsx`, `packages/client-solid/src/ui/ops/jarvis/JarvisUsageCard.tsx`
- Modify: `packages/ui-contract/src/specs/ops/JarvisUsageCard.contract.spec.ts`, `packages/ui-contract/src/visual/fixtures.ts` / `appData.ts` as needed
- Regenerate: the `ops-jarvis-usage-card` goldens (both themes, every bucket the recipe in memory `visual-scenario-add-recipe` names)

Exact copy:
- budget line: `$<spent> of $<limit> house budget today (UTC)`; `BUDGET OFF` branch removed (the limit is always a number); the soft-gate clause removed; `· EXHAUSTED` suffix when `gateLevel === "hard"`.
- section title `CURRENT WINDOW` → `TODAY (UTC)`; `Window resets HH:MM:SS` → `Resets 00:00 UTC`; `SINCE BOOT` unchanged.

- [ ] **Step 1:** Update the contract spec's expected strings → FAIL in both clients. **Step 2:** implement in both. **Step 3:** PASS (`pnpm --filter @rtc/client-react test:ui:contract` and the Solid one).
- [ ] **Step 4:** Regenerate the goldens; the user accepts them by eye before merge.
- [ ] **Step 5:** Commit `feat(ui): B3a Ops usage card reads the daily house budget`.

### Task 8: Wiring, docs and STATUS

**Files:**
- Modify: `packages/server/src/index.ts` — build the account directory before the services; `createSpendStore(accountsMode, options)` (Supabase in `supabase` mode, in-memory otherwise — add it beside `createAccountDirectory`); `JarvisBudgetService`; `createTierLookup(accountDirectory)`; pass both into `createServices`; dispose on shutdown.
- Modify: `packages/server/src/services/serviceContainer.ts` `createServices` signature to accept them (tests construct an in-memory store by default).
- Modify docs (names and meanings only): `docs/security.md` inventory (the two settings, the retired three, the new table), `docs/running-real-jarvis.md` (the gate recipe becomes `RTC_JARVIS_FORCE_GATE=exhausted`; the S7 note becomes durable per-user), `docs/DEPLOY.md` (a "Rolling out B3a" section: apply the migration first, then server + both web clients together), `docs/architecture/18-jarvis-ai-agent-surface.md` §18.15 governance paragraph (pointer to the spec; the five-hour window is gone), `docs/STATUS.md` (B3 entry: spec + this plan, B3a in progress; S7 resolved on deploy).
- Test: `tests/fullstack/node-smoke.ts` gains one check if cheap: a roster login's `JARVIS_AVAILABILITY` carries `budget.limitUsd === null`.

- [ ] **Step 1:** Wire; `pnpm build` then `pnpm --filter @rtc/server test`.
- [ ] **Step 2:** Run the server locally with `RTC_DEV_ACCOUNTS=1`, `RTC_JARVIS_FAKE` unset, `ANTHROPIC_API_KEY=e2e-dummy`, `RTC_JARVIS_FORCE_GATE=exhausted`: the footer chip reads `budget exhausted` and every turn is scripted (recipe in `running-real-jarvis.md`).
- [ ] **Step 3:** Docs; `pnpm check:doc-links`.
- [ ] **Step 4:** `/rtc:gauntlet full`.
- [ ] **Step 5:** Commit `feat(server): B3a wire the daily budget; docs and STATUS`.

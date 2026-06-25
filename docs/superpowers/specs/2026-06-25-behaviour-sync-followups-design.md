# Behaviour-Sync Follow-ups + Idle Reconnect — Design

**Date:** 2026-06-25
**Status:** Approved (pending user review of this spec)
**Predecessor:** [`2026-06-23-behaviour-sync-to-original-design.md`](./2026-06-23-behaviour-sync-to-original-design.md) (the 13-behaviour sync, merged to `main` at `b7ff4cf`)
**Source of truth:** the original ReactiveTraderCloud, archived commit `4a31f01`, paths under `packages/client/src/`.

## Goal

Complete the one out-of-scope divergence the behaviour-sync surfaced (the idle-overlay **Reconnect** button + faithful button-only idle recovery), clear the cosmetic follow-ups the final whole-branch review listed, and **close the test-coverage gaps the sync introduced** so coverage returns to its pre-sync standard. The clean architecture and the dumb-UI / dependency-rule constraints are preserved throughout.

## Scope (6 work items, one plan)

1. **Reconnect button + button-only idle recovery** — the substantive feature.
2. Remove the dead `formatCellValue` alias in the blotter utilities.
3. Dedupe the `wholeNumber` `Intl.NumberFormat` shared by `formatPnlValue.ts` and `formatScale.ts`.
4. Add direct `reduceRfqEvent` unit cases for `quoteRejected` (with-price **and** without-price) and `rfqClosed`.
5. Defensive nit: null `reconnectTimer` after `clearTimeout` in `WsAdapter`.
6. **Coverage-gap pass** across every test kind, targeting the behaviour-sync'd code (runs last, after 1–5 land).

CreditExceeded remains the one deliberate non-fix (web build no-ops the limit check) — unchanged here.

## Global constraints (bind every task)

- **Dependency rule (machine-enforced by dependency-cruiser):** `@rtc/domain` depends only on `rxjs` at runtime; no Node built-ins in domain production source; `client`/`server`/`mobile` never import each other.
- **Dumb-UI:** no rxjs/localStorage/fetch/setTimeout in `src/ui`; UI drives the app layer only through the hooks contract. The 29 `@rtc/tests` grep-gates enforce this.
- **Framework-swap test structure preserved:** corrected/new assertions live in the framework-neutral contract/shared layer; the `react/` swap-trio stays intact so a future SolidJS client inherits the contract.
- **Source of truth** is `rtc-original@4a31f01`; behavioural wiring is provenance-cited to `file:line`; deterministic value/logic is golden-fixtured.
- **Per-task gates (the lesson from the sync):** every task runs `biome ci`, `pnpm typecheck` (**including server**), `pnpm --filter @rtc/tests gates`, and `dependency-cruiser` — not only focused tests.
- **Multi-arch visual goldens:** UI-appearance changes regenerate the `react-local/linux-arm64` set in-sandbox; the x86 `react/` (CI-compared) and `darwin-arm64` sets are regenerated at merge time on those platforms (carried over from the sync branch — these tasks add to that same merge-time regen list).
- **Commit copy:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Work on a fresh branch off `main`.

---

## Item 1 — Reconnect button + button-only idle recovery (core)

### Behaviour (faithful to the original)

Original references: `components/DisconnectionOverlay.tsx:29-36` (the button shows **only** for `IDLE_DISCONNECTED`, `variant="outline"`, `onClick={initConnection}`) and `services/connection.ts:43-50,74-96` (idle disposes the connection; recovery is **only** via `initConnection` — mousemove does **not** reconnect from idle; it only resets the 15-min countdown while connected).

- The idle overlay (`IDLE_DISCONNECTED` only) renders a **"Reconnect"** button below the "You have been disconnected due to inactivity." text. The offline and generic-disconnected overlays are unchanged (no button).
- Clicking Reconnect re-establishes the connection.
- **`userActivity` no longer auto-reopens** after an idle close. It retains its other role: resetting the 15-min idle countdown **while connected** (the `BrowserConnectionEventsAdapter` already resets its `IDLE_TIMEOUT_MS` timer on activity — unchanged). The Reconnect command is the sole recovery from idle.

### Architecture (dumb-UI command pattern)

Rejected alternatives: the button reusing the `userActivity` event (conflates the two concerns we just separated); the button calling `ws.reopen()` directly (UI reaching the transport — clean-arch violation). Chosen:

- **Command hook `useReconnect(): () => void`** added to the `AppHooks` contract — `createAppHooks` (real), the contract-tier fake (`hooksFromWorld.ts`), and the visual fake (`buildFakeHooks.ts`). It returns a stable callback.
- The callback pushes a `{ type: "reconnect" }` intent into the app layer via a `reconnect$` Subject owned in `composition.ts`, merged into the connection-events stream alongside the existing gateway/browser merges.
- **`routeIdleLifecycle`** (the exported function from T2.2) gains a `reconnect → ws.reopen()` branch and **drops the `userActivity → reopen()` branch**. The **simulator** branch maps `reconnect → gatewayConnected` (replacing today's `userActivity → gatewayConnected` auto-resume).
- `ConnectionOverlay.tsx` renders a genuine interactive `<button>` (it has a real click action — unlike the PnL-bar case) for the idle state, wired to `useReconnect()`. CSS Modules; the button styling follows the existing modal/button idiom in `src/ui/shell`.

### Data flow

`Reconnect <button>` → `useReconnect()` → `reconnect$.next({type:"reconnect"})` → `composition` merge → `routeIdleLifecycle` → `ws.reopen()` (real WS) / `gatewayConnected` (simulator) → connection status returns to `CONNECTING`/`CONNECTED` → overlay hides.

> The deployed demo runs in **simulator mode** (`VITE_SERVER_URL` unset), so the observable behaviour a user sees is the simulator branch; both branches are implemented and tested.

### Units & interfaces

- `ConnectionOverlay.tsx` — dumb render; new prop-free `useReconnect()` call for the idle case.
- `AppHooks.useReconnect` — `() => () => void`.
- `composition.ts` — owns `reconnect$`; `routeIdleLifecycle(event, ws)` updated (reconnect-driven, not activity-driven). A reconnect command port/presenter method exposes `reconnect$.next` to the hook factory.
- `BrowserConnectionEventsAdapter` — unchanged (still resets idle timer on activity, still emits `idleTimeout`).

### Testing

- **Contract (framework-neutral):** Reconnect button is present + correctly labelled for `IDLE_DISCONNECTED`, **absent** for `OFFLINE_DISCONNECTED` and generic `DISCONNECTED`; clicking it fires the reconnect command; **recovery is button-only** — a `userActivity` event after an idle close does **not** reconnect. Red-first.
- **App-layer:** update T2.2's `idleTeardown` test — `userActivity` no longer reopens; `reconnect` does. Update the `routeIdleLifecycle` unit assertions accordingly (idleTimeout→closeForIdle, reconnect→reopen, userActivity→neither).
- **Visual:** the idle overlay gains a button → regenerate `react-local/linux-arm64` (all 3 tiers); x86/darwin deferred to merge-time regen.

---

## Items 2–5 — Cleanups (mechanical)

- **2. Dead alias:** `blotterColumns.ts:80` exports `formatCellValue = formatFxCell`. It has **no production caller** (source uses `formatFxCell` directly), but `blotterColumns.test.ts` still imports and exercises it (8 cases). Repoint that test to `formatFxCell` first (preserving the coverage under the real name), **then** delete the `formatCellValue` alias. Confirm `knip`, `biome ci`, and typecheck stay clean.
- **3. Formatter dedupe:** extract a single `wholeNumberFormat` (and, if shared, `precisionNumberFormatter`) helper in `packages/domain/src/analytics/` (mirroring the original's `utils/formatNumber.ts`), import it from both `formatPnlValue.ts` and `formatScale.ts`. The existing golden tests for both must stay green (the formatter output is unchanged).
- **4. Reducer tests:** add `reduceRfqEvent` / `WorkflowEventStreamUseCase` unit cases asserting `quoteRejected` (`rejectedWithPrice` **and** `rejectedWithoutPrice`) and `rfqClosed` upsert the right state without clobbering siblings — making the wire variants' reducer handling explicit rather than only simulator-transitive.
- **5. WsAdapter nit:** set `this.reconnectTimer = null` after each `clearTimeout(this.reconnectTimer)` (defensive; behaviour unchanged).

---

## Item 6 — Coverage-gap pass (runs last)

**Intent:** restore coverage to its pre-sync standard. The sync added/changed a lot of code; this pass finds where that code is under-covered and adds the missing scenarios.

**Method (per tier — report-only tooling, no new CI gates):**

1. Run each coverage report and read the line/branch coverage of the **behaviour-sync'd files specifically**:
   - **domain (v8):** `pnpm --filter @rtc/domain test:coverage` → `formatPnlValue.ts`, `formatScale.ts`, `aggregatePositions.ts`, `credit/rfq.ts` (`applyMaximum`, `CREDIT_RFQ_EXPIRY_SECONDS`), `simulators/PricingSimulator.ts` (`rfqResponseDelayMs`), `simulators/CreditRfqSimulator.ts` (expiry + `quoteRejected`), `usecases/WorkflowEventStreamUseCase.ts`, `usecases/CreateRfqUseCase.ts`.
   - **server (v8):** `pnpm --filter @rtc/server test:coverage` → `ws/wsHandler.ts` (the `quoteRejected`/`rfqClosed` transform branches).
   - **client app (v8):** `pnpm --filter @rtc/client-react test:app:coverage` → `app/presenters/RfqCountdownMachine.ts`, `app/adapters/WsAdapter.ts` (`closeForIdle`/`reopen`/the new `reconnect` path), `app/composition.ts` (`routeIdleLifecycle`).
   - **contract tier → `src/ui` (v8):** `pnpm --filter @rtc/client-react test:ui:contract:coverage` → `ui/fx/analytics/PositionBubbles.tsx` + `PairPnlBars.tsx`, `ui/credit/blotter/CreditBlotter.tsx`, `ui/fx/blotter/*` (generified utilities), `ui/shell/connection/ConnectionOverlay.tsx` (incl. the new Reconnect button).
   - **visual tier → `src/ui` (istanbul):** `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:coverage` → render-path coverage of the same `src/ui` components.

2. For each uncovered line/branch in those files, add a test in **the tier that owns it**: pure logic → domain/server unit or `src/app` app-coverage; `src/ui` behaviour → contract tier; `src/ui` render → visual scenario. Tests must verify real behaviour (no coverage-only no-ops), red-first where they assert new expectations.

3. Refresh `packages/client-react/tests/ui/visual/COVERAGE-GAPS.md` with the new dated numbers and any intentionally-deferred gaps (with reasons).

**Acceptance:** the behaviour-sync'd files are covered at or above the repo's prior standard for their tier; any remaining gap is documented in `COVERAGE-GAPS.md` with a justification.

---

## Verification (whole-branch, before finishing)

`pnpm build`; `pnpm typecheck` (all packages incl. server); `pnpm test`; `biome ci`; `dependency-cruiser`; `pnpm --filter @rtc/tests gates` (all 29); `pnpm test:e2e:no-cypress`; `react-local/linux-arm64` visual suites green across 3 tiers; the per-tier coverage reports run and `COVERAGE-GAPS.md` updated. x86 `react/` + darwin-arm64 visual goldens flagged for merge-time regen.

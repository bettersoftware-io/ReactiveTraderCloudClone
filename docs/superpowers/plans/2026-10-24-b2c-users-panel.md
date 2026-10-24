# B2c — Users panel, administrator access, visible session end (PR 2) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An administrator approves, blocks, unblocks, renames and deletes
registered accounts from a new Admin tab.
- The server enforces each of those rules.
- A reset, a block or a rename ends the account's sessions, and the browser
  says so.
- `/mcp` admits the administrator only.

**Architecture:**

- **Server.**
  - **Identity.** The verified identity (`Caller`) now travels from the
    WebSocket upgrade to each connection's services.
  - **Ending sessions.** A per-account `sessions_not_before` stamp, together
    with an `iat` claim on account tokens, ends sessions durably. A session
    registry closes live sockets with the close code `4401`.
  - **Admin actions.** An `AccountAdminService` holds every admin rule: the
    caller's current access, refusing self-edits, refusals as typed answers.
    It sits behind five thin `admin.accounts.*` RPC effects.
- **Client.**
  - **Port.** `AccountAdminPort` sits beside the other ports. The live
    adapter speaks the RPCs, and every other builder answers `unavailable`.
  - **Core members.** One new presenter (`accountList`) and one new machine
    (`accountAction`). Both are native in all three cores over pure folds in
    `@rtc/core-logic`.
  - **Existing members.**
    - `auth` reacts to a new `sessionEnded` connection event by signing out
      with a message.
    - `workspaceNav` learns which tabs the signed-in user may see.
  - **Web clients.** Both render the Admin tab and the Users panel from those
    members.

**Tech Stack:** Node `ws` + `@rtc/ws-effects` (server), Supabase PostgREST +
Auth admin API over `fetch`, rxjs 7 / `@rx-state/core` (RxJS core), the async
kernel, Effect 3, React 19, SolidJS, vitest 5, Playwright, and
`scripts/mutation-check.mts`.

**Spec:** [../specs/2026-10-18-b2c-users-panel-design.md](../specs/2026-10-18-b2c-users-panel-design.md)
§4–§7 (PR 2). The authority behind it is the parent
[B2 spec](../specs/2026-10-04-b2-user-management-design.md) §5.5, §5.6 and §8.

**Prerequisite:** [the Ops rename](2026-10-24-ops-rename.md) (PR 1) is merged.
Work starts on a fresh branch off that `main`. In the existing worktree, run
`git fetch origin main`, then
`git switch -c worktree-b2c-admin origin/main`, then
`pnpm install && pnpm build`, then prove it with
`pnpm --filter @rtc/domain test`.

**Rulings:** `2026-10-24-b2c-users-panel-rulings.md`, written by the
controller during execution.

## Decisions this plan adds to the spec

These are made here because the code settled them. The spec is amended in
Task 17.

1. **One `revokeSessions(id, atMs)` directory method serves the reset path.**
   - `setBlocked(id, true, atMs)` and `rename(id, name, atMs)` write the stamp
     in the **same** PATCH as their own column, so those two are atomic.
   - Blocking stamps too, so a later unblock does not bring the old tokens
     back.
2. **Where the admin rules live.** They sit in a server-side
   `AccountAdminService` (`packages/server/src/accounts/accountAdminService.ts`),
   and the effects stay thin, as `ops.effects.ts` does. The service is on the
   connection container as `ctx.accountAdmin`, and the identity is
   `ctx.caller`.
3. **The connection identity is passed explicitly.**
   `scopeServicesToConnection(shared, caller)` takes the caller, and a
   `WeakMap<IncomingMessage, UpgradeVerdict>` hands the verdict from
   `verifyClient` to `connection`.
4. **`workspaceNav` owns tab visibility.**
   - `WorkspaceNavState` gains `visibleTabs`, and the machine folds the
     signed-in user's access.
   - The tab bar renders from `visibleTabs`.
   - The route sync gains `canShow`, read from the same state.
   - So the core, not the view, decides who sees Admin, and Jarvis, a URL and
     a click all go through one gate.
5. **`sessionEnded` reaches the auth presenter through
   `ports.connectionEvents`.** No new `AuthPresenter` member is added. Each
   core's composition routes the event to its auth presenter's internal
   sign-out. The contract suite drives it from the scripted
   `connectionEvents`.
6. **`AccountStatus` moves to `@rtc/domain`** (`auth/accountStatus.ts`). The
   server and the client then share one spelling.

## Global Constraints

- **No new dependency in any package.** `@rtc/domain` and `@rtc/ws-effects`
  stay rxjs-only at runtime. `@rtc/core-logic` imports rxjs as types only.
  The sibling cores import rxjs values only in `bridge/`.
- **Exact values from the spec:**

  | Item | Value |
  |---|---|
  | close code / reason | `4401` / `"session_ended"`, named `SESSION_ENDED_CLOSE_CODE` / `SESSION_ENDED_REASON` in `@rtc/shared` |
  | message prefix | `admin.accounts.` |
  | refusals | `forbidden`, `self`, `not_found`, `invalid_name`, `unavailable` |
  | list cap | `ADMIN_ACCOUNT_LIST_MAX = 500` |
  | `/mcp` refusal | `403 admin_only`, or `503` |
  | sign-out copy | "Your session has ended. Please sign in again." |
  | forbidden copy | "Administrator access required" |
  | empty-list copy | "No registered accounts yet." |
  | delete confirmation | "Delete this account?" with Confirm / Cancel |
  | panel title | "Users" |
  | panel id | `admin-users` |
  | tab | `admin`, label "Admin", route `/admin` |
- **The token and the stamp.**
  - Account tokens carry `iat` (ms). Roster tokens are unchanged.
  - An account token without `iat` has ended.
  - The comparison is `issuedAt < sessionsNotBefore` (strict).
  - The stamp is always the server's `now()`, written in the PATCH, never the
    database's `now()`.
- **Privacy.**
  - Never log an email, a display name, a token or a password.
  - Log lines name an account id and an outcome word at most.
  - Admin refusals carry no detail beyond the refusal word.
- **The admin gate reads the directory directly** (`findAccount`), never the
  status cache, and never the token's `a` claim.
- **Copy.** All the copy lives in `@rtc/core-logic`
  (`presenters/accountAdminCopy.ts`, plus the sign-out line in
  `shellFolds.ts`'s `describeAuthFailure`). No string a user reads is spelled
  in a component or a core.
- **Names, imports, fixtures and lint.**
  - Function names state their effect (`docs/handler-naming.md`). Intents:
    `refresh`, `approve`, `block`, `unblock`, `startRename`, `editName`,
    `submitRename`, `requestDelete`, `confirmDelete`, `cancel`, `dismiss`.
  - One import statement per module, and a types-only statement stays
    `import type`.
  - `create*` fixture factories go below the cases.
  - JSON payloads are object literals plus `JSON.stringify`.
  - Braces on every control statement, and an explicit return type on every
    function.
- **Timers.** Fake timers for any timer-driven wait. The status cache and the
  service take `now`.
- **The core rules** (load the `application-core-rules` skill before Tasks
  8–11):
  - Each machine's `dispose()` makes its intents inert and cancels a request
    in flight.
  - A request superseded by `cancel`/`dismiss` never writes state.
  - Neither new member folds a port that bursts.
  - Each core's `createMachineFactories` keeps `(presenters) => MachineFactories`.
  - The member count goes 76 → **78**.
- **Builds.** Never run two builds in this checkout at once. Rebuild changed
  libraries one at a time in dependency order: `@rtc/domain` →
  `@rtc/shared` → `@rtc/core-api` → `@rtc/core-logic` →
  `@rtc/client-adapters` → `@rtc/core-contract`. Grep `dist` for a new
  export before trusting a 0 s cached build.
- **Red by design.**
  - Whole-repo `pnpm typecheck` is red from Task 8 until Task 11 lands.
  - The Solid contract suite is red from Task 13 until Task 15 lands.

  Each task names its own green gates.
- **Before each commit,** run `pnpm exec biome check --write <files>`, then
  `pnpm exec eslint <files>`.
- **No lint suppressions.** On the FINAL tree, run `/rtc:gauntlet full`, then
  `pnpm --filter @rtc/tests test:fullstack:node`,
  `pnpm --filter @rtc/tests test:fullstack:browser` and `pnpm test:e2e`.
- **Goldens** are generated from `@rtc/client-react` only and asserted by
  both clients. The user accepts the new shots by eye before merge.
- **One PR.** Outward steps each go in their own Bash call, batched at the
  end.

## Review Focus

1. **A demoted, blocked or stale-token administrator still acting through an
   open socket.** The socket was admitted hours ago, and the effect must
   re-read the directory. → Task 5: the service refuses `forbidden` for a
   caller whose current record is `access: "user"`, whose status is not
   `active`, or whose `issuedAt` is before the stamp. Each of the three
   cases has a mutant.
2. **An invalidation racing an in-flight status lookup.** A lookup started
   before a block must not re-cache "active" after it. → Task 3: the lookup
   is held pending, `invalidate` runs, then the lookup resolves `active`. The
   next `statusOf` reads the directory again. A second case checks that a
   fresh lookup started after the invalidation is not deleted from
   `inFlight` by the old one's `finally`.
3. **A browser in a reconnect loop after its session ended.** → Task 7: a
   `close` with `4401` emits `sessionEnded` and schedules no reconnect,
   checked on fake timers advanced past `RECONNECT_INTERVAL_MS`. Any other
   code still reconnects.
4. **A non-admin reaching `/admin` by URL, Back/Forward or a stale active tab
   after signing out.** → Task 12: the route sync's `canShow` cases. → Task 8:
   the nav fold. Switching to a hidden tab is refused, and losing access while
   on `admin` lands on `fx`.
5. **A rename that passes the client check but carries an invisible or
   stacked character.** The server must re-validate. → Task 5: the service
   answers `invalid_name` for `"Ann​"`, and Task 4's guard accepts the
   frame shape, so the refusal is a typed answer, not a nack.

Also pinned:
- the administrator's own row (`isSelf`) gets no actions and the server
  refuses `self` (Tasks 5 and 14);
- a delete's 404 is `not_found` (Task 2);
- unconfirmed rows are not counted as pending (Task 9).

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261024000000_sessions_not_before.sql` | `alter table public.profiles add column sessions_not_before timestamptz` |
| `packages/server/src/accounts/migrations.test.ts` | pins the new column (nullable, no default, RLS still on, no policy) |
| `packages/domain/src/auth/accountStatus.ts` | `AccountStatus` (moved from the server) |
| `packages/domain/src/auth/sessionUser.ts`, `auth/roster.ts` | `SessionUser.access: AccessLevel`; the roster's `"user"` |
| `packages/domain/src/connection/connectionStatus.ts` | `ConnectionEvent` gains `{ type: "sessionEnded" }` |
| `packages/domain/src/ports/accountAdminPort.ts` | `AccountSummary`, `AccountAdminRefusal`, `AccountAdminAction`, `AccountListOutcome`, `AccountActionOutcome`, `AccountAdminPort`, `createUnavailableAccountAdmin()` |
| `packages/shared/src/protocol/{auth,accountAdmin,messages}.ts` | `SessionUserDto.access`; the account-admin DTOs and guards; the five messages; `SESSION_ENDED_CLOSE_CODE`, `SESSION_ENDED_REASON` |
| `packages/server/src/auth/token.ts`, `AuthService.ts` | `iat`; `VerifiedToken.issuedAt` |
| `packages/server/src/accounts/AccountDirectory.ts` + the three implementations | `AccountRecord.createdAt`/`sessionsNotBefore`; `listAccounts`, `setApproved`, `setBlocked`, `rename`, `deleteAccount`, `revokeSessions` |
| `packages/server/src/accounts/accountStatusCache.ts` | `{ status, sessionsNotBefore }` + `invalidate` |
| `packages/server/src/accounts/revocationLedger.ts` | the in-process fallback stamps |
| `packages/server/src/accounts/sessionRegistry.ts` | live sockets per account; `closeAll` |
| `packages/server/src/accounts/sessionEnd.ts` | `decideSessionEnded(token, lookup, ledger)`, the one rule every gate calls |
| `packages/server/src/accounts/accountAdminService.ts` | the admin rules |
| `packages/server/src/http/upgradeGate.ts`, `index.ts`, `services/connectionScope.ts`, `services/serviceContainer.ts` | the caller, ended sessions, `4401` |
| `packages/server/src/accounts/AccountService.ts` | `onSessionsRevoked` after a reset |
| `packages/server/src/mcp/mcpHttpHandler.ts` | the administrator gate |
| `packages/server/src/effects/accountAdmin.effects.ts`, `effects/guards.ts` | five RPCs |
| `packages/server/src/config/limits.ts` | `ADMIN_ACCOUNT_LIST_MAX`, `REVOCATION_LEDGER_MAX_ENTRIES` |
| `packages/client-adapters/src/adapters/WsAccountAdminAdapter.ts`, `WsAdapter.ts`, `portFactory.ts`, `HttpAuthAdapter.ts`, session stores | the live port; `4401`; `access` |
| `packages/core-api/src/{app,machine}.ts`, `presenters/accountList.ts`, `machines/accountAction.ts`, `machines/workspaceNav.ts`, `layout.ts` | the contract |
| `packages/core-logic/src/presenters/{accountListFold,accountActionFold,accountAdminCopy,workspaceNavFold}.ts`, `shellFolds.ts`, `routes/workspaceRouteSync.ts`, `layout/defaultLayoutPort.ts` | the shared rules |
| three cores | `accountList`, `accountAction`, `workspaceNav` access, `auth` `sessionEnded` |
| `packages/core-contract/src/suites/{accountList,accountAction}.ts`, `suites/{auth,workspaceNav}.ts`, `harness/scriptedPorts.ts`, `registry.ts` | the suites |
| both bindings | `useAccountList`, `useAccountAction` |
| both clients | `ui/admin/{UsersPanel,UsersHead,UserRow}.tsx` + CSS modules, `NavTab`/`HeaderChrome`, registries |
| `packages/ui-contract/src/{specs,shared/pages}/admin/**`, `visual/**` | specs, pages, scenarios |
| `tests/fullstack/accounts-journey.ts`, `tests/fullstack/browser/accounts.spec.ts` | the end-to-end witnesses |

---

### Task 1: Shared vocabulary: domain, shared and the migration

**Files:**
- **Create:** `packages/domain/src/auth/accountStatus.ts`,
  `packages/domain/src/ports/accountAdminPort.ts`,
  `packages/shared/src/protocol/accountAdmin.ts`, and the migration.
- **Modify:** `domain/src/auth/sessionUser.ts`, `auth/roster.ts`,
  `connection/connectionStatus.ts`, `domain/src/index.ts`;
  `shared/src/protocol/{auth,messages}.ts`, `shared/src/index.ts`;
  `server/src/accounts/AccountDirectory.ts` (now imports `AccountStatus`);
  `migrations.test.ts`.

**Interfaces (produces):**

```ts
// domain
export type AccountStatus = "unconfirmed" | "pending" | "active" | "blocked";
export interface SessionUser { /* existing seven */ readonly access: AccessLevel }
export type ConnectionEvent = /* existing */ | { type: "sessionEnded" };
export interface AccountSummary {
  readonly id: string; readonly email: string; readonly displayName: string;
  readonly access: AccessLevel; readonly status: AccountStatus;
  readonly joinedAt: number; /* epoch ms */ readonly isSelf: boolean;
}
export type AccountAdminRefusal = "forbidden" | "self" | "not_found" | "invalid_name" | "unavailable";
export type AccountAdminAction =
  | { readonly kind: "approve" } | { readonly kind: "block" } | { readonly kind: "unblock" }
  | { readonly kind: "rename"; readonly displayName: string } | { readonly kind: "delete" };
export type AccountListOutcome =
  | { readonly ok: true; readonly accounts: readonly AccountSummary[] }
  | { readonly ok: false; readonly reason: AccountAdminRefusal };
export type AccountActionOutcome =
  | { readonly ok: true } | { readonly ok: false; readonly reason: AccountAdminRefusal };
export interface AccountAdminPort {
  listAccounts(): Observable<AccountListOutcome>;
  actOn(accountId: string, action: AccountAdminAction): Observable<AccountActionOutcome>;
}
export function createUnavailableAccountAdmin(): AccountAdminPort; // every call: one { ok: false, reason: "unavailable" }, then complete
// shared
export const SESSION_ENDED_CLOSE_CODE = 4401; export const SESSION_ENDED_REASON = "session_ended";
CLIENT_MSG.ADMIN_ACCOUNTS_LIST = "admin.accounts.list"; /* …APPROVE, BLOCK, UNBLOCK, RENAME, DELETE */
SERVER_MSG.ADMIN_ACCOUNTS_LIST_RESPONSE = "admin.accounts.list.response"; /* …one per request */
export interface AccountSummaryDto { id; email; displayName; access; status; joinedAt: number; isSelf: boolean }
export type AccountAdminAnswerDto = { accounts: AccountSummaryDto[] } | { done: true } | { error: AccountAdminRefusal };
export interface AccountIdPayload { readonly accountId: string }
export interface AccountRenamePayload extends AccountIdPayload { readonly displayName: string }
export function isAccountIdPayload(v: unknown): v is AccountIdPayload;      // UUID shape
export function isAccountRenamePayload(v: unknown): v is AccountRenamePayload; // + string ≤ 200 UTF-16 units (shape only; the rule is the server's)
export function isAccountAdminAnswerDto(v: unknown): v is AccountAdminAnswerDto;
SessionUserDto gains `access: AccessLevel`; `isSessionUserDto` (or whatever guard reads it) requires it.
```

- [ ] **Step 1: Write the failing tests.**
  - `accountAdminPort.test.ts`: `createUnavailableAccountAdmin` answers
    `unavailable` once and completes, for both methods.
  - `accountAdmin.test.ts` (shared):
    - the guards accept a UUID and refuse `"x"`, `""` and a 37-character
      id;
    - `isAccountRenamePayload` refuses a missing name;
    - `isAccountAdminAnswerDto` accepts the three shapes and refuses
      `{ error: "nope" }`.
  - `messages.test.ts`: the twelve new strings.
  - `migrations.test.ts`: the new file adds `sessions_not_before
    timestamptz` with no `default`, adds no `policy`, and does not disable
    RLS.

  Run `pnpm --filter @rtc/domain test`, `pnpm --filter @rtc/shared test` and
  `pnpm --filter @rtc/server test -- migrations`. Expected: FAIL.
- [ ] **Step 2: Implement.**
  - Move `AccountStatus` to domain, and have the server import it.
  - The four roster personas get `access: "user"`.
  - `nextConnectionStatus` leaves the status unchanged on `sessionEnded`, as
    its `default` branches already do; check every `switch` for
    exhaustiveness.
  - Write the migration with a header comment in the style of the B2a file.
- [ ] **Step 3: Rebuild, then run the gates.**
  - Rebuild `@rtc/domain`, then `@rtc/shared`.
  - The domain, shared and server tests must be green.
  - Run `pnpm --filter @rtc/client-adapters typecheck`. The places it breaks
    on `SessionUser.access` are fixed in Task 7, not here: note them in the
    report.
- [ ] **Step 4: Commit** with the message
  `feat(accounts): the account-admin vocabulary, SessionUser.access, the sessionEnded event and the sessions_not_before column`.

---

### Task 2: The directory's admin operations and the token's `iat`

**Files:**
- `server/src/accounts/AccountDirectory.ts`;
- `SupabaseAccountDirectory.ts` (+ test);
- `InMemoryAccountDirectory.ts` (+ test);
- `DisabledAccountDirectory.ts` (+ test);
- `auth/token.ts` (+ test);
- `auth/AuthService.ts` (+ test);
- `config/limits.ts`.

**Interfaces (produces):**

```ts
interface AccountRecord { /* existing */ readonly createdAt: number; readonly sessionsNotBefore: number | null }
type AdminWrite = "ok" | "not_found" | "unavailable";
type AccountListing = { readonly outcome: "listed"; readonly accounts: readonly AccountRecord[] } | { readonly outcome: "unavailable" };
interface AccountDirectory {
  listAccounts(limit: number): Promise<AccountListing>;          // newest first
  setApproved(accountId: string): Promise<AdminWrite>;            // approved = true
  setBlocked(accountId: string, blocked: boolean, stampAtMs: number): Promise<AdminWrite>; // stamps only when blocked
  rename(accountId: string, displayName: string, stampAtMs: number): Promise<AdminWrite>;  // one PATCH, both columns
  deleteAccount(accountId: string): Promise<AdminWrite>;
  revokeSessions(accountId: string, stampAtMs: number): Promise<AdminWrite>;
}
// token
interface VerifiedToken { /* existing */ readonly issuedAt: number | null } // null for a roster token AND for an account token minted before B2c
signToken(...): account tokens carry `iat: now`
```

- [ ] **Step 1: Write the failing tests.**
  - **Supabase directory.** Use the existing injected-`fetch` style, and
    assert the exact method, path, query and body each method sends:
    - `listAccounts` sends `GET /rest/v1/profiles?select=<columns incl. created_at,sessions_not_before>&order=created_at.desc&limit=500`.
    - `setApproved` sends `PATCH /rest/v1/profiles?id=eq.<id>` with body
      `{"approved":true}` and the header `Prefer: return=representation`.
    - `setBlocked(id, true, T)` sends the body
      `{"blocked":true,"sessions_not_before":<ISO of T>}`.
      `setBlocked(id, false, T)` sends `{"blocked":false}`.
    - `rename` sends `{"display_name":…,"sessions_not_before":…}`.
    - A PATCH answering `[]` means `not_found`.
    - `deleteAccount` sends `DELETE /auth/v1/admin/users/<id>`, and a 404
      means `not_found`.
    - An id that fails `UUID_SHAPE` means `not_found` with no request.
    - A 5xx or a timeout means `unavailable`.
    - `toAccountRecord` reads `created_at` and `sessions_not_before` to ms
      (null stays null).
  - **In-memory directory.** It answers each method the same way over its
    map. A seed's `createdAt` is its construction time, and a deleted
    account's `findAccount` answers `missing`.
  - **Disabled directory.** Every method answers `unavailable`.
  - **Token.**
    - An account token round-trips `issuedAt === now`.
    - A roster token reads `issuedAt === null`.
    - A hand-built account payload without `iat` verifies with
      `issuedAt === null`: it is NOT refused at verify, so the upgrade can
      end it visibly.
    - An `iat` that is not a number refuses the token.
- [ ] **Step 2: Implement.**
  - Add `PATCH` to `Call.method`.
  - Add `ADMIN_ACCOUNT_LIST_MAX = 500` to `limits.ts` with its why-comment.
- [ ] **Step 3: Run the gate.** `pnpm --filter @rtc/server test` must be green.
- [ ] **Step 4: Commit** with the message
  `feat(accounts): the directory's admin operations and an issued-at claim on account tokens`.

---

### Task 3: Ending sessions: the stamp rule, the cache, the ledger and the registry

**Files:**
- **Create:** `server/src/accounts/{sessionEnd,revocationLedger,sessionRegistry}.ts`,
  each with its test.
- **Modify:** `accountStatusCache.ts` (+ test) and `limits.ts`
  (`REVOCATION_LEDGER_MAX_ENTRIES = 10_000`).

**Interfaces (produces):**

```ts
// accountStatusCache
type CachedAccount =
  | { readonly status: AccountStatus; readonly sessionsNotBefore: number | null }
  | { readonly status: "missing" | "unavailable" };
interface AccountStatusCache { read(accountId: string): Promise<CachedAccount>; invalidate(accountId: string): void }
// revocationLedger — the fallback when a stamp could not be written; forgotten on restart
interface RevocationLedger { record(accountId: string, atMs: number): void; notBefore(accountId: string): number | null }
function createRevocationLedger(maxEntries: number): RevocationLedger; // keeps the later of two stamps; drops the oldest entry past the cap
// sessionEnd — the one rule
function hasSessionEnded(issuedAt: number | null, account: CachedAccount, ledgerNotBefore: number | null): "ended" | "live" | "unavailable";
// sessionRegistry
interface SessionRegistry {
  register(accountId: string, socket: ClosableSocket): () => void; // returns the unregister
  closeAll(accountId: string): number;                              // closes with 4401 / "session_ended"; returns how many
}
interface ClosableSocket { close(code: number, reason: string): void }
```

`hasSessionEnded` answers in this order:
1. `"unavailable"` when the cached status is `unavailable`.
2. `"ended"` when the status is `missing`, or anything but `active`.
3. `"ended"` when `issuedAt` is null.
4. `"ended"` when `issuedAt` is before the later of `sessionsNotBefore` and
   `ledgerNotBefore` (strictly before).
5. Otherwise `"live"`.

- [ ] **Step 1: Write the failing tests.**
  - `hasSessionEnded`: a table with one row per branch, including `issuedAt`
    equal to the stamp (live) and one millisecond before it (ended).
  - The cache:
    - `invalidate` makes the next `read` call the directory again;
    - **the race (Review Focus 2):** hold the directory promise open, call
      `invalidate`, resolve it with `active`, then a second `read` calls the
      directory again;
    - **the second race:** start a lookup after the invalidation, then let
      the OLD lookup settle. The new in-flight lookup is still shared by a
      third concurrent `read`, so the directory is called twice in total,
      not three times;
    - the existing B2a cases move to the new shape.
  - The ledger keeps the later stamp and drops the oldest past its cap.
  - The registry:
    - `closeAll` closes each registered socket once with `(4401,
      "session_ended")`;
    - an unregistered socket is not closed;
    - `closeAll` on an unknown id returns 0.
- [ ] **Step 2: Implement.**
  - **The generation guard.** The cache keeps a generation counter per
    account. `invalidate` bumps it and deletes both maps' entries. `lookUp`
    remembers its result only if the generation is unchanged, and its
    `finally` deletes `inFlight` only if the entry is still its own promise.
  - **Callers.** Rename `statusOf` → `read`. Update its caller
    (`upgradeGate.ts`) minimally so it compiles: it reads `.status`. Task 4
    rewrites it.
- [ ] **Step 3: Run the gate.** `pnpm --filter @rtc/server test` must be green.
- [ ] **Step 4: Commit** with the message
  `feat(accounts): one session-ended rule, an invalidatable status cache, a revocation ledger and a session registry`.

---

### Task 4: The caller on every connection, the visible end of a session, and `/mcp`

**Files:**
- `http/upgradeGate.ts` (+ test);
- `index.ts`;
- `services/connectionScope.ts` (+ test);
- `services/serviceContainer.ts`;
- `mcp/mcpHttpHandler.ts` (+ test);
- `accounts/AccountService.ts` (+ test);
- `http/loginHandler.ts` (`UpgradeRejection` gains nothing: an ended session
  is accepted);
- `observability/connectionLog.ts` (counts `sessions-ended`).

**Interfaces:**

```ts
interface Caller { readonly username: string; readonly accountId: string | null; readonly issuedAt: number | null }
interface UpgradeVerdict {
  readonly ok: boolean; readonly status: 200 | 401 | 403 | 429 | 503; readonly reason?: UpgradeRejection;
  readonly caller?: Caller;          // set when ok
  readonly sessionEnded?: boolean;   // ok + true ⇒ accept, then close 4401 at once
}
interface UpgradeGateDeps { /* existing */ readonly revocations: RevocationLedger } // accountStatus is now the cache's read()
function scopeServicesToConnection(shared: ServiceContainer, caller: Caller): ServiceContainer; // adds caller, keeps the per-connection ThroughputService
interface ServiceContainer { /* existing */ readonly caller: Caller | null; readonly accountAdmin: AccountAdminService } // Task 5 fills accountAdmin
interface McpHandlerDeps { /* existing */ readonly accounts: Pick<AccountDirectory, "findAccount">; readonly revocations: RevocationLedger }
interface AccountServiceOptions { /* existing */ readonly onSessionsRevoked: (accountId: string) => void }
```

- [ ] **Step 1: Write the failing tests.**
  - **`decideUpgrade`, for an account token:**
    - `active` with a valid `iat` gives `ok`, a `caller`, and no
      `sessionEnded`;
    - each kind of ended session gives `{ ok: true, status: 200,
      sessionEnded: true }`: blocked, pending, missing, no `iat`, a stamp
      after the `iat`, and a ledger stamp after the `iat`;
    - `unavailable` gives 503;
    - a bad token still gives 401;
    - a roster token gives `ok` and `caller.accountId === null`.
  - **`connectionScope`:** `ctx.caller` is the given caller, and two
    connections get separate `ThroughputService`s.
  - **`/mcp`:**
    - a roster token gives `403 admin_only`;
    - an account whose current record is `access: "user"` gives 403;
    - an account whose current record is `admin` but `blocked` gives 403;
    - an admin with a stale `iat` gives 403;
    - an admin with a live session reaches the POST check (405 on a GET);
    - a directory answering `unavailable` gives 503.
  - **`AccountService.resetPassword`:**
    - after `changed`, it calls `revokeSessions(id, now)` and then
      `onSessionsRevoked(id)`;
    - when `revokeSessions` answers `unavailable` twice, `onSessionsRevoked`
      is still called, the outcome is still `changed`, and one log line
      names the id and `stamp-failed`;
    - when `invalid_code`, neither is called.
- [ ] **Step 2: Implement.**
  - **Stamp failure.** The ledger record on a failed stamp happens inside
    the `index.ts` wiring of `onSessionsRevoked`. The service passes
    `stamped: boolean` as a second argument
    (`onSessionsRevoked(accountId, stamped)`), and the wiring calls
    `ledger.record` when `!stamped`. Update the interface above in the same
    commit.
  - **`index.ts` keeps the verdict for `connection`:**
    - `verifyClient` stores the verdict in a `WeakMap` keyed by `info.req`.
    - `connection` reads it. With `sessionEnded`, it calls
      `ws.close(SESSION_ENDED_CLOSE_CODE, SESSION_ENDED_REASON)`, records it
      in the connection log, and attaches no effects. The caps slot is still
      acquired and released on `close`.
    - Otherwise it registers the socket in the registry under
      `caller.accountId` (accounts only) and unregisters it on `close`.
  - **`onSessionsRevoked` wiring:** `cache.invalidate(id)`, then
    `registry.closeAll(id)`.
- [ ] **Step 3: Run the gates.**
  - `pnpm --filter @rtc/server test` must be green.
  - `pnpm --filter @rtc/server build`, then `pnpm --filter @rtc/tests
    test:fullstack:node`, which must be green **except** the `/mcp`
    witnesses in `accounts-journey.ts`. Task 6 rewrites those; note them in
    the report.
- [ ] **Step 4: Commit** with the message
  `feat(server): the caller reaches each connection; an ended session closes with 4401; /mcp admits the administrator only; a reset ends sessions`.

---

### Task 5: `AccountAdminService` and the five effects

**Files:**
- **Create:** `server/src/accounts/accountAdminService.ts` (+ test) and
  `server/src/effects/accountAdmin.effects.ts` (+ test).
- **Modify:** `effects/index.ts`, `effects/guards.ts` (+ test), and
  `index.ts` (the wiring).

**Interfaces:**

```ts
interface AccountAdminServiceDeps {
  readonly directory: AccountDirectory; readonly statusCache: AccountStatusCache;
  readonly sessions: SessionRegistry; readonly revocations: RevocationLedger;
  readonly now: () => number; readonly listLimit: number; // ADMIN_ACCOUNT_LIST_MAX
}
type AdminAnswer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: AccountAdminRefusal };
interface AccountAdminService {
  list(caller: Caller | null): Promise<AdminAnswer<readonly AccountSummary[]>>;
  act(caller: Caller | null, accountId: string, action: AccountAdminAction): Promise<AdminAnswer<void>>;
}
function createAccountAdminService(deps: AccountAdminServiceDeps): AccountAdminService;
```

These are the rules, in order, for both methods:
1. **The caller.** A null caller, a roster caller (`accountId === null`) or
   a caller whose `findAccount` answers `missing` is refused `forbidden`.
   The directory being down is `unavailable`. A caller whose record is not
   `active` with `access: "admin"`, or whose session `hasSessionEnded`, is
   also refused `forbidden`.
2. **`act` only:**
   - `accountId === caller.accountId` is refused `self`;
   - a `rename` whose `normalizeDisplayName(name)` fails
     `isValidDisplayName` is refused `invalid_name`, before any write.
3. **Writes.**
   - `approve` calls `setApproved`;
   - `block` calls `setBlocked(id, true, now())`;
   - `unblock` calls `setBlocked(id, false, now())`;
   - `rename` calls `rename(id, normalized, now())`;
   - `delete` calls `deleteAccount`.

   `not_found` and `unavailable` pass through.
4. **After a successful `block`, `rename` or `delete`:** call
   `statusCache.invalidate(id)`, then `sessions.closeAll(id)`. After
   `approve` and `unblock`, only invalidate.
5. **`list`:** map each record to `AccountSummary`, with
   `isSelf = record.id === caller.accountId` and `joinedAt = createdAt`.
   Sorting is the client's job (Task 9).

The effects:
- `rpc(CLIENT_MSG.ADMIN_ACCOUNTS_*, SERVER_MSG.ADMIN_ACCOUNTS_*_RESPONSE, …)`.
- The payload goes through `validated(…, isAccountIdPayload |
  isAccountRenamePayload, …)` (`list` takes `{}`, with no guard).
- Each one calls `ctx.accountAdmin` with `ctx.caller`.
- The answers map as:
  - `{ ok: true, value }` becomes `{ accounts }` or `{ done: true }`;
  - `{ ok: false, refusal }` becomes `{ error: refusal }`.

- [ ] **Step 1: Write the failing tests.**
  - **The service** runs against the in-memory directory and a fake
    registry, cache, ledger and clock. One case per rule:
    - **`forbidden`:** a null caller, a roster caller, a demoted caller, a
      blocked admin, an admin whose stamp is after their `iat` (Review
      Focus 1), and an admin whose ledger stamp is after their `iat`.
    - **The other refusals:** `self` for each action; `invalid_name` for
      `"Ann​"` and `""`, with no directory write in either case
      (Review Focus 5); `not_found`; `unavailable`.
    - **The successful actions:**
      - `block` invalidates the cache, calls `closeAll` and stamps;
      - `unblock` does not call `closeAll`;
      - `rename` normalizes the name (`" Ann  Lee "` is stored as the
        NFKC form `normalizeDisplayName` returns);
      - `delete` is followed by `findAccount` answering `missing`.
    - **`list`:** `isSelf` is true only on the caller's own row.
  - **The effects**, through `createWsListener` with a fake socket, the way
    `ops.effects.test.ts` drives its RPCs:
    - a malformed `approve` payload (`{ accountId: "x" }`) is a nack;
    - a valid one answers `{ done: true }`;
    - a refusal answers `{ error: "forbidden" }`, not a nack.
- [ ] **Step 2: Implement and wire.** The container's `accountAdmin` gets
  the real service, built once in `index.ts`. In accounts-`disabled` mode
  the disabled directory makes every call `unavailable`.
- [ ] **Step 3: Run the gate.** `pnpm --filter @rtc/server test` must be green.
- [ ] **Step 4: Commit** with the message
  `feat(server): admin.accounts — list, approve, block, unblock, rename, delete, each gated on the caller's current access`.

---

### Task 6: The node journey over the real server

**Files:** `tests/fullstack/accounts-journey.ts`, plus its helpers if a WS
RPC helper is needed. Reuse the `node-smoke.ts` socket helpers.

The existing journey keeps its legs, and these legs are added. The fixed
values are `admin@rtc.test` / `trader@rtc.test` / `pending@rtc.test` and
`Mcdc2026!desk`.

1. **List.** The admin signs in and opens a WS. `admin.accounts.list`
   answers four or more seeds, and the admin's own row has `isSelf: true`.
2. **Approve.** The admin approves the account the journey registered
   earlier. That account's `/login` now answers 200.
3. **Block.** The trader signs in, and their WS is open. The admin blocks
   the trader, and the trader's socket closes with `4401`. A new upgrade
   with the trader's token is accepted, then closed with `4401`.
4. **Unblock.** The admin unblocks the trader. The **old** token is still
   ended, because the stamp is after its `iat`. A fresh `/login` gives a
   token whose WS stays open.
5. **Self.** The admin cannot block themselves: `{ error: "self" }`.
6. **A non-admin.** The trader's `admin.accounts.list` answers
   `{ error: "forbidden" }`.
7. **Reset.** `pending@rtc.test` resets its password (the existing leg). A
   token taken before the reset gets `4401` at upgrade.
8. **`/mcp`.**
   - The admin's token passes the gate (405 on GET);
   - the trader's token gets `403 admin_only`;
   - a roster token gets `403 admin_only`.

   These replace the old `account_tokens_not_accepted` witness.

- [ ] **Step 1: Write the legs.** Run `pnpm --filter @rtc/server build`,
  then `pnpm --filter @rtc/tests test:fullstack:node`. Everything must PASS.
- [ ] **Step 2: Commit** with the message
  `test(fullstack): the admin leg — list, approve, block closes the socket, stale tokens end, self and non-admin refused, /mcp`.

---

### Task 7: Client ports: the live admin adapter, `4401`, and `access`

**Files:**
- **Create:** `client-adapters/src/adapters/WsAccountAdminAdapter.ts`
  (+ test).
- **Modify:**
  - `WsAdapter.ts` (+ test), `portFactory.ts` (+ test),
    `HttpAuthAdapter.ts` (+ test), `InMemorySessionStore.ts`,
    `RoutingAuthPort.ts`;
  - `web-boot/src/adapters/LocalStorageSessionStore.ts` (+ test);
  - `client-react-native/src/app/adapters/AsyncStorageSessionStore.ts`
    (+ test) and `buildNativePorts.ts`;
  - `core-api/src/app.ts` (`AppPorts.accountAdmin: AccountAdminPort`);
  - `core-contract/src/harness/scriptedPorts.ts`: a scripted
    `accountAdmin` with `emitAccountList(outcome)` and
    `answerAction(outcome)`, plus call counters for both methods, following
    the `admin.`/`ops.` counter precedent.

**Interfaces (produces):**
- `createWsAccountAdminAdapter(ws: IWsAdapter): AccountAdminPort`. Each
  method:
  - makes one `ws.rpc(CLIENT_MSG.ADMIN_ACCOUNTS_*, payload)`;
  - maps the answer with `isAccountAdminAnswerDto`;
  - treats a nack, a malformed answer or a disconnect as `unavailable`.
- `WsAdapter` on a `close` event whose `code === SESSION_ENDED_CLOSE_CODE`:
  - emits `{ type: "sessionEnded" }` on `connectionEvents`;
  - does **not** emit `gatewayDisconnected`, and does not
    `scheduleReconnect`;
  - stays reusable through `connect()` after a new sign-in.
- Session stores read a stored user without `access` as `access: "user"`.
  `HttpAuthAdapter` passes `access` through from the DTO.
- `AppPorts.accountAdmin` in the builders:
  - the simulator builder: `createUnavailableAccountAdmin()`;
  - the wsReal builder: `createWsAccountAdminAdapter(ws)`;
  - React Native: unavailable.

- [ ] **Step 1: Write the failing tests.**
  - **The adapter:** one case per answer shape and per failure.
  - **`WsAdapter` (Review Focus 3), on fake timers:**
    - a `4401` close emits `sessionEnded`, and after
      `vi.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS * 3)` no new
      socket was created;
    - a `1006` close still reconnects;
    - `connect()` after a `4401` opens a socket.
  - **Session stores:** a stored blob without `access` reads `"user"`. A
    blob with `"admin"` reads `"admin"`.
  - **`portFactory`:** the simulator's `accountAdmin` answers
    `unavailable`.
- [ ] **Step 2: Implement.** Rebuild `@rtc/core-api`, `@rtc/client-adapters`,
  `@rtc/web-boot` and `@rtc/core-contract`, in order.
- [ ] **Step 3: Run the gates.** All of these must be green:
  - `pnpm --filter @rtc/client-adapters test`;
  - `pnpm --filter @rtc/web-boot test`;
  - `pnpm --filter @rtc/core-contract test`;
  - `pnpm --filter @rtc/client-react-native typecheck`;
  - `pnpm --filter @rtc/client-react-native test`.
- [ ] **Step 4: Commit** with the message
  `feat(client): the account-admin port, the 4401 session end on the socket, and SessionUser.access through the stores`.

---

### Task 8: Contract and RxJS core, part 1: the session end and the visible tabs

**Files:**
- `core-api/src/layout.ts` (`WorkspaceTab` gains `"admin"`, after `ops`);
- `core-api/src/machines/workspaceNav.ts`;
- `core-logic/src/presenters/workspaceNavFold.ts` (+ test, new);
- `core-logic/src/presenters/shellFolds.ts` (+ test);
- `core-logic/src/layout/{defaultLayoutPort,workspaceDock,workspaceLayoutPersistence}.ts`
  (+ tests);
- `core-logic/src/routes/appRoutes.ts` (+ test; slug `admin`);
- `shared/src/jarvis/deskPanels.ts`, if its type is keyed by `WorkspaceTab`
  (the `admin` entry is `[{ id: "admin-users", title: "Users" }]`);
- `client-core-rxjs`: `WorkspaceNavMachine.ts`, `AuthPresenter.ts`,
  `composition.ts`;
- `core-contract/src/suites/{auth,workspaceNav}.ts`,
  `harness/workspaceTabs.ts`.

**Interfaces (produces):**

```ts
interface WorkspaceNavState { readonly activeTab: WorkspaceTab; readonly visibleTabs: readonly WorkspaceTab[] }
// core-logic
const EVERY_USER_TABS: readonly WorkspaceTab[] = ["fx", "credit", "equities", "ops"];
function visibleTabsFor(access: AccessLevel | null): readonly WorkspaceTab[]; // + "admin" last for "admin"
type WorkspaceNavEvent = { readonly type: "switchTab"; readonly tab: WorkspaceTab } | { readonly type: "access"; readonly access: AccessLevel | null };
function stepWorkspaceNav(state: WorkspaceNavState, event: WorkspaceNavEvent): WorkspaceNavState;
const INITIAL_WORKSPACE_NAV: WorkspaceNavState; // { activeTab: "fx", visibleTabs: visibleTabsFor(null) }
// AuthFailureReason (domain) gains "session_ended"; describeAuthFailure("session_ended") === "Your session has ended. Please sign in again."
```

The rules:
- **Switching** to a tab not in `visibleTabs` returns the same state, and
  the machine emits nothing.
- **An `access` event** recomputes `visibleTabs`. If `activeTab` is no
  longer visible, it becomes `"fx"`.
- **The rxjs nav machine** takes the access stream as a dependency:
  `createWorkspaceNavMachine(access$: Observable<AccessLevel | null>)`.
  Composition passes `auth.state$` mapped to `user?.access ?? null`, with
  `distinctUntilChanged`, so the auth presenter is built first.
- **The auth presenter on `sessionEnded`.** Composition subscribes to
  `ports.connectionEvents` filtered to `sessionEnded` and calls the
  presenter's internal `endSession()`. That is a class method, not part of
  the `AuthPresenter` interface. It clears the store and emits
  `UNAUTHENTICATED_STATE` with `failure: "session_ended"` and `error`
  carrying the copy. When nobody is signed in it is a no-op.
- **The default layout** for `admin` is one panel, `admin-users`, titled
  "Users".
- **`WORKSPACE_TAB_MARKERS`** gains `admin`.
- **The persistence test** from PR 1 is re-pinned: a saved `admin` tab
  whose tree holds `admin-dashboard` reads as `null`.

- [ ] **Step 1: Write the failing tests.**
  - **`workspaceNavFold` unit tests (Review Focus 4):**
    - `visibleTabsFor(null)`, `("user")` and `("admin")`;
    - a switch to `admin` while `user` is refused;
    - an `access: "admin"` event, then a switch to `admin`, is accepted;
    - an `access: null` event while on `admin` lands on `fx`;
    - an `access: null` event while on `credit` stays on `credit`.
  - **The core-contract suites**, run by every core:
    - `workspaceNav` gains these cases: the initial `visibleTabs` has no
      `admin`; an admin sign-in (scripted auth answering a user with
      `access: "admin"`) shows it; sign-out while on `admin` lands on
      `fx`;
    - `auth` gains: emitting `{ type: "sessionEnded" }` on the scripted
      `connectionEvents` while authenticated gives `status:
      "unauthenticated"`, `failure: "session_ended"`, the copy, and a
      cleared store; while unauthenticated it changes nothing;
    - the transport-gate suite already proves that sign-out disconnects.

  Run `pnpm --filter @rtc/core-logic test` and
  `pnpm --filter @rtc/client-core-rxjs test`. Expected: FAIL.
- [ ] **Step 2: Implement** in core-api, core-logic and the RxJS core. Then
  rebuild `@rtc/domain`, `@rtc/core-api`, `@rtc/core-logic` and
  `@rtc/core-contract`, in order.
- [ ] **Step 3: Run the gates.** All of these must be green:
  - `pnpm --filter @rtc/core-logic test`;
  - `pnpm --filter @rtc/client-core-rxjs test`;
  - `pnpm --filter @rtc/shared test`;
  - `pnpm --filter @rtc/layout-dockview test` (the seed for a one-panel tab
    already exists).

  The async and effect cores are red until Tasks 10 and 11.
- [ ] **Step 4: Commit** with the message
  `feat(core): the Admin tab is visible to administrators only, decided in workspaceNav; a sessionEnded event signs out with a message (rxjs)`.

---

### Task 9: Contract and RxJS core, part 2: `accountList` and `accountAction`

**Files:**
- **Create:**
  - `core-api/src/presenters/accountList.ts`;
  - `core-api/src/machines/accountAction.ts`;
  - `core-logic/src/presenters/{accountListFold,accountActionFold,accountAdminCopy}.ts`
    (+ tests);
  - `client-core-rxjs/src/presenters/{AccountListPresenter,AccountActionMachine}.ts`;
  - `core-contract/src/suites/{accountList,accountAction}.ts`.
- **Modify:**
  - `core-api/src/{app,machine}.ts` and the index files;
  - `client-core-rxjs/src/composition.ts`;
  - `core-contract/src/registry.ts`.

**Interfaces (produces):**

```ts
// core-api
type AccountListStatus = "loading" | "ready" | "failed" | "forbidden";
interface AccountListState { readonly status: AccountListStatus; readonly rows: readonly AccountSummary[]; readonly pendingCount: number }
interface AccountListPresenter {
  readonly state$: StateStream<AccountListState>;   // replay-current; loads on first subscription
  refresh(): void;
  /** Pass-through for the accountAction machine (factories take presenters only). */
  readonly admin: AccountAdminPort;
}
Presenters.accountList: AccountListPresenter;
type AccountActionKind = "approve" | "block" | "unblock" | "rename" | "delete";
type AccountActionState =
  | { readonly phase: "idle" }
  | { readonly phase: "confirmingDelete" }
  | { readonly phase: "renaming"; readonly draft: string; readonly draftError: string | null }
  | { readonly phase: "inFlight"; readonly action: AccountActionKind }
  | { readonly phase: "failed"; readonly action: AccountActionKind; readonly message: string };
interface AccountActionIntents {
  approve(): void; block(): void; unblock(): void;
  startRename(current: string): void; editName(draft: string): void; submitRename(): void;
  requestDelete(): void; confirmDelete(): void; cancel(): void; dismiss(): void;
}
MachineFactories.accountAction: (accountId: string) => Machine<AccountActionState, AccountActionIntents>;
// core-logic
function orderAccountRows(accounts: readonly AccountSummary[]): readonly AccountSummary[];
function countPending(accounts: readonly AccountSummary[]): number;  // status === "pending" only
function foldAccountList(outcome: AccountListOutcome, previous: AccountListState): AccountListState;
type AccountActionEvent = /* one per intent */ | { readonly type: "settled"; readonly outcome: AccountActionOutcome };
function stepAccountAction(state: AccountActionState, event: AccountActionEvent): { readonly state: AccountActionState; readonly request: AccountAdminAction | null };
const ACCOUNT_ADMIN_COPY: { panelTitle: "Users"; empty: "No registered accounts yet."; forbidden: "Administrator access required"; confirmDelete: "Delete this account?"; you: "You"; /* button labels, status chip labels, pending line `${n} pending` via a function */ };
function describeAccountAdminRefusal(refusal: AccountAdminRefusal, action: AccountActionKind | "list"): string;
```

**`orderAccountRows`:** pending rows first, oldest `joinedAt` first; then
the rest, newest first; ties broken by `id`.

**`foldAccountList`:**
- `ok` gives `ready`, with the ordered rows and the count;
- `forbidden` gives `forbidden` with no rows;
- any other refusal gives `failed`, keeping the previous rows.

**The machine:**
- **`approve`, `block` and `unblock`** go from `idle` to `inFlight`.
- **Deleting.**
  - `requestDelete` goes from `idle` to `confirmingDelete`.
  - `confirmDelete` goes from `confirmingDelete` to `inFlight("delete")`.
  - `cancel` goes from `confirmingDelete` back to `idle`.
- **Renaming.**
  - `startRename(current)` goes from `idle` to `renaming`, with
    `draft = current` and `draftError = null`.
  - `editName` updates `draft`. `draftError` holds the live display-name
    check's text, the same rule as `accountFieldFeedback`'s `display-name`
    row, or null.
  - `submitRename` with an error stays put. With no error it goes to
    `inFlight("rename")`, carrying the normalized draft.
  - `cancel` goes from `renaming` back to `idle`.
- **Settling.**
  - `settled ok` goes to `idle`, and the machine calls
    `presenters.accountList.refresh()`.
  - `settled refused` goes to `failed`, carrying the
    `describeAccountAdminRefusal` text. A `forbidden` refusal also calls
    `refresh()`, so the list re-reads into `forbidden`.
  - `dismiss` goes from `failed` back to `idle`.
- **Ignored and late.** Intents not listed for a phase are ignored. A
  `settled` that arrives when the phase is not `inFlight`, for example after
  `dispose`, is ignored.

- [ ] **Step 1: Write the failing tests.**
  - Fold unit tests for every line above.
  - The **`accountList` contract suite**, using `scriptedPorts`'
    `accountAdmin`:
    - loads once on first subscription (the port called once);
    - `ready` rows come in the fold's order;
    - `pendingCount` excludes unconfirmed;
    - `refresh` calls the port again, and the rows stay visible while it
      loads;
    - `forbidden`;
    - `failed` keeps the rows;
    - `dispose` cuts the port stream;
    - the construction-time count is zero calls before the first
      subscription.
  - The **`accountAction` contract suite**:
    - each action sends exactly one `actOn(id, action)`;
    - the rename sends the normalized name, and an invalid draft sends
      nothing;
    - success triggers one `listAccounts` re-read;
    - `forbidden` flips the list to `forbidden`;
    - `dispose` in flight means a later answer writes nothing;
    - a cancelled delete sends nothing.
  - Register both in `registry.ts`.
- [ ] **Step 2: Implement** in the RxJS core. Rebuild in order.
- [ ] **Step 3: Run the gates.** `pnpm --filter @rtc/core-logic test`,
  `pnpm --filter @rtc/client-core-rxjs test` and
  `pnpm --filter @rtc/core-contract test` (the registry drift test) must be
  green.
- [ ] **Step 4: Commit** with the message
  `feat(core): accountList and accountAction — contract, shared folds and copy, the RxJS core, their suites`.

---

### Task 10: The async core

**Files:**
- `client-core-async/src/presenters/accountList.ts`;
- `machines/accountAction.ts`;
- `machines/workspaceNav.ts`;
- the auth presenter;
- `composition.ts` (+ the core's own tests where it keeps them).

Implement Tasks 8 and 9's members natively over the same core-logic folds,
in the core's run-slot / `once` style, as its `accountAccess` does.

- [ ] **Step 1: Implement** until the shared suites pass:
  `pnpm --filter @rtc/client-core-async test`, including its
  `coreContract.test.ts`.
- [ ] **Step 2: Run** `pnpm --filter @rtc/client-core-async test:coverage`
  and check it is at least 95%, with branches at least 85%.
- [ ] **Step 3: Commit** with the message
  `feat(core-async): accountList, accountAction, admin-aware workspaceNav, sessionEnded`.

---

### Task 11: The Effect core

The same as Task 10, in `client-core-effect`. Read
`packages/client-core-effect/CLAUDE.md` first (its delivery rules).

- [ ] **Step 1: Implement** until the shared suites pass:
  `pnpm --filter @rtc/client-core-effect test`.
- [ ] **Step 2: Run** `pnpm --filter @rtc/client-core-effect test:coverage`
  and check it is at least 95% / 85%. Then run `pnpm typecheck` for the
  whole repo, which must be green from here on.
- [ ] **Step 3: Commit** with the message
  `feat(core-effect): accountList, accountAction, admin-aware workspaceNav, sessionEnded`.

---

### Task 12: Bindings and the route gate

**Files:**
- `react-bindings/src/createViewModel.ts` (+ test);
- `solid-bindings/src/createViewModel.ts` (+ test);
- `core-logic/src/routes/workspaceRouteSync.ts` (+ test);
- both clients' `ui/shell/routes/useWorkspaceRoutes`.

**Interfaces (produces):**
- `useAccountList(): { state: AccountListState; refresh(): void }`. React
  returns a value; Solid returns an accessor in `state`, as its siblings do.
- `useAccountAction(accountId: string): { state: AccountActionState; intents: AccountActionIntents }`,
  one machine per mount and disposed on unmount (`useMachine`).
- `WorkspaceRouteSyncDeps` gains `readonly canShow: (tab: WorkspaceTab) => boolean`.
  - On mount, a URL naming a hidden tab is `replace`d with the active tab.
  - On a Back/Forward step, a hidden tab is `replace`d with the shown one.
  - It never calls `switchTab` for a hidden tab.
- The hooks pass `canShow = (tab) => navState.visibleTabs.includes(tab)`,
  read at call time.

- [ ] **Step 1: Write the failing route-sync tests (Review Focus 4).**
  - `/admin` on mount with `canShow(admin) = false` gives `replace("/fx")`
    and no `switchTab`;
  - a traversal to `/admin` gives a `replace` back;
  - with `canShow` true, `/admin` switches to it.

  Then write the bindings tests for both hooks.
- [ ] **Step 2: Implement.** Rebuild `@rtc/core-logic`, then the bindings.
- [ ] **Step 3: Run the gates.** `pnpm --filter @rtc/core-logic test`,
  `pnpm --filter @rtc/react-bindings test` and
  `pnpm --filter @rtc/solid-bindings test` must be green.
- [ ] **Step 4: Commit** with the message
  `feat(bindings): useAccountList, useAccountAction; the route sync never shows a tab the user may not see`.

---

### Task 13: UI contract: World, page objects and specs (red until Tasks 14 and 15)

**Files:**
- `ui-contract/src/shared/pages/admin/{UsersPanelPage,UsersHeadPage}.ts`;
- `ui-contract/src/specs/admin/UsersPanel.contract.spec.ts`;
- `specs/shell/chrome/HeaderChrome.contract.spec.ts` and
  `WorkspaceRoutes.contract.spec.ts`, which gain the gate cases;
- `shared/harness/world.ts` and `shared/mount.ts`;
- both clients' `viewModelFromWorld.ts`;
- `tests/browser/page-objects/contracts/testids.ts`, where `TESTIDS.admin`
  gains the users testids.

**Testids:**

| Testid | Element |
|---|---|
| `users-panel` | the panel, with `data-status` |
| `users-head-pending` | the pending count |
| `users-refresh` | the Refresh control |
| `user-row-<id>` | a row, with `data-status` and `data-self` |
| `user-approve-<id>`, `user-block-<id>`, `user-unblock-<id>`, `user-rename-<id>`, `user-delete-<id>`, `user-confirm-delete-<id>`, `user-cancel-<id>` | the row's buttons |
| `user-name-input-<id>`, `user-name-error-<id>`, `user-save-<id>` | rename |
| `user-error-<id>`, `user-dismiss-<id>` | a failure |
| `users-empty`, `users-forbidden` | the empty and forbidden states |
| `tab-admin` | the Admin tab |

**Spec cases:**
1. **The order and the count.** Rows render in the order given, and the
   head shows "2 pending".
2. **Unconfirmed is not pending.** An unconfirmed row has no Approve and is
   not counted.
3. **Pending.** A pending row shows Approve, Rename and Delete.
4. **Active and blocked.** An active row shows Block; a blocked row shows
   Unblock.
5. **Your own row.** It shows "You" and no buttons.
6. **Delete.** It asks for confirmation inline, and Cancel restores the row.
7. **Rename.** It shows the field. An invalid draft shows its error and
   disables Save.
8. **In flight.** The row's buttons are disabled.
9. **Failed.** The row shows the message and Dismiss.
10. **Empty and forbidden.** The empty copy and the forbidden copy each show
    in their state.
11. **The Admin tab.** It is absent for a user and present for an admin
    (`HeaderChrome`).
12. **The route as a user.** `/admin` lands on `/fx` (`WorkspaceRoutes`).
13. **Signing out on Admin.** It lands on `fx`.

- [ ] **Step 1: Write the page objects, the World support and the specs.**
  `pnpm --filter @rtc/ui-contract build` must succeed. The client suites are
  expected red.
- [ ] **Step 2: Commit** with the message
  `test(ui-contract): the Users panel and the Admin tab gate — shared specs (red until both clients land)`.

---

### Task 14: React: the Admin tab and the Users panel

**Files:**
- `client-react/src/ui/admin/{UsersPanel,UsersHead,UserRow}.tsx` + CSS
  modules;
- `ui/shell/chrome/{NavTab,HeaderChrome}.tsx` (`TAB_LABEL.admin = "Admin"`;
  render the Admin `NavTab` when `visibleTabs` includes it, and keep the
  existing four as they are);
- `ui/shell/layout/engine/appPanelRegistry.tsx` and the head registry
  (`admin-users`).

**The look.** Follow the Ops panels' chrome: the panel head, mono labels and
skin tokens, with no hard-coded colours. **Before writing any CSS
transition, read `docs/performance.md`.**
- **Status chips** use the existing tone tokens: positive for Active,
  warning for Pending, negative for Blocked, and muted for Unconfirmed.
- **The joined date** is formatted `YYYY-MM-DD` by a pure helper in
  `@rtc/core-logic` (`formatJoinedDate(ms)`), with a test, so Solid formats
  it the same way.

- [ ] **Step 1: Implement until the React suite is green.**
  `pnpm --filter @rtc/client-react test:ui:contract` and
  `pnpm --filter @rtc/client-react test` must PASS, and
  `pnpm --filter @rtc/client-react test:ui:contract:coverage` must be at
  least 95%.
- [ ] **Step 2: Commit** with the message
  `feat(react): the Admin tab and the Users panel`.

---

### Task 15: Solid twin

The same as Task 14, in `client-solid` (`<Index>`/`<For>` as the siblings
use them). It must reach pixel parity with React in Task 16.

- [ ] **Step 1: Implement until the suite is green.**
  `pnpm --filter @rtc/client-solid test:ui:contract`,
  `test:ui:contract:coverage` (at least 95%, branches at least 85%) and
  `pnpm --filter @rtc/client-solid test` must PASS.
- [ ] **Step 2: Commit** with the message
  `feat(solid): the Admin tab and the Users panel`.

---

### Task 16: Visual scenarios and goldens

**Files:**
- `ui-contract/src/visual/{appData,fixtures,scenarios,scenarioActions}.ts`;
- both clients' `buildFakeViewModel.ts`, for `useAccountList` and
  `useAccountAction` with a per-row state map;
- the goldens.

| Scenario | Fixture |
|---|---|
| `admin/users` | a mixed list: one each of pending (2), active, blocked, unconfirmed, and self (admin) |
| `admin/users-empty` | `ready`, no rows |
| `admin/users-row-in-flight` | the mixed list, the first pending row `inFlight("approve")` |
| `admin/users-row-failed` | the mixed list, the active row `failed("block", <unavailable copy>)` |
| `admin/users-confirm-delete` | the mixed list, the blocked row `confirmingDelete` |
| `admin/users-rename` | the mixed list, the first pending row `renaming` with an invalid draft and its error |
| `admin/users-forbidden` | `forbidden` |
| `app/admin` | the full app as an admin user, Admin tab active |

The fixed fixture dates (`joinedAt`) make the shots deterministic. Existing
goldens must not change, except where the tab bar now lists Admin, and only
`app/admin` signs in as an admin.

- [ ] **Step 1: Generate the local set.** Add the fixtures, then run
  `cd packages/client-react && SCENARIO_PATTERN='(admin/users|app/admin)[^_]*__' pnpm test:ui:visual:playwright:react:update`.
  Expect 80 new PNGs in `react-local/darwin-arm64` and nothing modified.
  Then assert React and Solid without `--update`.
- [ ] **Step 2: Send the user** the eight `classic-dark` shots with
  `SendUserFile`. Their acceptance is the gate, and a requested change is a
  fix round on Tasks 14 and 15.
- [ ] **Step 3: Commit** with the message
  `test(visual): the Users panel and the Admin tab — eight scenarios (local goldens)`.
- [ ] **Step 4 (closing batch):**
  `gh workflow run update-visual-goldens.yml --ref worktree-b2c-admin -f scenario_pattern='(admin/users|app/admin)[^_]*__'`.
  Then pull and verify that the auto-commit touched only
  `__screenshots__/react/` and holds 80 files.

---

### Task 17: The browser journey, mutants and docs

**Files:**
- `tests/fullstack/browser/accounts.spec.ts`, with a new case, and the
  page objects and scenarios it needs (`openAdminTab`,
  `approveAccount(email)`, `expectAdminTabAbsent`);
- `<scratchpad>/b2c-mutants.json`, which is not committed;
- the docs.

**The browser case.**
1. `admin@rtc.test` signs in, sees `tab-admin`, opens it and approves the
   account registered earlier in the same serial describe.
2. That account then signs in.
3. `trader@rtc.test` signs in and sees no `tab-admin`. Opening `/admin`
   lands on `/fx`.

**Mutants.** Each row's `find` must match exactly once, and every row must
be KILLED.

| # | File | Mutation | Expected killer |
|---|---|---|---|
| 1 | `sessionEnd.ts` | `issuedAt < notBefore` → `<=` | the equal-stamp row |
| 2 | `sessionEnd.ts` | drop the ledger from the max | the ledger row |
| 3 | `accountStatusCache.ts` | drop the generation check | race case 1 |
| 4 | `accountStatusCache.ts` | `finally` deletes unconditionally | race case 2 |
| 5 | `accountAdminService.ts` | read `caller` access from a constant `"admin"` | demoted-caller case |
| 6 | `accountAdminService.ts` | drop the `self` check | self cases |
| 7 | `accountAdminService.ts` | skip `closeAll` after block | block case |
| 8 | `accountAdminService.ts` | skip the name validation | `invalid_name` case |
| 9 | `upgradeGate.ts` | an ended session → `ok` without `sessionEnded` | ended rows |
| 10 | `mcpHttpHandler.ts` | accept `accountId === null` | roster-token case |
| 11 | `AccountService.ts` | skip `onSessionsRevoked` | the reset case |
| 12 | `SupabaseAccountDirectory.ts` | `setBlocked` omits the stamp | the body assertion |
| 13 | `WsAdapter.ts` | reconnect after `4401` | the fake-timer case |
| 14 | `workspaceNavFold.ts` | accept a switch to a hidden tab | the fold case + suite |
| 15 | `workspaceNavFold.ts` | keep a hidden active tab on access loss | the fold case + suite |
| 16 | `workspaceRouteSync.ts` | ignore `canShow` on mount | the route-sync case |
| 17 | `accountListFold.ts` | count unconfirmed as pending | the fold case + suite |
| 18 | `accountActionFold.ts` | send the raw draft instead of the normalized one | the suite rename case |
| 19 | the rxjs `AccountActionMachine.ts` | skip `refresh` after success | the suite case |
| 20 | the rxjs `AuthPresenter.ts` | `endSession` leaves the store | the auth suite case |

A row that crosses a package boundary gives its test command with the
rebuild:
`pnpm --filter @rtc/core-logic build && pnpm --filter @rtc/client-core-rxjs test -- coreContract`.

**Docs.**
- **`docs/authentication.md`:** a new §7.10, "Administration and ending
  sessions (B2c)". It covers:
  - the gate order;
  - the stamp and `iat`;
  - `4401` and what the browser does;
  - the ledger's residual;
  - the five actions;
  - `/mcp`;
  - a tall sequence diagram, block → socket closed → sign-in screen with
    the line.
- **`docs/security.md`:** the S12 row is closed; the tokens row (B2c closes
  sessions); `/mcp` admin-only; and the inventory gains the migration.
- **`docs/DEPLOY.md`:** the migration-before-deploy step, and the one-time
  sign-out of every account user.
- **`docs/architecture/18-jarvis-ai-agent-surface.md`:** the `/mcp` local
  recipe now uses `dev:*:ws`, `RTC_DEV_ACCOUNTS=1` and `admin@rtc.test`.
- **`docs/STATUS.md`:** B2 complete; B3 NEXT; the user's rollout steps.
- **The member count, 76 → 78:** in `CLAUDE.md` if it counts them, docs §22
  and §23, and the two sibling-core READMEs.
- **The parent spec §8:** an "as built" line.
- **This plan's spec:** amend it with decisions 1–6 above.

- [ ] **Step 1: Write the browser case.**
  `pnpm --filter @rtc/tests test:fullstack:browser` must PASS.
- [ ] **Step 2: Run the mutants.**
  `node scripts/mutation-check.mts <scratchpad>/b2c-mutants.json --keep-going`
  must show all KILLED, and `git status` must be clean afterwards. A row
  that SURVIVED is a missing test: add it, then run again.
- [ ] **Step 3: Write the docs.** `pnpm check:doc-links` must PASS.
- [ ] **Step 4: Commit** with the message
  `test+docs: the admin browser journey; B2c in authentication, security, deploy, status`.

---

## Close-out (controller)

1. **Run the gates on the final tree:**
   - `/rtc:gauntlet full`;
   - `pnpm --filter @rtc/tests test:fullstack:node`;
   - `pnpm --filter @rtc/tests test:fullstack:browser`;
   - `pnpm --filter @rtc/tests test:fullstack:hybrid`;
   - `pnpm test:e2e`.
2. **Whole-branch review** on the most capable model, with a focus on the
   server's gate order and on what a demoted administrator can still do. One
   fix wave, then a scoped re-review.
3. **The rulings file**, with the mutant table and the deferred-finding
   triage, committed after the goldens auto-commit.
4. **The closing batch,** one outward step per Bash call:
   1. push;
   2. dispatch the goldens;
   3. pull and verify;
   4. push the rulings;
   5. `gh pr create`;
   6. watch CI on the head SHA;
   7. check code scanning;
   8. Rule 3 triage;
   9. `gh pr merge --merge`;
   10. confirm with `git merge-base --is-ancestor`;
   11. remove the worktree from outside it.
5. **Tell the user their rollout** (spec §7):
   1. apply the migration (offer to do it through the Supabase connector
      with their yes);
   2. deploy the server and both clients together;
   3. everyone with an account is signed out once;
   4. React Native needs an EAS Update;
   5. re-point any MCP client at the administrator's token.

## Self-review

- **Spec coverage:**
  - §4.1 the caller: Task 4;
  - §4.2 the registry: Task 3;
  - §4.3 the stamp, `iat` and its clock: Tasks 1–4;
  - §4.4 invalidation: Task 3;
  - §4.5 the directory: Task 2;
  - §4.6 the effects and the gate: Task 5;
  - §4.7 the reset with the stamp failure: Task 4;
  - §4.8 `/mcp` and local development: Task 4 and Task 17's docs;
  - §4.9 `access`: Tasks 1 and 7;
  - §4.10 the visible end: Tasks 4, 7 and 8;
  - §5.1 ports: Task 7;
  - §5.2 the members and `isSelf`: Tasks 1, 5 and 9–11;
  - §5.3 the gate: Tasks 8 and 12, with the documented `forbidden`
    behaviour in Task 9;
  - §5.4 the panel: Tasks 13–15;
  - §6 the tests: across tasks;
  - §7 the rollout: the close-out.
- **Placeholders:** none. The async and Effect tasks point at Tasks 8 and 9's
  interface blocks.
- **Type consistency:** these names are spelled the same in every task:
  `AccountSummary`, `AccountAdminRefusal`, `AccountAdminAction`,
  `AccountAdminPort`, `Caller`, `CachedAccount`, `hasSessionEnded`,
  `SessionRegistry.closeAll`, `RevocationLedger`, `AccountAdminService`,
  `AccountListState`, `AccountActionState`, `stepAccountAction`,
  `stepWorkspaceNav`, `visibleTabsFor`, `useAccountList`, `useAccountAction`,
  `SESSION_ENDED_CLOSE_CODE`.
- **Review Focus:** 1 → Task 5; 2 → Task 3; 3 → Task 7; 4 → Tasks 8 and 12;
  5 → Task 5.

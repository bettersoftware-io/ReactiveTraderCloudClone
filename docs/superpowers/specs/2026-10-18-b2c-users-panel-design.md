# B2c — the Ops rename, the Users panel and administrator access — design

**Date:** 2026-10-18 · **Status:** approved in conversation, awaiting spec review
**Builds on:** [B2 user management](2026-10-04-b2-user-management-design.md)
§5.5, §5.6 and §8 with their amendments. That spec decided *what* B2c does.
This one records what changed since, decides what it left open, and
says how the work fits the code as it stands on `main` (6cda23f6b).

## 1. Purpose

B2c finishes B2. An administrator approves, blocks, unblocks, renames and
deletes registered accounts from inside the app. The server enforces every
one of those rules. A reset, a block or a delete ends the account's open
sessions. `/mcp` is closed to everyone but an administrator.

It also fixes a name. The tab called "Admin" today is an operations
dashboard: throughput, latency, incidents, sessions and Jarvis usage. It
manages nobody, every signed-in user sees it, and the demo is better for
it. The user asked (2026-10-18): "was that tab really admin or more a
dashboard?" It becomes **Ops**, and **Admin** becomes the name of the new
administrators' workspace.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | The existing tab becomes **Ops** at `/ops`, unchanged in content and visible to everyone, the demo personas included (user, 2026-10-18). | It is a dashboard, not an admin area. |
| D2 | A new **Admin** tab at `/admin` holds the Users panel. It appears in the tab bar only when the signed-in user's `access` is `admin`. For anyone else, `/admin` behaves like an unknown path and lands on `/fx` (user, 2026-10-18). | Separates what everyone sees from what one person manages. |
| D3 | No hidden or hard-to-guess URL. | Every route ships in the JavaScript bundle. The server check is the lock; the client gate only keeps the interface honest. A non-admin who forces the panel open sees refused requests and nothing else. |
| D4 | The rename is a true rename. The workspace id, the route, the panel id, the component and spec directories, the scenario keys and the server's `admin.*` wire messages all become `ops`. | After B2c, "admin" in this codebase must mean only the guarded thing. A security reviewer reading `admin.setThroughput` should not wonder whether it is gated. |
| D5 | Two PRs. **PR 1** is the Ops rename, mechanical, with its goldens. **PR 2** is B2c proper. | A reviewer could accept one and reject the other. The rename's golden churn (about 280 PNGs a set) stays out of the security review. |
| D6 | Changing someone's role stays a manual edit in Supabase, and there is no promote/demote button. | Unchanged from the parent spec §8. There is one administrator. |
| D7 | The Users panel loads the list over a request, not a live stream. It re-reads after each action, and the panel head has a Refresh control. | One administrator, a short list (unconfirmed accounts are purged after 48 hours), and no unsubscribe problem. A stream would need a server-side change signal and an unsubscribe message type (STATUS B1 follow-up (b)) for a list that changes a few times a week. |
| D8 | Rename is in, as an action on the row. | Parent spec §8: a display name can belong to an earlier, never-confirmed registrant of the same address, and the panel is where it gets fixed. |
| D9 | When the server ends a session, the browser signs the person out and says so: "Your session has ended. Please sign in again." (user, 2026-10-18, option (a) of two). | Today a refused upgrade is invisible to a browser, so the client reconnects forever over a frozen screen. B2c ends sessions on purpose (block, reset, rename, and once for everyone at the deploy), so it must end them visibly. §4.10. |

## 3. PR 1 — the Ops rename

### 3.1 What changes

- `WorkspaceTab` becomes `"fx" | "credit" | "equities" | "ops"`
  (`packages/core-api/src/layout.ts`, and the local copies of the union in
  both clients' `NavTab.tsx`), with the slug `ops` in
  `packages/core-logic/src/routes/appRoutes.ts`. The tab label is "Ops"
  (`NavTab.tsx` in both clients). Tab order stays fx, credit, equities, then ops.
- The panel id changes from `admin-dashboard` to `ops-dashboard`. Its title
  changes from "Admin" to "Ops" (`defaultLayoutPort.ts`).
- These directories are renamed:
  - `ui/admin/` → `ui/ops/` in both clients;
  - `ui-contract/src/specs/admin/` → `specs/ops/`;
  - `shared/pages/admin/` → `pages/ops/`.
  The components follow the same pattern: `AdminDashboard` → `OpsDashboard`,
  `AdminHead` → `OpsHead`, `AdminPanel` → `OpsPanel`, and so on. Hooks keep
  their names unless the name says "admin": `useAdminMetrics` →
  `useOpsMetrics`.
- The visual scenario keys change from `app/admin*` and `admin/*` to
  `app/ops*` and `ops/*`.
  - Component-level shots that do not show the tab bar are renamed with
    `git mv`, and their pixels are unchanged.
  - Every shot that shows the tab bar is regenerated, because its label
    changed.
- The wire messages change:
  - The constants: `CLIENT_MSG.GET_THROUGHPUT` / `SET_THROUGHPUT` and the
    Jarvis-usage subscribe message.
  - Their strings: `admin.getThroughput` → `ops.getThroughput`, and so on.
  - The matching `SERVER_MSG` responses.
  - The server's `admin.effects.ts` → `ops.effects.ts` and
    `adminJarvisUsage.effects.ts` → `opsJarvisUsage.effects.ts`.
  Server and clients deploy together. See §7 for React Native.
- The port and presenter names follow D4 too. This is the application-core
  part of the rename:
  - `AdminPort` (`packages/domain/src/ports/adminPort.ts`) → `OpsPort`;
  - `AppPorts.admin` (`packages/core-api/src/app.ts`) → `AppPorts.ops`;
  - the "Admin" presenter names and docs in `core-api` and the three cores;
  - the `ADMIN_JARVIS_USAGE*` constant names;
  - the core-contract suites and `scriptedPorts`;
  - both port builders and React Native's `buildNativePorts`.

  It is mechanical, but it crosses the core boundary. Load the
  `application-core-rules` skill before cutting the plan.
- Jarvis's drive commands and desk roster use `ops`:
  - `DRIVE_TABS` (`packages/domain/src/jarvis/driveCommand.ts`);
  - `DESK_PANEL_ROSTER` (`packages/shared/src/jarvis/deskPanels.ts`);
  - any prompt text that names the tab (grep the server's Jarvis prompts).
- e2e: page objects (`openAdmin` → `openOps`, the tab unions), `testids.ts`,
  the `adminIncident` scenario and spec, `theme.spec.ts`/`theme.feature`, and
  `tests/specs/admin/incident.feature` with its steps. Also the tool scripts
  (`motion-audit.ts`, `framework-compare.ts`, and the feature→test map in
  `grep-gates.ts`).
- Docs: every doc that calls this tab "Admin" (architecture, power-saver,
  performance, the e2e docs). The prototype under `docs/design/` and
  `packages/client-prototype` keep their own names. They record the design
  as delivered, and the deviation corpus already explains renames.

### 3.2 Saved layouts

The persisted layout blob keys tabs by id (`WORKSPACE_TAB_MARKERS` in
`workspaceLayoutPersistence.ts`). After the rename, a saved `admin` entry
names a tab that no longer exists before PR 2, and a different tab after it.
**The payload version goes from `v: 1` to `v: 2`, and a `v: 1` payload reads
as no saved layout,** so every tab starts from its default once. There is no
migration. Nobody has used saved layouts in anger (user, 2026-10-17, about
the URLs: "it's a new thing, nobody used them").

### 3.3 Done when

- A `grep` for the workspace id `"admin"`, `tab-admin`, `admin-dashboard`,
  `admin.` message strings, `AdminPort` and `AppPorts.admin` finds nothing
  outside `docs/design/`,
  `client-prototype`, the server's `AccessLevel` uses and CHANGELOG history.
- The full gauntlet and e2e are green, and the regenerated goldens differ only
  in the tab label.
- The user has looked at one before/after pair.

## 4. PR 2 — server

### 4.1 The caller on every connection

`UpgradeVerdict` (`packages/server/src/http/upgradeGate.ts`) carries the
verified identity on success: `{ username, accountId: string | null,
issuedAt: number | null }` (`issuedAt` is the token's `iat`, null for a
roster token). The
`connection` handler in `packages/server/src/index.ts` receives the identity
for that request. It goes through a `WeakMap<IncomingMessage, Caller>`
filled by `verifyClient`, or whatever `settleUpgrade` allows; that choice is
the builder's.

`scopeServicesToConnection(shared, caller)` puts it on the per-connection
container as `ctx.caller`.

**`access` is not part of `Caller`.** An effect that needs it reads it from
the directory at that moment (parent §8, amended).

### 4.2 Session registry

`sessionRegistry` (new, `packages/server/src/accounts/sessionRegistry.ts`)
maps an account id to its live sockets:

- the `connection` handler registers each socket;
- the socket's `close` handler unregisters it;
- `closeAll(accountId, reason)` closes every socket with the session-ended
  close code (§4.10).

Roster sockets are not registered.

### 4.3 Revoking tokens

Tokens are stateless HMACs that last eight hours. Closing sockets is not
enough: the old token would just reconnect.

- **Profiles gain `sessions_not_before timestamptz`**, null by default. This
  is a new migration in `supabase/migrations/`, and `migrations.test.ts`
  gains its properties.
- **Account tokens gain an `iat` claim** (issued-at, ms) in
  `packages/server/src/auth/token.ts`.
  - An account token without `iat` counts as ended (§4.10), so every
    registered user signs in once more after the deploy.
  - Roster tokens are unchanged.
- **Where the check runs.** Wherever an account token is accepted (the
  upgrade re-check and `/mcp`), a token whose `iat` is before the account's
  `sessions_not_before` is refused.
  - The status cache carries `sessionsNotBefore` beside the status.
- **The clock.** The **server** writes the stamp, as its own `now()` in
  milliseconds, sent in the PATCH. It is never the database's `now()`. `iat`
  comes from the same clock, so clock skew cannot refuse a token issued just
  after the stamp. The comparison is `iat < sessionsNotBefore` (strictly
  before).
- **What sets it.** A completed password reset, a block and an
  administrator's rename set `sessions_not_before`.
  - Each of these also invalidates the cache entry and calls
    `sessionRegistry.closeAll`.
  - A delete needs no stamp: the row is gone, so the token's status re-check
    fails.

Rename revokes because it changes what other people see the user called. Their
own `SessionUser.name` would otherwise be stale for eight hours. That is the
builder's call to confirm; if it is dropped, say so in the rulings.

**The shape change.** `AccountRecord` gains `createdAt` and
`sessionsNotBefore`. `PROFILE_COLUMNS` gains `created_at` and
`sessions_not_before`. The status cache stores
`{ status, sessionsNotBefore }` instead of a bare status string, and
`decideUpgrade` compares the token's `iat` against it. This refactors B2a
code (`findAccount`, the cache's value type, `decideUpgrade`) rather than
adding beside it, and the B2a tests move with it.

### 4.4 Cache invalidation

`accountStatusCache` gains `invalidate(accountId)`. It drops both the entry
and any in-flight lookup. Otherwise a lookup started before the change
re-caches the old verdict, because `remember()` only guards on `readAt`.

### 4.5 Directory operations

`AccountDirectory` gains five methods. All three implementations get them:
Supabase, in-memory and disabled.

| Method | Supabase | Result |
|---|---|---|
| `listAccounts(limit)` | `GET /rest/v1/profiles?select=…&order=created_at.desc&limit=` | `AccountSummary[]` (`id, email, displayName, access, status, createdAt`) or `unavailable` |
| `setApproved(id, true)` | `PATCH /rest/v1/profiles?id=eq.<id>` with `Prefer: return=representation` | `ok`, `not_found`, `unavailable` |
| `setBlocked(id, blocked)` | same; also stamps `sessions_not_before` when blocking | same |
| `rename(id, displayName)` | same; also stamps `sessions_not_before` | same |
| `deleteAccount(id)` | `DELETE /auth/v1/admin/users/<id>` (the purge already uses it; the profile cascades) | same; a 404 is `not_found` |

- `Call.method` gains `PATCH`.
- An empty array returned by a PATCH means `not_found`.
- The id is checked with `UUID_SHAPE` before any request.
- `listAccounts` caps at `ADMIN_ACCOUNT_LIST_MAX` (500, in `limits.ts`).
- The in-memory directory implements all five over its map, so `dev:*:ws`,
  e2e and the fullstack journey can exercise them.
- The disabled directory answers `unavailable`.

### 4.6 Admin effects

New effects live in `packages/server/src/effects/accountAdmin.effects.ts`.
Their messages go in `packages/shared/src/protocol/messages.ts`, prefixed
`admin.accounts.`:

| Message | Payload | Answer |
|---|---|---|
| `admin.accounts.list` | `{}` | `{ accounts: AccountSummaryDto[] }` |
| `admin.accounts.approve` | `{ accountId }` | `{ account: AccountSummaryDto }` |
| `admin.accounts.block` / `.unblock` | `{ accountId }` | same |
| `admin.accounts.rename` | `{ accountId, displayName }` | same |
| `admin.accounts.delete` | `{ accountId }` | `{ accountId }` |

Every handler runs the same gate first.

- **The caller check.** The handler reads the caller's account with
  `directory.findAccount(ctx.caller.accountId)`, directly and not through
  the cache.
  - The caller must be a registered account that is `active` with `access`
    `admin`, and its token's `iat` must not be before its
    `sessions_not_before`.
  - Otherwise the handler answers with a typed refusal `{ error: "forbidden" }`.
  - A roster caller is always refused.
- **No editing yourself.** An action whose `accountId` equals the caller's
  own is refused with `{ error: "self" }`. This is Graflyn's rule, from
  parent §8.
- **Other refusals.** A missing target answers `{ error: "not_found" }`. A
  directory that cannot be reached answers `{ error: "unavailable" }`.
- **Refusals are answers, not nacks.** A nack carries no reason, and the panel
  needs to tell "you are not an admin" from "try again".
  - A malformed payload is still a nack, through `validated()` in
    `guards.ts`. New guards cover `{ accountId }` (UUID shape) and
    `{ accountId, displayName }`.
- **Display-name validation.** The rename re-validates the name with the
  registration rule (`packages/domain/src/auth/accountInput.ts`, B2a ruling
  8). An invalid name answers `{ error: "invalid_name" }`.
- **Rate limit.** The admin effects share the per-socket token bucket. They
  need no limit of their own: the caller is an approved administrator.
- **Ops messages stay open.** The `ops.*` messages renamed in PR 1 remain
  available to every login. They act per connection (B1's S10), and are not
  administration.

### 4.7 Password reset closes sessions

`AccountServiceOptions` gains `onSessionsRevoked(accountId)`. `resetPassword`
calls it after a `changed` outcome, finding the id with `findByEmail`. The
directory stamps `sessions_not_before` as part of `resetPassword` itself.

**Order and failure.** In Supabase the stamp is a second request after the
password change, and it can fail.
- **Order.** The stamp follows the change, never precedes it. Stamping
  first would let anyone end a named user's sessions by submitting wrong
  codes for their address.
- **On a failed stamp.** The directory retries once. If it still fails, the
  outcome stays `changed`: the password did change, and saying otherwise
  would send the user round again. The server then:
  - logs at error level, naming the account id and nothing else;
  - records the stamp in an in-process fallback map, which the upgrade gate,
    the admin gate and `/mcp` consult beside the stored value;
  - still invalidates the cache and closes the sockets.
- **The residual.** A machine restart forgets the fallback. A token taken
  before the reset is then valid again until it expires, at most eight
  hours. The rulings record it.
Wiring in `index.ts` connects the callback to `invalidate` + `closeAll`
(reason `password_reset`). The admin effects reuse the same wiring (reasons
`blocked`, `deleted`, `renamed`).

### 4.8 `/mcp`

The `account_tokens_not_accepted` refusal (`mcpHttpHandler.ts`) is replaced
by the administrator gate.

- **What passes.** The token must carry account claims. The account, read
  from the directory at request time, must be `active` with `access` `admin`,
  and the token's `iat` must not be before its `sessions_not_before`.
- **Refusals.** Anything else gets `403 admin_only`. A directory that cannot
  be reached gets `503`.
- **Roster tokens.** They are refused from now on. This closes S12: there is
  no longer a way to reach `execute_trade` without being the administrator.
  Nothing in the repo uses `/mcp` with a roster token today, apart from the
  handler's own tests and the journey's witness.
- **Local development.** The recipe in
  `docs/architecture/18-jarvis-ai-agent-surface.md` (about line 1088) signs
  in as the roster `demo` user, and is rewritten to sign in as
  `admin@rtc.test` under `dev:*:ws` with `RTC_DEV_ACCOUNTS=1`. With accounts
  disabled, `/mcp` is unreachable: every token is a roster token, so the
  answer is `403 admin_only`.

`McpHandlerDeps` gains the directory (or a narrow `Pick`) and the clock.

### 4.9 `SessionUser.access`

- `SessionUser` (`packages/domain/src/auth/sessionUser.ts`) and
  `SessionUserDto` gain `access: AccessLevel`. `sessionUserFor` sets it, and
  the four roster personas carry `"user"`.
- **Stored sessions.** A session saved by an earlier build has no `access`.
  The web session store and the React Native one read it as `"user"`. A
  stored session is never trusted for more than the server grants anyway.
- **The client gate is cosmetic.** `access` on the client only decides what
  to draw.

### 4.10 Ending a session visibly

A browser cannot read the status of a refused WebSocket upgrade. A `403` and
a network failure look the same to it, and the adapter reconnects either way
(`WsAdapter.ts`, `onclose` → `scheduleReconnect`).

**The server's side.**
- A token with a valid signature whose session has ended is **accepted** at
  the upgrade, then closed at once with the application close code `4401`
  and reason `session_ended`. A session has ended when:
  - the account is not `active`;
  - the account no longer exists;
  - the token's `iat` is missing or before `sessionsNotBefore`.
- That socket gets no effects. It still counts against the connection caps,
  and costs no ban strike.
- `sessionRegistry.closeAll` uses the same code and reason.
- **Unchanged:** a bad signature, an expired token or a malformed request is
  still refused at the upgrade (`401`), and an unreachable directory is
  still `503`, which the client should retry.

**The client's side.**
- **Detection.** `WsAdapter` treats a close with `4401` as final. It does not
  schedule a reconnect, and it emits a new `ConnectionEvent`,
  `{ type: "sessionEnded" }` (`packages/core-api/src/adapters.ts`).
- **The auth presenter, in all three cores.** It answers `sessionEnded` by
  signing out: the stored session is cleared, as on a manual sign-out.
  Sign-out and its message are shared logic in `@rtc/core-logic`.
- **The message.** It sets `AuthViewState.error` to "Your session has ended.
  Please sign in again." The sign-in screen already renders that field.
- **One message for every cause.** The reason is not shown: a blocked user
  learns that they are blocked at the next sign-in, from B2a's own refusal.
- **Tests and React Native.** A core-contract case pins the behaviour, and
  React Native's auth flow gets the same handling through the same presenter.

## 5. PR 2 — client

### 5.1 Ports

`AppPorts` (`packages/core-api/src/app.ts`) gains
`accountAdmin: AccountAdminPort`. The port interface lives in
`packages/domain/src/ports/accountAdminPort.ts`, beside the other port
interfaces. `AccountSummary` and
`AccountAdminRefusal` (`forbidden | self | not_found | invalid_name |
unavailable`) are domain types.

- **Live builder.** `client-adapters/portFactory.ts` builds it over
  `ws.rpc`. An answer with `error` maps to a typed refusal. A nack or a
  dropped connection maps to `unavailable`.
- **Simulator builder, React Native and `scriptedPorts`.** The simulator
  builder and React Native's `buildNativePorts` give a port that answers
  `unavailable`. No simulator user is an admin, so it is never reached
  there. `scriptedPorts` in core-contract gets a scripted port the suites
  drive.

### 5.2 Core members

The cores gain one presenter and one machine factory. Each is native in
rxjs, async and Effect, with a contract suite in `@rtc/core-contract`.
`sessions` and `tileExecution` are the shapes to copy.

- **`presenters.accountList`**
  - State: `{ status: "loading" | "ready" | "failed" | "forbidden",
    rows: AccountRow[], pendingCount }`.
  - Intent: `refresh()`.
  - It loads on first subscription and re-reads on `refresh()`.
  - Rows sort pending first (oldest pending first, so the longest waiter is
    on top), then everyone else newest first.
  - `pendingCount` counts status `pending`. Unconfirmed accounts are not
    pending: they have not finished signing up.
- **`machines.accountAction(accountId)`**
  - States: `idle`, `confirmingDelete`, `renaming` (holds the draft name),
    `inFlight(action)` and `failed(action, refusal)`.
  - Intents: `approve`, `block`, `unblock`, `startRename` / `editName` /
    `submitRename` / `cancel`, `requestDelete` / `confirmDelete` / `cancel`,
    `dismiss`.
  - After a success, it tells the list to re-read (D7). A `forbidden`
    refusal also flips the list to `forbidden`.
- **`AccountSummary` carries `isSelf`.** The server sets it by comparing the
  row's id with the caller's account id, so the client needs no account id
  of its own. `SessionUser.id` is a display badge, not the account id.
  - The draft name is validated live with the shared display-name rule.
    `accountFieldFeedback`'s `display-name` row is the precedent.
- **Shared logic.** The sort, the pending count, the copy for each refusal
  and the action fold are pure, and live in `@rtc/core-logic`, so the three
  cores share them. B2b's `stepAccountAccess` is the precedent.

### 5.3 The gate in the shell

- The tab bar renders the Admin tab only when
  `useAuth().state.user?.access === "admin"`.
- **The route.** The workspace route sync (`workspaceRouteSync.ts`) and the
  nav machine gain a `canShow(tab)` dependency, built from the current
  user's `access`.
  - A route, a Back/Forward step or a `switchTab` that names a tab the user
    cannot see is treated as an unknown route: it is replaced with the active
    tab, or with `/fx`.
  - The Jarvis drive cannot name `admin` at all. `DRIVE_TABS` keeps `ops`
    and does not gain `admin`.
- **`canShow` re-evaluates when the signed-in user changes.** Today the nav
  machine is a warm singleton with no user input, so this is a new input to
  it in all three cores.
  - On sign-out the active tab, if `admin`, becomes `fx`.
- **A `forbidden` answer** (the account was demoted in Supabase mid-session)
  does not move the shell or hide the tab. The panel shows "Administrator
  access required". The stale `access` corrects itself at the next sign-in,
  and coupling the auth presenter to the list is not worth it for a change
  made by hand in Supabase.
- **A deep link to `/admin` while signed out.** It behaves like a deep link
  to any other tab today: the sign-in screen takes the URL. Whatever the
  workspace route sync does after sign-in, it does for `/admin` too, gated
  by `canShow`. B2c adds no extra deep-link preservation.

### 5.4 The Users panel

There is no prototype design for it. It follows the Ops panels' chrome
(panel head, mono labels, the skin tokens). The user accepts it from the
goldens, as with B2b.

- **Head.** "Users", the pending count ("3 pending"), and a Refresh control.
- **Rows.**
  - Columns: display name; email, always shown beside the name (parent §8:
    lookalike scripts); joined date; and a status chip (Pending, Active,
    Blocked, Unconfirmed).
  - The actions on each row depend on its status:
    - Pending: Approve.
    - Active: Block.
    - Blocked: Unblock.
    - Every status: Rename and Delete.
  - The administrator's own row shows "You" and no actions.
- **Delete** asks inline ("Delete this account? Confirm / Cancel"), with no
  modal.
- **Rename** turns the name cell into a field with the live display-name
  check and Save / Cancel.
- **While a request runs,** the row's buttons are disabled and the chosen
  button reads in progress. **A failure** shows its copy under the row with a
  Dismiss control.
- **Empty list:** "No registered accounts yet."

## 6. Tests

- **Server.**
  - Every gate rule has a test that a wrong implementation fails, proven
    with `node scripts/mutation-check.mts`:
    - forbidden for a roster caller, a non-admin, a blocked admin and a
      stale `iat`;
    - `self`;
    - a missing target;
    - `invalidate` dropping in-flight lookups;
    - `closeAll` on a block, a delete, a rename and a reset;
    - the `/mcp` gate.
  - The Supabase calls run against an injected `fetch`.
- **Contract suites** for `accountList` and `accountAction`, run by all three
  cores.
- **ui-contract specs** cover the Users panel (both clients) and the shell gate:
  - the tab is hidden for a user;
  - `/admin` as a user lands on `/fx`;
  - the tab is shown for an admin;
  - sign-out leaves `/admin`.
- **Visual scenarios:**
  - `admin/users` (a mixed list);
  - `admin/users-empty`;
  - `admin/users-row-in-flight`;
  - `admin/users-row-failed`;
  - `admin/users-confirm-delete`;
  - `admin/users-rename`;
  - `admin/users-forbidden`;
  - `app/admin` (the full app with the Admin tab, as an admin).
- **Fullstack.**
  - `tests/fullstack/accounts-journey.ts` gains the admin leg over the real
    server and the in-memory directory:
    - the admin approves the pending account, which can then sign in;
    - the admin blocks the trader, whose open socket closes with `1008`;
    - after a reset, the old token is refused at upgrade.
  - The `/mcp` witnesses change: an admin's token gets through, a user's
    gets `403 admin_only`, and a roster token gets `403 admin_only`.
  - `tests/fullstack/browser/accounts.spec.ts` gains: the admin signs in,
    sees the Admin tab and approves.

## 7. Rollout (the user's steps)

1. Apply the new migration to the Supabase project before the server deploys.
   It adds a nullable column, so the running server is unaffected.
   The column name and type must match `PROFILE_COLUMNS` exactly: the new
   server selects it, and a missing column fails every account read.
2. Run `deploy.yml` (server and both clients together, because the wire
   messages changed).
3. Every registered user, including the administrator, is signed out once
   with "Your session has ended" (§4.10): old account tokens carry no `iat`.
   Only the new bundle does that: a tab still running the previous bundle
   treats the `4401` close as an ordinary drop and reconnects about every
   3 s (its token is accepted at the upgrade, then closed at once), and the
   user never sees a sign-out. Reload every open tab after the deploy.
4. **React Native.** Its build talks to the deployed server. Until the
   updated build (EAS Update) is taken, a registered account's token (no
   `iat`) meets the same endless `4401` reconnect as an old tab, and the
   renamed `ops.*` messages break its throughput and Jarvis-usage controls.
   RN users with registered accounts must take the update (or sign out and
   back in).
5. `/mcp`: any MCP client configured with a roster token stops working.
   Re-configure it with the administrator's token.

## 8. Calls made at write-up (not discussed with the user)

These were settled after the builder check. Check them while reading.

- The application-core part of the rename (`AdminPort` → `OpsPort`,
  `AppPorts.admin` → `AppPorts.ops`) goes in PR 1 (§3.1).
- `Caller` carries `issuedAt`, so the admin effects can apply the stale-`iat`
  rule themselves (§4.1).
- The server's clock writes the stamp (§4.3). A stamp that fails after a
  reset still reports `changed`, and falls back to memory until a restart
  (§4.7).
- A `forbidden` answer leaves the tab visible and shows a message in the
  panel (§5.3).
- `isSelf` on each row, not an account id on `SessionUser` (§5.2).
- `/mcp` in local development needs `dev:*:ws` and `admin@rtc.test` (§4.8).
- Close code `4401`, and one sign-out message for every cause (§4.10).
- Revoking sessions on a rename (§4.3) is kept. It costs the renamed user one
  sign-in.
- Parent spec §8 said a non-admin gets a nack. Here refusals are typed
  answers (§4.6), and the parent gets an amendment line pointing here.

## 9. Not in B2c

- Promote/demote in the app (D6).
- Notifying the admin when someone registers. The pending count is the
  signal (parent §8).
- A live-updating list (D7).
- Self-service deletion or an email change (parent §13).
- Users panel in React Native.

## 10. As built (PR 2, 2026-10-24)

The plan settled six decisions the spec left to the code, and review changed
a few more. Where this section differs from §4 and §5, this section is what
shipped. The mechanism, end to end, is in
[authentication.md §7.10](../../authentication.md#710-administration-and-ending-sessions-b2c).

**Decisions made in the plan**

1. One directory method, `revokeSessions(id, atMs)`, serves the reset path.
   `setBlocked(id, true, atMs)` and `rename(id, name, atMs)` write the stamp in
   the **same** PATCH as their own column, so those two are atomic. Blocking
   stamps, so a later unblock does not bring the old tokens back.
2. The admin rules sit in a server-side `AccountAdminService`
   (`packages/server/src/accounts/accountAdminService.ts`); the effects stay
   thin. It is `ctx.accountAdmin` on the connection container, and the
   identity is `ctx.caller`.
3. The connection identity is passed explicitly:
   `scopeServicesToConnection(shared, caller)`, with a
   `WeakMap<IncomingMessage, UpgradeVerdict>` carrying the verdict from
   `verifyClient` to `connection`.
4. `workspaceNav` owns tab visibility. `WorkspaceNavState` gains
   `visibleTabs`, the tab bar renders from it, and the route sync gains
   `canShow` from the same state, so Jarvis, a URL and a click go through one
   gate.
5. `sessionEnded` reaches the auth presenter through `ports.connectionEvents`;
   no new `AuthPresenter` member. Each core's composition routes it to its
   auth presenter's internal sign-out.
6. `AccountStatus` moved to `@rtc/domain` (`auth/accountStatus.ts`).

**Changes from review**

- An ended session is **accepted** at the upgrade and closed at once with
  `4401` / `session_ended`; the upgrade-time `403` in §4.3 was replaced
  because a browser cannot read it. Bad signature or expiry stay `401`; an
  unreadable store stays `503`. The stamp comparison is strict (`iat <
  max(stamp, ledger)`), and a token without `iat` is ended.
- `closeAll` bumps a per-account revocation epoch. An upgrade that read the
  status before a revocation is closed at connection time when the epoch
  moved (a TOCTOU fix), and invalidating the status cache drops in-flight
  lookups (a generation guard).
- Unblock does **not** stamp. A password reset takes the account id from
  Supabase's verify response (a `findByEmail` fallback only if absent). A
  stamp that fails twice after a reset logs `[accounts] stamp-failed id=<id>`,
  records the stamp in an in-process ledger, invalidates the cache and closes
  the sockets; the outcome stays `changed`. A restart forgets the ledger (an
  old token then lives until expiry, at most 8 hours).
- Every admin call reads `findAccount` directly (not the cache, not the
  token's `a` claim) and requires active, admin and a live session; `self` is
  refused before any write; a rename is re-validated (`invalid_name`); ids
  must be canonical lowercase UUIDs, and an uppercase id is a malformed frame
  (a nack). Refusals are typed answers, malformed frames are nacks.
- Blocks and renames made in the Supabase dashboard do not close open sockets;
  they apply at the next upgrade within the 60 s cache TTL.
- `/mcp`: only an active administrator with a live session; roster tokens and
  users get `403 admin_only`, an unreadable store `503`. The earlier
  `account_tokens_not_accepted` refusal is gone. No limiter yet.
- Client: `WsAdapter` treats `4401` as final (no reconnect, `sessionEnded`,
  pending RPCs rejected). The Users panel's list is keyed on the signed-in
  user. A pre-rename saved workspace layout reads as none; an old Dockview
  blob for the admin tab restores the new seed; old admin presets show as
  unreadable.
- Two core members were added: `accountList` (presenter) and `accountAction`
  (machine), taking the member count from 76 to 78.
- Rollout order: the migration **before** the deploy
  ([DEPLOY.md](../../DEPLOY.md#rolling-out-b2c)).


# B2c PR 2 — rulings

Plan: [2026-10-24-b2c-users-panel.md](2026-10-24-b2c-users-panel.md) · Spec: [../specs/2026-10-18-b2c-users-panel-design.md](../specs/2026-10-18-b2c-users-panel-design.md) §4–§7

The decisions the controller made during subagent-driven execution, in order, each with its reason and its cost if wrong. They are copied from the execution ledger.

## Rulings

- Ruling 1: Task 1 adds `access: "user"` (or the right value) to EVERY `SessionUser`/`SessionUserDto` literal in the repo (fixtures, roster, simulators, fakes) so the whole repo typechecks at Task 1's commit; Task 7 keeps only the stores' tolerant parse + HttpAuthAdapter pass-through — why: Global Constraints limit the red window to T8–T11 and a red typecheck across T1–T7 would hide real breakage — cost if wrong: Task 1 grows by mechanical fixture edits.
- Ruling 2: Task 4 adds `ServiceContainer.caller` only; Task 5 adds `ServiceContainer.accountAdmin` with the real service — why: every commit must compile — cost if wrong: none.
- Ruling 3: `AccountServiceOptions.onSessionsRevoked` is `(accountId: string, stamped: boolean) => void` from the start (Task 4 Step 2's form) — why: the wiring needs `stamped` to feed the ledger — cost if wrong: none.
- Ruling: Minor 2 (any delete 404 → not_found, incl. a gateway 404) promoted into fix round 1: require GoTrue's `error_code: "user_not_found"` for not_found, other 404 → unavailable — why: a misrouted gateway would tell the admin "no such account" — cost if wrong: a GoTrue version answering 404 without error_code reads as unavailable (the admin retries; nothing is deleted wrongly).
- Ruling: subagents switch from `cd WT && …` to single commands (`pnpm --dir WT`, `git -C WT`) after the user reported prompt spam — cost if wrong: none
- Ruling: S1 fixed by a per-account revocation EPOCH in SessionRegistry (closeAll bumps a global monotonic counter for that account; decideUpgrade captures epochOf(id) BEFORE the directory read and carries it in the verdict; the connection decision, extracted into a pure tested function, closes 4401 when epochOf(id) > captured) — why: synchronous, no I/O, Task 5's block/rename/delete inherit it — cost if wrong: a socket racing a revocation is closed even if its session was re-issued in the same microseconds (it reconnects).
- Ruling: S2 fixed by `ResetOutcome` success carrying `accountId` (Supabase: verify body `user.id`; in-memory: entry.id), the second lookup becomes a fallback only when the id is absent — overrides the controller's earlier "no callback on lookup failure" — cost if wrong: none (removes a round trip).
- Ruling: Minors 2 (findAccount throw test in /mcp), 3 (connection logic unit-tested via the extraction), 5 (stampOnce type) and 6 (stale comments index.ts:469, loginHandler account-not-active doc, README:246) folded into fix round 1; Minor 1 (/mcp unbounded directory reads per request) and 4 (reset can wait 3 timeouts) deferred to the whole-branch review.
- Ruling: Important 1 fixed by requiring the canonical lowercase UUID at the wire guard (drop `/i` from the shared `isAccountIdPayload` UUID shape → an uppercase id is a malformed frame → nack) AND canonicalizing in the service (`accountId.toLowerCase()` before every comparison/key) as defense in depth — why: ids the server hands out are lowercase; one canonical form makes `self`, invalidate and closeAll key on the same value — cost if wrong: a client that uppercases ids gets nacks (no such client exists).
- Ruling: Minors 1 (list row toEqual), 3 (comment the redundant status clause as deliberate defense in depth), 4 (a self case with an invalid name pins self-before-validation) folded into fix round 1; Minor 2 (createServices' unavailable fallback default) deferred to the whole-branch review.
- Ruling: Minors 1 (stale composition comment), 2 (auth suite asserts transport.disconnect on sessionEnded), 3 (gaining access does not auto-switch) folded into fix round 1 — they pin guarantees the sibling cores (Tasks 10/11) must inherit; Minor 4 (endSession/logout during an in-flight unlock → inconsistent state; pre-existing race shared with logout) deferred → STATUS follow-up; Minor 5 (double parse) deferred.
- Ruling: the presenter is keyed on the signed-in user (auth.state$ → `user?.email ?? null`, distinctUntilChanged — NOT `user.id`, a 4-hex display badge that can collide); on null/change: reset to loading with no rows, cancel any load in flight, re-load immediately if subscribed else on the next first subscription; contract case pins it (and warm-for-the-same-user + refresh-before-first-subscription no-op, Minor 2) — cost if wrong: one extra list read per sign-in.
- Ruling: Minors 3 (port-error contract cases for both members) and 4 (invalid_name copy → "That display name was not accepted") folded; Minor 5 deferred.
- Ruling: before Solid copies the panel, fold two accessibility minors into a React fix round: per-row accessible names on row buttons (aria-label from a core-logic helper naming the account, e.g. "Approve Ann Lee") and `title={email}` on the truncated email cell — why: Solid copies whatever React ships and goldens follow; cheap now — cost if wrong: none. Minors 3 (narrow-width check → Task 16 goldens), 4 (focus return), 5 (aria-hidden column labels), 6 (year >9999) deferred.
- Ruling: correcting my own earlier instruction — Solid rows key by ACCOUNT ID following RfqsPanel.tsx:55-66 (<For each={ids()}> over string ids, per-row createMemo lookup of the current summary, <Show keyed> narrowing); shared ui-contract cases pin row state across a list re-emission with new objects (in-flight, failed, rename draft) for both clients — cost if wrong: none.
- Ruling: a one-row prose fix is verified by the controller reading its diff rather than a re-review subagent — cost if wrong: a wording slip in one table row, caught by the whole-branch review.
- Ruling: option (e) — sessionEnded leaves the connection-event stream: `AuthGatedTransport` (core-api; WsAdapter implements) gains `sessionEnded(): Stream<void>` (a hot, adapter-owned stream emitting once per 4401); `ConnectionEvent` drops `sessionEnded`; each core subscribes `ports.transport?.sessionEnded()` ONCE at construction (absent transport = simulator = no subscription) and calls its auth presenter's endSession; the connection-status fold is again the only subscriber of `connectionEvents.events()` — restoring the pre-B2c single subscription without changing the connection contract. Shared suites: auth sessionEnded cases drive the scripted transport's new stream; a portDiscipline/transport case pins exactly one sessionEnded() call at construction; the RN test passes unchanged. Why: session end is an auth/transport concern, not connection status; no contract change; fixes doubled browser listeners too — cost if wrong: one more port member to keep in sync across builders.
- Ruling: WsAdapter rejects in-flight rpcs on a drop/disconnect with an error whose `name` is a shared constant (e.g. "TransportLostError", constant in @rtc/domain); the shared order-ticket fold maps that error to a distinct, non-rejected phase whose copy (core-logic) reads "Connection lost — check the orders blotter"; both tickets render it; contract + fold tests; no string-matching on messages — cost if wrong: one extra ticket phase.

## User decisions during execution (2026-10-25)

- The revised Users-panel screenshots are accepted (fixed status and actions column widths, readable disabled buttons, the failed row on its line).
- The equity-order message for a dropped connection is fixed before merge. It reads "Connection lost — check the orders blotter", not REJECTED.

## Mutation proof

```
mutation kill table
  KILLED    01 sessionEnd: a token issued AT the stamp counts as ended (< becomes <=)
  KILLED    02 sessionEnd: the ledger fallback stamp is dropped from the max
  KILLED    03 accountStatusCache: a lookup that straddled an invalidation is remembered anyway (generation check dropped)
  KILLED    04 accountStatusCache: a settling lookup deletes inFlight unconditionally (even a newer lookup's promise)
  KILLED    05 accountAdminService: the access check reads a constant admin (access gate bypassed)
  KILLED    06 accountAdminService: the self check is dropped (an administrator may act on their own account)
  KILLED    07 accountAdminService: block/rename/delete no longer closes the target's sockets
  KILLED    08 accountAdminService: rename skips the display-name validation
  KILLED    09 upgradeGate: an ended session is accepted WITHOUT sessionEnded: true
  KILLED    10 decideConnection: the epoch comparison is dropped (a moved epoch never closes the socket)
  KILLED    11 mcpHttpHandler: a roster token (accountId null) is admitted past the admin gate
  KILLED    12 AccountService: onSessionsRevoked is not called after a reset
  KILLED    13 SupabaseAccountDirectory: setBlocked(true) omits sessions_not_before from the PATCH body
  KILLED    14 WsAdapter: a 4401 close still schedules a reconnect
  KILLED    15 workspaceNavFold: a switch to a hidden tab is accepted
  KILLED    16 workspaceNavFold: a hidden active tab is kept when access is lost
  KILLED    17 workspaceRouteSync: canShow is ignored on mount (a hidden tab's URL is switched to)
  KILLED    18 accountListFold: unconfirmed accounts count as pending
  KILLED    19 accountActionFold: rename sends the raw draft instead of the normalized name
  KILLED    20 AccountActionMachine: no list refresh after a settled action
  KILLED    21 AuthPresenter.endSession: the session store is not cleared
  KILLED    22 AccountListPresenter: a changed user key does not reset the list or cancel the load
  KILLED    23 shared accountAdmin: the account-id UUID guard accepts uppercase again (i flag)
  KILLED    24 dockBlob: isRestorableDockBlob no longer requires a seed panel in the blob
  KILLED    25 solid UsersPanel: rows keyed by object again (For over rows, not ids)

25/25 killed
```

## Deferred findings (STATUS follow-ups, not blocking)

- **`/mcp`:** no per-account or per-IP limiter. A `user` claim now costs no directory read, but an admin claim costs one per request.
- **Reset:** it can wait up to three directory timeouts when the store is degraded.
- **Unlock race:** `endSession`/logout during an unlock still in flight leaves an inconsistent auth state. This predates B2c.
- **Session end and status:** a 4401 leaves the connection status reading CONNECTED while signed out. It is not visible today.
- **Users list cap:** the list shows the newest 500 accounts. Fetch pending accounts first if the list grows.
- **Focus:** it does not return to the row button after Cancel or Save.
- **README screenshots:** they still show the old ADMIN tab (from PR 1).
- **Goldens:**
  - The `react-local/linux-arm64` bucket still says ADMIN; it is slated for deletion.
  - One x86 golden (equities-instances-dockview, terminal-light) was captured mid-animation; pin that frame.
- **Test-strength and cosmetic minors:** one line per task, kept in the ledger and summarized in the final review's triage table. None blocks merge.

## Order-ticket fix (2026-10-25, user-approved)

A dropped connection or a deliberate close rejects in-flight RPCs with `TransportLostError`, matched by name. The shared order-ticket fold maps it to a neutral `connectionLost` phase reading "Connection lost — check the orders blotter", never REJECTED. It is reviewed and approved, and the deferred minors are in the ledger.

## The x86 goldens

`update-visual-goldens.yml` (run 40143828141, auto-commit `6fec2511f`) added the 80 `react/` PNGs: 8 scenarios × 10 skins. It added nothing else.

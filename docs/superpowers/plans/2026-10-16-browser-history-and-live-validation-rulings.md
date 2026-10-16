# Browser history and live field validation — controller rulings

Companion to [the plan](2026-10-16-browser-history-and-live-validation.md) and [the spec](../specs/2026-10-16-browser-history-and-live-validation-design.md). Written by the controller during subagent-driven execution (2026-10-16): every decision taken on the plan's behalf, the review fixes, and the deferred findings with their triage. Each ruling reads decision — why — cost if wrong.

## Rulings

Rulings 1–4 were made in the pre-flight scan, 5–6 during execution, 7–11 on the final whole-branch review.

- **Ruling 1** — both route-sync controllers ignore an `observe` whose argument equals the last one they observed (account: the same state object, `===`; workspace: the same tab), with the bookkeeping set before any intent/switchTab call. Each gets a unit case ("observing the same value twice writes nothing / calls nothing") and a mutant that removes the guard. — The React hook observes once when it creates the controller and once more from its [state]/[activeTab] effect in the same commit; without the guard the mount rules write two spurious entries (see table). Fixing it in the pure controller keeps it testable and serves Solid's re-entrant effects too. — Cost if wrong: a repeated identical value is skipped; a machine re-emitting the identical object means nothing changed, so nothing is lost.
- **Ruling 2** — Task 6 deletes ui-contract world.ts's local `AccountNavigation` and uses the `@rtc/core-api` type (LoginScreenPage imports it from there). — One name, one definition; same four members. — Cost if wrong: none.
- **Ruling 3** — keep two FakeRouteHistory copies (core-logic unit-test helper, ui-contract harness). — core-logic has no testing entry and a test fake must not ship from its main entry; ui-contract cannot be a dependency of core-logic (inner package). — Cost if wrong: ~40 duplicated test lines.
- **Ruling 4** — Task 3 splits the last test into two cases, each named for what it checks. — Plan text's case name doesn't match its second assertion. — Cost if wrong: none.
- **Ruling 5** — Task 5 also adds `useRouteHistory: () => null` to both clients' contract viewModelFromWorld (the ViewModel interface gains a required member, so they must typecheck); Task 6 changes them to `() => world.routes`. — plan put viewModelFromWorld only in Task 6, which would leave Task 5 red on typecheck. — Cost if wrong: none.
- **Ruling 6** — Task 7 fix round 1 also adds ONE sign-in hand-off spec (reviewer's minor): through the same AuthGate mount the Important fix needs, signed out on #/credit → sign in → Credit active, URL kept; and on "" → after sign-in replace #/fx. — Spec §6 "once signed in, the workspace mount rule lands on that tab" is otherwise covered only piecewise, and the vehicle is the same mount, so the cost is one case. — Cost if wrong: one extra spec case.
- **Ruling 7** — Important #1 (blur-reveal shifts the centred panel between mousedown and mouseup, so clicks on the links below a form are lost) is fixed by keeping focus on mousedown for the buttons and links inside the three account forms (`mousedown` preventDefault, one named helper per client), not by reserving error lines. — Reserving a line changes every login golden and still shifts when the display-name copy wraps to two lines; revealing only non-empty fields departs from spec §7. Keeping focus means a pointer click never blurs, so nothing moves before the click lands; keyboard Tab still blurs and reveals as the spec says; touch compat mousedown is covered too. — Cost if wrong: a pointer user who clicks a link never sees that field's error (they are leaving the form anyway); if a reviewer judges the pattern unacceptable, the fallback is the reserved slot + golden regen.
- **Ruling 8** — Minor #3 (Resend skips the field gate, so the same address error can show inline AND at form level) is fixed in the same wave — gate Resend like submit. — Spec §7 "a local refusal shows once, under its field" applies. — Cost: small.
- **Ruling 9** — Minor #5 (HashRouteHistory resolves "#/x" against a possible <base href>) hardened in the same wave: write pathname + search + hash. — One line, removes a trap for the real-paths follow-up. — Cost: none.
- **Ruling 10** — Minor #2 (React route hooks re-run the mount rule if an intent changes identity) — not refactored; instead each React hook's doc comment states the stability requirement (intents and switchTab must be stable per view model), which every real host meets (verified twice). — A ref/effect-event refactor adds machinery for a host that does not exist. — Cost if wrong: a future unstable host loops the way the Task 7 fake did, and the comment names why.
- **Ruling 11** — Minor #4 (real-browser login Back/Forward runs on React only) accepted — the fullstack smoke spawns React only; Solid is covered by the shared contract specs and by the controller's dev:solid:fs browser check before merge. — Cost: a Solid-only real-browser bug in login routing would surface in the eyeball, not CI.

## Review fixes that changed behaviour

- **Task 2:** every `NAVIGATION_MODES` / `MODE_NAVIGATIONS` entry of the account route sync gets a test and a mutant; two of the eight were untested (the forgot-password traversal, the "I already have a code" link).
- **Task 6:** the harness's fake history is pinned to tell no subscriber about its own push or replace.
- **Task 7:** unmount disposal of all four route hooks is specified (a leaked sync after sign-in, sign-out or a core swap would call intents on a disposed machine), plus the sign-in hand-off of Ruling 6.
- **Task 8:** the malformed-code browser smoke now asserts no `/reset-password` request; it had watched `/confirm-email`, which the reset flow never calls, since B2b.
- **Task 10:** the hybrid smoke counts document `load` events, not `framenavigated` (hash routes fire the latter without reloading).
- **Final review:** Rulings 7–9; the hybrid smoke helpers renamed to what they count.

## Deferred minors

Triaged by the final reviewer as can-wait (the one must-fix, the hybrid helper names, was fixed):

- **Task 1** — formatAppRoute's `?? ""` fallback is silent if a union member ever lacks a ROUTE_SLUGS row (appRoutes.ts:207) — a Record-keyed table or a union-enumerating test would enforce it
- **Task 1** — isSameRoute all-pairs test uses identity as oracle; value-equality only checked for workspace/fx (appRoutes.test.ts:136)
- **Task 2** — workspaceRouteSync shown and lastObserved always equal — one name would do (plan/ruling-mandated "keep shown")
- **Task 2** — account ruling test duplicates the harness's four-intent block; workspace harness uses a reenter flag instead
- **Task 2** — busy-form test observes REGISTER_BUSY but harness state stays non-busy register (accountRouteSync.test.ts:199) — misleading fixture
- **Task 2** — reenter doc comment sits on the interface, not on createHarness (workspaceRouteSync.test.ts:113)
- **Task 3** — field-feedback tests — only email goes through the revealed matrix; no empty-list case for findFirstFailingField
- **Task 4** — startWebClient.test.ts leaves the URL hash at #/create-account for later cases (no reset)
- **Task 4** — HashRouteHistory.test asserts history.state null after push only, not after replace
- **Task 5** — RN buildFakeViewModel.test.tsx comment spliced over 80 cols — re-wrap
- **Task 5** — inert RouteHistory fakes duplicated in two bindings tests + two AppRoot page objects (on top of Ruling 3's two)
- **Task 6** — RoutedComponent throw message could name mount(..., { routeHash }); the throw path is untested
- **Task 6** — fake-history seeding test uses an unrecognised hash only; a recognised seed would check parse-on-read
- **Task 7** — routes spec case 3 relies on the harness default registrationAvailable=false — pass it explicitly
- **Task 7** — DRIVE_SETTLE_MS duplicated verbatim from JarvisDriver.contract.spec.ts
- **Task 7** — link tests assert navigations().at(-1) only; push-before-intent order pinned at unit level only
- **Task 7** — AuthGate.routes spec:55 hard-codes ["replace #/fx","replace #/fx"] — couples to write count; navigations() is the real discriminator
- **Task 8** — per-client wiring repeated across 3 forms (reveal setters, NOTHING_REVEALED, aria pair, submit gate); ResetRequestForm uses a boolean not the revealed set — candidate fieldAriaProps / useFieldReveal helper
- **Task 8** — waitFieldError / expectFieldError take field: string — narrow to the AccountField union
- **Task 8** — live clearing tested only on the create form's email
- **Task 8** — .fieldError margin-top -8px — judge on the Task 9 golden
- **Task 10** — accounts.spec.ts:419-420 forgot-password step asserts the hash only — add expectLoginPhase(ctx, "requestReset")
- **Task 10** — hybrid.spec.ts helper names (countMainFrameNavigations / waitForMainFrameNavigation, NavigationCounter comment) now stale — they count document loads
- **Task 10** — pressBrowserBack/Forward near-duplicated in scenarios/login.ts and scenarios/navigation.ts
- **Task 11** — docs/architecture/17 line ~56 attributes the <AppRoot> JSX to reactTreeMount.ts; it is in main.tsx's createReactView (pre-existing, brief pointed at the wrong file) — say "from main.tsx's createReactView, through reactTreeMount.ts"
- **Task 11** — doc 17's appended routes passage makes a long paragraph denser

## Proof

Mutation checks (`scripts/mutation-check.mts`), all KILLED: Task 2 19/19, Task 3 2/2, Task 6 1/1, Task 7 23/23, Task 8 40/40, final fix wave 14/14. The full local gauntlet (36 gates, including the web-boot and React Native coverage gates) passed on the final tree; both clients were checked by hand on `dev:react:fs` / `dev:solid:ws:local` (login Back/Forward, one-click Back from a half-typed address, blur/live/submit validation, `#/credit` sign-in hand-off, tab Back/Forward, Back onto login history while signed in, reload, a core swap).

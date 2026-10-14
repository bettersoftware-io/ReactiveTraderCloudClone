# B2b client flows — controller rulings

Companion to [the plan](2026-10-13-b2b-client-flows.md). Written by the controller during subagent-driven execution (2026-10-14): every decision taken on the plan's behalf, the deferred findings and their triage, and the mutation proof. Each ruling ends with what it costs if it is wrong.

## Rulings

R1–R4 were made in the pre-flight scan; the rest during execution, at the task named.

- **R1** — T11 `login/create-account-checklist` typing "Abc123!!" meets FIVE rules (max-length, uppercase, lowercase, digit, special) and misses ONE (min-length), not "four met, two unmet" — PASSWORD_RULES has six entries (passwordPolicy.ts). Scenario stands; the caption is corrected in the brief. Cost if wrong: a caption.
- **R2** — T13 mutant 17 "AccountPresenter (each core)" reads as the auth presenter of each core (rxjs AuthPresenter.ts, async/effect presenters/shell.ts). Cost if wrong: none.
- **R3** — `FLOW_UNAVAILABLE` is a module-local constant in each of HttpAuthAdapter.ts and RoutingAuthPort.ts; no export for a one-line literal. Cost if wrong: two duplicate lines.
- **R4** — accountAccessCopy.ts ↔ accountAccessFold.ts share types in both directions; the copy→fold edge is `import type` only (erased; dep-cruiser tsPreCompilationDeps:false ignores it). Stands as planned; if any gate reports the cycle, the implementer moves AccountRequest/AccountRequestKind/AccountFlowRefusal into `accountAccessRequest.ts` and says so. Cost if wrong: one extra file.
- **R5** — the accountAccess machine cancels the request in flight ONLY when an intent actually changes the state; the brief's "cancel on any intent the phase ignores" left `busy: true` with nothing in flight (a hung form) — plan defect. A 15th contract case pins it, so Tasks 5 and 6 must follow. Cost if wrong: one guard in each machine.
- **R6** — I1 is real and new with B2b (the auth presenter's login/unlock methods are NOT instrumented — manifest lists stream methods only — so today no password reaches the inspector). Fix in @rtc/devtools-core: DevtoolsHub.machineIntent masks the values of object-argument properties named `password` or `code` (one level into each object arg) to "[redacted]" before serializing; generic, keeps devtools-core a leaf with no B2b coupling. Cost if wrong: an unrelated intent arg field named `code` shows as [redacted] in the inspector.
- **R7** — promote review minors 4 (case 9 no-port-call assertion placement), 5 (case 5 also asserts code absent + a refusal state), 6 (fold settled-guard also requires busy / matching flow), 7 (R5 identity rule documented on stepAccountAccess), 8 (isPasswordRule positive check), 10 (case 13 comment) into fix round 1 — the suite and fold are inherited by Tasks 5/6, and fixing them later means re-verifying three cores. Minor 9 (case 2 display-name order at contract level) deferred: fold test pins it. Cost if wrong: a larger round-1 diff.
- **R8** — brief spec 4 "all checklist rules unmet before typing" cannot hold — max-length passes on an empty password; the case expects only max-length met before typing. Cost if wrong: one assertion.
- **R9** — brief spec 6 typed " Ann@Desk.io " — a type="email" field strips the spaces (jsdom and browsers), so the UI cannot carry them; the case pins "the UI does not normalize" (mixed-case email, padded display name) and normalization stays pinned at the fold/contract level (Task 4 cases 3 and 9). Cost if wrong: none — the fold still normalizes.
- **R10** — promote Task 8 minors 1 (no spec that password/code never land in a data-* attribute — the global constraint's only cross-client enforcement point), 2 (goBack only asserted on register; add code + requestReset) and 3 (explicit phase() on code + requestReset cases) into fix round 1 before Tasks 9/10 build against the suite. Cost if wrong: a few more spec cases.
- **R11** — Task 9's "60-second eyeball" on pnpm dev:react:fs is done by the CONTROLLER after the task lands (a foreground-only subagent cannot hold a dev server); the implementer skips it. Cost if wrong: none — the check still happens.
- **R12** — (binds Task 10's Solid twin): (1) the reset-request submit reads busySubmit "SENDING" while busy, like register and code; (2) `.link:disabled` style (not-allowed cursor, opacity .6) for the sign-in links disabled while authenticating; (3) have-code / enter-code / resend / back links stay enabled while busy (brief disables only the sign-in links; navigation supersedes the request in flight by design); (4) forms take the narrowed phase state via named `XPhaseTag` interfaces (eslint forbids inline object type args). Cost if wrong: copy/styling tweaks in both clients.
- **R13** — the three account forms (CreateAccountForm, EnterCodeForm, ResetRequestForm) get `noValidate`, keeping type="email" / inputMode="numeric" / autoComplete for keyboards and autofill; drop `pattern` on the code field (it only feeds native validation). Task 10 mirrors it. Task 12 adds a real-browser e2e case: a malformed code / address shows the fold's own error (jsdom cannot see native validation). Cost if wrong: browser-side hints lost (the fold's copy replaces them).
- **R14** — the four pre-existing sign-in literals moved verbatim into SignInForm ("Username", "Password", "AUTHENTICATING", "AUTHENTICATE ▸") stay out of scope — they predate B2b and the copy module is the account-flow copy; deferred to the final review's triage. Cost if wrong: a follow-up moving four strings.
- **R15** — Task 13 mutant rows 5 and 16 re-aimed at the post-review code (busy-guarded settle; cancelsInFlight), row 17 split per core (R2), rows 18-22 added for the review-round protections (redaction, cancelsInFlight on stay, positive isPasswordRule, async + effect cancel). Cost if wrong: a few extra mutation runs.
- **R16** — Task 14 docs say 2026-10-14 (the date accountAccess landed), not the plan's 2026-10-13; STATUS.md follows .claude/skills/tracking-workstream-status (pending-only: the finished B2b entry is deleted/condensed, B2c becomes NEXT, the B2b deploy step stays as pending operator work); the PR number is not known yet — the doc writes 'PR #TBD-B2B' as a single grep-able token that the controller replaces in the close-out rulings commit (closing batch reordered: push → gh pr create → golden dispatch → pull → rulings + PR-number commit → push → CI). Cost if wrong: one token left in prose — the controller greps for it before the final push.
- **R17** — promote Task 14 minors into fix round 1 (docs accuracy, cheap): §7.9 dev recipe "00000000 for any address" → "for any address you register, or request a reset for" (seeds are already confirmed); mermaid: the "I already have a code" node gets its outgoing edges + passwordUnset → requestReset; copy table gains the no-rule fallback "The request was refused". The STATUS Order-line minor is already resolved by the controller's merge. Cost if wrong: none.
- **R18** — Task 12 reopened (fix round 1): the three unused scenario helpers either get used (the composite registerAndConfirm / the specs call the single-step helpers where that is the natural reading) or are deleted; knip is a CI gate and the plan's "one helper per PO method" does not outrank it. Cost if wrong: three helpers to re-add when a spec needs them.
- **R19** — Task 7 reopened (fix round 1): bump VIEW_MODEL_MEMBER_COUNT 79 → 81 (the two members are real ViewModel members the RN fakes already carry); fold in the two RN deferred minors from the same package — Task 7's sliceTypes.ts union order and Task 3's RN page objects (LoginScreenPage.tsx, LockScreenPage.tsx) missing `failure: null`. Cost if wrong: none.
- **R20** — accept Important 1 — R12(3) is revised for the resend link: in the fold, the send intents (register, requestReset, submitCode, resendCode) are ignored (`stay`, cancelsInFlight false) while the current phase is busy; Back stays the escape; the resend link is disabled while busy in both clients; a 20th contract case + a ui-contract case pin it. The fix wave also takes minors 2 (Solid `<Show when>` !== null), 3 (drop maxLength on the code field: a pasted " 12345678" truncates to a malformed 7-digit code; the fold already rejects anything but 8 digits), 4-partial (role="alert" on login-error in every form; the focus move on phase change is DEFERRED — it would put focus rings into goldens and is a new behaviour the plan never asked for), 5 (request-aware rate_limited copy for register), 6 (isAccountErrorDto narrows rule via isAccountInputRule), 7 (contract cases: request-reset error renders; account links absent outside signIn), 8 (STATUS stale words "rejected"/"rejected-email"). Cost if wrong: one more fix wave.
- **R21** — accept the register rate-limit copy "Too many sign-up attempts. Try again later" (the server's /register 429 has two causes, per-IP and the address's send budget, so "from this network" would be false for one); a rate-limited FIRST reset request keeps "The last code you received still works" — deferred minor (the fold could distinguish a first request from a resend; follow-up). Adapter change (readErrorWord) to keep the bogus-rule mapping under the stricter guard is accepted. Cost if wrong: one copy string.

## Deferred findings and their triage

Every Minor a task review raised and the controller deferred. The final whole-branch review triaged each one; all **can ship** except those marked otherwise.

- Task 1: minor: pass-through tests record args only for register; resendCode/confirmEmail/requestPasswordReset/resetPassword checked only for "unavailable" (swapped code/password args would pass) — *can ship*
- Task 1: minor: AuthSimulator.test.ts subscribe callback `return seen.push(o)` — plain statement cleaner — *can ship*
- Task 1: minor: delayedAuthPort.test.ts missing blank line before new `it(` — *can ship*
- Task 1: minor: isAccountErrorDto checks rule only as string while typed AccountInputRule; Task 2 brief narrows via isAccountInputRule (brief line 71) — final review to confirm — *fixed in the final fix wave (R20)*
- Task 1: minor: withLoginDelay flow-delegation triplicated across three cores (by design, "verbatim copies" header) — *can ship*
- Task 2: minor: HttpAuthAdapter.test.ts "is cold" test never subscribes (it.each covers the subscribe path) — *can ship*
- Task 2: minor: no /login test for 429/5xx (pre-existing fall-through to unavailable) — *can ship*
- Task 2: minor: defer(...).pipe(catchError(...)) shape thrice (login, flow, liveFlow) — acceptable — *can ship*
- Task 3: minor: RN page objects LoginScreenPage.tsx:63-72 + LockScreenPage.tsx:57-64 build auth state without `failure: null` (brief listed them; compiles because RN ViewModel typing is looser) — runtime undefined vs null — *fixed in the Task 7 fix round (R19)*
- Task 3: minor: no separate RED capture (toEqual on exact state makes the assertions fail against old shape) — *can ship*
- Task 3: minor: `accounts` contract case (suites/auth.ts:1113-1121) asserts call count, not argument identity — Task 4's scripted flows could tighten — *resolved — the auth suite now asserts the exact pending call*
- Task 4: minor: case 2 doesn't prove display-name-before-password at contract level (fold test pins it) — *can ship*
- Task 5: minor: accountAccess.test.ts:102-107 port fake via `as unknown as AccountFlowPort` double cast — *can ship*
- Task 5: minor: accountAccess.ts:165-166 comment "ends the run before any new send" overstates (slot.start supersedes) — *can ship*
- Task 6: minor: accountAccess.ts:223 `step.state !== ref.get()` guard redundant with SyncRef.set's Object.is — *can ship*
- Task 6: minor: wiring test asserts register args only (contract suite pins password-not-emitted) — *can ship*
- Task 7: minor: stale demo-accounts comment now sits above useAccountAccess in both visual buildFakeViewModel.ts (react diff ~266, solid ~421) — move the new members above the comment — *nothing to fix — the comment already sits above its own member*
- Task 7: minor: RN tests/visual/fake/sliceTypes.ts:96 union order (useRegistrationAvailable before useReconnect) — *fixed in the Task 7 fix round (R19)*
- Task 7: minor: binding tests call hooks without ViewModelProvider (closure-bound; behaviour-neutral) — *can ship*
- Task 8: minor: no case that account links are absent outside signIn; request-reset busy SENDING label unasserted; LoginScreenPage.openCodeEntry falls back login-have-code → login-enter-code — *can ship*
- Task 9: minor: ResetRequestForm error line uncovered by any contract case; AccountNotice <br/> between copy and email; auth.state.status read in shell and form — *can ship*
- Task 10: minor: Solid EnterCodeForm.tsx:329 `<Show when={props.state.email}>` tests truthiness where React and asksEmail() use `!== null` — *fixed in the final fix wave (R20)*
- Task 10: minor: LoginScreen.tsx repeats per-phase memo narrowing four times — *can ship*
- Task 11: minor: scenarios.ts login/create-account-checklist shares the fixture; no comment that its steps live in scenarioActions.ts — *can ship*
- Task 11: minor: brief's SCENARIO_PATTERN env is read nowhere in client-react (implementer used -g); the x86 dispatch uses the workflow input instead — *can ship*
- Task 12: minor: the code-step R13 case passes without noValidate (code field has no pattern/required after R13); the email case carries the native-validation guard — add a comment or accept — *can ship*
- Task 12: minor: TITLE/SEED_PASSWORD consts below the cases; registerAndConfirm hardcodes title + "00000000" — *can ship*
- Task 13: minor: rows 17a-c mutate only the login `failure: outcome.reason`; the unlock path's twin is not mutated (the auth suite's refused-unlock `blocked` case should cover it — final review to confirm) — *can ship*

Also deferred from the final review (R20/R21): the focus move on a mode change (would put focus rings into goldens; not asked for by the plan); the first rate-limited reset request reads "The last code you received still works"; the four pre-existing sign-in literals (R14). From the fix wave's re-review: a port stream that completes without emitting would leave a phase busy with only Back as the escape — unreachable today, since every adapter emits exactly once.

## Mutation proof

`node scripts/mutation-check.mts <spec> --keep-going` over 24 mutants (Task 13, R15): **24/24 killed** on the first run, every test command green on the clean tree. The final fix wave's busy guard (R20) was proven separately by a mutant of the built fold that failed only the 20th contract case.

| # | File | Mutation | Test | Result |
|---|---|---|---|---|
| 1 | core-logic accountAccessFold.ts | checkEmailInput returns raw | core-logic accountAccessFold.test.ts | KILLED |
| 2 | same | checkCodeInput drops .trim() | same | KILLED |
| 3 | same | settleConfirmation passwordHeld false->true | same | KILLED |
| 4 | same | settleConfirmation password null->held.password | same | KILLED |
| 5 | same | register settle guard drops `!state.busy` (R15) | same | KILLED |
| 6 | same | beginCode reset request kind resetPassword->confirmEmail | same | KILLED |
| 7 | accountAccessCopy.ts | isSend drops resendCode | same | KILLED |
| 8 | same | describeInputRule swaps the two password texts | same | KILLED |
| 9 | client-adapters HttpAuthAdapter.ts | login 403 blocked->pending | HttpAuthAdapter.test.ts | KILLED |
| 10 | same | flow 403 check drops registration_closed | same | KILLED |
| 11 | same | drop isAccountInputRule check | same | KILLED |
| 12 | RoutingAuthPort.ts | liveFlow uses deps.demo | RoutingAuthPort.test.ts | KILLED |
| 13 | domain AuthSimulator.ts | unavailable flows answer ok code_sent | AuthSimulator.test.ts | KILLED |
| 14 | core-logic shellFolds.ts | pending text -> blocked text | shellFolds.test.ts | KILLED |
| 15 | web-boot buildBrowserPorts.ts | offersRegistration drops `!== ""` | offersRegistration.test.ts | KILLED |
| 16 | rxjs AccountAccessMachine.ts | cancelsInFlight guard no longer calls cancelRequest (R15) | rxjs coreContract.test.ts -t accountAccess | KILLED |
| 17a | rxjs AuthPresenter.ts | login failure: outcome.reason -> null | rxjs coreContract -t auth | KILLED |
| 17b | async presenters/shell.ts | same | async coreContract -t auth | KILLED |
| 17c | effect presenters/shell.ts | same | effect coreContract -t auth | KILLED |
| 18 | devtools-core DevtoolsHub.ts | SECRET_INTENT_KEYS stops masking code | hubIntentRedaction.test.ts | KILLED |
| 19 | accountAccessFold.ts | stay() returns cancelsInFlight true | accountAccessFold.test.ts | KILLED |
| 20 | same | isPasswordRule true for every defined rule | same | KILLED |
| 21 | async machines/accountAccess.ts | cancelsInFlight no longer calls slot.end() | async coreContract -t accountAccess | KILLED |
| 22 | effect machines/accountAccess.ts | same | effect coreContract -t accountAccess | KILLED |

## Review record

Fix rounds: Task 4 (devtools secret redaction R6, type pin, dispose case, six promoted minors R7), Task 8 (data-* leak case and Back on every form, R10), Task 9 (native validation pre-empting the fold's copy, R13 — confirmed in Chromium by the controller), Task 12 (unused scenario helpers, R18), Task 7 (React Native member count, R19), Task 14 (docs accuracy, R17). Whole-branch review (most capable model): one Important (sends while busy) plus minors, fixed in one wave (R20, R21) and re-reviewed. Browser eyeball of both clients against the full stack: register → confirm → awaiting approval, reset → password changed → sign in with the new password.


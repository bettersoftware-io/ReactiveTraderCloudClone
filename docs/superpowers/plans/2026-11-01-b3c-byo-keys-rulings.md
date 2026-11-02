# B3c bring-your-own keys: rulings

Every ruling the controller made while building [the B3c plan](2026-11-01-b3c-byo-keys.md), kept because the working ledger is git-ignored. Each has what it costs if wrong. PR 4 appends its own at the end.

Spec: [B3 design](../specs/2026-10-25-b3-ai-metering-byo-keys-design.md).

## Before building (plan scan)

1. **The fake check is passed in, not read from the environment.** `ConnectionOwnKey` takes its `verify` function as a dependency, and `index.ts` passes the fake one when `RTC_JARVIS_FAKE=1`. So `verifyOwnKey` reads no environment and stays pure. Wrong: one signature change.
2. **Task 8 may touch `core-api` and every `IWsAdapter` implementation or fake that fails typecheck.** The plan's interface requires it. Wrong: no cost.
3. **`jarvisBrainTakesEffort` arrives in Task 10.** Until then the server's effort check stays on the model id. Wrong: one small server edit in PR 3.
4. **The real-key run in Task 14 stops and asks the user.** It is security-sensitive and the spec requires a hand run. Wrong: no cost.

## PR 1: the policy

5. **The deploy guard is `check-csp --dist`, not the brief's literal grep.** The bundle must name a host that `connect-src` allows. The literal grep already runs just above it, so both guards run. Wrong: no cost.
6. **The spec file sits under `tests/browser/playwright/` and the scenario under `tests/browser/scenarios/`.** That is the repo's layout; the plan's path was wrong. Wrong: no cost.
7. **The devtools inline guard moved into a module.** This is outside the brief's file list, but the brief says to fix the code. Wrong: a small cost.
8. **`?relay=<ws-url>` on the deployed `/devtools/` is blocked by `connect-src`.** React Native inspection runs from the local dev server, which sends no policy. Widening `connect-src` to any WebSocket host would undo the policy. Wrong: a person has to run devtools locally to inspect React Native.
9. **A deploy smoke that pipes `curl` into `grep -q` under `pipefail` may see curl exit 23.** Real but low risk, because headers arrive in one write. Wrong: one false red after a good deploy; re-run the smoke.
10. **Adjacent doc comments in `Csp.ts` are left alone.** Cosmetic.

## PR 2: the server

11. **The fake path is its own function, `fakeVerifyOwnKey`.** `ConnectionOwnKey` takes the verifier, the limiter and the caller id. The OpenRouter check uses `/api/v1/key` until Task 14 confirms it. Wrong: small.
12. **The same key sent again after `unreachable` or `limited` makes a new check.** After `accepted`, `checking` or `refused` it only updates the cap. Read literally, the brief's rule left "Try again shortly" with no way out, and a refused key stays refused without another provider call. Wrong: one extra check per retry, bounded by the limiter.
13. **The cap is read once per turn.** Wrong: small.
14. **The own client does not inherit the operator's Anthropic environment.** Wrong: small.
15. **A successful check refunds the limiter's charge.** Reconnects are free and only failed guesses count. Wrong: small.
16. **Anthropic's low-credit 400 maps to the "out of credit" refusal now,** matched on the error's `credit balance` text without logging it. The status and text are from memory, so Task 14's real-key run confirms them. Wrong: that case keeps the generic copy.
17. **The per-socket cap and per-socket key are accepted.** Spend is per person, the limit is per socket, the most generous tab governs, and Remove in one tab leaves the other live. None spends beyond the person's own choice. The server has no ping, so "gone when the socket closes" can lag by minutes. Both are recorded in `security.md` and the plan. Wrong: a person is surprised by a second tab.
18. **A topped-up key stays refused on its connection.** Remove then save again clears and rechecks, and a reconnect rechecks. Wrong: one extra click.
19. **A non-refundable hourly ceiling sits beside the refundable guess limit: 120 per caller.** Two tabs reconnecting every minute stay under it, and a flood stops. Refunds keep the guess limit at 20. Wrong: a very flappy client reads `limited` until the hour turns.
20. **A ceiling that drops a working key on that connection until the hour turns is accepted.** It needs about 120 checks an hour. Wrong: a person re-saves their key next hour.

## PR 3: the clients

21. **A stored own brain whose model left the list reads as `scripted`, not as the default.** This overrides the plan's Task 2 sentence. The default is a house brain, and a person who chose their own key must never be moved quietly onto the house's. Wrong: one scripted turn before the person re-picks.
22. **A preferred own brain whose key is `unreachable` or `limited` has its own readout row.** `Scripted · couldn't reach <Provider>` and `Scripted · too many key checks`, both warnings. The aim is that nobody is unsure whether a real model answered. Wrong: two short strings.
23. **The owner of a key is `state.user.email`.** Auth state carries no username, every core already folds the email, and the server normalises it. Wrong: one line per core plus fixtures.
24. **After any sign-in with a known owner, the transport holds that owner's key or nothing.** The controller sends a clear whenever it restores nothing, because the transport outlives a composition. A clear on a closed socket is local memory only. Wrong: one no-op call per sign-in.
25. **The limit on a saved key is editable in place.** The spec calls it adjustable. Wrong: one small control.
26. **The readout line for someone who chose scripted never says their daily limit is used.** Wrong: small.
27. **The Effort control is greyed out for Haiku, the default brain.** This is true on the server, which omits effort for Haiku. It needs the user's sign-off at the golden review. Wrong: the control looks missing.
28. **Several smaller findings were fixed in the same rounds** because each touched a stated constraint: an own-shaped string falling to the house default, a string turn id in a key frame being logged, a provider list that would delete stored keys as malformed, a storage read failure deleting a valid key, a stale save after an account switch sending the old owner's key, and the domain import cycle. Wrong: each costs a line.
29. **The hook-to-wire path has no client unit test.** The full-stack browser case covers it: it saves a fake key, sees it accepted, reloads, runs a reply on the own brain, signs out and finds nothing in storage. Wrong: a break there shows in that case, not earlier.

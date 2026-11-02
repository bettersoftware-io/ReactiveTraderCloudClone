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
19. **A non-refundable hourly ceiling sits beside the refundable guess limit.** Tabs reconnecting normally stay under it, and a flood stops. Refunds keep the guess limit doing its own job. Wrong: a very flappy client reads `limited` until the hour rolls.
20. **A ceiling that drops a working key on that connection until the hour turns is accepted.** It takes far more checks than normal use makes. Wrong: a person re-saves their key next hour.
21. **The full-stack smoke asserts the own brain's stamp on its reply.** Task 6 promoted this into its fix round: a regression to scripted would otherwise pass the only live witness of own routing. Wrong: a line of test.

## PR 3: the clients

22. **A stored own brain whose model left the list reads as `scripted`, not as the default.** This overrides the plan's Task 2 sentence. The default is a house brain, and a person who chose their own key must never be moved quietly onto the house's. Wrong: one scripted turn before the person re-picks.
23. **A preferred own brain whose key is `unreachable` or `limited` has its own readout row.** `Scripted · couldn't reach <Provider>` and `Scripted · too many key checks`, both warnings. The aim is that nobody is unsure whether a real model answered. Wrong: two short strings.
24. **The owner of a key is `state.user.email`.** Auth state carries no username, every core already folds the email, and the server normalises it. Wrong: one line per core plus fixtures.
25. **After any sign-in with a known owner, the transport holds that owner's key or nothing.** The controller sends a clear whenever it restores nothing, because the transport outlives a composition. A clear on a closed socket is local memory only. Wrong: one no-op call per sign-in.
26. **The limit on a saved key is editable in place.** The spec calls it adjustable. Wrong: one small control.
27. **The readout line for someone who chose scripted never says their daily limit is used.** Wrong: small.
28. **The Effort control is greyed out for Haiku, the default brain.** This is true on the server, which omits effort for Haiku. It needs the user's sign-off at the golden review. Wrong: the control looks missing.
29. **An own-shaped string never falls to the house default.** Task 5 promoted this into its fix round: it touches the rule that a person's choice of key is never quietly moved onto the house's. Wrong: a line.
30. **A string turn id in a key frame is not logged.** Task 5 promoted this too: a frame carrying a key must leave nothing of itself in a log. Wrong: a line.
31. **The provider list is one list.** A new provider in PR 4 would otherwise delete stored keys as malformed. Wrong: a line.
32. **A storage read failure keeps the key.** A transient `getItem` failure used to delete a valid value. Wrong: a line.
33. **The domain import cycle is fixed, not parked.** `JARVIS_PROVIDERS` and `isJarvisProvider` moved into `jarvisOwnModels.ts`, because `pnpm check:deps` fails CI. Wrong: a line.
34. **The hook-to-wire path has no client unit test.** The full-stack browser case covers it: it saves a fake key, sees it accepted, reloads, runs a reply on the own brain, signs out and finds nothing in storage. Wrong: a break there shows in that case, not earlier.
35. **Own-key failures that touched a constraint were fixed in the Task 7 round, not deferred:** `own && exhausted !== null`, so the switch line names the budget that was spent, and `budgets` as a required parameter, so no caller can leave the choice of budget out. Both restore a guarantee that task claims. Wrong: small.
36. **The key member ends with its composition.** `OwnKeyFold.stop()`, called from each core's release, makes the intents do nothing, because a presenter still held after a hot swap would send the old owner's key or clear the store under the next composition. Wrong: small.
37. **Smaller Task 9 corrections went in the same round:** a comment that still said username, a doc comment that had moved off its function, and the skill's member count. Wrong: small.
38. **An automatic reconnect compares the session store's token with this tab's.** A missing or different token reports `sessionEnded()` instead of opening a socket, so that tab signs out and the fold wipes. Chosen over a storage-event port across three cores: it is one seam, and it closes the second-tab hole. Wrong: a tab is signed out at reconnect after another tab re-signed in, which is safe.
39. **This tab's own token writes are not another tab's.** An unlock rotates the token under a socket that stays open, in all three cores, so comparing with the opening token alone would sign a person out, and wipe their key, at the first reconnect after an unlock. The store `createWsRealPorts` hands to auth tells the transport what this tab wrote (`adoptToken`). `reopen()` after an idle close makes the same check, for the same hole. Wrong: one method on the transport.
40. **Try again re-sends the saved key through `setCap`.** The button (`jarvis-key-retry`) shows for `unreachable`, `limited` and a key the server has not reported on. Task 4's rule rechecks it, and the limiter bounds it. Wrong: a charged check per click.
41. **No timer on an unconfirmed key.** `src/ui` forbids them. A saved key with no server reading says `Not confirmed by the server yet` and offers Try again; `Checking…` shows only when the server says so. DEPLOY.md makes server-first a hard order, because the wire cannot reveal a server's version. Wrong: copy only.
42. **A socket lost mid-turn is a STATUS entry, not this PR.** It leaves Jarvis's turn open until a reload, but it predates this work and carries no key. Wrong: the same wedge as today.
43. **The key field uses `autocomplete="new-password"` plus the password managers' ignore attributes.** This overrides the plan's `off`. The risk is a login password filled into a field that is forwarded to a provider. Wrong: no cost.
44. **`stop()` also releases the held key, and silence from the server says nothing about the key.** A holder surviving a hot swap, and false copy after a timeout-synthesized availability, were both promoted into the fix wave. Wrong: small.

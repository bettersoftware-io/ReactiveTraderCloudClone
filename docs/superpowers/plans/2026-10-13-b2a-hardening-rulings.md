# B2a hardening — rulings, triage and mutant table

Companion to [the plan](2026-10-13-b2a-hardening.md) and [the spec](../specs/2026-10-13-b2a-hardening-design.md). Written by the controller of the subagent-driven run that built the PR (2026-10-13): every decision taken on the author's behalf, in the order it was taken, each with what it costs if wrong; the per-task findings that were deferred and how the final review triaged them; and the mutant table that proves the security rules' tests can fail. The run itself: nine tasks, each with a fresh implementer and an independent reviewer (two needed one fix round each), a whole-branch review on the most capable model, one fix wave, one scoped re-review.

## Rulings

| # | When | Ruling | If wrong |
|---|---|---|---|
| R1 | pre-flight | Task 2 `parseAllowedOrigins`: the plan's last condition rejected `https://host:443/`, which its own test accepts (`URL.origin` drops a default port); replaced by a userinfo check (`username`/`password` non-empty). | An odd origin spelling is judged differently from intent; the tests pin both directions. |
| R2 | pre-flight | Task 2 test: the "does not name the entry's text" assertion is skipped for the empty entry (`new RegExp("")` matches everything). | One assertion fewer on one row. |
| R3 | after T1 | Background security scan: "lockout amplification" via the /48 tier. Design-accepted (spec §3.5, D6): the wider budget is 4× one /64's; a tunnel broker hands one person a /48. Code stands. | Neighbours of an abuser in one /48 see 429 on the account routes for one window. |
| R4 | after T4 | Background scan: "authorization-state-loss" (the list→DELETE race) and "parser-differential" (the PostgREST filter) in the Supabase directory. (a) stands — seconds-wide window on a 48 h-old row. (b) stands — `findByEmail` is reached only after the validator, whose character set has no `"` or `\`. Superseded in part by R8: the quoting itself was the defect. | (a) a rare re-registration; (b) moot after R8. |
| R5 | after T5 | Background scan: enumeration side channel vs. global lockout in the fuses. Charging a fuse only for a send that lands leaves a one-bit-per-hour channel; charging every request makes a 15-request lockout trivial. Spec §3.2 chose this balance under the project's 60/h; the edge challenge (§8) is the designed remover. Code stands; STATUS names the lockout cost (3 IPs + 5 addresses hold a path shut for an hour). | A patient attacker confirms which addresses have accounts, which Supabase's register behaviour already discloses. |
| R6 | after T6 | Background scan: the 300 ms floor is an "incomplete mitigation". A floor equalizes only decisions faster than it; a constant-time equalizer costs every login the tail. Spec §3.2 sized it to the measured hash time; the state words after a correct password are the parent spec's UX. Stands; the constant's comment cites its basis. | A patient attacker distinguishes unknown from known addresses on `/login`. |
| R7 | after T7 | Background scan: a /64 refused by a spent /48 collects login strikes. The strike lands on the caller's own key by its own retries (10 in the window), the same path as self-exhaustion; the abuser cannot strike a neighbour. Stands; a tier-reporting API is out of this PR. | A persistent neighbour of an abuser is banned 15 min after 10 refused retries. |
| R8 | final review | **C1 accepted:** `findByEmail` drops the double quotes PostgREST strips only inside logic trees and `in.()` lists; the top-level value is everything after the operator's dot, so the plain percent-encoded address is correct (as `findAccount`'s `id=eq.<uuid>` already was). Spec §3.2 corrected. **The live probe must be re-run from the merged tree before the deploy** — its `findByEmail` checks have never run live. | If quotes WERE required, the probe's "finds the account by its address" check fails loudly before any deploy. |
| R9 | final review | I2: `dev:*:ws:remote` browser logins (other than in-browser demo logins) answer 403 after the deploy unless `http://localhost:5173,http://localhost:5473` join `RTC_ALLOWED_ORIGINS`. Documented (CLAUDE.md, env-files, DEPLOY step 11); the production allowlist is NOT widened by default — the operator chooses. | A developer meets one 403 and finds the sentence. |
| R10 | final review | I4/R5/R6 follow-ups added to the wave: floor cases for the 403 and 503 paths; the floor constant's comment cites its measured basis (~70 ms, spec §3.2); STATUS names the resend lockout cost. | — |
| R11 | fix wave | C3 (hoisting two test constants) waived: the repo's `rtc/newspaper-order` rule forbids it and `eslint --fix` moves them back. | None. |
| R12 | fix wave | The executed plan keeps the quoted `findByEmail` form it prescribed, as the historical record; the spec and this file carry the correction (R8). | A reader of the plan alone repeats the mistake; the plan's header points here. |
| R13 | re-review | A `log` that throws inside the purge's `.catch` is still an unhandled rejection; left — the production logger is `console.log`, the same edge A1 accepted for `detach`. | A throwing logger takes the server down hourly; replacing the logger means revisiting this. |
| R14 | re-review | No test for a synchronous throw from `resendCode`/`requestReset` (the A2 widening); left — the shared `startSend` path is tested through `signUp`. | A regression there would log `threw` and answer `code_sent`, which is the intended behaviour anyway. |
| R15 | re-review | STATUS's edge-challenge sentence now reads as if `RTC_SIGNUPS_*` tune the resend lockout, which they do not; left for the Turnstile item to rewrite. | One misleading clause in STATUS until then. |
| R16 | close-out | `pnpm lint:dead` (knip) found `EMAIL_SENDS_WINDOW_MS` unused once Task 5 moved the fuses onto `SEND_FUSE_WINDOW_MS`; removed by the controller directly (a mechanical gate fix, verified by knip, the typecheck and the covering tests), with the stale comment above `EMAIL_SENDS_PER_HOUR_MAX` rewritten and the authentication.md table row corrected. | None; the gates are the reviewer. |

## Per-task findings deferred, and the final review's triage

Fixed in the wave (final review agreed with each): the tiered-limiter "refused /64 still charges its /48" test (T1); the 415 "no header" row that sent a string body (T3); `connection: close` asserted on the 403/415 (T3); hoisted test constants (T3); the oldest-first purge witness (T4); `detach` ends in `.catch` (T5); a synchronous `signUp` throw can no longer leak an in-flight slot (T5); the "not awaited" test fails fast (T5); floor test 3 asserts its 200s (T6); `runOnce().catch` in the purge scheduler (T7, the one item the final review would not merge without); the journey's header tally (T8); the authentication.md sentence that made the ban list and connection caps sound tiered (T9); DEPLOY's "steps 10-13" paragraph (T9).

Left as-is (final review: LEAVE): `createTieredLimiter.size()` JSDoc; the list policy compares the raw lowercased header while the setting went through `URL.origin` (fail-closed; browsers send neither a default port nor a slash); no `[::1]`/trailing-dot localhost cases (all fail closed); the vacuous "without a strike" assertion (the `Pick<BanList,"bannedUntil">` type is the guarantee); one long comment line; the list→DELETE purge race; the in-memory purge's unvalidated `limit` (dev-only); no 403/thrown-fetch purge test (same branch as 422/500); the duplicated 15-line resend/reset block (a helper would hide which status qualifies); peek-clock inconsistency and `createFuses` ×3 in tests; the count-based oracle (R5); the unbounded `getTimerCount` poll and the untested default `waitMs`; the discarded purge handle and missing overlap guard; the status-only null-origin smoke witness; DEPLOY's line break and the parent spec's lead-in.

## Mutant table

`node scripts/mutation-check.mts <spec>` over 25 mutants, one per security rule (spec in the run's workspace; the table is the record). First sweep at 3f6d5d62d: 22 killed, 3 survived — each a test gap, not a code defect, closed by the wave. Final sweep after the wave: 25 killed, 0 survived (65d4806aa; the fix wave also ran six scratch mutants against its new tests, all killed)..

| Mutant | Test | First sweep | After the wave |
|---|---|---|---|
| origin check inverted (foreign allowed) | postRouter | KILLED | KILLED |
| missing Origin refused like a foreign one | postRouter | KILLED | KILLED |
| content-type check removed | postRouter | KILLED | KILLED |
| CORS header `*` again | postRouter | KILLED | KILLED |
| list policy: `null` allowed | originPolicy | KILLED | KILLED |
| localhost policy: any host on http | originPolicy | KILLED | KILLED |
| JSON content type by prefix | originPolicy | KILLED | KILLED |
| `peek` always true | rateLimit | KILLED | KILLED |
| tiered `hit` short-circuits on own refusal | tieredLimiter | **SURVIVED** | KILLED (new case: a /64 refused on its own window still charges its /48) |
| sign-up fuse charged before the count | AccountService | KILLED | KILLED |
| resend condition widened to any status | AccountService | KILLED | KILLED |
| reset condition includes `blocked` | AccountService | KILLED | KILLED |
| spent resend fuse no longer refuses before the lookup | AccountService | KILLED | KILLED |
| spent reset fuse no longer refuses before the lookup | AccountService | **SURVIVED** | KILLED (new case: the reset twin of Review Focus 4) |
| resend awaited instead of detached | AccountService | KILLED | KILLED |
| login floor removed | loginHandler | KILLED | KILLED |
| in-memory purge removes seeds | InMemoryAccountDirectory | **SURVIVED** | KILLED (new case: a directory with an unconfirmed custom seed) |
| in-memory purge removes confirmed accounts | InMemoryAccountDirectory | KILLED | KILLED |
| in-memory purge ignores the cutoff | InMemoryAccountDirectory | KILLED | KILLED |
| Supabase purge: 404 on delete stops the run | SupabaseAccountDirectory | KILLED | KILLED |
| Supabase purge lists confirmed accounts | SupabaseAccountDirectory | KILLED | KILLED |
| /48 multiplier dropped | accountLimits | KILLED | KILLED |
| `readPositiveInteger` accepts 0 | resolveAccountsMode | KILLED | KILLED |
| purge interval timer not unref'd | unconfirmedPurge | KILLED | KILLED |
| purge first-run timer not unref'd | unconfirmedPurge | KILLED | KILLED |

## What the author still does

1. Set the Fly secrets (DEPLOY §4 steps 10–11), **re-run the live probe** from the merged tree (step 9 — the `findByEmail` checks, R8), deploy (12), make the first admin (13), the keep-alive run (14), unset the key (15).
2. Decide R9: add the two localhost origins to `RTC_ALLOWED_ORIGINS` on Fly, or live with 403s in `dev:*:ws:remote` browser logins.

# B2a hardening — the seven items that block opening registration: design

Date: 2026-10-13 · Status: design approved 2026-10-13; built by [`../plans/2026-10-13-b2a-hardening.md`](../plans/2026-10-13-b2a-hardening.md)

Parent: [B2 user management](2026-10-04-b2-user-management-design.md) (§5.7
abuse controls, §6 failure modes) and its B2a rulings,
[`../plans/2026-10-04-b2a-account-server-rulings.md`](../plans/2026-10-04-b2a-account-server-rulings.md)
(rulings 20–23). This document resolves the seven items `docs/STATUS.md`
lists as **blocking** under B2a, and is the spec the hardening plan argues
from. Nothing here changes a wire type a client already reads.

## 1. Intent

B2a shipped the account server on 2026-10-12 (PR #1000) with seven known gaps,
each recorded rather than fixed because each deserved its own reviewed
change. Registration stays closed (`REGISTRATION_OPEN=false`) until they are
closed. This PR closes them, so that the deploy that follows it can open
sign-up to strangers.

What changed since the gaps were recorded, and shapes this design:

- The live probe ran against the real project on 2026-10-13 and passed. It
  measured the response-time oracle: signing up an address that already has
  a confirmed account answered in **28 ms**; a fresh sign-up, which sends an
  email, took **1,361 ms**. A fifty-fold difference, measurable from across
  the internet.
- The email sender is Resend's free plan (100 emails a day), reached through
  the project's custom SMTP; the project's own email limit is set to 60 an
  hour. Every mail the server lets through spends both allowances, and a
  send Supabase throttles is lost silently (parent §6).
- The deployed clients are two Vercel origins, `https://rtc-clone-react.vercel.app`
  and `https://rtc-clone-solid.vercel.app`; the React Native client and the
  probe reach the server with no `Origin` header at all.

## 2. Decisions (user, 2026-10-13)

| # | Decision | Why |
|---|---|---|
| D1 | Browsers reach the POST routes only from an **origin allowlist**, and only with `Content-Type: application/json`. | Item 1. A foreign page can otherwise make its visitors' browsers register, resend and guess codes from their own addresses, inside every per-IP budget we have. |
| D2 | The three paths that send mail answer **before** the send runs (**detached sends**); a failed account login is held to a **300 ms floor**. | Item 2. Padding every answer to the slowest case would make each sign-up wait 1.4 s and still leak through the tail; answering first removes the send from what the caller can time. |
| D3 | A resend or reset is **attempted, and counted, only when it will land**: a lookup by address first, then a per-path hourly fuse charged for real sends only, and a spent fuse refuses every request on that path. | Items 7 and 5. Ruling 21's fuse was a cheap global lockout; ruling 23's no-fuse let junk accounts drain the allowance. Looking up first satisfies both. |
| D4 | Accounts not confirmed within **48 hours** are **purged**, hourly, by the server. | Item 3. Junk sign-ups otherwise accumulate forever and each can draw resends. 48 and not 24: the daily sign-up cap counts the last 24 hours of profiles and must not be undercut by its own cleanup. |
| D5 | The hourly sign-up fuse and the daily cap become **environment settings**. | Item 5. The levers that pause sign-up are real; an operator must be able to retune them during abuse without a deploy. The challenge at the edge that removes them (Turnstile) is not in this PR: it needs Cloudflare in front of the Fly server and client work. |
| D6 | Every per-IP budget on the POST routes is also charged against the caller's **/48**, at four times the budget. | Item 6. A tunnel-broker /48 holds 65,536 /64s; the second bucket bounds it at four households' worth. |
| D7 | The probe gains the new read, and the docs record the rollout as it now stands. | Item 4. The probe is the only proof against the real service; the read this PR adds must be in it before the deploy; the purge is not probed live (§5). |

Judgment calls folded into those decisions, each confirmed in conversation:
detached sends over padding; 48 hours; a reset is sent to a *pending*
account as well as an *active* one (confirmed and not blocked); 300 ms; a
deployed server refuses to start without the allowlist.

## 3. Design

### 3.1 Origins and content type (D1)

**Setting.** `RTC_ALLOWED_ORIGINS`: a comma-separated list of origins,
`scheme://host[:port]`, trimmed and compared lowercase. Each entry must
parse as an `http` or `https` URL with no path, query or fragment; a list
that does not is a startup refusal naming the entry's position, not its
text. On Fly the value is
`https://rtc-clone-react.vercel.app,https://rtc-clone-solid.vercel.app`.

**Unset.** On a machine that is not deployed (no `FLY_APP_NAME`, no
`RTC_DEPLOYED`): the **localhost policy**, which allows any `http` origin
whose host is `localhost` or `127.0.0.1`, on any port — every `dev:*:fs`,
`dev:*:ws:local` and e2e flow. On a deployed machine, whatever the account
mode: the server **refuses to start** ("RTC_ALLOWED_ORIGINS must be set on a
deployed server"), the posture every other half-configuration already has.
`DEPLOY.md` gains the `fly secrets set` line, before the deploy that carries
this change.

**Where it applies.** The POST router (`http/postRouter.ts`), so every route
it owns: `/login` and the five account routes. The GET health routes keep
`Access-Control-Allow-Origin: *`; `/mcp` is unchanged (token-gated, not a
browser surface in B2a). `index.ts` stops setting `*` for every request at
the top of the handler and sets it inside the GET branches only, so a header
the router chooses not to send is really absent.

**Rules, in order, before the body is read:**

1. `OPTIONS` (the preflight): with an allowed `Origin`, `204` with
   `Access-Control-Allow-Origin: <that origin>`, `Vary: Origin`,
   `Access-Control-Allow-Methods: POST, OPTIONS`,
   `Access-Control-Allow-Headers: Content-Type`,
   `Access-Control-Max-Age: 600`. With a missing, `null` or foreign
   `Origin`: `403`, no CORS headers.
2. `POST` with an `Origin` header that is `null` or not allowed: `403`
   `{ "error": "origin_not_allowed" }`, no CORS headers, **no ban strike**
   (the sender is a victim's browser). A request with **no** `Origin` header
   passes: no browser is involved (curl, the probe, the React Native
   client, the smokes).
3. `POST` whose `Content-Type` is not `application/json` (a parameter such as
   `; charset=utf-8` is fine): `415` `{ "error": "unsupported_media_type" }`,
   no strike. This is what stops a "simple" cross-site form post, which
   needs no preflight.
4. The ban check, the body cap and the handler, as today.

**Responses.** `jsonResult` no longer carries a CORS header. The router adds
`Access-Control-Allow-Origin: <origin>` and `Vary: Origin` to every response
it writes — the handler's result, the 413, the 429 for a banned caller and
the 500 — when the request carried an allowed `Origin`, and nothing
otherwise. A browser on an allowed page therefore reads every answer it
could read before; a browser on any other page reads none and cannot send
a body-bearing request at all.

### 3.2 Sends that cannot be timed, and that always land (D2, D3)

**The port gains one read.** `findByEmail(email): Promise<AccountLookup>` —
the same shape as `findAccount`, keyed by the normalized address. In the
Supabase directory it is one PostgREST query on `profiles`
(`email=eq."<address>"`, the value double-quoted so PostgREST's reserved
characters in a local part are literal; the validator already refuses `"`
and `\`), whose cost does not depend on whether a row exists. The dev
directory reads its map; the disabled directory answers `unavailable`.

**`/register`**, in the account service: validate; charge the address's send
budget (`throttled`); read the daily count (`unavailable` if the store does
not answer, `closed` over the cap); charge the sign-up fuse
(`unavailable` when spent); then start `directory.signUp` **without
awaiting it** and answer `code_sent`. The in-flight and answered counters
still move when the detached call settles, so the daily cap's arithmetic is
unchanged. A detached outcome other than `sent` is logged as one fixed line
(the route and the outcome word, never the address) and is otherwise lost:
an address Supabase refuses after our validator accepted it shows "code
sent" and no mail arrives, the same as an address typed wrong today. A
store that is down is still caught before detaching, by the count.

**`/resend-code`** and **`/request-reset`**: validate; charge the address's
send budget; if the path's fuse is already spent, `unavailable`; look the
address up (`unavailable` if the store does not answer); then, **only** if
a send will land — a resend for an `unconfirmed` account, a reset for a
`pending` or `active` one — charge the path's fuse and start the send
without awaiting it. Every other case (no account, the wrong status)
answers `code_sent` having sent nothing. The lookup runs for every
well-formed request and the send is never awaited, so the answer's timing
carries no information about the address.

**Three fuses, one key each, sized together.** `SIGNUPS_PER_HOUR` (25,
`RTC_SIGNUPS_PER_HOUR`), `RESENDS_PER_HOUR` (15) and `RESETS_PER_HOUR` (15):
**55 an hour at most**, under the project's email limit of 60, so the
project never throttles a mail the server let through and no mail is lost
silently. An operator who raises `RTC_SIGNUPS_PER_HOUR` must raise the
project's limit by the same amount; `DEPLOY.md` says so beside the setting.
A spent fuse answers `503 unavailable` to **every** request on its path,
whether or not that request would have sent: refusing only the ones that
would have sent would tell the caller which addresses have accounts. The
rate limiter therefore gains `peek(key, now)`, a read that reports whether
a hit would be allowed without charging it.

**A failed account login (`/login`, the `@` branch)** is held to
`LOGIN_FAILURE_FLOOR_MS` (300 ms) from the moment the handler starts: every
answer other than `ok` waits out the remainder of the floor before it is
returned. Supabase answers an unknown address at once and a wrong password
after its hash (about 70 ms in the probe's logs); under the floor the two
are the same. A successful login is slower than the floor already. The
roster branch is unchanged: `AuthService` hashes with a dummy salt for an
unknown username.

### 3.3 Purging never-confirmed accounts (D4)

**The port gains one write.** `purgeUnconfirmedBefore(cutoffMs, limit)` →
`{ outcome: "purged", count }` or `{ outcome: "unavailable" }`. Supabase:
one PostgREST read of up to `limit` profile ids with `email_confirmed_at`
null and `created_at` before the cutoff, oldest first, then one
`DELETE /auth/v1/admin/users/{id}` per id — the cascade removes the profile;
a 404 counts as purged (already gone). If the read fails the outcome is
`unavailable`; if a delete fails the run stops and reports what it did
purge, and the next run continues. The dev directory removes the matching
entries from its map; its seeds are exempt, so the seeded unconfirmed
account stays. The disabled directory answers `unavailable`.

**The schedule.** `startUnconfirmedPurge` in `accounts/`, wired from
`index.ts` for the Supabase and in-memory modes (not for `disabled`): the
first run one minute after start, then every hour (`PURGE_INTERVAL_MS`),
each run with cutoff `now − PURGE_UNCONFIRMED_AFTER_MS` (48 hours) and
`PURGE_BATCH` (100). The timer is `unref`'d, so it never holds the process
open. The run logs one line only when it purged something
(`[accounts] purged <n> unconfirmed accounts`) or could not
(`[accounts] purge unavailable`) — a count, never an id or an address.

**Why 48 hours, and what it costs.** Supabase's code expires after an hour,
so a user who comes back two days later must register again, which costs
one form. The daily cap counts profiles created in the last 24 hours;
purging at 48 leaves every row the cap can count in place.

### 3.4 The levers as settings (D5)

`RTC_SIGNUPS_PER_HOUR` (default 25) and `RTC_SIGNUPS_PER_DAY` (default 200),
read beside `REGISTRATION_OPEN` in `resolveAccountsMode.ts`: a set value must
be a positive integer, or the server refuses to start naming the setting
(never echoing the value). They feed the sign-up fuse and
`maxRegistrationsPerDay` where the constants did. Lowering either during
abuse is one `fly secrets set` and a restart, no deploy.

### 3.5 The /48 bucket (D6)

`collapseToNetworkKey` already keys an IPv6 caller by its /64. A new helper,
`widerNetworkKeyOf(key)`, gives the /48 for an IPv6 key (the first three
hextets, then `::`) and `null` for IPv4 or an unparsable key. The per-IP
limiters of the six POST routes become **two-tier**: `createTieredLimiter`
wraps the existing limiter so that `hit(key, now)` charges the key's own
window and, for an IPv6 key, the /48's window against a limiter with
**four times** the maximum and the same period; a refusal from either is a
refusal. Handlers do not change: the composite satisfies `RateLimiter`.
Strikes and bans stay on the /64 key, as today; the connection caps and the
per-address limiters are untouched.

### 3.6 Nothing else moves

No wire type changes: `AccountErrorDto` gains the two error words
`origin_not_allowed` and `unsupported_media_type`, which B2b's screens may
show but need not. The flow statuses, the session token and the upgrade
gate are as in B2a.

## 4. Failure modes

| Condition | Behaviour |
|---|---|
| A page on a foreign origin posts to an account route | `403 origin_not_allowed`, no strike; its preflight fails the same way. The visitor's own budgets are untouched. |
| A browser posts without `Content-Type: application/json` | `415 unsupported_media_type`, no strike. |
| The React Native client, the probe, curl | No `Origin` header: pass. A scripted attacker can omit the header too — deliberately not the threat D1 closes; the per-IP budgets and the fuses are. |
| `RTC_ALLOWED_ORIGINS` unset on Fly | The server does not start; `fly logs` names the setting. |
| A detached send fails (`unavailable`, `rejected-email`) | The caller already has `202 code_sent`; one log line with the route and outcome word; no mail. The user resends or re-registers. |
| The store is down | `/register` answers `503` from the count; `/resend-code` and `/request-reset` from the lookup; nothing is detached. |
| A fuse is spent | `503 unavailable` to every request on that path for the rest of the hour, whether or not the address has an account. |
| A purge run cannot read or delete | `[accounts] purge unavailable`; the next hour retries. Accounts purged so far stay purged. |
| A caller inside a tunnel-broker /48 | Each /64 has today's budget; the /48 together has four. |
| `RTC_SIGNUPS_PER_HOUR` raised above the project's email limit minus 30 | Supabase can throttle silently again. Documented beside the setting; not enforced — the server cannot read the project's limit. |

## 5. Testing

- **Unit, per rule, with a mutant each** (the repo's `mutation-check`):
  the origin policy (allowed, foreign, `null`, missing; localhost policy;
  the deployed refusal; each malformed entry); the router (preflight for an
  allowed and a foreign origin, the 403 and 415 before the body is read, the
  echoed origin and `Vary` on every response kind, nothing on a request with
  no `Origin`); the service's three send paths (the answer resolves while
  the directory's send is still pending — a fake whose promise never
  settles; the fuse charged only on a real send; a spent fuse refusing a
  missing address too; the lookup's `unavailable` surfacing; the detached
  outcome logged without the address); `peek`; the login floor (fake timers:
  an `invalid` answer is not returned before 300 ms, an `ok` one is not held);
  `purgeUnconfirmedBefore` in both directories (cutoff, limit, seeds exempt,
  a failed delete stopping the run with the partial count); the scheduler
  (first run, interval, `unref`, the two log lines); the tiered limiter (a
  /48 shared by five /64s); the two settings' parsing and refusals.
- **Supabase adapter tests** replay the documented responses for
  `findByEmail` (one row, none, a 5xx) and for the purge (the id list, a
  200, a 404, a 500 mid-run).
- **The probe** gains `findByEmail` of the account it created (found,
  `unconfirmed`) and of a never-registered address (missing). It does **not**
  call `purgeUnconfirmedBefore` against the live project: with any cutoff it
  could remove a real user's fresh, not-yet-confirmed account. The purge's
  two calls are each proven live already — the PostgREST read by the probe's
  other `profiles` reads, the admin delete by the probe's own cleanup — and
  their composition by the replayed adapter tests and the dev directory.
- **The full-stack smoke's account journey** adds: a `/register` with a
  foreign `Origin` (403, no CORS header), one with `http://localhost:5173`
  (202 with that origin echoed), one without `Content-Type` (415), and
  keeps its no-`Origin` calls as the witness for the mobile path.
- **Gates**: the full local list, e2e and the smoke on the merged tree, as
  for B2a.

## 6. What the user does

Before dispatching the deploy that carries this PR (DEPLOY §4 step 11 gains
the first line):

    fly secrets set --stage RTC_ALLOWED_ORIGINS=https://rtc-clone-react.vercel.app,https://rtc-clone-solid.vercel.app -a rtc-clone-server

Nothing else: the fuses and the cap keep their defaults, and the project's
email limit is already 60.

## 7. Docs this PR updates

`docs/STATUS.md` (the seven items become done; what remains for B2b, B2c and
the edge), `docs/DEPLOY.md` §4 (step 1 as done — Cloudflare, Resend EU,
`auth.bettersoftware.io`; the probe as run; the new setting in step 11;
step 14 decided: keep-alive), `docs/privacy.md` (deletion requests to
`privacy@bettersoftware.io`), `docs/env-files.md` (`RTC_ALLOWED_ORIGINS`,
`RTC_SIGNUPS_PER_HOUR`, `RTC_SIGNUPS_PER_DAY`), `docs/authentication.md` §7
(the origin rule, detached sends, the purge), `supabase/README.md` (the
three fuses against the project's email limit), `packages/server/README.md`,
and the parent spec's §5.7 and §6 residual rows marked resolved with a
pointer here.

## 8. Not in this PR

- A challenge at the edge (Cloudflare Turnstile) and Cloudflare in front of
  the Fly server: the layer that removes the sign-up denial levers
  altogether. Its own design, after the deploy.
- B2c's session-closing on reset, block and delete; `access` read from the
  store at use; the `/mcp` administrator gate.
- `/mcp`'s CORS posture.
- A per-address limit on `/login` (parent §5.4, deliberately absent).

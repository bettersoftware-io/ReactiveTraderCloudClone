# B2a — account server: rulings made during execution

The [plan](2026-10-04-b2a-account-server.md) was executed by subagents: one
implementer per task, one reviewer per task, and a controller that settled
whatever the plan did not. This file records every decision the controller
took on the user's behalf, in the order it was taken: what was decided, why,
and what it costs if it was the wrong call. The user reads it to overrule.

The [spec](../specs/2026-10-04-b2-user-management-design.md) carries the
resulting amendments in place.

## Facts the rulings rest on

Each was checked during execution, not assumed.

| Fact | Where it was checked |
|---|---|
| A second sign-up for an address whose user is **unconfirmed** does not update that user (password and metadata stay the first registrant's) and re-sends the confirmation code. The source comment reads "do not update the user because we can't be sure of their claimed identity". | Supabase Auth, `internal/api/signup.go` |
| The password grant verifies the password **before** it checks whether the email is confirmed, so "email not confirmed" is never answered to a wrong password. | Supabase Auth, `internal/api/token.go` |
| Verification `type: "email"` accepts **both** the confirmation token and the recovery token. `type: "signup"` accepts only the confirmation token. `type: "recovery"` accepts only the recovery token, and a successful recovery verification also confirms an unconfirmed email. A successful sign-up verification returns a session. | Supabase Auth, `internal/api/verify.go` |
| Graflyn's "special character" rule is `/[^A-Za-z0-9]/`, the same as the plan's. | `graflyn/src/components/auth/AuthPage.tsx` |
| The server verifies a session token in exactly two production places: the WebSocket upgrade and `/mcp`. | `git grep "verifyToken("` over `packages/server/src` |
| The server trusts the `fly-client-ip` header by default, locally as well as on Fly. | `packages/server/src/http/clientIp.ts` |
| The password grant returns at once for an unknown address and runs a password hash for a known one; the recover handler returns at once for an unknown address and sends the email inside the request for a known one. | Supabase Auth, `internal/api/token.go`, `recover.go` (read by the whole-branch reviewer) |
| The adapter has never been run against a real Supabase project. Its unit tests replay documented answers; `accounts:probe` is the only live proof and it needs the user's key. | — |

## The rulings

### 1. The spec and plan ship in the same PR as the code

The plan's Task 0 cut a worktree from `main`, but its Task 11 edits the spec,
which existed only on the docs branch. The implementation branch merged the
docs branch.

- **Why:** a reviewer reads plan and code together, and the spec amendments
  belong with the code that caused them.
- **Cost if wrong:** the PR diff carries about 6,800 lines of docs.

### 2. The ledger, briefs and reports live in the session scratchpad

Not in `.superpowers/sdd/` inside the worktree.

- **Why:** removing a worktree deletes its git-ignored files
  (`shipping-repo-changes` Rule 6).
- **Cost if wrong:** none.

### 3. Tasks 1 and 2 went to one implementer and one reviewer

- **Why:** both are small transcriptions in the two inner packages.
- **Cost if wrong:** one larger review surface.

### 4. The controller runs the outward steps, the mutants and the repo-wide gates

Task 11 put them inside an implementer task.

- **Why:** subagents stall on long runs and must not push, open or merge.
- **Cost if wrong:** none; the same commands run.

### 5. Implementers ran on Sonnet, not the cheapest tier

Although the plan carried complete code.

- **Why:** a weaker model has dropped the worktree `cd` here before and
  committed to the primary checkout.
- **Cost if wrong:** tokens.

### 6. The next implementer starts while the previous task's review runs

When their files are disjoint. A fix round waits for a quiet tree.

- **Why:** the standing preference for parallel work on disjoint files.
- **Cost if wrong:** a fix lands under a task that already built on it; the
  scoped re-review and the whole-branch review cover that.

### 7. Email addresses are printable ASCII only

An internationalized domain is typed in its punycode form; a non-ASCII local
part is refused. Later tightened (ruling 8) to lowercase, RFC "atext" local
part and hostname labels.

- **Why:** the plan's shape check accepted any non-space character. A Cyrillic
  `а` in `аdmin@…` is a different account that reads the same, and lowercasing
  non-ASCII can disagree with the store's own.
- **Cost if wrong:** a visitor with a non-ASCII mailbox cannot register. Loosen
  `EMAIL_SHAPE` in `packages/domain/src/auth/accountInput.ts`.

### 8. The validators stand on their own

A display name must be in NFKC normal form, hold at least one letter or digit,
and carry no invisible character (Unicode's default-ignorable set, controls,
format characters), no enclosing mark and no run of four or more combining
marks. An email must already be in its normalized form.

- **Why:** the plan's validators were only safe behind a caller that
  normalized first, and the Users panel (B2c) will show these names to an
  administrator.
- **Cost if wrong:** an unusual but legitimate name is refused at
  registration. Known cases: a Persian name spelled with a zero-width
  non-joiner, and some Burmese words (four consecutive spacing marks — a
  follow-up narrows the rule to non-spacing marks).

### 9. Test files import their own package through the `#/` alias

Where the plan's test code wrote `./x.js`.

- **Why:** the plan's own Global Constraints and every existing server test
  use the alias; the code blocks contradicted the constraint.
- **Cost if wrong:** none; both resolve.

### 10. Subagent commits carry the attribution of the model that ran

The first six commits carry the controller's instead, because the working
rules said so until an implementer questioned it. They were left as they are.

- **Why:** rewriting six local commits buys nothing.
- **Cost if wrong:** six commits credit the session's model rather than the
  one that transcribed the plan's code.

### 11. Registration carries no password; the code-bearing request sets it

`RegisterRequestDto` lost `password`; `ConfirmEmailRequestDto` gained it;
`AccountFlowStatus` gained `password_unset`. A sign-up stores a random password
nobody knows. **This changes the approved spec's wire contract (§5.3).**

- **Why:** account pre-hijacking. An attacker registers a victim's address
  with the attacker's password and never confirms. When the owner later
  registers, Supabase keeps the first password and only re-sends the code
  (first fact above). The owner confirms, an administrator approves, and the
  attacker's password works.
- **What the user sees is unchanged:** one form, then a code. The client holds
  the password until the code step.
- **Cost if wrong:** rework across Tasks 2, 4, 5, 6 and 7 (done here as "Task
  6b"), and B2b's client must send the password with the code and render
  `password_unset` — the rare case where the email is confirmed but the
  password could not be stored, finished through "forgot password".
- **Residual, not fixed:** an address pre-registered by someone else keeps that
  first display name. It is not a credential and the administrator sees it at
  approval; a rename belongs to B2c.

### 12. Code entry is limited per address as well as per caller

Five well-formed attempts per fifteen minutes per normalized email, shared by
confirm and reset, with no ban strike.

- **Why:** the reviewer rated the missing per-address bound an accepted
  residual. Supabase's own limits follow the forwarded caller IP, so a guesser
  with many addresses faced no bound, and a guessed reset code is an account
  takeover.
- **Cost if wrong:** see ruling 16.

### 13. No per-address limit on password attempts at `/login`

- **Why:** it would let anyone lock a named user out indefinitely, and a
  twelve-character four-class password is not guessable online.
- **Cost if wrong:** credential stuffing against one account is bounded only
  per caller IP and by the ban list. The whole-branch review pointed out that
  for an IPv6 caller this was no bound at all, because every per-IP limit keyed
  on the full address; ruling 19 keys an IPv6 caller by its /64.

### 14. A roster username may not contain `@`

`parseAuthUsers` throws at startup.

- **Why:** `/login` routes every identifier containing `@` to the accounts
  path, so such a roster user could never sign in and nothing would say so.
- **Cost if wrong:** if the production `AUTH_USERS` secret holds such an
  entry, the next deploy refuses to start until it is renamed.

### 15. `/mcp` refuses every token that carries account claims

Until B2c adds the administrator gate.

- **Why:** only the WebSocket upgrade re-checks an account's status, so a
  blocked account's token kept working on `/mcp` until it expired. B2c
  restricts `/mcp` to administrators anyway.
- **Cost if wrong:** a registered (non-roster) user has no MCP access in B2a.

### 16. The per-address lockout stays, and is charged only for a real guess

The limit moved from the handler into `AccountService`, immediately before the
store is asked; a request that fails local validation (a malformed code, a weak
password) spends nothing. Its table holds 50,000 addresses.

- **Why:** bounding distributed guessing of a six-digit code and letting anyone
  delay a named address cannot both be avoided without a longer code.
- **Cost if wrong:** anyone who sends five well-formed code attempts for an
  address makes it wait fifteen minutes to confirm or reset. Password sign-in
  is unaffected. If this is abused, the alternative is a longer code (Supabase
  allows up to ten digits).
- **Questioned by the whole-branch review, and changed:** the cost above
  counted one code. See ruling 18.

### 17. With accounts enabled, `AUTH_SECRET` must be at least 32 characters

- **Why:** it is the key that signs account and administrator sessions; the
  plan checked only that it was non-empty.
- **Cost if wrong:** if the production secret is shorter, the first deploy
  that sets the Supabase secrets refuses to start until it is rotated.

### 18. Codes are eight digits, not six

**This changes the approved spec.** The domain validator, the dev code
(`00000000`), the docs and the probe follow; the operator sets the Supabase
project's Email OTP length to 8.

- **Why:** the whole-branch review's arithmetic. Five tries per fifteen
  minutes is 480 a day per address, indefinitely (a fresh reset code can be
  requested every hour) and for every known address in parallel, and the
  limiter that enforces it lives in memory on a machine that scales to zero.
  At six digits that is about 0.05% a day per account — across 200 accounts,
  roughly one takeover every ten days. Eight digits makes it 100 times smaller.
- **Cost if wrong:** two more digits to type. If the project is left at six
  digits every confirmation fails; the probe now asserts the length.

### 19. The whole-branch review's bounded findings are fixed in this PR

The reviewer would have merged with two small fixes and done the rest "before
registration opens". Fixed here instead, in the one final fix wave:

- an IPv6 caller is keyed by its /64, so the per-IP limits and the ban list
  bind someone with a routed prefix;
- sending a code is limited to three an hour per address across register,
  resend and reset, with a fuse of 25 an hour for the whole server that answers
  `503` rather than let Supabase drop mail silently;
- a rate-limit answer from Supabase's verify endpoint reads as "unavailable",
  not as a wrong code with a ban strike;
- the Supabase session each sign-in creates is closed again (`scope=local`),
  so a confirmed-but-unapproved account cannot grow the session table;
- the smoke signs a token for the blocked seed and sees the socket refused;
- the container image itself marks a deployed machine (`RTC_DEPLOYED=1`), so
  the dev directory's refusal does not depend on the host being Fly.

- **Why:** the user asked for this workstream to be done properly rather than
  quickly, and each item is small and specified.
- **Cost if wrong:** a larger final diff reviewed once, instead of a follow-up
  PR reviewed on its own.

### 20. Three findings are not fixed here and block opening registration

Recorded in `docs/STATUS.md` as blocking for the last step of
`docs/DEPLOY.md` §4, not as optional follow-ups:

- **Cross-origin abuse.** The account endpoints answer CORS `*` and accept a
  body without `Content-Type: application/json`, so any website can make its
  visitors' browsers send sign-up, resend and code-entry requests from their
  own addresses. The fix is an origin allowlist plus a JSON content-type
  requirement; it needs the deployed client's origin, which is the user's to
  name.
- **Response time reveals a registered address** in Supabase mode (a known
  address runs a password hash or sends an email inside the request; an
  unknown one returns at once). The in-memory directory hides this with a
  dummy hash, so no test sees it. There is no project to measure against yet:
  the probe now prints per-call durations, and the choice between a
  response-time floor and detached sends follows the measurement.
- **Never-confirmed accounts are never purged.**

And as B2c requirements: a password reset, a block and a delete must close the
account's open sessions (today a reset leaves an attacker's eight-hour token
valid and an open socket untouched), and `access` must be read from the store
at use, not from the token claim.

- **Cost if wrong:** registration must not be opened until these are done.
  Rulings 21–23 and the whole-branch review add four more items to the same
  list: the levers that can pause new sign-ups, callers holding more than a
  /64, the unbounded resend and reset mail, and the live probe.

### 21. The hourly email fuse covers sign-up only

Ruling 19's fuse (25 sends an hour for the whole server, answering `503`)
first sat on all three sending paths. A security pass over that commit showed
the flaw: a resend or reset request for an address that has no account sends
nothing at Supabase, yet it spent the fuse, so 25 junk requests an hour would
have denied password resets to everyone. The fuse now covers `/register` only.

- **Why:** on sign-up every counted request really does spend the project's
  email allowance, so the fuse adds no new lever there; on the other two paths
  it was a cheap global lockout.
- **Cost if wrong:** see ruling 23.

### 22. The per-address throttles stay, although anyone can spend them

Three sends an hour and five code attempts per fifteen minutes, per address.

- **Why:** they block only new mail and new guesses. Mail already delivered
  stays usable, so the address's owner can still confirm or reset with the
  latest code received. B2b's screens must let a user enter a code without
  requesting a new one.
- **Cost if wrong:** a targeted nuisance against one address. A challenge at
  the edge (a CAPTCHA) is what removes it.

### 23. Bounding resend and reset mail properly is not built in this PR

A second security pass flagged ruling 21 in turn: without a fuse, junk accounts
(up to 25 new an hour, 200 a day, never purged) can each draw three resends and
three resets an hour and exhaust the email allowance, after which legitimate
codes are lost silently. The two findings pull in opposite directions. The
design that satisfies both: look the address up first, so only sends that will
really happen are attempted and counted (a resend only for an unconfirmed
account, a reset only for a confirmed, unblocked one); a separate fuse per
path; and purge never-confirmed accounts.

- **Why not now:** it adds an operation to the store's port, a query keyed by
  email, matching behaviour in the dev directory and probe coverage. That
  deserves its own reviewed change, not a second amendment made while the last
  fix wave was already running.
- **Cost if wrong:** if registration were opened without it, legitimate codes
  could be lost silently. It is item 7 of the list in `docs/STATUS.md` that
  blocks the last step of `docs/DEPLOY.md` §4, and the deployed server stays
  in `disabled` mode until the Supabase secrets are set.

## Plan defects the reviews found

Fixed in the code; listed because the plan's text mandated each one.

| Plan said | Problem | Now |
|---|---|---|
| Display name: reject control characters only | Zero-width and bidi-override characters passed | Ruling 8 |
| Email: any non-space character | Lookalike and control characters passed | Ruling 7 |
| `signUp`: any other 4xx → `unavailable` | Supabase's per-address throttle revealed a registered address | `over_email_send_rate_limit` → `sent`. Its cost: the same code means the project's email allowance is spent, so mail can be lost silently — hence the fuse in ruling 19 and the required custom SMTP sender |
| A 401 from Supabase → wrong password / invalid code / sent | A rotated or mistyped key read as a verdict about the user | 401, or 403 with no error code → `unavailable` |
| Confirm with `type: "email"` | A reset code worked at `/confirm-email` (third fact above) | `type: "signup"` |
| The daily cap: count, then sign up | A concurrent burst passed the cap | In-flight sign-ups are counted |
| `REGISTRATION_OPEN !== "false"` | `0`, `FALSE` or a trailing newline left sign-up open | Anything but `true` / `false` refuses to start |
| The status lookup had no `try` | A throwing store rejected the upgrade instead of failing closed | Reads as `unavailable`, never cached |
| The probe: in no typecheck or lint program | It would rot silently | `tsconfig.scripts.json`, and the typed ESLint program includes it |

## Left open after the final fix wave

The whole-branch review's findings were fixed in one wave and re-reviewed
once: every finding addressed, nothing new of consequence. The process allows
one wave, so these six small items were parked rather than fixed. None changes
behaviour a user or operator relies on.

| Item | Why it was left |
|---|---|
| The comment on `readErrorCode` says a Supabase API-version header would make every refusal read as "unavailable". In fact a wrong password would read as `invalid`, a code as `invalid_code`, a reset update as `rejected`. | Comment only; nothing sends that header. |
| Two comments say every sign-up the email fuse counts really sends mail. The fuse is charged before the daily-cap count, so a registration that is then refused, or a repeat for a confirmed address, also spends it. | Accuracy only; the lever is item 5 of the blocking list. |
| Keying an IPv6 caller by its /64 puts every device of one home or office network under the eight-connection cap and one ban, as IPv4 NAT already does. | Part of the NAT-posture decision that is already the user's. |
| The smoke checks that a blocked account's token cannot open a socket, not that the refusal was the `403`. A control token for an active account rules out a format or secret drift. | Test strength only. |
| No test asserts the logout after a failed password update, exactly one logout per sign-in, or the logout when Supabase returns no user id. | Gaps on a best-effort call; the mutant for the logout itself is killed. |
| NAT64, SIIT, IPv4-compatible and Teredo prefixes each collapse to one key shared by unrelated callers. | Not reachable through Fly's header in practice. |

## Mutants

92 mutants, one or more per security rule: 89 killed. The three survivors are
equivalent mutants, not test gaps:

- the in-memory directory's first "already confirmed" guard — a second guard
  after the password hash refuses the same case;
- stripping an IPv6 zone id — the zone sits in the last hextet, which the /64
  key discards;
- the `try/catch` around the logout — the call it wraps already turns every
  failure into a value.

## What a live project must still prove

`pnpm --filter @rtc/server accounts:probe` has not been run. Until it prints
`PASS`, these are expectations from Supabase's source and documentation:

- the error codes the adapter maps (`email_not_confirmed`, `otp_expired`,
  `over_email_send_rate_limit`, `user_already_exists`);
- `Content-Range` on an empty `profiles` table;
- a wrong password on an unconfirmed account answers `invalid`;
- a sign-up on an existing address answers `sent`;
- a recovery code presented to `confirmEmail` answers `invalid_code`, and is
  still usable for the reset that follows;
- sign-up metadata cannot set `role`, `approved` or `blocked`.

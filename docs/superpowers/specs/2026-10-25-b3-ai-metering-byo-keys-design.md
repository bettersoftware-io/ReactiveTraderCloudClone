# B3 — per-user AI metering, the brain indicators and bring-your-own keys — design

**Date:** 2026-10-25 · **Status:** approved by the user 2026-10-25
**Builds on:** [public-launch hardening](2026-09-27-public-launch-hardening-design.md)
§"B3 — AI metering" and §10 (bring-your-own model keys), finding S7. Storage was
settled there as D5: the same Supabase project as the accounts
([B2 design](2026-10-04-b2-user-management-design.md) §5.1). This document records
what the user decided on 2026-10-25 and how it fits the code on `main`
(`8ade5ff19`).

## 1. Purpose

Real Claude is about to be offered to strangers. Today one in-memory meter
counts everybody's spend together over a rolling five-hour window, and a
restart resets it (S7: "treat today's gate as a display, not a limit"). B3
makes the AI budget a real limit:

- each approved person gets a small daily allowance on the house key, kept in
  the database so nothing resets it early;
- when it runs out Jarvis keeps working on the scripted brain instead of
  refusing;
- everyone can see, while talking to Jarvis, whether a real model or the
  script is answering, which model, and on whose key;
- anyone who wants more brings their own key and sets their own daily limit.

Success: a stranger from the public post can use Jarvis on real Claude for a
handful of questions a day, can never cost the operator more than the
house-wide cap on any day, and is never in doubt about which brain answered.

## 2. Decisions

"User" rows were decided by the user on 2026-10-25; "my call" rows are the
author's and are open to correction.

| # | Decision | Source |
|---|---|---|
| D1 | Approved accounts get **Claude Haiku 4.5 and Claude Sonnet 5** on the house key, **Haiku by default**. Opus is not offered on the house key. | user |
| D2 | Each person has a **daily house budget of $0.20**, counted in estimated dollars, so Sonnet uses it about three times faster with no extra rule. | user (amount proposed, accepted) |
| D3 | A **house-wide daily cap of $3**. Past it every house-key user is on the scripted brain until the day resets. | user (proposed, accepted) |
| D4 | The day is the **UTC calendar day**; budgets reset at 00:00 UTC. | user (proposed, accepted) |
| D5 | When a person's budget or the house cap is spent, Jarvis **switches to the scripted brain** until the reset. It never refuses outright and never falls through to another key. | user |
| D6 | Both amounts are **env settings** on the server, changeable on Fly without a code change. | user (proposed, accepted) |
| D7 | The server-wide five-hour meter and its soft/hard gate are **replaced** by the per-user daily meter. There is no soft stage: the check before every model request bounds the overshoot (§3.4). | proposed, accepted; dropping the soft stage is my call |
| D8 | Three brain **indicators** in the Jarvis overlay, each an independent switch in Preferences: the **header readout** (on by default), the **reply tag** (on by default), the **input-bar brain pill** (off by default). The footer chip stays as it is. | user |
| D9 | **Bring your own key** for three providers: **Anthropic, OpenRouter and OpenAI**. OpenRouter and OpenAI share one OpenAI-compatible loop. Each provider offers a **curated model list**, not a free-text model field. | user (list proposed, accepted) |
| D10 | The key is held in the browser in **sessionStorage**, with an opt-in **"Remember on this device"** that moves it to localStorage. Either way it is **wiped at sign-out** and on an account switch. It is never stored on the server and never encrypted in the browser (§5.2 says why). | user |
| D11 | Each person sets a **daily dollar cap on their own key**: default **$1**, adjustable, or "no limit". Reaching it switches Jarvis to scripted until the reset, like D5. | user |
| D12 | Three PRs: **B3a** metering, **B3b** indicators, **B3c** bring-your-own key. | my call (stated to the user) |
| D13 | A failing own key (refused, revoked, out of credit) **fails the turn with a clear message** naming the provider; it never quietly falls back to the house key. | my call (stated to the user, not contradicted) |
| D14 | **One own key per person at a time**, for one provider. Setting a key for another provider replaces it. The $1 cap (D11) is per person, not per key. | my call (builder check) |
| D15 | Own-key turns with a cap **fail closed** like the house key when the spend store is unreachable (scripted, readout says why). With "no limit" they run regardless, and their spend is still recorded, best effort, so the readout can show it. | my call (builder check) |
| D16 | Own keys work **even when the house key is off** — no `ANTHROPIC_API_KEY`, or either daily amount set to `0`. Jarvis is then available with scripted plus the own-key brains, so the operator can switch the house key off in a cost emergency without taking real AI away from people who brought a key. Anthropic clients for own keys are created per connection. | my call (builder check) |
| D17 | **Administrators and the roster persona** get every house model, Opus included, with **no personal limit**; their spend **counts toward the house-wide cap**, so a long admin session can put everyone else on scripted for the rest of the day. The Console limit stays the backstop. | user (recommendation approved) |
| D18 | With an own key set, the picker shows **both groups**: "House key" (the caller's house brains) and "Your key" (the provider's curated models). The selection is **key + provider + model**, so a person can use their free daily allowance first. | user (recommendation approved) |
| D19 | **Narrator turns** (the proactive commentary, on by default) **run on the scripted brain when the caller is on a house brain**; on an own-key brain they run on the selected brain and count against the person's own cap. A new origin field on the chat frame (`"user" | "narrator"`) carries this, through all three application cores. | user (recommendation approved) |

## 3. B3a — per-user metering on the house key

### 3.1 Who gets what

| Caller | House brains offered | Budget |
|---|---|---|
| Approved account, role `user` | scripted, Haiku 4.5, Sonnet 5 | $0.20/day + house cap |
| Approved account, role `admin` | scripted, Haiku 4.5, Sonnet 5, **Opus 5** | **no personal limit**; spend counts toward the house cap (D17) |
| Roster persona (the one private persona on Fly, `accountId` null) | same as admin | same as admin (D17) |
| Demo-roster login in the browser | scripted only, in-browser (unchanged — never reaches the server) | none |

`Caller` (`services/serviceContainer.ts`) already reaches every connection's
scoped container since B2c. The meter keys a person by `account:<accountId>`
for an account and `roster:<username>` for a roster persona. `Caller` carries
no role, so the role is read from the account directory at use — the same way
`accountAdminService` reads `access` today, never from the eight-hour token
claim — once per connection and again on each availability push.

### 3.2 What is stored

One new table in the Supabase project, created by a migration under
`supabase/migrations/`, private to the server exactly like `profiles` (RLS on,
no policies, `revoke all … from anon, authenticated`; `migrations.test.ts`
pins it the same way):

```
jarvis_spend_daily (
  owner      text    -- 'account:<uuid>' | 'roster:<username>' | 'house'
  day        date    -- UTC day
  key_kind   text    -- 'house' | 'own'
  spend_usd  numeric not null default 0
  turns      integer not null default 0
  primary key (owner, day, key_kind)
)
```

The `house` owner row is the house-wide total for D3. A Postgres function
`record_jarvis_spend(owner, day, key_kind, usd)` adds to the person's row and,
for `key_kind = 'house'`, to the house row in the same transaction, upserting
both, and returns the new totals. The server calls it over the same plain
`fetch` + secret key path `SupabaseAccountDirectory` uses (no SDK). Rows older
than 35 days may be deleted by the existing hourly maintenance job (builder's
choice whether to add it now).

Dev and test modes mirror the accounts modes (`resolveAccountsMode`): with
Supabase configured the store is Supabase; `RTC_DEV_ACCOUNTS=1` or the
disabled mode get an in-memory store with the same interface. No silent
fallback from Supabase to memory.

### 3.3 The turn, step by step

1. A `jarvis.chat` frame is dequeued (the existing `concatMap` queue).
2. The server resolves the brain the caller asked for against what the
   caller is offered (D1, §3.1).
3. If it is a house brain, the server reads the caller's spend and the house
   spend for today. If either is at or over its limit, the turn runs on the
   scripted brain (D5) and the reply is attributed to scripted (§4.3).
4. During the turn, **before every model request** — the Anthropic tool
   runner makes up to `JARVIS_RUNNER_MAX_ITERATIONS` (8) requests per turn —
   the session checks the running total again and stops the turn cleanly if a
   limit has been crossed mid-turn, with the reply ending on a short system
   line ("Today's AI budget is used — switching to the scripted brain.").
5. After every model request the server records its cost through
   `record_jarvis_spend` and updates the in-process copy.

The read in step 3 can be served from an in-process copy refreshed from the
database at the first turn of a connection and after every write; Fly runs one
machine, so the copy and the table agree. The builder may choose the caching,
provided a restart never resets a budget and the check happens before each
request.

### 3.4 How far a turn can overshoot

The check before each request means a turn can cross the limit by at most
one request. One request is bounded by `JARVIS_MAX_TOKENS_PER_TURN` (4,096
output tokens) and the input caps already in place (text 4,000 chars,
history 20 × 2,000 chars, a ~2.1k-token persona-plus-tools prefix measured
2026-08-04, [running-real-jarvis.md](../../running-real-jarvis.md)). On
Sonnet that is roughly $0.03 input + $0.06 output ≈ **$0.10 worst case**, on
Haiku ≈ $0.03. A typical turn is far smaller: one or two requests of ~3k
input and a few hundred output tokens, about **$0.01 on Haiku, $0.03 on
Sonnet**, so $0.20 is roughly 20 Haiku or 7 Sonnet turns. These are estimates
from the documented prefix size, not a measured live turn; the first live
turns after the deploy should be compared against them (§8).

### 3.5 Cost

The existing `JARVIS_PRICE_TABLE` and `estimateCostUsd` arithmetic (cache
reads at 10 %, cache writes at 125 % of the input price) stay the source of
the house-key estimate. The estimate is what the limits are enforced
against; the Anthropic Console spend limit stays on as the final backstop.

### 3.6 When the store is unreachable

Fail closed for the house key: if the spend cannot be read or written, house
turns run on the scripted brain and the indicator says so ("AI budget
unavailable"). `/health/accounts` already reports the store's state; no new
health endpoint.

### 3.7 Settings

| Setting | Default | Meaning |
|---|---|---|
| `RTC_JARVIS_USER_DAILY_USD` | `0.20` | D2. `0` turns the house key off for everyone. |
| `RTC_JARVIS_HOUSE_DAILY_USD` | `3` | D3. `0` turns the house key off for everyone. |
| `RTC_JARVIS_FORCE_GATE` | unset | Kept for eyeballing: `exhausted` forces every caller onto scripted as if the budget were spent. Its old values `soft`/`hard` are retired. |
| `RTC_JARVIS_FAKE=1` | unset | Unchanged kill switch: scripted only, for house **and** own keys. |

Removed: `RTC_JARVIS_BUDGET_USD`, `RTC_JARVIS_BUDGET_SOFT_RATIO`. A malformed
value warns and uses the default, as the gate settings do today. The
inventory in [security.md](../../security.md) and the DEPLOY docs carry the
names and meanings, never values specific to the deployed instance.

### 3.8 What else moves

- `UsageMeter`'s five-hour window and `JarvisGateService`'s timer-armed lift
  give way to the daily store. The lift becomes "the day changed": the
  availability push re-runs at the next 00:00 UTC for every live connection
  that was gated.
- `JARVIS_AVAILABILITY` becomes per connection: the brains offered to this
  caller, the default, and the caller's budget state —
  `{ keyKind: "house" | "own", spentUsd, limitUsd | null, exhausted, resetsAtMs }`
  plus why it is exhausted (`"user" | "house" | "unavailable" | "forced"`).
- The Ops **Jarvis usage** card shows **today's house-wide spend against the
  cap** and the per-model rows for today. Own-key spend is not shown there.
- The existing budget-downgrade system line becomes the D5 switch line.

## 4. B3b — the brain indicators (web clients)

Both web clients, React and Solid, byte-identical CSS as with every overlay
surface. The React Native client has no Jarvis chat and is out of scope.

### 4.1 Header readout (default on)

One line under the J.A.R.V.I.S title and state line, with a thin meter under
it, as in the mockup the user chose:

- live, house key: `CLAUDE HAIKU 4.5 · HOUSE KEY · $0.14 OF $0.20 LEFT TODAY`
- live, own key: `CLAUDE SONNET 5 · YOUR KEY · $0.62 OF $1.00 TODAY`, or
  `· NO DAILY LIMIT`
- scripted by choice: `SCRIPTED`
- scripted because spent: amber, `SCRIPTED · TODAY'S AI BUDGET USED · BACK AT 00:00 UTC`
  (or `· HOUSE AI BUDGET USED`, `· AI BUDGET UNAVAILABLE`)
- demo login: `SCRIPTED · DEMO`

The meter is a static bar (width only changes between turns); no animation,
per [performance.md](../../performance.md).

### 4.2 Reply tag (default on)

Every Jarvis reply carries a small tag naming the brain that wrote it
(`CLAUDE HAIKU 4.5`, `GPT-…`, `SCRIPTED`). Scrolling back, a reader can tell
real answers from scripted ones. The one-line switch notice (D5) appears at
the point the brain changed. The tag is attributed by the **server**: the
turn's events carry the brain that actually ran, because the server may
resolve a different brain than the client asked for (§3.3 step 3).

### 4.3 Input-bar brain pill (default off)

A pill inside the input bar showing the model and what is left
(`HAIKU 4.5 · $0.14 ▾`); clicking it opens a small menu to switch brain —
the brains offered to this caller, plus the own-key models once a key is set —
without opening Preferences. It writes the same `jarvisBrain` preference the
Preferences picker writes.

### 4.4 The switches

Three new boolean preferences in `@rtc/domain`'s preferences, persisted like
every other preference (the ~10-site preference blast radius applies),
shown in Preferences under the Jarvis brain picker:

| Preference | Default |
|---|---|
| `jarvisShowHeaderReadout` | `true` |
| `jarvisShowReplyTags` | `true` |
| `jarvisShowBrainPill` | `false` |

Names are the builder's to adjust to the codebase's naming rules.

### 4.5 Goldens

New visual scenarios for each indicator state above (at minimum: house live,
own key, spent, demo, each switch off), accepted by the user by eye as with
earlier UI rounds.

## 5. B3c — bring your own key

### 5.1 Providers and models

| Provider | Host (fixed, server-side) | Loop | Models |
|---|---|---|---|
| Anthropic | `api.anthropic.com` | the existing Anthropic loop, given the user's key | Haiku 4.5, Sonnet 5, Opus 5 |
| OpenRouter | `openrouter.ai` | new OpenAI-compatible loop | a short curated list of models that handle tool calls reliably |
| OpenAI | `api.openai.com` | the same OpenAI-compatible loop | a short curated list |

The curated lists, their display labels and their prices live in the
codebase; choosing the initial models is the builder's, with a test that each
listed model completes a tool-calling turn (run by hand with a real key
before merge, not in CI). The provider's address is **never** taken from the
client: the client sends a provider id from a closed set, the server maps it
to the host.

`JarvisBrain` widens from four strings to a key kind plus a provider plus a
model id (spec §10 "widen the brain model", D18). The stored preference, the wire and the
picker carry that pair; the label map and type guard follow.

The OpenAI-compatible loop must reproduce what the Anthropic loop does
today: streamed deltas, the `@rtc/agent-tools` tools translated to function
tools, the confirm gate on `execute_trade`, `render_panel`, `drive_app`, the
iteration cap, cancel, and the sanitized error copy. Its HTTP client is the
builder's choice (plain `fetch` or the `openai` package); if an SDK is used
it gets the same confinement rule the Anthropic and MCP SDKs have
(dependency-cruiser allowlist to `packages/server/src/agent/`).

### 5.2 Where the key lives, and why

The threat that matters is script running on the page (an XSS bug, a
compromised dependency, an extension). It can read localStorage,
sessionStorage and memory alike, so storage choice changes only how long the
key is exposed. Encrypting the key in the browser does not help: whatever
decrypts it lives on the same page (a non-extractable WebCrypto key can still
be *used* by injected script). Keeping keys on the server is ruled out by §10
of the parent spec.

So (D10):

- default **sessionStorage**: survives a reload, gone when the tab closes;
- opt-in **"Remember on this device"**: localStorage;
- both **wiped at sign-out**, on an account switch, and on a session ended by
  the server (B2c's visible session end);
- shown back **masked** (`sk-ant-…a1b2`) with Replace and Remove; never
  rendered in full after entry, never put in a URL, `history.state`, a
  `data-*` attribute, a log line or an error message.

The real protection is a key with its own spend limit at the provider. The
Preferences section says, **before the field**, in plain words: what happens
to the key (stays in this browser, sent to our server only to make your
requests, held in memory for your connection, never stored or logged), and
recommends creating a dedicated key with a spend limit (Anthropic Console
workspace limit, OpenAI project budget, OpenRouter per-key credit limit).

**No Content-Security-Policy header is sent today** (checked 2026-10-25: none
in `vercel.json` or the pages). B3c adds one for both web clients, tight
enough to block inline and third-party script, and verifies the deployed
sites still boot (Vercel, the devtools page, the WebSocket and `/login`
origins). This protects the house session token as much as the key.

### 5.3 How the key reaches the server

A new client message sets the key for the connection: provider id, the key,
the daily cap (dollars or null for no limit). It is sent after the socket
authenticates, again after every reconnect, and a "clear" form removes it.
The server:

- refuses a provider id outside the closed set;
- checks the key once with the provider's cheapest read (a models-list call,
  no tokens spent) and answers accepted or refused, never echoing the key;
- holds the key in the connection's scope only; it is gone when the socket
  closes;
- never logs it: the malformed-frame logging already omits payloads
  (`describeMalformedFrame`); the new message gets the same treatment and a
  test that a refused or malformed key frame's log line does not contain the
  key.

Demo-roster logins never see the key section (they never reach the server).

### 5.4 Limits on an own key

- Own-key turns skip the house budget and the house cap.
- The person's own daily cap (D11) is enforced exactly like the house budget
  (§3.3, §3.4), from `jarvis_spend_daily` rows with `key_kind = 'own'`.
  "No limit" skips the check.
- Cost: Anthropic and OpenAI from the price table; OpenRouter from the cost
  each response reports. The UI calls it an estimate and points at the
  provider limit as the real backstop.
- The server's rate limits (connection caps, token bucket, chat text caps)
  apply unchanged.
- A failing key (D13): the turn ends with an error naming the provider
  ("Anthropic refused your key"), and the indicator shows the key as refused;
  the person can replace it or switch back to the house brains.

## 6. Non-goals and anti-goals

- **Not** a billing system: no payments, no top-ups, no per-user Opus on the
  house key.
- **Not** storing anyone's key on the server, ever, in any form.
- **Not** a free-text endpoint or model field (a free endpoint turns the
  server into a relay to any address).
- **Not** the React Native client (no Jarvis chat there).
- **Not** a per-user usage view in the Users panel (possible later).
- Anti-goal: a user ever being unsure whether a reply came from a real model.
- Anti-goal: a stranger's turns ever spending on the house key after their
  budget or the house cap is spent, including across a restart.

## 7. Questions settled after the builder check

The builder check (2026-10-25) raised six; three were the user's and are
D17–D19, three were settled as D14–D16.

## 8. Acceptance

- A restart in the middle of a day does not reset anyone's spend (witnessed
  with the in-memory store reloaded from a fake persistent store, and once
  live after the deploy).
- A caller over budget gets scripted replies, attributed as scripted, and
  the readout says why; at 00:00 UTC (fake timers) the availability push
  lifts it without a new frame from the client.
- Two callers have independent budgets; the house cap stops both.
- An admin has no personal limit but is counted in the house cap.
- A narrator turn from a house-brain caller runs scripted and costs nothing.
- A turn crossing the limit mid-turn stops before its next request.
- The key never appears in a log line, an error payload, a URL or the DOM
  after entry (tests on the server log and the client render).
- Each indicator switch on and off renders as in §4, in both web clients,
  goldens accepted by eye.
- After the deploy, the first few live turns' recorded costs are compared
  with §3.4's estimates and the comparison is noted in STATUS.

## 9. Left to the builder

The exact wire message names and payload shapes, the caching in §3.3, the
curated model lists and their labels, the OpenAI-compatible loop's HTTP
client, the CSP's exact directives, preference names, and the plan's task
breakdown inside each of the three PRs.

## 10. Rollout (each PR)

- **B3a:** apply the migration before deploying the server (the server reads
  the table on every house turn); deploy the server and both web clients
  together (the availability payload changes shape); set the two env
  settings on Fly if the defaults are not wanted.
- **B3b:** both web clients.
- **B3c:** server and both web clients; check the deployed sites boot under
  the new CSP.

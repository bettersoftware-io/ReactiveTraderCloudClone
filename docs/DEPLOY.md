# Deploy

The web clients deploy to **Vercel**, the WebSocket server to **Fly.io**
(London, `lhr`). Deploys are **on-demand only** — the single official way is to
run `.github/workflows/deploy.yml` manually (Actions tab → "Deploy" → Run
workflow, or `gh workflow run deploy.yml`). One workflow deploys any subset of
three independent targets via checkboxes — `deploy_react` (→
`rtc-clone-react.vercel.app`), `deploy_solid` (→ `rtc-clone-solid.vercel.app`),
and `deploy_server` (→ Fly) — plus `include_sourcemaps` to ship a debuggable
client build. Each ticked target is smoke-checked. Nothing auto-deploys on a
push or merge, on any branch: Vercel's Git integration is turned off by
`"git": { "deploymentEnabled": false }` in each client's `vercel.<client>.json`
(`vercel.react.json` / `vercel.solid.json`), so the workflow is the only path.
Access is gated by genuine
per-user login, not a shared password or token. The deployed web build is
**hybrid** ([`docs/authentication.md` §6](authentication.md#6-hybrid-data-source-one-deployment-two-modes)):
credentials matching the committed demo roster are verified in the browser
and run the in-browser simulators, and any other credentials are POSTed to the
Fly server's `/login`, which validates them against its `AUTH_USERS` roster —
or, for an email address, against its account store
([§4](#4-supabase-account-store)) — and returns a signed session token that
gates the WebSocket upgrade.

## One-time setup

You need accounts on Vercel, Fly.io, and GitHub admin on this repo.

### 1. Fly.io (server)

    fly auth login
    fly launch --no-deploy --name rtc-clone-server --region lhr   # accept the existing fly.toml
    fly secrets set AUTH_SECRET="$(openssl rand -hex 32)"          # HMAC session-token signing secret
    fly secrets set AUTH_USERS="user1:pass1,user2:pass2"           # real roster — ask the team, never invent one
    fly tokens create deploy                                        # copy → GitHub secret FLY_API_TOKEN

`AUTH_SECRET` and `AUTH_USERS` are set as Fly secrets **by hand** — the deploy
workflow's `FLY_API_TOKEN` can only deploy code, not manage secrets. Credentials
are never published in this repo; ask the team for the real roster.

### 2. Vercel (client)

    vercel login
    vercel link            # create/select the project; note Org ID + Project ID

In the Vercel dashboard → Project → Settings → Environment Variables, add for
**Production**:

    VITE_SERVER_URL = wss://rtc-clone-server.fly.dev

That's it — no client-side token or password to set. The deployed client logs
in against the Fly server directly, the same as local dev pointed at a live
server.

### 3. GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret:

    FLY_API_TOKEN            = <from `fly tokens create deploy`>
    VERCEL_TOKEN             = <vercel.com/account/tokens>
    VERCEL_ORG_ID            = <from `vercel link` / .vercel/project.json>
    VERCEL_REACT_PROJECT_ID  = <the rtc-clone-react project's id>
    VERCEL_SOLID_PROJECT_ID  = <the rtc-clone-solid project's id>

### 4. Supabase (account store)

Registered accounts (B2a, [`authentication.md` §7](authentication.md#7-registered-accounts-b2a))
live in a Supabase project that only the Fly server talks to. The
project-side reference is [`supabase/README.md`](../supabase/README.md); this
is the rollout, in the order it must be done. Every step is **yours** — none
happens on its own, and none is done by a deploy.

**Until the step 12 deploy the deployed server runs in `disabled` mode** (step 11 only stages the secrets):
registered logins answer `503 unavailable`, `/health/accounts` answers
`disabled`, and everything else — demo accounts, roster logins — works as
before. Merging B2a changes nothing on the deployed server until you
redeploy it.

**Unproven until step 9 passes.** The server's Supabase adapter is tested
against replayed copies of the responses Supabase documents; it has never
run against a real project. Until the probe prints `PASS`, its agreement
with Supabase's real answers is unproven. If a check prints `✗`, stop: the
adapter's mapping for that operation needs a fix (a follow-up PR against
`packages/server/src/accounts/SupabaseAccountDirectory.ts`) before you go
on.

Two choices are still open and change no code: which **email sender and
domain** to use (step 1), and whether to keep the free plan with the
`accounts-keepalive.yml` workflow or pay for **Supabase Pro**, which removes
pausing outright (step 14).

The Supabase dashboard menu names in steps 2–8 are as of October 2026;
Supabase moves them.

1. **Email sender.** Choose an SMTP provider and a sending domain you
   control, and add the provider's DNS records (SPF, DKIM) for it.
   *Done:* the provider shows the domain verified, and you have its SMTP
   host, port, user and password. **This is required, not optional.**
   Supabase's built-in sender allows only a couple of emails an hour, and a
   sign-up Supabase throttles still answers "code sent" — so with the
   built-in sender a busy hour silently loses sign-ups, and nobody is told.
2. **Create the project** in the Supabase dashboard, region London
   (`eu-west-2`, next to Fly `lhr`), separate from any other project.
   *Done:* the project is up; note its URL, `https://<ref>.supabase.co`.
   Keep that URL private. [`privacy.md`](privacy.md) names this region —
   change it there if you choose another.
3. **Apply the migration** `supabase/migrations/20261004000000_create_profiles.sql`
   (paste it into the SQL editor and run it, or `supabase db push`).
   *Done:* Table editor shows `public.profiles` with row-level security
   enabled and no policies.
4. **Auth providers** (Authentication → Sign In / Providers). Email: enabled,
   *Confirm email* on, minimum password length 12, new sign-ups allowed.
   **Phone** and **Anonymous**: disabled — `profiles.email` is `not null`, so
   such a user would break the profile trigger. *Done:* only Email is
   enabled.
5. **SMTP and templates** (Authentication → Emails). Enter the step 1
   sender under *SMTP settings*. Paste `supabase/templates/confirm-signup.html`
   into *Confirm signup* and `supabase/templates/reset-password.html` into
   *Reset password*; both print the code (`{{ .Token }}`), not a link. Set
   **Email OTP length to 8** (Authentication → Sign In / Providers → Email)
   and leave its expiry at an hour or less. The server refuses a code of any
   other length before it reaches Supabase, so a project left at the default
   6 would make every confirmation and every reset fail.
   Then set the project's email rate limit under Authentication → Rate
   limits to **at least 60 an hour**: the server stops new sign-ups at 25
   an hour (`EMAIL_SENDS_PER_HOUR_MAX`) and answers 503, which leaves the
   rest for resends and password resets. A send over Supabase's own limit
   is lost silently, as in step 1. *Done:* custom SMTP enabled, both templates
   saved, Email OTP length 8.
6. **IP forwarding** (Authentication → Rate limits): enable IP address
   forwarding. The server sends each caller's IP as `Sb-Forwarded-For`, so
   Supabase's per-IP limits apply to each visitor rather than to the
   server's one address. *Done:* the setting is on.
7. **Sessions.** Every sign-in and every verified code through the server
   opens a Supabase session, which the server logs out (`scope=local`) as
   soon as it has used it. A logout that fails is ignored, so a session can
   still be left behind now and then; if your plan offers a session time-box
   (Authentication → Sessions), set one as a backstop.
8. **Secret key** (Project Settings → API Keys): create a **secret** key
   (`sb_secret_…`). It bypasses row-level security: it goes only into the
   probe's shell and the Fly secret below, never into a client, a file or a
   chat. Do not hand out the project's publishable key either: with the URL
   it allows a direct `/auth/v1/signup` that skips the server's rules (such
   an account still needs approval and cannot read `profiles`).
9. **Run the probe** from an up-to-date checkout of `main` (after `pnpm
   install`), with the secret typed at a prompt rather than on the command
   line:

       read -rs SUPABASE_SECRET_KEY && export SUPABASE_SECRET_KEY
       SUPABASE_URL=https://<ref>.supabase.co PROBE_EMAIL_DOMAIN=<your domain or test inbox> \
         pnpm --filter @rtc/server accounts:probe

   `PROBE_EMAIL_DOMAIN` is a domain you control or a test inbox: the probe
   sends **one real confirmation email** there, which is also your check
   that steps 1 and 5 work (it shows an 8-digit code; the probe also fails
   if the codes it obtains are not eight digits). It creates two
   throwaway accounts: the first (`probe-<timestamp>@…`) is walked through
   confirm, sign-in and reset; the second (`probe-fresh-<timestamp>@…`) is a
   real sign-up, checked only for a password nobody knows. It deletes both
   and prints only account ids and outcomes. *Done:* the last line is
   `accounts probe: PASS`, both `cleanup` lines are `✓`, **and** the
   confirmation email arrived at the probe domain — the probe passes whether
   or not it arrives, so only you can check that. If a cleanup failed,
   delete the account whose id that line printed (Authentication → Users);
   if the probe was killed before its cleanup, no id was printed, so search
   Authentication → Users for addresses starting with `probe-`. The probe
   does not check steps 6 and 7.
10. **Check the server's other secrets.** With accounts on, the server will
    not start unless `AUTH_SECRET` is at least 32 characters (trimmed), and
    no `AUTH_USERS` username may contain `@`. Fly does not show secret
    values, so if you are not sure, rotate the secret now (this signs every
    user out once):

        fly secrets set --stage AUTH_SECRET="$(openssl rand -hex 32)" -a rtc-clone-server

    and re-set `AUTH_USERS` without any `@` if you ever put one in.
11. **Set the account secrets on Fly:**

        fly secrets set --stage SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY="$SUPABASE_SECRET_KEY" -a rtc-clone-server

    Add `REGISTRATION_OPEN=false` to the same command to keep sign-up
    closed while you check the result. Run it in the shell from step 9, so
    `$SUPABASE_SECRET_KEY` still holds the key and the key itself never
    appears on a command line. `--stage` is flyctl's documented way to store
    secrets without restarting the machine (confirm with `fly secrets set
    --help`); the next deploy picks them up. Without it, Fly
    restarts the machine at once on the image it is already running — and a
    server that refuses to start (below) is an outage until it is fixed.
12. **Deploy the server:** run `deploy.yml` with `deploy_server` ticked
    (`gh workflow run deploy.yml -f deploy_server=true`). *Done:* the
    workflow's `/health` smoke passes, and

        curl -s https://rtc-clone-server.fly.dev/health/accounts

    answers `{"ok":true,"directory":"up"}`. `disabled` means the secrets did
    not reach the machine; `down` means the server cannot read the project
    (a wrong key reads as `down`, not as an error). If the machine does not
    come up, `fly logs -a rtc-clone-server` shows which refusal stopped it:

    **The server will not start if:**
    - `SUPABASE_URL` is set without `SUPABASE_SECRET_KEY`, or the reverse;
    - `SUPABASE_URL` does not start with `https://`;
    - an account mode is on and `AUTH_SECRET` is empty or shorter than 32
      characters (trimmed);
    - `REGISTRATION_OPEN` is anything but `true` or `false`;
    - an `AUTH_USERS` username contains `@`, or `AUTH_USERS` is set with an
      empty `AUTH_SECRET`;
    - `RTC_DEV_ACCOUNTS=1` is set (Fly sets `FLY_APP_NAME` on every machine
      and the image sets `RTC_DEPLOYED=1`, and the dev directory is refused
      when either is), or set together with `SUPABASE_URL`.
13. **Make yourself the administrator.** Register, confirm and sign in with
    `curl` (B2b adds the screens; the password goes into your shell history
    unless the line starts with a space):

        SERVER=https://rtc-clone-server.fly.dev
        curl -s $SERVER/register -H 'Content-Type: application/json' \
          -d '{"email":"you@example.com","displayName":"Your Name"}'
        # → {"status":"code_sent"}; the code arrives by email
        curl -s $SERVER/confirm-email -H 'Content-Type: application/json' \
          -d '{"email":"you@example.com","code":"12345678","password":"<12+ chars, Aa1!>"}'
        # → {"status":"pending_approval"}

    (`/register` needs `REGISTRATION_OPEN` unset or `true`.) Then in the SQL
    editor:

        update public.profiles set role = 'admin', approved = true
        where email = 'you@example.com';

    *Done:* `curl -s $SERVER/login -H 'Content-Type: application/json' -d
    '{"username":"you@example.com","password":"…"}'` answers `200` with a
    token, and the deployed web client signs in with the email address typed
    as the username.
14. **Keep-alive or Pro.** `accounts-keepalive.yml` already runs Monday and
    Thursday at 07:17 UTC: it reads `/health/accounts`, which is the activity
    that keeps a free-plan project from pausing, and fails on `down` (GitHub
    emails you) — passing quietly on `disabled`. Supabase does not guarantee
    the read prevents pausing; Supabase Pro removes pausing outright. *Done:*
    you have chosen; a manual run of the workflow (`gh workflow run
    accounts-keepalive.yml`) is green.

**Approving and blocking** (until the B2c Users panel): edit `approved` /
`blocked` on the account's `profiles` row in the table editor. A change
applies at the account's next sign-in, and to an open session within 60
seconds, at its next connect — a socket already open stays open until it
reconnects. **Deleting an account** (a privacy request,
[`privacy.md`](privacy.md)): delete the user under Authentication → Users;
its profile goes with it.

**Closing sign-up without a code change:**
`fly secrets set REGISTRATION_OPEN=false -a rtc-clone-server` (this restarts
the machine with the new value; `/register` then answers `403
registration_closed`). Reopen with `true`, or `fly secrets unset
REGISTRATION_OPEN`. Any other value stops the server at startup, so a typo
cannot leave sign-up silently open.

## Deploying

Run the **Deploy** workflow manually — Actions tab → "Deploy" → Run workflow,
tick the targets you want (`deploy_react` / `deploy_solid` / `deploy_server`,
plus optional `include_sourcemaps`), or e.g.
`gh workflow run deploy.yml -f deploy_react=true -f deploy_server=true`.
(Merging to `main` does **not** deploy; ticking nothing fails the run's `guard`
job.) Each client build is guarded **before** it deploys, so a wrong build fails
loudly instead of shipping:
- the server URL was inlined (`rtc-clone-server.fly.dev` in the bundle) —
  otherwise the client would silently run the simulator with no WebSocket
- the demo roster was inlined (`mcdc2026` in the bundle, from the committed
  `packages/client-*/.env.production`) — otherwise the hybrid would silently
  send every login, demo accounts included, to the server
- every application core ships only as a lazy chunk (the RxJS composition root too, since approach B)
  (`scripts/check-core-bundle.mts`)
- an inline sourcemap is present when `include_sourcemaps` was ticked

Each ticked target is then smoke-checked:
- server `/health` → 200
- each client → 200 on its canonical alias (the deployed SPA renders its own
  login screen; there is no edge-level password wall to smoke-check anymore)

Open `https://rtc-clone-react.vercel.app` (or `https://rtc-clone-solid.vercel.app`),
log in with a real credential (ask the team) and watch live prices tick — or
with a demo account (`demo` / `mcdc2026`) to run the in-browser simulators
instead; the login decides.

### Debuggable (sourcemap) builds

Tick `include_sourcemaps` to ship a build you can profile with real component
names in the DevTools flamechart. The maps are **inline** (embedded in each JS
bundle as a `data:` URI), not external `.map` files — because Vercel's edge
returns **403 for served `.map` files** by design (source-exposure protection),
so an external map would be generated and linked but never fetchable in
production. Inline maps sidestep that (no separate `.map` request), at the cost
of a larger bundle — fine for an opt-in debug deploy. The wiring is
`RTC_SOURCEMAPS=1` (workflow) → `turbo.json` `build.env` → each client's
`vite.config.ts` (`build.sourcemap: "inline"`); the deploy job asserts the
inline map is present when requested, so a regression fails loudly.

The debug build also resolves the `@rtc/*` libraries to their **original TypeScript**: when `RTC_SOURCEMAPS=1`, Vite aliases those workspace packages to their `src` (compiling them from source rather than consuming `dist/*.js`, whose sourcemap chain Vite's dep pre-bundle would otherwise drop), and emits distinct `-dbg-` filenames so the debug and lean builds never collide in a cache. So a profiled deploy resolves the whole flamechart — app components and presenters/machines — to source.

## How it works

- The client is a static Vite SPA. A production build inlines both
  `VITE_SERVER_URL` (from Vercel) and the committed demo roster
  `VITE_DEMO_AUTH` (from `packages/client-*/.env.production`), which makes it
  **hybrid**: the login decides the data source. Credentials matching the
  demo roster are verified in the browser and run the in-browser simulators
  (nothing is sent to any server); any other credentials are POSTed as
  `{ username, password }` to the Fly server's `/login` over HTTPS
  (`HttpAuthAdapter`). A successful server login returns a signed session
  token, which the client then appends as `?access=<token>` when it opens the
  real `wss://` connection. A login that lands in the other mode than the
  page was composed in stores its session plus `localStorage["rtc.dataSource"]`
  and reloads once; the console line `[data] composed <sim|live> from <reason>`
  says which rule won. Full rules and the reload timeline:
  [`docs/authentication.md` §6](authentication.md#6-hybrid-data-source-one-deployment-two-modes).
- The server validates the token at the WebSocket handshake
  (`decideUpgrade` → `AuthService.verifyToken`), rejecting a missing,
  malformed, or expired token with 401. A registered account's token is then
  re-checked against the account's current status (`403` unless active,
  `503` when the account store does not answer). `/health`,
  `/health/accounts`, `/login` and the five account endpoints stay open
  (HTTP routes, not WS upgrades).
- **Limits in production** (hardening B1, spec §2.2 / §9.2). Fly refuses new
  connections to the machine past `hard_limit = 250` (`fly.toml`,
  `[http_service.concurrency]`, unit `connections` because WebSockets are
  long-lived) — a flood becomes refused connections, not an out-of-memory
  crash; the reconnecting `WsAdapter` backs off and retries. Below that the
  app itself says no: 200 live sockets per process and 8 per client IP (`503`
  on the upgrade), a 256 KiB frame cap (`1009`), a per-socket message budget
  (`1008` after 100 dropped frames), a 4 KiB `/login` body (`413`), 10 login
  attempts a minute, and an in-memory ban list — 10 weighted strikes in 10
  minutes earn a 15-minute `429 banned`; a redeploy clears it. The account
  endpoints add their own per-IP and per-address limits and a daily sign-up
  cap ([`authentication.md` §7.6](authentication.md#76-limits)). Every number
  lives in `packages/server/src/config/limits.ts`. All of it keys on
  `Fly-Client-IP`; set `RTC_TRUSTED_IP_HEADER=cf-connecting-ip` as a Fly
  secret once Cloudflare fronts the server. The container runs as the
  unprivileged `node` user.
- There is no Vercel Edge Middleware anymore — the old shared-password
  Basic-Auth wall (`middleware.ts`, `SITE_PASSWORD`) and the shared WebSocket
  token (`WS_ACCESS_TOKEN` / `VITE_WS_TOKEN`) have both been removed. Access
  control is now real per-user authentication on the server, not a static
  edge secret.
- For **local** simulator-mode dev (no real server), `VITE_DEV_AUTH` (a JSON
  map of `username` → `password`, e.g. `{"demo":"mcdc2026"}`) seeds an
  in-process `AuthSimulator` so the login screen works with no backend at all.
  Both web clients read it identically via `buildBrowserPorts.ts`'s
  `parseDevAuth` — `pnpm dev` (`client-react`) and `pnpm dev:solid`
  (`client-solid`) each already read the committed demo roster from their own
  `.env.development`; see `packages/client-react/.env.example` to override.
- The mobile app shows a login screen on every launch (no auto-login); in
  **live** mode the operator signs in with any credential that exists in the
  deployed server's `AUTH_USERS` roster. In **simulator** mode
  (`EXPO_PUBLIC_DEV_AUTH`, expo `extra.devAuth`), a JSON `username -> password`
  map seeds an in-process `AuthSimulator`, falling back to all four roster
  usernames at a shared dev password when unset. See the
  [client-react-native README](../packages/client-react-native/README.md#live-data--signing-in).

## Rotating / managing credentials

- **Server roster (source of truth):** `fly secrets set AUTH_USERS="user:pass,..." -a rtc-clone-server`
  — adds, removes, or changes credentials; no client-side value needs to
  change in step, since the client always authenticates fresh via `/login`.
- **Session-signing secret:** `fly secrets set AUTH_SECRET=<new> -a rtc-clone-server`
  invalidates every outstanding session token immediately (users must log in
  again) — useful if a token were ever compromised. With accounts enabled the
  new value must be at least 32 characters, or the server will not start.
- **Account store key:** create a new secret key in Supabase, `fly secrets set
  SUPABASE_SECRET_KEY=<new> -a rtc-clone-server`, then delete the old key in
  Supabase. A revoked or mistyped key makes every account call `503
  unavailable` and `/health/accounts` read `down`; it never reads as a wrong
  password.
- This is a **demo app**, so the demo login password (`mcdc2026`) is committed
  for local dev (`.env.development` + the `dev:*` scripts) — throwaway and
  rotatable. The **`AUTH_SECRET`** token-signing key is the credential that
  never belongs in a committed file: it stays a Fly secret set by hand.

See [env-files.md](./env-files.md) for the full inventory of `.env` files and
the auth-related environment variables.

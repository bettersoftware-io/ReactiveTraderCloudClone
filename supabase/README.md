# Supabase — account store

The server's private account store (B2 design:
[`docs/superpowers/specs/2026-10-04-b2-user-management-design.md`](../docs/superpowers/specs/2026-10-04-b2-user-management-design.md)).
Only `@rtc/server` talks to it. No client has its URL or a key.

## One-time setup

This section covers the Supabase project itself. The whole rollout (the
email sender, the probe, the Fly secrets, the deploy and the first
administrator) is one numbered procedure in
[`docs/DEPLOY.md` §4](../docs/DEPLOY.md#4-supabase-account-store); follow that, and
use this list as the reference for the project-side steps. Menu names are as
of October 2026; Supabase moves them.

1. Create a project in London (`eu-west-2`). `docs/privacy.md` names this
   region; change it there if you choose another.
2. Apply `migrations/` in filename order (SQL editor, or `supabase db push`).
3. **Authentication → Emails:** paste `templates/confirm-signup.html` into
   *Confirm signup* and `templates/reset-password.html` into *Reset
   password*. Both print the code (`{{ .Token }}`), not a link.
   Under **Sign In / Providers → Email**, set *Email OTP length* to **8** and
   leave its expiry at an hour or less: the server refuses any code that is
   not eight digits before it reaches Supabase, so a project left at the
   default 6 makes every confirmation and reset fail (the probe checks it).
4. **Authentication → Sign In / Providers → Email:** *Confirm email* on;
   minimum password length 12. Phone and anonymous off (below).
5. **Authentication → Emails → SMTP settings:** a custom sender is
   **required** before registration is opened. The built-in one allows only
   a couple of emails an hour, and a sign-up Supabase throttles still
   answers "code sent" through the server and sends nothing — so a busy hour
   silently loses sign-ups. Check the email-sending rate under
   Authentication → Rate limits as well: set the project's email limit to at
   least 60 an hour, because the server's three hourly fuses (sign-ups 25,
   resends 15, resets 15) sum to 55 and must stay under it, or Supabase
   throttles a mail the server let through and loses it silently. Raising
   `RTC_SIGNUPS_PER_HOUR` means raising the project's limit by the same
   amount.
6. **Authentication → Rate limits:** enable IP address forwarding
   (`Sb-Forwarded-For`), so Supabase limits each visitor, not our server's
   one address.
7. **Authentication → Sessions:** if your plan offers a session time-box, set
   one as a backstop. The server logs out each session it opens (a sign-in
   or a verified code) right after using it, but ignores a logout that
   fails, so an occasional session row can still be left behind.
8. **Project Settings → API Keys:** create a **secret** key (`sb_secret_…`).
   It is never typed, never in your shell history, never in a file and
   never in a client: the probe
   and the Fly secret take it from a shell variable read at a prompt
   ([`docs/DEPLOY.md` §4](../docs/DEPLOY.md#4-supabase-account-store) steps
   9–12 run the probe, stage the secrets and deploy).
9. After your own first sign-up: in the table editor set your `profiles` row
   to `role = 'admin'`, `approved = true`.

**Passwords are set by the confirmation, not the sign-up.** A sign-up stores
a random password nobody knows; the request that carries the emailed code
also carries the user's password and sets it. So someone who registers an
address they do not own never holds a working credential for it. If
*leaked password protection* or a stricter password policy is enabled in the
project, a confirmation can answer `password_unset` (the email is confirmed
but the password was refused); the user then finishes through "forgot
password".

The server deletes accounts that are never confirmed 48 hours after
creation, so the table editor rarely shows them.

## Keep these closed

- The **phone** and **anonymous** sign-in providers must stay disabled:
  `profiles.email` is `not null`, so such a user would break the profile trigger.
- The project URL plus the publishable key allow a direct `/auth/v1/signup`
  that bypasses the server's password rule and per-IP limits. Such an account
  still needs approval and cannot read `profiles`, so keep the URL private and
  do not hand out the publishable key.

## Probing a real project

`pnpm --filter @rtc/server accounts:probe` drives the server's Supabase
adapter against the project named by `SUPABASE_URL` / `SUPABASE_SECRET_KEY`
and prints one line per check. It also needs `PROBE_EMAIL_DOMAIN`: a domain
you control or a test inbox — the probe sends one real confirmation email
to it. It creates two throwaway accounts, addressed `probe-<timestamp>@…`
and `probe-fresh-<timestamp>@…`, and deletes them; each cleanup line prints
the account's id. If a cleanup fails, delete that id; if the probe is killed
before cleanup, search Authentication → Users for addresses starting with
`probe-`. Run it after setup and whenever Supabase changes its Auth API.

## Approving and blocking

Until the in-app Users panel (B2c): edit `approved` / `blocked` on the
`profiles` row in the table editor. A change takes effect at the account's
next sign-in, and within a minute for an open session's next connect.

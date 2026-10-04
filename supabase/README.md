# Supabase — account store

The server's private account store (B2 design:
[`docs/superpowers/specs/2026-10-04-b2-user-management-design.md`](../docs/superpowers/specs/2026-10-04-b2-user-management-design.md)).
Only `@rtc/server` talks to it. No client has its URL or a key.

## One-time setup

1. Create a project in London (`eu-west-2`).
2. Apply `migrations/` in filename order (SQL editor, or `supabase db push`).
3. **Authentication → Emails:** paste `templates/confirm-signup.html` into
   *Confirm signup* and `templates/reset-password.html` into *Reset
   password*. Both print a 6-digit code (`{{ .Token }}`), not a link.
4. **Authentication → Sign In / Providers → Email:** *Confirm email* on;
   minimum password length 12.
5. **Authentication → Emails → SMTP settings:** a custom sender. The built-in
   one allows only a couple of emails an hour.
6. **Authentication → Rate limits:** enable IP address forwarding
   (`Sb-Forwarded-For`), so Supabase limits each visitor, not our server's
   one address.
7. Create a **secret** API key (`sb_secret_…`) and set, on Fly:
   `flyctl secrets set SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_…`
8. Run the probe (below) before the first deploy.
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
to it. It creates two throwaway accounts and deletes them. If the probe is
killed or a cleanup fails it leaves an account behind, whose id it printed. Run it after setup and whenever Supabase changes its Auth API.

## Approving and blocking

Until the in-app Users panel (B2c): edit `approved` / `blocked` on the
`profiles` row in the table editor. A change takes effect at the account's
next sign-in, and within a minute for an open session's next connect.

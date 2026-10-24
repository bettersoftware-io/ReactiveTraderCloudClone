-- B2c: session revocation stamp (docs/superpowers/specs/2026-10-24-b2c-users-panel-design.md).
--
-- PRIVATE TO THE SERVER, like the rest of public.profiles: row-level security
-- stays on and NO policy is defined, so the anon and authenticated roles can
-- do nothing here. Only the server's secret key reads or writes.
--
-- sessions_not_before is the instant before which no session token is honoured.
-- The server writes it from its own clock (never the database's now()) when it
-- blocks, renames or resets an account. Null means no session has been
-- revoked, so there is deliberately no default.
--
-- packages/server/src/accounts/migrations.test.ts pins these properties.

alter table public.profiles add column sessions_not_before timestamptz;

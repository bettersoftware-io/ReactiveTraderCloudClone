-- B3a: per-person daily Jarvis AI spend (docs/superpowers/plans, B3a per-user durable AI metering).
--
-- PRIVATE TO THE SERVER. Row-level security is on and NO policy is defined,
-- so the anon and authenticated roles can do nothing here. Only the server's
-- secret key (service_role, which bypasses RLS) reads or writes. No browser
-- ever talks to this project.
--
-- One row per (owner, day, key_kind). owner is a profile id, or the literal
-- 'house' for the all-users total of house-key spend. spend_usd stays numeric
-- so sums never lose precision.
--
-- packages/server/src/accounts/migrations.test.ts pins these properties.

create table public.jarvis_spend_daily (
  owner     text    not null,
  day       date    not null,
  key_kind  text    not null check (key_kind in ('house', 'own')),
  spend_usd numeric not null default 0,
  turns     integer not null default 0,
  primary key (owner, day, key_kind)
);

alter table public.jarvis_spend_daily enable row level security;
revoke all on public.jarvis_spend_daily from anon, authenticated;

-- Adds one turn's cost to the owner's row and, for house-key spend, to the
-- house total, in one statement (so one transaction). Returns both new totals;
-- house_usd is 0 when no house row exists (own-key spend).
create function public.record_jarvis_spend(
  p_owner    text,
  p_day      date,
  p_key_kind text,
  p_usd      numeric
)
returns table (owner_usd numeric, house_usd numeric)
language sql
security definer set search_path = ''
as $$
  with owner_row as (
    insert into public.jarvis_spend_daily as t (owner, day, key_kind, spend_usd, turns)
    values (p_owner, p_day, p_key_kind, p_usd, 1)
    on conflict (owner, day, key_kind)
    do update set spend_usd = t.spend_usd + excluded.spend_usd,
                  turns = t.turns + 1
    returning t.spend_usd
  ),
  house_row as (
    insert into public.jarvis_spend_daily as t (owner, day, key_kind, spend_usd, turns)
    select 'house', p_day, 'house', p_usd, 1
    where p_key_kind = 'house'
    on conflict (owner, day, key_kind)
    do update set spend_usd = t.spend_usd + excluded.spend_usd,
                  turns = t.turns + 1
    returning t.spend_usd
  )
  select (select spend_usd from owner_row),
         coalesce((select spend_usd from house_row), 0::numeric);
$$;

revoke execute on function public.record_jarvis_spend(text, date, text, numeric) from public, anon, authenticated;

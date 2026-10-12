-- B2a: account profiles (docs/superpowers/specs/2026-10-04-b2-user-management-design.md §5.1).
--
-- PRIVATE TO THE SERVER. Row-level security is on and NO policy is defined,
-- so the anon and authenticated roles can do nothing here. Only the server's
-- secret key (service_role, which bypasses RLS) reads or writes. No browser
-- ever talks to this project.
--
-- packages/server/src/accounts/migrations.test.ts pins these properties.

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text not null,
  display_name       text not null,
  role               text not null default 'user' check (role in ('user', 'admin')),
  approved           boolean not null default false,
  blocked            boolean not null default false,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);

create index profiles_created_at_idx on public.profiles (created_at);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

-- One profile per sign-up. Reads ONLY display_name from the sign-up
-- metadata: role and approved always start at their defaults, so a sign-up
-- cannot grant itself anything.
create function public.create_profile_for_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, email_confirmed_at)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Guest'), 40),
    new.email_confirmed_at
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_user();

-- Mirrors the email and its confirmation timestamp, so the server reads one table.
create function public.sync_profile_confirmation()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email,
      email_confirmed_at = new.email_confirmed_at
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.sync_profile_confirmation();

revoke execute on function public.create_profile_for_user() from public, anon, authenticated;
revoke execute on function public.sync_profile_confirmation() from public, anon, authenticated;

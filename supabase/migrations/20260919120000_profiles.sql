-- PlayMint · profiles (September 2026, Week 1 — APPLIED)
--
-- One row per auth user, created automatically on first sign-in by a trigger on
-- auth.users. Owner-only access through Row Level Security; `anon` has nothing.
-- Safe to re-run.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player'
               check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Defense in depth on top of RLS: no table privileges for anonymous visitors,
-- and signed-in users may only ever change their display name.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- updated_at maintenance (shared with the games table later).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Profile creation on signup. SECURITY DEFINER because the inserting role
-- (supabase_auth_admin) has no rights on public.profiles; search_path is pinned
-- to '' so nothing can be hijacked through it.
-- The name expression can NEVER violate the 1..40 check — a failing trigger here
-- would abort every signup, so it is deliberately bulletproof.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
        'Player'
      ),
      40
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for accounts created before this migration ran.
insert into public.profiles (id, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(split_part(coalesce(u.email, ''), '@', 1)), ''),
      'Player'
    ),
    40
  )
from auth.users u
on conflict (id) do nothing;

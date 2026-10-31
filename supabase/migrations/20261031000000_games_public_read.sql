-- PlayMint · Public Reads, Profiles & Remix Lineage (October 2026 Milestone §2C)
--
-- Enables public reading of published and unlisted games, public display names
-- for creator attribution, and allows authenticated users to save remixes with
-- remix_parent_id lineage.
--
-- Safe to re-run.

-- 1. Grant SELECT on public.games to anon and authenticated
grant select on public.games to anon, authenticated;

-- 2. Public Read Policy on public.games:
-- Visitors can read games marked 'public' or 'unlisted'.
-- (The existing games_select_own policy already permits owners to select their own private games).
drop policy if exists games_select_public on public.games;
create policy games_select_public on public.games
  for select to anon, authenticated
  using (visibility in ('public', 'unlisted'));

-- 3. Public Display Names on public.profiles:
-- Allows anyone to read creator display names for game attribution without exposing private user data.
grant select (id, display_name) on public.profiles to anon, authenticated;

drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select to anon, authenticated
  using (true);

-- 4. Minimal Remix Grant:
-- Allow authenticated users to set remix_parent_id and allow_remix on INSERT,
-- carrying forward game lineage when a player remixes an existing game.
grant insert (remix_parent_id, allow_remix)
  on public.games to authenticated;

-- Ensure remix_parent_id and allow_remix remain updatable by the owner
grant update (remix_parent_id, allow_remix)
  on public.games to authenticated;

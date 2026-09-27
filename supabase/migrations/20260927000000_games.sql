-- PlayMint · games table — APPROVED by the client 27 September 2026; pending
-- application to production (apply this file in the Supabase SQL editor, then
-- confirm with GET /api/keepalive, which reports gamesTable: 'ok').
--
-- Contract checkpoint 20 Sep 2026: "Games table schema and RLS policies drafted
-- and shared for review before any row is written." It sat in supabase/drafts/
-- (outside migrations/, so no tool could apply it by accident) until the client
-- approved it on 27 Sep 2026; it then moved here. The SQL below is the reviewed
-- text, byte-identical to the draft — only this header changed.
--
-- Week 2 (saved games / My Games) writes rows through
-- src/game/savedGames/index.js. Client code is written to degrade to an empty
-- library if this table is absent, so the app runs on a deployment where the
-- migration has not been applied yet.
--
-- Depends on: 20260919120000_profiles.sql (public.set_updated_at()).
--
-- ── Notes for the reviewer ────────────────────────────────────────────────────
-- 1. PRIVATE BY DEFAULT. Every policy below is owner-only and `anon` has no
--    privileges at all. The `visibility`, `published_at`, `allow_remix` and
--    `remix_parent_id` columns exist from day one so October's publish and remix
--    need no migration — but NOTHING reads them yet. October adds exactly one
--    policy: public read where visibility = 'public'.
-- 2. NO USAGE/QUOTA TABLE YET, on purpose. Generation still runs in the browser
--    with the client-side Gemini key, so any usage the browser reports could be
--    forged. Quotas arrive with server-side generation (November).
--    The per-user row cap below is an abuse guard, not a quota.
-- 3. ART IS REFERENCED, NOT COPIED. `art_id` points at the existing Vercel Blob
--    folder games/<art_id>/. It is NOT unique: the asset cache deliberately
--    shares one art set across different games and different users.
--    OPEN ISSUE FOR OCTOBER: those folders are mutable (a restyle overwrites the
--    same id) and the upload endpoint is unauthenticated. Before games become
--    PUBLIC, published art must be made immutable (copy-on-publish).
-- 4. CLIENT REVIEW 22 Sep 2026 (applied below): INSERT is column-gated so users
--    cannot set id/owner_id/timestamps/visibility/published_at/allow_remix/
--    remix_parent_id; enforce_games_row_cap() is SECURITY INVOKER (no SECURITY
--    DEFINER in the public schema). UPDATE grants are unchanged — owners may
--    later publish/remix their own rows.
-- ──────────────────────────────────────────────────────────────────────────────

create table public.games (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,

  title           text not null check (char_length(title) between 1 and 80),
  mode            text not null check (mode in ('runner', 'platformer', 'shooter')),
  prompt          text not null default '' check (char_length(prompt) <= 2000),

  -- The full game config (physics, layout, tuning, title…) exactly as the app
  -- boots it, minus images. A few KB in practice; capped against abuse.
  config          jsonb not null check (pg_column_size(config) < 65536),
  -- Art metadata the scene needs to restore the game (sprite-sheet frames,
  -- facing, dropped layers, tags). Run-scoped cost logs are stripped before save.
  asset_meta      jsonb check (asset_meta is null or pg_column_size(asset_meta) < 65536),
  schema_version  integer not null default 1,

  art_id          text check (art_id is null or art_id ~ '^[a-z0-9][a-z0-9-]{6,63}$'),
  thumbnail_path  text check (thumbnail_path is null or char_length(thumbnail_path) <= 300),

  visibility      text not null default 'private'
                  check (visibility in ('private', 'unlisted', 'public')),
  published_at    timestamptz,
  allow_remix     boolean not null default false,
  remix_parent_id uuid references public.games (id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- My Games lists one owner's games, newest first.
create index games_owner_updated_idx on public.games (owner_id, updated_at desc);
create index games_remix_parent_idx  on public.games (remix_parent_id)
  where remix_parent_id is not null;

create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- ── Row Level Security: a user can only ever see and change their own rows ────
alter table public.games enable row level security;

revoke all on public.games from anon, authenticated;
grant select, delete on public.games to authenticated;
-- Column-level INSERT (client review 22 Sep 2026): users may only supply the
-- content columns. id, owner_id, created_at/updated_at, visibility,
-- published_at, allow_remix and remix_parent_id are NOT insertable — their
-- defaults/casts fill them (id gen_random_uuid(), owner_id auth.uid(),
-- created_at now(), visibility 'private', allow_remix false).
grant insert (title, mode, prompt, config, asset_meta, schema_version, art_id,
              thumbnail_path)
  on public.games to authenticated;
-- Column-level UPDATE: owner_id, id, created_at and remix_parent_id are
-- immutable after insert even for the owner. visibility/published_at/
-- allow_remix stay updatable so owners can later publish/remix their own rows
-- (October's publish feature) — only INSERT is locked down.
grant update (title, prompt, config, asset_meta, schema_version, art_id,
              thumbnail_path, visibility, published_at, allow_remix)
  on public.games to authenticated;

create policy games_select_own on public.games
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy games_insert_own on public.games
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy games_update_own on public.games
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy games_delete_own on public.games
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ── Abuse guard: signup is open, so inserts must be bounded per user ──────────
-- SECURITY INVOKER (client review 22 Sep 2026 — no SECURITY DEFINER in the
-- public schema): the count query runs under the invoking role with RLS
-- active, and games_select_own scopes it to that user's OWN rows — exactly
-- the per-user cap we want. search_path stays pinned to ''.
create or replace function public.enforce_games_row_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.games g where g.owner_id = new.owner_id) >= 200 then
    raise exception 'Saved games limit reached (200). Delete a game to save a new one.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_games_row_cap() from public, anon, authenticated;

create trigger games_row_cap
  before insert on public.games
  for each row execute function public.enforce_games_row_cap();

-- ── How isolation will be PROVEN (Week 2 deliverable: the isolation test log) ─
-- With two real accounts A and B, by direct REST calls (not through the UI):
--   • anon key, no session      → select returns 0 rows; insert is refused
--   • B selects A's game by id  → 0 rows
--   • B updates / deletes A's id → 0 rows affected
--   • B inserts with owner_id = A → refused by games_insert_own
--   • A changes owner_id on own row → refused (no column privilege)

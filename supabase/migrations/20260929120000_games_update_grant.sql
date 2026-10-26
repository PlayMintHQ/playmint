-- PlayMint · games table — add `mode` to the column-level UPDATE grant.
-- APPLY THIS FILE in the Supabase SQL editor, then confirm with
-- GET /api/keepalive (it reports gamesTable: 'ok').
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- 20260927000000_games.sql granted UPDATE without `mode` (it granted INSERT with
-- it, and mode was not in the "immutable after insert" list, so the omission
-- looks deliberate — it is not):
--
--     grant update (title, prompt, config, asset_meta, schema_version, art_id,
--                   thumbnail_path, visibility, published_at, allow_remix)
--       on public.games to authenticated;
--
-- src/game/savedGames/index.js built one `values` object and used it for BOTH
-- branches of its upsert — the INSERT includes `mode`, the UPDATE spread the
-- same object. Postgres rejects a SET naming a column the role has no UPDATE
-- privilege on ("permission denied for column mode"), so:
--
--   * the first save of a game INSERTED fine (the grant covers INSERT), which is
--     why the row appeared at all, and
--   * every SUBSEQUENT save of that game failed, always, with that error.
--
-- The failure was invisible: saveGame returns {ok:false} and the only caller
-- surface was a console.warn, so the Save button sat on "✓ Saved" from the
-- first write while silently never persisting a tweak again.
--
-- ── Fix ──────────────────────────────────────────────────────────────────────
-- Re-grant UPDATE with `mode` included. Column-level privileges are additive and
-- idempotent, so re-listing the existing columns is safe on a database that
-- already has the original grant.
--
-- src/game/savedGames/index.js additionally stopped sending `mode` on the UPDATE
-- (see the "why the code also changes" note there): a saved game's mode can never
-- change, because mode switching is intentionally unsupported (gameEditor refuses
-- it), so the column has no reason to be written on re-save. The grant is
-- corrected here for correctness, and the client is not asked to depend on it.

grant update (title, mode, prompt, config, asset_meta, schema_version, art_id,
              thumbnail_path, visibility, published_at, allow_remix)
  on public.games to authenticated;

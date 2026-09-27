// Saved games / My Games library (2026-09-27, contract §2B).
//
// One table, `public.games`, RLS owner-only (supabase/migrations/20260927000000_games.sql).
// This module is the ONLY writer. Three rules it exists to enforce:
//
//  1. NOTHING HERE THROWS. Every export resolves to {ok, ...} and swallows its
//     own failures. A library that cannot load must degrade to an empty grid,
//     never take down generation or play — same posture as the asset cache
//     backends and getSupabase().
//  2. The saved `config` is EXACTLY the share-link payload (stripForShare). That
//     is what makes "Play" a one-liner: the row's config re-encodes into a
//     #config= URL, App's existing import sets pendingRestoreId, and
//     getGameById(art_id) rehydrates the AI art from the Blob store — the exact
//     path a shared link has used since 2026-08-11.
//  3. art_id IS gameId. There is no separate art id: the asset cache stamps
//     gameId = crypto.randomUUID() and serverBackend uploads to games/<id>/,
//     which is what the games.art_id regex describes. A static-theme boot has
//     neither, so its row carries art_id = null and restores as a themed static
//     game (correct — there is no AI art to fetch).

import { getSupabase, isAuthConfigured } from '../../auth/supabaseClient';
import { stripForShare } from '../shareLink.js';
import { ensureUploaded } from '../assetCache/index.js';
import * as server from '../assetCache/serverBackend.js';
import { composeThumbnail } from './thumbnail.js';

// games.mode CHECK (games.sql:40) allows exactly these. gameType values that
// are not playable modes yet — 'dodge' is a GameModeManager placeholder that
// falls back to RunnerMode — are stored as 'runner' rather than failing the
// INSERT with a raw Postgres check violation the UI cannot explain. Revisit
// when dodge actually ships; a mode rename then needs a migration.
const ALLOWED_MODES = ['runner', 'platformer', 'shooter'];

export const normalizeMode = (gameType) =>
  (ALLOWED_MODES.includes(gameType) ? gameType : 'runner');

const TITLE_MAX = 80;   // games.sql:39
const PROMPT_MAX = 2000; // games.sql:41

const titleFor = (liveParams) => {
  const raw = liveParams?.gameName
    || liveParams?.sourcePrompt?.slice(0, TITLE_MAX)
    || 'PlayMint game';
  return String(raw).trim().slice(0, TITLE_MAX) || 'PlayMint game';
};

const promptFor = (liveParams) =>
  String(liveParams?.sourcePrompt || '').slice(0, PROMPT_MAX);

// Run-scoped data is stripped before save, exactly as games.sql:47 promises.
// `run` describes the run that produced the art and `cost.calls[]` is its
// per-call log (~25KB of text on a 12-call run) — neither belongs in a saved
// row. The cost TOTALS are kept: they are what the cost report reads as
// "original art cost" on every later restore.
const buildSaveMeta = (assetMeta) => {
  if (!assetMeta) return null;
  const { run: _run, cost, ...rest } = assetMeta;
  if (!cost) return rest;
  const { calls: _calls, ...totals } = cost;
  return { ...rest, cost: totals };
};

const fail = (error, extra = {}) => ({ ok: false, error: error?.message || String(error) || 'unknown', ...extra });

// A missing table (migration not applied yet) is a distinct state from a
// network/permission error: the grid says so instead of showing a raw PostgREST
// code. 42P01 = undefined_table, PGRST205 = relation not in schema cache.
const isSchemaMissing = (err) => {
  const code = err?.code || '';
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(err?.message || '');
};

const client = async () => {
  if (!isAuthConfigured()) return null;
  return getSupabase();
};

const COLUMNS = 'id,title,mode,prompt,config,art_id,thumbnail_path,visibility,created_at,updated_at';

/**
 * Save (or re-save) the running game for the signed-in user.
 *
 * Upsert, never duplicate: an explicit save after a slider tweak, and the
 * auto-save on generation, both land on the same row. Resolution order is
 * liveParams.savedGameId (a row we created or loaded this session) → an
 * existing row with the same art_id → INSERT. A static-art game has no art_id,
 * so within one session its row is tracked by savedGameId only.
 *
 * @returns {Promise<{ok: boolean, id?: string, error?: string, thumbnail?: string}>}
 */
export const saveGame = async ({ liveParams, preloadedImages } = {}) => {
  const supabase = await client();
  if (!supabase) return fail('Accounts are not enabled on this deployment.');
  if (!liveParams) return fail('Nothing to save yet.');

  const mode = normalizeMode(liveParams.gameType);
  const artId = liveParams.gameId || null;
  const config = stripForShare(liveParams);
  const assetMeta = buildSaveMeta(liveParams.assetMeta);
  const values = {
    title: titleFor(liveParams),
    mode,
    prompt: promptFor(liveParams),
    config,
    asset_meta: assetMeta,
    art_id: artId,
  };

  try {
    // The art upload is fire-and-forget inside the asset cache, so a user can
    // press Save (or auto-save fire) before the Blobs are up. A HEAD probe plus
    // an on-demand upload closes that race, so Play can never 404 the art.
    if (artId) await ensureUploaded(artId);

    // Card art is cosmetic: a failure leaves thumbnail_path null and the grid
    // paints the world's gradient instead. It must never fail the save.
    let thumbnailPath = null;
    if (artId) {
      const blob = await composeThumbnail({
        preloadedImages,
        assetMeta: liveParams.assetMeta,
        themeKey: liveParams.themeKey
      });
      if (blob) thumbnailPath = await server.putThumbnail(artId, blob);
    }

    let rowId = liveParams.savedGameId || null;
    if (!rowId && artId) {
      const existing = await supabase
        .from('games')
        .select('id')
        .eq('art_id', artId)
        .limit(1)
        .maybeSingle();
      if (existing.error) return fail(existing.error);
      rowId = existing.data?.id || null;
    }

    if (rowId) {
      const upd = await supabase
        .from('games')
        .update({ ...values, thumbnail_path: thumbnailPath })
        .eq('id', rowId)
        .select('id')
        .maybeSingle();
      if (upd.error) return fail(upd.error);
      return { ok: true, id: upd.data?.id || rowId, thumbnail: thumbnailPath || undefined };
    }

    const ins = await supabase
      .from('games')
      .insert({ ...values, thumbnail_path: thumbnailPath })
      .select('id')
      .maybeSingle();
    if (ins.error) return fail(ins.error);
    return { ok: true, id: ins.data?.id, thumbnail: thumbnailPath || undefined };
  } catch (err) {
    return fail(err);
  }
};

/** The signed-in user's own rows, newest first. RLS scopes this to the owner. */
export const listMyGames = async () => {
  const supabase = await client();
  if (!supabase) return { ok: false, games: [], configured: false, error: 'Accounts are not enabled on this deployment.' };
  try {
    const { data, error } = await supabase
      .from('games')
      .select(COLUMNS)
      .order('updated_at', { ascending: false });
    if (error) {
      if (isSchemaMissing(error)) return { ok: false, games: [], configured: true, schemaMissing: true, error: error.message };
      return { ok: false, games: [], configured: true, error: error.message };
    }
    const games = data || [];
    // Absolute card URLs, resolved client-side: art is stored as a PATH because
    // the store's hostname can change while the path is the read-path contract.
    await Promise.all(games.map(async (g) => {
      if (!g.thumbnail_path) return;
      const url = await server.publicUrl(g.thumbnail_path);
      g.thumbnail_url = url || null;
    }));
    return { ok: true, games, configured: true };
  } catch (err) {
    return { ok: false, games: [], configured: true, error: err?.message || String(err) };
  }
};

export const renameGame = async (id, title) => {
  const supabase = await client();
  if (!supabase) return fail('Accounts are not enabled on this deployment.');
  const clean = String(title || '').trim().slice(0, TITLE_MAX);
  if (!id) return fail('Missing game id.');
  if (!clean) return fail('A title is required.');
  try {
    // No owner filter: games_update_own does it. An id belonging to another
    // account simply updates 0 rows, which is the isolation the log proves.
    const { error, count } = await supabase
      .from('games')
      .update({ title: clean }, { count: 'exact' })
      .eq('id', id);
    if (error) return fail(error);
    if (!count) return fail('That game is not in your library.');
    return { ok: true, title: clean };
  } catch (err) {
    return fail(err);
  }
};

export const deleteGame = async (id) => {
  const supabase = await client();
  if (!supabase) return fail('Accounts are not enabled on this deployment.');
  if (!id) return fail('Missing game id.');
  try {
    const { error, count } = await supabase
      .from('games')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) return fail(error);
    if (!count) return fail('That game is not in your library.');
    // The row only. The game's art folder (games/<art_id>/) stays in the Blob
    // store: serverBackend.deleteGame is a deliberate v1 stub ("cleanup is a
    // dashboard concern"), and a shared art set may back other games.
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
};

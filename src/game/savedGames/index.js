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

// A card-art problem must be DIAGNOSABLE. putThumbnail resolving null — no
// BLOB_READ_WRITE_TOKEN, an unreachable /api/games/upload, a compose that found
// nothing to paint — used to be indistinguishable from success, because nothing
// but the resulting blank card said so. Card art is cosmetic and never fails a
// save, so a warning is the whole remedy. Deduped per message so a library of
// twelve games does not print twelve identical lines.
const warnedOnce = new Set();
const warnOnce = (message, err) => {
  const key = `${message}|${err?.message || ''}`;
  if (warnedOnce.has(key)) return;
  warnedOnce.add(key);
  console.warn(`[SavedGames] ${message}${err ? `: ${err.message || err}` : ''}`);
};

/**
 * Second chance at card art for a game that had no art_id to key an upload
 * under (a static-art boot) or whose first upload found nothing to paint.
 * composeThumbnail falls back to the built-in world's real backdrop art, so this
 * succeeds for essentially every game; the row id stands in for the art id.
 *
 * Runs AFTER the row exists and writes ONLY thumbnail_path, so it can never
 * fail the save and cannot clobber anything else. Returns the path it settled
 * on (the existing one when this pass adds nothing).
 */
const backfillThumbnail = async (supabase, rowId, existingPath, compose, warn) => {
  if (existingPath || !rowId) return existingPath;
  try {
    const blob = await compose();
    if (!blob) return null;
    const path = await server.putThumbnail(rowId, blob);
    if (!path) {
      warn('no card art was uploaded (no reachable image store — set BLOB_READ_WRITE_TOKEN)');
      return null;
    }
    const upd = await supabase.from('games').update({ thumbnail_path: path }).eq('id', rowId);
    if (upd.error) warn('card art uploaded but its path could not be saved', upd.error);
    return path;
  } catch (err) {
    warn('card art skipped', err);
    return null;
  }
};

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
export const saveGame = async ({ liveParams, preloadedImages, frameBlob = null } = {}) => {
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

    // Card art. A real captured frame of the running game WINS over anything
    // composed: the client's verdict on the composed version (its own assets on a
    // painted ground line, or a sampled colour when the game had no assets at
    // all) was that the card has to be a frame OF the game. `frameBlob` is that
    // frame (game/frameCapture.js); compose is the fallback for the cases where
    // no frame was available yet — an early manual save, or a save that happens
    // before the scene has rendered a single frame.
    // Card art is cosmetic: it must NEVER fail the save.
    const compose = () => (frameBlob ? Promise.resolve(frameBlob) : composeThumbnail({
      preloadedImages,
      assetMeta: liveParams.assetMeta,
      themeKey: liveParams.themeKey
    }));
    let thumbnailPath = null;
    if (artId) {
      const blob = await compose();
      if (blob) thumbnailPath = await server.putThumbnail(artId, blob);
      else warnOnce('no card art was produced from the game\'s own images');
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
      // `mode` is deliberately NOT sent here. The 2026-09-27 migration granted
      // UPDATE without it, so naming it in a SET made Postgres reject the whole
      // statement with "permission denied for column mode" — every save after the
      // first failed, invisibly. The grant is corrected by
      // migrations/20260929120000_games_update_grant.sql, but the client must
      // not DEPEND on that: a saved game's mode can never change anyway (mode
      // switching is intentionally unsupported — gameEditor refuses it), so the
      // column has no business being written on re-save.
      const { mode: _immutableMode, ...updateValues } = values;
      // thumbnail_path is included ONLY when this save actually produced art.
      // Sending an explicit null here erased a good card on any re-save that
      // happened before a frame was available (an immediate slider tweak), which
      // is how a card that had a real frame went back to a colour swatch.
      const upd = await supabase
        .from('games')
        .update(thumbnailPath ? { ...updateValues, thumbnail_path: thumbnailPath } : updateValues)
        .eq('id', rowId)
        .select('id')
        .maybeSingle();
      if (upd.error) return fail(upd.error);
      thumbnailPath = await backfillThumbnail(supabase, rowId, thumbnailPath, compose, warnOnce);
      return { ok: true, id: upd.data?.id || rowId, thumbnail: thumbnailPath || undefined };
    }

    const ins = await supabase
      .from('games')
      .insert({ ...values, thumbnail_path: thumbnailPath })
      .select('id')
      .maybeSingle();
    if (ins.error) return fail(ins.error);
    const newId = ins.data?.id;
    // A static-art game has no art_id to key a card on, so the row id takes
    // that role. The row has to exist first, hence this second write.
    thumbnailPath = newId
      ? await backfillThumbnail(supabase, newId, thumbnailPath, compose, warnOnce)
      : null;
    return { ok: true, id: newId, thumbnail: thumbnailPath || undefined };
  } catch (err) {
    return fail(err);
  }
};

/**
 * Uploads a captured game frame onto an EXISTING row. The frame is captured a
 * beat after boot (it has to be a settled scene, not the first black frame), but
 * auto-save fires as soon as the row is inserted — so on a fast save the frame
 * arrives after the fact. This closes that gap without re-running the whole save.
 *
 * Cosmetic like everything else here: never throws, resolves to the path it set
 * or null.
 *
 * @returns {Promise<string|null>} the stored thumbnail_path
 */
export const attachThumbnail = async (rowId, blob) => {
  if (!rowId || !blob) return null;
  const supabase = await client();
  if (!supabase) return null;
  try {
    // Look up the row's art_id so we upload to the SAME path that saveGame used.
    // saveGame uses artId (= liveParams.gameId) for `putThumbnail`, which builds
    // the blob path as `games/${id}/thumbnail.png`. If we pass rowId instead,
    // the frame lands at a different path and the card never finds it.
    const { data: row } = await supabase
      .from('games')
      .select('art_id')
      .eq('id', rowId)
      .maybeSingle();
    const uploadId = row?.art_id || rowId;

    const path = await server.putThumbnail(uploadId, blob);
    if (!path) {
      warnOnce('no card art was uploaded (no reachable image store — set BLOB_READ_WRITE_TOKEN)');
      return null;
    }
    const upd = await supabase.from('games').update({ thumbnail_path: path }).eq('id', rowId);
    if (upd.error) warnOnce('card art uploaded but its path could not be saved', upd.error);
    return path;
  } catch (err) {
    warnOnce('card art skipped', err);
    return null;
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

export const setGameVisibility = async (id, isPublic) => {
  const supabase = await client();
  if (!supabase) return fail('Accounts are not enabled on this deployment.');
  if (!id) return fail('Missing game id.');
  const visibility = isPublic ? 'public' : 'private';
  try {
    const { error, count } = await supabase
      .from('games')
      .update({ visibility }, { count: 'exact' })
      .eq('id', id);
    if (error) return fail(error);
    if (!count) return fail('That game is not in your library.');
    return { ok: true, visibility };
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

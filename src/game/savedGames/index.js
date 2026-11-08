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
import { ensureUploaded, ensureArtStored } from '../assetCache/index.js';
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
  const { run: _run, audit: _audit, cost, ...rest } = assetMeta;
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

const COLUMNS = 'id,owner_id,title,mode,prompt,config,art_id,thumbnail_path,visibility,published_at,allow_remix,remix_parent_id,created_at,updated_at';

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
  const config = stripForShare(liveParams, { forRow: true });
  const assetMeta = buildSaveMeta(liveParams.assetMeta);
  const values = {
    title: titleFor(liveParams),
    mode,
    prompt: promptFor(liveParams),
    config,
    asset_meta: assetMeta,
    art_id: artId,
    // Remixable unless the creator turned it off (`=== true` made every unset
    // game non-remixable; the checkbox now writes an explicit boolean).
    allow_remix: liveParams.allowRemix !== false,
  };
  // Lineage is written ONLY when a row is created. A row's parent never changes,
  // and a game can never be its own parent.
  const parentId = liveParams.remixParentId && liveParams.remixParentId !== liveParams.savedGameId
    ? liveParams.remixParentId
    : null;

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
    // Card art is keyed by the ROW (2026-11-05), so it is uploaded once the row
    // id is known: art ids are shared between games, and a card stored under the
    // art id was overwritten by every other game using the same art set.
    const uploadCard = async (rowId) => {
      try {
        const blob = await compose();
        if (!blob) { warnOnce('no card art was produced from the game\'s own images'); return null; }
        const path = await server.putThumbnail(rowId, blob);
        if (!path) { warnOnce('no card art was uploaded (no reachable image store — set BLOB_READ_WRITE_TOKEN)'); return null; }
        const upd = await supabase.from('games').update({ thumbnail_path: path }).eq('id', rowId);
        if (upd.error) { warnOnce('card art uploaded but its path could not be saved', upd.error); return null; }
        return path;
      } catch (err) {
        warnOnce('card art skipped', err);
        return null;
      }
    };

    // Art ids are SHARED across users on purpose (the cache reuses art), so every
    // row lookup is scoped to the caller. Without the owner filter this could land
    // on someone else's public row, "save" 0 rows under RLS and report success.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const ownerId = authData?.user?.id;
    if (authError || !ownerId) return fail('Sign in to save games.');

    let rowId = liveParams.savedGameId || null;
    // A game generated in THIS session is a new game: it must never be matched to
    // an older row by art id. Art ids are shared (two Quick Starts get the same
    // preset art), and that lookup made the second game's auto-save overwrite the
    // first game's row. The art-id lookup is only for re-saving a restored game.
    if (!rowId && artId && !liveParams.createdInSession) {
      const existing = await supabase
        .from('games')
        .select('id')
        .eq('art_id', artId)
        .eq('owner_id', ownerId)
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
        .update(updateValues)
        .eq('id', rowId)
        .select('id,thumbnail_path,visibility')
        .maybeSingle();
      if (upd.error) return fail(upd.error);
      if (upd.data) {
        // A new card only when this save brings a real frame, or the row has none.
        let thumbnail = upd.data.thumbnail_path || null;
        if (frameBlob || !thumbnail) thumbnail = (await uploadCard(upd.data.id)) || thumbnail;
        return { ok: true, id: upd.data.id, created: false, visibility: upd.data.visibility, thumbnail: thumbnail || undefined };
      }
      // 0 rows updated: that row is not in THIS user's library (or is gone). Fall
      // through and create the user's own copy rather than reporting a phantom save.
    }

    const ins = await supabase
      .from('games')
      .insert({ ...values, remix_parent_id: parentId })
      .select('id,visibility')
      .maybeSingle();
    if (ins.error) return fail(ins.error);
    const newId = ins.data?.id;
    const thumbnail = newId ? await uploadCard(newId) : null;
    return { ok: true, id: newId, created: true, visibility: ins.data?.visibility || 'private', thumbnail: thumbnail || undefined };
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
    const path = await server.putThumbnail(rowId, blob);
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

/**
 * The signed-in user's OWN row for an art id (F5 / a copied link of your own
 * game: the URL carries no row id, so Share and Save would lose the row).
 * Newest first; null when there is none.
 */
export const findMyRowByArtId = async (artId) => {
  if (!artId) return null;
  const supabase = await client();
  if (!supabase) return null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const ownerId = authData?.user?.id;
    if (!ownerId) return null;
    const { data } = await supabase
      .from('games')
      .select('id,owner_id,visibility,title')
      .eq('art_id', artId)
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
};

/** Current visibility of a row the caller can read, or null. */
export const getRowVisibility = async (rowId) => {
  if (!rowId) return null;
  const supabase = await client();
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('games').select('visibility').eq('id', rowId).maybeSingle();
    return data?.visibility || null;
  } catch {
    return null;
  }
};

/**
 * The signed-in user's own rows, newest first.
 *
 * The owner filter is explicit, not left to RLS: the public-read migration
 * (20261031000000_games_public_read.sql) added `games_select_public`, which is
 * OR-combined with `games_select_own`. RLS therefore returns other people's
 * PUBLIC games to a signed-in caller too, and this list would leak them into
 * My Games without this predicate.
 */
export const listMyGames = async () => {
  const supabase = await client();
  if (!supabase) return { ok: false, games: [], configured: false, error: 'Accounts are not enabled on this deployment.' };
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authError || !user) {
      return { ok: false, games: [], configured: true, error: 'Sign in to see your games.' };
    }
    const { data, error } = await supabase
      .from('games')
      .select(COLUMNS)
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) {
      if (isSchemaMissing(error)) return { ok: false, games: [], configured: true, schemaMissing: true, error: error.message };
      return { ok: false, games: [], configured: true, error: error.message };
    }
    const games = data || [];
    // Absolute card URLs, resolved client-side: art is stored as a PATH because
    // the store's hostname can change while the path is the read-path contract.
    // The owner's own games are never hidden; a game whose art is definitely gone
    // gets a badge instead (Play boots its built-in world).
    await Promise.all(games.map(async (g) => {
      const probe = g.art_id ? server.probeGame(g.art_id, { timeoutMs: 2500 }) : Promise.resolve('none');
      const url = g.thumbnail_path ? server.publicUrl(g.thumbnail_path) : Promise.resolve('');
      const [state, thumb] = await Promise.all([probe, url]);
      g.art_missing = state === 'missing';
      if (g.thumbnail_path) g.thumbnail_url = thumb || null;
    }));
    return { ok: true, games, configured: true };
  } catch (err) {
    return { ok: false, games: [], configured: true, error: err?.message || String(err) };
  }
};

/**
 * List all public community games across all players, newest first.
 * Readable by anyone (anon and authed) thanks to RLS public read policy.
 */
export const listPublicGames = async ({ limit = 60 } = {}) => {
  const supabase = await client();
  if (!supabase) return { ok: false, games: [], configured: false, error: 'Accounts are not enabled on this deployment.' };
  try {
    const { data, error } = await supabase
      .from('games')
      .select(COLUMNS)
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (isSchemaMissing(error)) return { ok: false, games: [], configured: true, schemaMissing: true, error: error.message };
      return { ok: false, games: [], configured: true, error: error.message };
    }
    const games = data || [];
    const ownerIds = [...new Set(games.map(g => g.owner_id).filter(Boolean))];
    const profileMap = new Map();
    if (ownerIds.length > 0) {
      try {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id,display_name')
          .in('id', ownerIds);
        if (profs) {
          profs.forEach(p => profileMap.set(p.id, p.display_name));
        }
      } catch {
        /* profile lookup failure is non-fatal */
      }
    }
    // Community never lists a game whose art is gone (2026-11-07: "Spiders" was
    // published with art that never reached the server, so Play could only show
    // the built-in world). One cached HEAD per row, in parallel and time-boxed;
    // only a definite 404 hides a row — a slow or offline store hides nothing.
    const artState = new Map();
    await Promise.all(games.map(async (g) => {
      g.creator_name = profileMap.get(g.owner_id) || 'Community Creator';
      const probe = g.art_id ? server.probeGame(g.art_id, { timeoutMs: 2500 }) : Promise.resolve('none');
      const url = g.thumbnail_path ? server.publicUrl(g.thumbnail_path) : Promise.resolve('');
      const [state, thumb] = await Promise.all([probe, url]);
      artState.set(g.id, state);
      if (g.thumbnail_path) g.thumbnail_url = thumb || null;
    }));
    const listed = games.filter((g) => artState.get(g.id) !== 'missing');
    if (listed.length < games.length) {
      console.info(`[Community] hiding ${games.length - listed.length} game(s) whose artwork is missing.`);
    }
    return { ok: true, games: listed, configured: true };
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

export const setGameVisibility = async (id, isPublic, { artId = null } = {}) => {
  const supabase = await client();
  if (!supabase) return fail('Accounts are not enabled on this deployment.');
  if (!id) return fail('Missing game id.');
  // A public game must be playable by anyone, so its art has to be on the
  // server first (uploaded from this browser's cache when it never got there).
  // Only a definite miss refuses; an unreachable store never blocks a publish.
  if (isPublic && artId) {
    const stored = await ensureArtStored(artId);
    if (!stored.ok) {
      return fail('This game\'s artwork is missing, so it can\'t be shared publicly. Use Quick Edit to redraw it, then publish again.');
    }
  }
  const visibility = isPublic ? 'public' : 'private';
  const published_at = isPublic ? new Date().toISOString() : null;
  try {
    const { error, count } = await supabase
      .from('games')
      .update({ visibility, published_at }, { count: 'exact' })
      .eq('id', id);
    if (error) return fail(error);
    if (!count) return fail('That game is not in your library.');
    return { ok: true, visibility, published_at };
  } catch (err) {
    return fail(err);
  }
};

/**
 * Creator toggle: may other people remix this game? Owner-only via RLS (a
 * non-owner's update matches 0 rows, reported as "not in your library").
 */
export const setGameRemix = async (id, allow) => {
  const supabase = await client();
  if (!supabase) return fail('Accounts are not enabled on this deployment.');
  if (!id) return fail('Missing game id.');
  try {
    const { error, count } = await supabase
      .from('games')
      .update({ allow_remix: !!allow }, { count: 'exact' })
      .eq('id', id);
    if (error) return fail(error);
    if (!count) return fail('That game is not in your library.');
    return { ok: true, allow_remix: !!allow };
  } catch (err) {
    return fail(err);
  }
};

/**
 * Fetch a published or unlisted game for public playback.
 * Permitted by RLS for anon and authenticated visitors.
 *
 * @param {string} id UUID of the game
 * @returns {Promise<{ok: boolean, game?: object, error?: string}>}
 */
export const getPublicGame = async (id) => {
  const supabase = await client();
  if (!supabase) return fail('Accounts are not enabled on this deployment.');
  if (!id) return fail('Missing game id.');

  try {
    const { data, error } = await supabase
      .from('games')
      .select('id,owner_id,title,mode,prompt,config,asset_meta,art_id,thumbnail_path,visibility,created_at,published_at,allow_remix,remix_parent_id')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (isSchemaMissing(error)) return fail('Games library schema is not yet configured.');
      return fail(error);
    }
    if (!data) {
      return fail('Game not found or is private.');
    }

    let thumbnailUrl = null;
    if (data.thumbnail_path) {
      thumbnailUrl = await server.publicUrl(data.thumbnail_path);
    }

    let creatorName = 'Community Creator';
    if (data.owner_id) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', data.owner_id)
          .maybeSingle();
        if (prof?.display_name) {
          creatorName = prof.display_name;
        }
      } catch {
        /* profile lookup failure is non-fatal */
      }
    }

    let parentGame = null;
    if (data.remix_parent_id) {
      try {
        const { data: parent } = await supabase
          .from('games')
          .select('id,title,mode')
          .eq('id', data.remix_parent_id)
          .maybeSingle();
        if (parent) parentGame = parent;
      } catch {
        /* parent lookup failure is non-fatal */
      }
    }

    return {
      ok: true,
      game: {
        ...data,
        thumbnail_url: thumbnailUrl,
        creator_name: creatorName,
        parent_game: parentGame,
      }
    };
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

// Share-link v2 (2026-08-11): slim payload + game id.
//
// v1 links serialized the ENTIRE liveParams — assetMeta bulk plus garbage `{}`
// entries for the non-serializable HTMLImageElements — into 11-14KB URLs that
// carried no art anyway. v2 strips both and keeps only what a boot needs, plus
// the gameId that lets the local asset cache (and, later, a server backend)
// restore the real AI art. The `#config=` param name is unchanged and decode
// falls back to the v1 format, so old links keep working.

// Only the load-bearing boot fields of assetMeta survive on the link: frames
// (spritesheet registration + animation), facingVerified (sprite alignment),
// dropped (optional-slot state). Everything else feeds only the cost report.
// Exported for the saved-games library: a saved row's `config` IS this payload,
// which is what lets "Play" on a My Games card re-enter through the same tested
// share-link import path instead of a second boot route.
export const stripForShare = (liveParams) => {
  // autoSaveExempt is a per-SESSION import marker (getInitialState stamps it on
  // a config decoded from a shared link) — it must never be persisted into a
  // saved row's config, or a later replay of that row would arrive pre-exempt
  // and never auto-save. saveRunId is the same class of thing: a per-boot
  // identity used only to dedup auto-save and to land a late result on the right
  // config. Persisting it would let one browser's run id leak into another's
  // library, and a replayed row would arrive carrying a stale one.
  //
  // savedGameId is stripped for a sharper reason: the live URL is rewritten from
  // this same payload (so F5 works), so it is a URL the user can copy and send.
  // Carrying the row id in it means a recipient who presses Save targets the
  // SHARER's row, and — the second the per-user RLS policies are the one thing
  // still unproven in this deployment — that can write someone else's library.
  // A replayed AI game still resolves its own row by art_id, which is the match
  // key the column was designed for.
  const {
    preloadedImages: _pi,
    assetMeta,
    autoSaveExempt: _exempt,
    saveRunId: _run,
    savedGameId: _saved,
    ...config
  } = liveParams || {};
  const slots = assetMeta?.slots;
  if (slots) {
    const lite = {};
    for (const [slot, m] of Object.entries(slots)) {
      const entry = {};
      if (m?.frames) entry.frames = m.frames;
      if (m?.facingVerified != null) entry.facingVerified = m.facingVerified;
      if (m?.dropped) entry.dropped = true;
      if (Object.keys(entry).length) lite[slot] = entry;
    }
    if (Object.keys(lite).length) config.assetMetaLite = { slots: lite };
  }
  return config;
};

export const encodeShareConfig = (liveParams) => {
  const json = JSON.stringify(stripForShare(liveParams));
  // Unicode-safe base64 — plain btoa threw (silently) on non-Latin-1 prompts.
  return btoa(unescape(encodeURIComponent(json)));
};

export const decodeShareConfig = (encoded) => {
  const raw = atob(encoded);
  let json;
  try {
    json = decodeURIComponent(escape(raw));
  } catch {
    json = raw; // pre-v2 links were plain Latin-1 btoa output
  }
  return JSON.parse(json);
};

/**
 * Lift a share payload's slim slot metadata back into the shape the boot path
 * reads (`config.assetMeta.slots`), merging with whatever real metadata is
 * already there.
 *
 * `stripForShare` has always written assetMetaLite, and until 2026-09-29
 * NOTHING read it — the link's `frames` were inert, so a game restored from a
 * link whose art had fallen out of the cache booted with an assetMeta the
 * sprite-sheet gates could not see. That is a whole class of "the player is
 * static" / "the sprite is the wrong size" reports that no amount of art
 * debugging would explain. It is deliberately tolerant: real metadata always
 * wins, and a missing field is simply not lifted.
 *
 * @param {object} config  a decoded share payload / boot config
 * @returns {object} the same config, with assetMeta.slots populated from
 *                   assetMetaLite where real metadata is absent
 */
export const hydrateAssetMetaLite = (config) => {
  const lite = config?.assetMetaLite?.slots;
  if (!lite || typeof lite !== 'object') return config;
  const slots = { ...(config.assetMeta?.slots || {}) };
  let changed = false;
  for (const [slot, m] of Object.entries(lite)) {
    const existing = slots[slot];
    if (!existing) {
      slots[slot] = { ...m };
      changed = true;
    } else {
      // Real metadata exists: fill only the fields it is missing, so a cache
      // hit is never degraded by the link's summary.
      for (const [k, v] of Object.entries(m || {})) {
        if (existing[k] == null) { existing[k] = v; changed = true; }
      }
    }
  }
  if (!changed) return config;
  const { assetMetaLite: _lite, ...rest } = config;
  return { ...rest, assetMeta: { ...(config.assetMeta || {}), slots } };
};

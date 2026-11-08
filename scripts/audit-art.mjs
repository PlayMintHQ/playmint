#!/usr/bin/env node
// Saved-game art audit (2026-11-05). Node 18+, no dependencies.
//
// Before 2026-11-05 an edit (Quick Edit restyle, the background player repair)
// re-uploaded its art under the SAME art id, and art ids are shared between games
// (Quick Start, exact prompt hits, matcher reuse). So a saved game can now point at
// art that another game's edit replaced — proven case: "Purple Alien Dash" opens
// the "African City Dash" world. The original pixels are gone; the client decided
// those rows are DELETED.
//
// What it does (read-only unless --delete):
//   for every row with an art_id, fetch games/<art_id>/meta.json from the public
//   Blob store and compare the row's saved snapshot (asset_meta.slots.*.promptUsed)
//   with what is stored now:
//     DELETE  — the WORLD changed (background_far or floor): the row opens another
//               game's world. These are the delete candidates.
//     review  — only cast/props changed (often the owner's own Quick Edit that was
//               never re-saved). Listed, never deleted.
//     ok      — matches.
//   It also lists art ids shared by several rows, and old characters (no rev).
//
// Usage:
//   node scripts/audit-art.mjs                      # report (public rows with the anon key,
//                                                   # ALL rows when SUPABASE_SERVICE_ROLE_KEY is set)
//   node scripts/audit-art.mjs --out report.json    # also write the report
//   node scripts/audit-art.mjs --delete --report report.json
//                                                   # delete ONLY the DELETE rows listed in a
//                                                   # report you reviewed (each is re-verified
//                                                   # first). Needs SUPABASE_SERVICE_ROLE_KEY.
// Keys are read from the environment or .env and are never printed.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const readDotEnv = async () => {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    const out = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    return out;
  } catch {
    return {};
  }
};
const fileEnv = await readDotEnv();
const env = (k) => process.env[k] || fileEnv[k] || '';

const SUPABASE_URL = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, '');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const KEY = SERVICE_KEY || env('VITE_SUPABASE_ANON_KEY') || env('SUPABASE_ANON_KEY');
const SITE = env('PM_SITE_URL') || 'https://playmintai.vercel.app';
if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL / a Supabase key (env or .env).');
  process.exit(2);
}
// New-style keys (sb_secret_… / sb_publishable_…) are not JWTs: they go in the
// apikey header only. Legacy JWT keys are also sent as the Bearer token.
const headers = /^sb_(secret|publishable)_/.test(KEY)
  ? { apikey: KEY }
  : { apikey: KEY, Authorization: `Bearer ${KEY}` };
const WORLD = ['background_far', 'floor'];

const blobBase = async () => {
  const explicit = env('BLOB_BASE_URL') || env('VITE_BLOB_BASE_URL');
  if (explicit) return explicit.replace(/\/+$/, '');
  const r = await fetch(`${SITE}/api/games/upload`);
  if (!r.ok) throw new Error(`could not discover the Blob store (${r.status})`);
  return (await r.json()).baseUrl;
};

const fetchRows = async () => {
  const select = 'id,owner_id,title,mode,visibility,art_id,updated_at,slots:asset_meta->slots';
  const scope = SERVICE_KEY ? '' : '&visibility=eq.public';
  const r = await fetch(`${SUPABASE_URL}/rest/v1/games?art_id=not.is.null${scope}&select=${select}&order=updated_at.desc&limit=1000`, { headers });
  if (!r.ok) throw new Error(`games query failed (${r.status})`);
  return r.json();
};

const classify = (row, meta) => {
  if (!meta) return { verdict: 'missing-art', changed: [] };
  const now = meta.assetMeta?.slots || {};
  const snap = row.slots || {};
  const changed = Object.keys({ ...now, ...snap }).filter((s) =>
    snap[s]?.promptUsed && now[s]?.promptUsed && snap[s].promptUsed !== now[s].promptUsed);
  const worldChanged = changed.some((s) => WORLD.includes(s));
  const cast = meta.assetMeta?.view === 'topdown' ? ['player', 'enemy'] : ['player'];
  const oldChars = cast.filter((s) => now[s] && !(Number(now[s].rev) >= 20261105));
  return {
    verdict: worldChanged ? 'DELETE' : changed.length ? 'review' : 'ok',
    changed,
    storedName: meta.config?.gameName || null,
    schemaVersion: meta.schemaVersion ?? null,
    oldCharacters: oldChars
  };
};

const main = async () => {
  const base = await blobBase();
  const rows = await fetchRows();
  console.log(`Scope: ${SERVICE_KEY ? 'ALL rows (service role)' : 'PUBLIC rows only (anon key — set SUPABASE_SERVICE_ROLE_KEY for all rows)'}; ${rows.length} row(s) with art.`);
  const metaCache = new Map();
  const getMeta = async (id) => {
    if (!metaCache.has(id)) {
      metaCache.set(id, fetch(`${base}/games/${id}/meta.json`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return metaCache.get(id);
  };

  if (flag('--delete')) {
    if (!SERVICE_KEY) { console.error('--delete needs SUPABASE_SERVICE_ROLE_KEY.'); process.exit(2); }
    const reportPath = opt('--report');
    if (!reportPath) { console.error('--delete needs --report <reviewed report.json>.'); process.exit(2); }
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const listed = new Set((report.rows || []).filter((r) => r.verdict === 'DELETE').map((r) => r.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    let deleted = 0;
    for (const id of listed) {
      const row = byId.get(id);
      if (!row) { console.log(`skip ${id}: no longer exists`); continue; }
      const again = classify(row, await getMeta(row.art_id));
      if (again.verdict !== 'DELETE') { console.log(`skip ${id} "${row.title}": no longer a world mismatch`); continue; }
      const r = await fetch(`${SUPABASE_URL}/rest/v1/games?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } });
      console.log(r.ok ? `deleted ${id} "${row.title}"` : `FAILED ${id} (${r.status})`);
      if (r.ok) deleted++;
    }
    console.log(`${deleted} row(s) deleted. Blob folders are kept (art may back other games).`);
    return;
  }

  const out = [];
  for (const row of rows) {
    const c = classify(row, await getMeta(row.art_id));
    out.push({ id: row.id, title: row.title, mode: row.mode, visibility: row.visibility, owner: row.owner_id, artId: row.art_id, updated: row.updated_at, ...c });
  }
  const shared = {};
  for (const r of out) (shared[r.artId] ||= []).push(r.title);
  const pad = (v, n) => String(v ?? '').slice(0, n).padEnd(n);
  console.log(`\n${pad('verdict', 11)} ${pad('title', 28)} ${pad('mode', 10)} ${pad('vis', 8)} ${pad('art', 9)} changed slots / notes`);
  for (const r of out) {
    const notes = [
      r.changed.length ? r.changed.join(',') : '',
      r.storedName && r.storedName !== r.title && r.verdict !== 'ok' ? `stored art is "${r.storedName}"` : '',
      shared[r.artId].length > 1 ? `art shared by ${shared[r.artId].length} rows` : '',
      r.oldCharacters?.length ? `pre-fix characters: ${r.oldCharacters.join(',')}` : '',
      r.schemaVersion === 1 ? 'stored before Oct 6 (v1 — restorable since Nov 7)' : ''
    ].filter(Boolean).join(' · ');
    console.log(`${pad(r.verdict, 11)} ${pad(r.title, 28)} ${pad(r.mode, 10)} ${pad(r.visibility, 8)} ${pad(r.artId?.slice(0, 8), 9)} ${notes}`);
  }
  // Public rows whose art is gone: Community hides them at load time; this
  // statement makes them private for good (the owner keeps the row).
  const missingPublic = out.filter((r) => r.verdict === 'missing-art' && r.visibility === 'public');
  if (missingPublic.length) {
    console.log(`\n${missingPublic.length} public game(s) have no stored art. To hide them for good (owner keeps the row), run in the SQL editor:`);
    console.log(`update public.games set visibility = 'private', published_at = null where id in (${missingPublic.map((r) => `'${r.id}'`).join(', ')}) and visibility = 'public';`);
  }
  const del = out.filter((r) => r.verdict === 'DELETE');
  console.log(`\n${del.length} delete candidate(s) (world replaced by another game's edit), ${out.filter((r) => r.verdict === 'review').length} to review.`);
  const outPath = opt('--out');
  if (outPath) {
    await writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), scope: SERVICE_KEY ? 'all' : 'public', rows: out }, null, 2));
    console.log(`Report written to ${outPath}. Review it, then: node scripts/audit-art.mjs --delete --report ${outPath}`);
  }
};

main().catch((err) => { console.error('audit failed:', err.message); process.exit(1); });

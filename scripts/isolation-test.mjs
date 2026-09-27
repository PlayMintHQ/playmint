// Two-account RLS isolation test (2026-09-27, contract §2B).
//
// WHAT IT PROVES, in the client's own acceptance terms: account B cannot see or
// touch account A's saved games — not through the app, but through the API
// directly, with B's real user JWT. Every request below is a plain PostgREST
// call with an access token obtained from Supabase Auth by signing in as a real
// user. There is no service role in this script on purpose: the service role
// BYPASSES RLS, so using it would test nothing.
//
// USAGE (two real confirmed accounts are required; the migration must be
// applied first — this script exits early with the reason if not):
//
//   node scripts/isolation-test.mjs \
//     --url https://<project>.supabase.co \
//     --anon <VITE_SUPABASE_ANON_KEY> \
//     --a user-a@example.com --a-pass '…' \
//     --b user-b@example.com --b-pass '…'
//
//   --url and --anon may be omitted to read VITE_SUPABASE_URL /
//   VITE_SUPABASE_ANON_KEY from .env at the repo root. Nothing is ever written
//   to a file unless --out is passed, and the output contains NO tokens — only
//   the verdict per check.
//
// Exit code is 0 only when every check passes, so it can gate CI later.

import { readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) {
    args[key.slice(2)] = next;
    i += 1;
  } else {
    args[key.slice(2)] = true;
  }
}

// .env is read ONLY when a flag is missing, and only for the two public values.
const readDotEnv = async () => {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    const out = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
};

const env = await readDotEnv();
const URL_BASE = (args.url || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = args.anon || env.VITE_SUPABASE_ANON_KEY || '';

const A = { email: args['a'], password: args['a-pass'] };
const B = { email: args['b'], password: args['b-pass'] };

const results = [];
let failures = 0;

const record = (name, pass, detail) => {
  results.push({ check: name, result: pass ? 'PASS' : 'FAIL', detail });
  if (!pass) failures += 1;
  console.log(`${pass ? '✓' : '✗'} ${name} — ${detail}`);
};

const signIn = async ({ email, password }) => {
  if (!email || !password) throw new Error('Both accounts need an email and a password (--a/--a-pass/--b/--b-pass).');
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${body?.error_description || body?.msg || res.status}`);
  }
  return { token: body.access_token, userId: body.user?.id };
};

// Every call is a direct PostgREST request with a USER token — the same surface
// the app uses, so a passing result is a statement about the real client.
const rest = (token, path, init = {}) => fetch(`${URL_BASE}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    Prefer: 'return=representation',
    ...(init.headers || {})
  }
});

// A 0-row mutation is NOT distinguishable by status: PostgREST answers a PATCH
// or DELETE that matched nothing with 200 and an EMPTY array (our `Prefer:
// return=representation` header), and a PATCH that DID hijack a row with 200 and
// that row. So every mutation check below looks at the RETURNED ROWS, never at
// the status alone — otherwise the one failure this script exists to catch would
// be reported as PASS.
const rowsFrom = async (res) => {
  const body = await res.json().catch(() => null);
  if (Array.isArray(body)) return body;
  return null; // an error object (refused outright) — nothing was returned
};

// PASS when the mutation matched no row (or was refused). `matched` is the count
// of rows the request actually came back with.
const mutationDenied = (rows) => (rows === null || rows.length === 0);

const run = async () => {
  if (!URL_BASE || !ANON) {
    console.error('Missing --url/--anon (or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env).');
    process.exit(2);
  }

  let a;
  let b;
  try {
    a = await signIn(A);
    b = await signIn(B);
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exit(2);
  }
  if (a.userId === b.userId) {
    console.error('\nBoth flags are the same account. Two DIFFERENT accounts are required.');
    process.exit(2);
  }
  record('two distinct accounts signed in', true, `A=${a.userId.slice(0, 8)}… B=${b.userId.slice(0, 8)}…`);

  // --- The table must exist, or nothing below is meaningful. -------------
  const probe = await rest(a.token, 'games?select=id&limit=1');
  if (probe.status === 404 || /does not exist/i.test(await probe.clone().text().catch(() => ''))) {
    console.error('\nThe `games` table does not exist. Apply supabase/migrations/20260927000000_games.sql first.');
    process.exit(2);
  }

  // --- No session at all (bare anon key) must see nothing and write nothing.
  // Checked FIRST, while the table is still empty apart from other users' rows,
  // so the assertion is about the GRANT/RLS, not about the data.
  const anonList = await fetch(`${URL_BASE}/rest/v1/games?select=id&limit=5`, { headers: { apikey: ANON } });
  const anonListBody = await anonList.json().catch(() => null);
  const anonRows = Array.isArray(anonListBody) ? anonListBody.length : null;
  record('anonymous key sees no rows', anonRows === 0, `GET /games with the anon key → ${anonRows === null ? anonList.status : `${anonRows} row(s)`}`);

  const anonInsert = await fetch(`${URL_BASE}/rest/v1/games`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ title: 'anon-probe', mode: 'runner', config: {} })
  });
  record('anonymous insert is refused', !anonInsert.ok, `POST /games → ${anonInsert.status}`);

  // --- Seed a row as A, through the API only (no app involved). ----------
  const stamp = Date.now();
  const config = { gameName: `isolation-probe-${stamp}`, gameType: 'runner' };
  const created = await rest(a.token, 'games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `isolation-probe-${stamp}`,
      mode: 'runner',
      prompt: 'isolation test',
      config,
      art_id: null
    })
  });
  const createdBody = await created.json().catch(() => []);
  const createdRow = Array.isArray(createdBody) ? createdBody[0] : null;
  record('A can save a game', created.ok && !!createdRow, created.ok ? 'INSERT allowed for the owner' : `INSERT refused (${created.status})`);
  if (!created.ok || !createdRow) {
    finish();
    return;
  }
  const id = createdRow.id;

  // --- B must not see it. ------------------------------------------------
  const bList = await rest(b.token, 'games?select=id&order=updated_at');
  const bListBody = await bList.json().catch(() => null);
  const bSees = Array.isArray(bListBody) && bListBody.some((r) => r.id === id);
  record('B cannot list A\'s game', !bSees, bSees ? `B's list contains A's row` : `B sees ${Array.isArray(bListBody) ? bListBody.length : 0} row(s), none of them A's`);

  const bDirect = await rest(b.token, `games?select=id&id=eq.${id}`);
  const bDirectBody = await bDirect.json().catch(() => null);
  record('B cannot fetch A\'s game by id', !Array.isArray(bDirectBody) || bDirectBody.length === 0, `GET /games?id=eq.${id} → ${bDirectBody?.length ?? 0} row(s)`);

  // --- B must not be able to change or destroy it. -----------------------
  // Judged on returned rows, not status (see rowsFrom/mutationDenied).
  const bUpdate = await rest(b.token, `games?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'hijacked-by-b' })
  });
  const bUpdateRows = await rowsFrom(bUpdate);
  const updateDenied = mutationDenied(bUpdateRows);
  record('B cannot rename A\'s game', updateDenied,
    updateDenied
      ? `PATCH → ${bUpdate.status}, 0 row(s) matched (${bUpdateRows === null ? 'refused' : 'empty result'})`
      : `HIJACKED — PATCH returned ${bUpdateRows.length} row(s)`);

  const bDelete = await rest(b.token, `games?id=eq.${id}`, { method: 'DELETE' });
  const bDeleteRows = await rowsFrom(bDelete);
  const deleteDenied = mutationDenied(bDeleteRows);
  // Belt and braces: a delete that matched nothing returns [] just like one that
  // deleted a row, so the AUTHORITATIVE proof that A's row survived is the
  // re-read as A below. This check reports what B's request returned.
  record('B cannot delete A\'s game', deleteDenied,
    deleteDenied
      ? `DELETE → ${bDelete.status}, 0 row(s) matched (${bDeleteRows === null ? 'refused' : 'empty result'})`
      : `DELETED — DELETE returned ${bDeleteRows.length} row(s)`);

  // --- B cannot forge ownership by supplying owner_id on INSERT. -----------
  // Two layers reject this: the column-level INSERT grant (owner_id is not
  // granted) and games_insert_own's with check. Both are worth proving.
  const bForge = await rest(b.token, 'games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `forged-by-b-${stamp}`,
      mode: 'runner',
      config,
      owner_id: a.userId
    })
  });
  const bForgeBody = await bForge.json().catch(() => null);
  const bForgeRow = Array.isArray(bForgeBody) ? bForgeBody[0] : null;
  const forgedOk = bForge.ok && bForgeRow && bForgeRow.owner_id === a.userId;
  record('B cannot insert a row owned by A', !forgedOk, forgedOk ? 'FORGED — RLS is not doing its job' : `POST with owner_id=A → ${bForge.ok ? 'refused/overridden' : bForge.status}`);

  // Clean up any row the forge attempt actually managed to create.
  if (forgedOk) {
    await rest(b.token, `games?id=eq.${bForgeRow.id}`, { method: 'DELETE' });
  }

  // --- A's own row must have survived B's attempts. ----------------------
  const aAfter = await rest(a.token, `games?select=id,title&id=eq.${id}`);
  const aAfterBody = await aAfter.json().catch(() => null);
  const survived = Array.isArray(aAfterBody) && aAfterBody.length === 1 && aAfterBody[0].title === `isolation-probe-${stamp}`;
  record('A\'s game is unchanged after B\'s attempts', survived, survived ? 'title intact' : `row now: ${JSON.stringify(aAfterBody)}`);

  // --- A can still delete its own row (cleanup + the happy path). ---------
  // Also judged by re-reading, not by status: a successful delete and a 0-row
  // delete both answer 200 with []. The row must actually be GONE.
  const aDelete = await rest(a.token, `games?id=eq.${id}`, { method: 'DELETE' });
  const aDeleteBody = await aDelete.json().catch(() => null);
  const aGone = await rest(a.token, `games?select=id&id=eq.${id}`);
  const aGoneBody = await aGone.json().catch(() => null);
  const goneNow = Array.isArray(aGoneBody) && aGoneBody.length === 0;
  record('A can delete its own game', aDelete.ok && goneNow,
    goneNow ? `DELETE → ${aDelete.status}, row confirmed gone` : `row still present after DELETE (${JSON.stringify(aGoneBody)})`);

  finish();
};

const finish = () => {
  const summary = {
    ranAt: new Date().toISOString(),
    project: URL_BASE.replace(/https?:\/\/([^.]+)\..*/, '$1…'),
    accounts: { a: A.email, b: B.email },
    checks: results,
    result: failures === 0 ? 'PASS' : `FAIL (${failures})`,
    note: 'Supabase RLS blocks the request, not the client: each request above is a direct PostgREST call carrying a real user access token.'
  };
  console.log(`\n${summary.result} — ${results.length} checks`);
  if (args.out) {
    writeFileSync(args.out, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`Written to ${args.out}`);
  }
  process.exit(failures === 0 ? 0 : 1);
};

run();

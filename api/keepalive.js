// Supabase keep-alive (2026-09-27, contract §3 "daily keep-alive").
//
// A free-tier Supabase project PAUSES after a week of inactivity and, on the
// paid tier, bills for it while idle. One small query a day is the cheapest way
// to keep `profiles`/`games` warm. Vercel Cron (see vercel.json) hits this
// route daily; the response is also a useful deploy probe, because it reports
// whether the September `games` migration is actually applied.
//
// SECURITY: this uses the SERVICE ROLE key, which bypasses RLS, so it is read
// only — one row's id, nothing else — and the key never leaves the server. It
// must be set as a server-side env var (`SUPABASE_SERVICE_ROLE_KEY`), never as a
// `VITE_`-prefixed one. The route is public like api/games/upload.js (same
// accepted posture in this project): unauthenticated callers can trigger one
// tiny select and nothing else.
//
// If the key is missing the route says so and does nothing, so a misconfigured
// cron can never take anything down.

const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  // VITE_SUPABASE_URL is already set for the browser, so it is a usable
  // fallback; SUPABASE_URL is honoured first for a server-only configuration.
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !key) {
    json(res, 200, {
      ok: false,
      configured: false,
      missing: [!url ? 'SUPABASE_URL' : null, !key ? 'SUPABASE_SERVICE_ROLE_KEY' : null].filter(Boolean),
      hint: 'Set SUPABASE_SERVICE_ROLE_KEY (server-side only) so the daily cron keeps the project awake.'
    });
    return;
  }

  // One select, per table. A REJECTED fetch (DNS blip, Supabase unreachable) is
  // caught rather than allowed to escape the handler: an unhandled rejection
  // would answer the cron with a 500 stack trace, and a transient network error
  // is a "did not keep the project awake" report, not a broken route.
  const probe = async (table) => {
    try {
      const r = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
      return { status: r.status, ok: r.ok };
    } catch (err) {
      return { status: 0, ok: false, error: err?.message || String(err) };
    }
  };

  const t0 = Date.now();
  // `profiles` exists from the Week 1 migration, so it never fails for the wrong
  // reason; the `games` probe is reported separately.
  const [profiles, games] = await Promise.all([probe('profiles'), probe('games')]);

  json(res, 200, {
    ok: profiles.ok,
    at: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    profiles: profiles.status,
    // PGRST205/42P01 = the September migration has not been applied yet. That is
    // a configuration state, not a keep-alive failure.
    games: games.status,
    gamesTable: games.ok ? 'ok' : 'missing-or-unreachable',
    ...(profiles.error ? { error: profiles.error } : {}),
    source: req.headers['x-vercel-cron'] ? 'cron' : 'manual'
  });
}

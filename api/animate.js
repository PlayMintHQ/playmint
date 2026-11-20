// Server-side animation proxy (November 2026): PixelLab skeleton animation for Runner heroes.
//
// WHY: the Gemini image models cannot control near/far limb swaps in a side view, so a
// Runner hero's arms never alternate. PixelLab redraws the SAME hero (our static Gemini
// sprite) in a skeleton pose per frame, so arms and legs swap exactly as the pose table
// says. The browser computes the skeletons (src/game/assetPipeline/runCycle.js); this
// endpoint only holds the key, validates the payload and rate-limits.
//
// SECURITY: PIXELLAB_API_KEY is read from the server environment ONLY. It is never
// VITE_-prefixed and never sent to the client.
//
// One action per POST (each call is short, so no long-running function is needed):
//   estimate -> POST /estimate-skeleton            ({ image })              -> { keypoints }
//   start    -> POST /animate-with-skeleton-v3     (hero + skeletons)       -> { jobId }
//   poll     -> GET  /background-jobs/{id}                                  -> { status, images? }

const API = 'https://api.pixellab.ai/v2';

const envInt = (name, fallback) => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
// Animation jobs per 24h (counted on `start` only; one job = one hero's cycle).
const GUEST_DAILY_ANIM_LIMIT = envInt('GUEST_DAILY_ANIM_LIMIT', 4);
const AUTH_DAILY_ANIM_LIMIT = envInt('AUTH_DAILY_ANIM_LIMIT', 40);
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_B64 = 300 * 1024; // a 128x128 PNG is ~10-40KB

const rateLimits = new Map();
function checkInMemory(identifier, limit) {
  const now = Date.now();
  let rec = rateLimits.get(identifier);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + WINDOW_MS };
    rateLimits.set(identifier, rec);
  }
  rec.count++;
  return { exceeded: rec.count > limit, limit, remaining: Math.max(0, limit - rec.count), resetAt: rec.resetAt };
}

async function checkRateLimit(identifier, limit) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/check_and_increment_rate_limit`, {
        method: 'POST',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_identifier: identifier, p_limit: limit, p_window_seconds: Math.floor(WINDOW_MS / 1000) })
      });
      if (r.ok) {
        const d = await r.json();
        return { exceeded: Boolean(d.exceeded), limit: Number(d.limit), remaining: Number(d.remaining), resetAt: Number(d.reset_at) * 1000 };
      }
    } catch { /* fall through to the in-memory window */ }
  }
  return checkInMemory(identifier, limit);
}

async function resolveIdentity(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (token && supabaseUrl && anon) {
    try {
      const r = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const u = await r.json();
        if (u?.id) return { userId: u.id, isAuth: true };
      }
    } catch { /* guest */ }
  }
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown-guest';
  return { userId: null, isAuth: false, ip };
}

const isB64 = (s) => typeof s === 'string' && s.length > 0 && s.length <= MAX_IMAGE_B64 && /^[A-Za-z0-9+/=]+$/.test(s);
const LABELS = new Set(['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM',
  'RIGHT HIP', 'RIGHT KNEE', 'RIGHT LEG', 'LEFT HIP', 'LEFT KNEE', 'LEFT LEG', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR']);

// Accept only well-formed skeletons: 18 known labels, 0-1 coordinates, integer z.
function cleanSkeleton(frame) {
  if (!Array.isArray(frame) || frame.length !== 18) return null;
  const out = [];
  for (const k of frame) {
    if (!k || !LABELS.has(k.label)) return null;
    const x = Number(k.x), y = Number(k.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
    out.push({ x, y, label: k.label, z_index: Math.trunc(Number(k.z_index) || 0) });
  }
  return out;
}

async function pl(method, path, body) {
  const key = (process.env.PIXELLAB_API_KEY || '').trim();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  return { status: res.status, data };
}

function upstreamError(res, status, data) {
  if (status === 402) return res.status(503).json({ error: 'Animation provider has no credit left.', kind: 'unconfigured' });
  if (status === 401) return res.status(503).json({ error: 'Animation provider key rejected.', kind: 'unconfigured' });
  if (status === 429) return res.status(429).json({ error: 'Animation provider is busy, try again shortly.', kind: 'busy' });
  const detail = typeof data?.detail === 'string' ? data.detail : Array.isArray(data?.detail) ? JSON.stringify(data.detail).slice(0, 300) : '';
  return res.status(502).json({ error: `Animation provider error (${status}). ${detail}`.trim(), kind: 'upstream' });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(process.env.PIXELLAB_API_KEY || '').trim()) {
    return res.status(503).json({ error: 'PIXELLAB_API_KEY is not configured on the server.', kind: 'unconfigured' });
  }
  const { action } = req.body || {};
  try {
    if (action === 'estimate') {
      const { image } = req.body;
      if (!isB64(image)) return res.status(400).json({ error: 'image must be a small base64 PNG.' });
      const r = await pl('POST', '/estimate-skeleton', { image: { type: 'base64', base64: image, format: 'png' } });
      if (r.status !== 200) return upstreamError(res, r.status, r.data);
      return res.status(200).json({ keypoints: r.data.keypoints, usage: r.data.usage || null });
    }

    if (action === 'start') {
      const { description, firstFrame, firstKeypoints, keypoints, seed } = req.body;
      if (!isB64(firstFrame)) return res.status(400).json({ error: 'firstFrame must be a small base64 PNG.' });
      if (typeof description !== 'string' || !description.trim() || description.length > 300) {
        return res.status(400).json({ error: 'description is required (max 300 chars).' });
      }
      const first = cleanSkeleton(firstKeypoints);
      if (!first) return res.status(400).json({ error: 'firstKeypoints invalid.' });
      if (!Array.isArray(keypoints) || keypoints.length < 3 || keypoints.length > 12) {
        return res.status(400).json({ error: 'keypoints must be 3-12 skeleton frames.' });
      }
      const frames = keypoints.map(cleanSkeleton);
      if (frames.some((f) => !f)) return res.status(400).json({ error: 'keypoints contain an invalid skeleton.' });

      const id = await resolveIdentity(req);
      const limit = id.isAuth ? AUTH_DAILY_ANIM_LIMIT : GUEST_DAILY_ANIM_LIMIT;
      const rl = await checkRateLimit(`anim:${id.isAuth ? `user:${id.userId}` : `ip:${id.ip}`}`, limit);
      res.setHeader('X-RateLimit-Limit', rl.limit);
      res.setHeader('X-RateLimit-Remaining', rl.remaining);
      if (rl.exceeded) {
        return res.status(429).json({
          error: id.isAuth ? 'Daily animation quota exceeded.' : 'Guest animation limit reached. Sign in to create more games.',
          kind: 'quota', isAuth: id.isAuth
        });
      }

      const r = await pl('POST', '/animate-with-skeleton-v3', {
        description: description.trim(),
        action: 'run',
        direction: 'east',
        view: 'side',
        first_frame: { type: 'base64', base64: firstFrame, format: 'png' },
        first_frame_keypoints: first,
        keypoints: frames,
        no_background: true,
        seed: Number.isInteger(seed) && seed >= 0 ? seed : 0
      });
      if (r.status !== 200) return upstreamError(res, r.status, r.data);
      return res.status(200).json({ jobId: r.data.background_job_id, status: r.data.status || 'processing' });
    }

    if (action === 'poll') {
      const { jobId } = req.body;
      if (typeof jobId !== 'string' || !/^[0-9a-fA-F-]{20,64}$/.test(jobId)) return res.status(400).json({ error: 'jobId invalid.' });
      const r = await pl('GET', `/background-jobs/${jobId}`);
      if (r.status !== 200) return upstreamError(res, r.status, r.data);
      const status = r.data?.status;
      if (status === 'completed') {
        const imgs = r.data?.last_response?.images || [];
        const images = imgs.map((im) => (typeof im === 'string' ? im : im?.base64)).filter(Boolean);
        const usage = r.data?.usage || r.data?.last_response?.usage || null;
        return res.status(200).json({ status, images, usage });
      }
      if (status === 'failed') {
        const detail = r.data?.last_response?.detail;
        return res.status(200).json({ status, error: typeof detail === 'string' ? detail.slice(0, 300) : 'animation failed' });
      }
      return res.status(200).json({ status: status || 'processing' });
    }

    return res.status(400).json({ error: 'Invalid action. Use "estimate", "start" or "poll".' });
  } catch (err) {
    return res.status(502).json({ error: `Animation proxy failed: ${err?.message || err}`, kind: 'upstream' });
  }
}

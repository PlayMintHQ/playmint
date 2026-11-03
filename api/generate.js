// Server-Side Generation & Usage Protection Endpoint (October 2026 Milestone)
//
// WHAT THIS DOES:
// 1. Keeps GEMINI_API_KEY secure on the server (never compiled into public client bundles).
// 2. Enforces per-user generation limits and guest rate limits before hitting Gemini.
// 3. Validates prompt lengths, model whitelists, and schemas.
// 4. Proxies requests to Google Gemini via @google/genai and returns image data or structured JSON.

import { GoogleGenAI } from '@google/genai';

// Rate limiting in-memory store (sliding window, 24 hours)
// Map<identifier, { count: number, resetAt: number }>
const rateLimits = new Map();

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let lastCleanup = Date.now();

function cleanExpiredLimits() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, record] of rateLimits.entries()) {
    if (now > record.resetAt) {
      rateLimits.delete(key);
    }
  }
}

// Limits per 24 hours:
// Guests: 25 API slot calls (approx. 2-3 full games)
// Authenticated Users: 200 API slot calls (approx. 20 full games)
// Budget counts IMAGE generations only (the paid calls). A full game is ~8-10
// image calls, so 25 = 2-3 games for a guest. Text/vision calls (art direction,
// cache matcher, vision QA, editor) are cheap and get their own, larger bucket so
// they can never starve the image budget. Both are env-overridable.
const envInt = (name, fallback) => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const GUEST_DAILY_LIMIT = envInt('GUEST_DAILY_IMAGE_LIMIT', 25);
const AUTH_DAILY_LIMIT = envInt('AUTH_DAILY_IMAGE_LIMIT', 200);
const GUEST_DAILY_TEXT_LIMIT = envInt('GUEST_DAILY_TEXT_LIMIT', 150);
const AUTH_DAILY_TEXT_LIMIT = envInt('AUTH_DAILY_TEXT_LIMIT', 1000);
// Image prompts reach ~3.6k chars (the 10-pose sheet scaffold); a 2.5k cap made
// every animated-sheet request fail with a 400.
const MAX_PROMPT_CHARS = 16000;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function checkRateLimitInMemory(identifier, limit) {
  cleanExpiredLimits();
  const now = Date.now();

  let record = rateLimits.get(identifier);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + WINDOW_MS };
    rateLimits.set(identifier, record);
  }

  record.count++;
  const remaining = Math.max(0, limit - record.count);
  const exceeded = record.count > limit;

  return { exceeded, limit, remaining, resetAt: record.resetAt, persistent: false };
}

async function checkRateLimit(identifier, limit) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/check_and_increment_rate_limit`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_identifier: identifier,
          p_limit: limit,
          p_window_seconds: Math.floor(WINDOW_MS / 1000)
        })
      });

      if (rpcRes.ok) {
        const data = await rpcRes.json();
        return {
          exceeded: Boolean(data.exceeded),
          limit: Number(data.limit),
          remaining: Number(data.remaining),
          resetAt: Number(data.reset_at) * 1000,
          persistent: true
        };
      }
    } catch {
      // Degrade gracefully to in-memory sliding window if Supabase RPC is unreachable
    }
  }

  return checkRateLimitInMemory(identifier, limit);
}

const ALLOWED_IMAGE_MODELS = new Set([
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-nano-banana-2.1',
  'gemini-2.5-flash-image'
]);

const ALLOWED_TEXT_MODELS = new Set([
  'gemini-flash-latest'
]);

// Server-side only. Deliberately NOT falling back to a VITE_ variable: those are
// compiled into the public client bundle.
const getApiKey = () => (process.env.GEMINI_API_KEY || '').trim();

let cachedClient = null;
let cachedKey = null;

function getServerClient() {
  const key = getApiKey();
  if (!key) throw new Error('GEMINI_API_KEY is not configured on the server.');
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new GoogleGenAI({ apiKey: key });
    cachedKey = key;
  }
  return cachedClient;
}

// Models differ in which optional fields they accept (imageSize on lite models,
// thinkingConfig on some tiers). A 400 INVALID_ARGUMENT is retried ONCE with the
// optional fields stripped instead of failing the slot.
const isInvalidArgument = (err) =>
  (err?.status ?? err?.code) === 400 || /invalid[_ ]argument/i.test(err?.message || '');

async function generateWithOptionalFallback(ai, params, stripPaths) {
  try {
    return await ai.models.generateContent(params);
  } catch (err) {
    if (!isInvalidArgument(err)) throw err;
    const config = { ...params.config };
    for (const path of stripPaths) {
      if (path === 'thinkingConfig') delete config.thinkingConfig;
      if (path === 'imageSize' && config.imageConfig) {
        config.imageConfig = { ...config.imageConfig };
        delete config.imageConfig.imageSize;
      }
    }
    return ai.models.generateContent({ ...params, config });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Resolve Identity for Rate Limiting
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  
  let userId = null;
  let isAuth = false;

  // Validate Supabase JWT if token present
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (token && supabaseUrl && supabaseAnonKey) {
    try {
      const userRes = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`
        }
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData?.id) {
          userId = userData.id;
          isAuth = true;
        }
      }
    } catch {
      // Degrade to IP rate limit if Supabase check fails
    }
  }

  // 2. Validate Request Body
  const { action, prompt, model, aspectRatio, imageSize, referenceImageDataUrls, responseSchema, imageDataUrl, label } = req.body || {};

  if (!action || (action !== 'image' && action !== 'json')) {
    return res.status(400).json({ error: 'Invalid action. Must be "image" or "json".' });
  }

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required and must be non-empty.' });
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ error: 'Prompt exceeds maximum length (16000 characters).' });
  }


  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown-guest';
  const rateLimitKey = isAuth ? `user:${userId}` : `ip:${clientIp}`;
  const isImage = action === 'image';
  const bucketKey = isImage ? rateLimitKey : `text:${rateLimitKey}`;
  const bucketLimit = isImage
    ? (isAuth ? AUTH_DAILY_LIMIT : GUEST_DAILY_LIMIT)
    : (isAuth ? AUTH_DAILY_TEXT_LIMIT : GUEST_DAILY_TEXT_LIMIT);

  const rateStatus = await checkRateLimit(bucketKey, bucketLimit);
  res.setHeader('X-RateLimit-Limit', rateStatus.limit);
  res.setHeader('X-RateLimit-Remaining', rateStatus.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateStatus.resetAt / 1000));

  if (rateStatus.exceeded) {
    return res.status(429).json({
      error: isAuth
        ? 'Daily generation quota exceeded. Please return tomorrow.'
        : 'Guest generation limit reached. Sign in to create more games.',
      kind: 'quota',
      isAuth,
      remaining: 0
    });
  }

  // 3. Process Action
  try {
    const ai = getServerClient();

    if (action === 'image') {
      const activeModel = model && ALLOWED_IMAGE_MODELS.has(model) ? model : 'gemini-3.1-flash-image';
      
      const refs = Array.isArray(referenceImageDataUrls) ? referenceImageDataUrls : [];
      let contents = prompt;
      const refParts = [];
      for (const ref of refs) {
        const match = ref?.match(/^data:([^;]+);base64,(.*)$/s);
        if (match) refParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
      if (refParts.length) {
        contents = [{ parts: [{ text: prompt }, ...refParts] }];
      }

      const config = {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio || '1:1',
          ...(imageSize ? { imageSize } : {})
        },
        thinkingConfig: { thinkingBudget: 0 }
      };

      const result = await generateWithOptionalFallback(ai, {
        model: activeModel,
        contents,
        config
      }, ['imageSize', 'thinkingConfig']);

      const candidate = result?.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find(p => p.inlineData?.data);

      if (!imagePart) {
        const finishReason = candidate?.finishReason || 'unknown';
        const kind = /safety/i.test(finishReason) ? 'safety' : 'no-image';
        return res.status(500).json({ error: `Gemini returned no image (finishReason: ${finishReason})`, kind });
      }

      const mimeType = imagePart.inlineData.mimeType || 'image/png';
      const dataUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

      return res.status(200).json({
        ok: true,
        dataUrl,
        model: activeModel,
        usage: result.usageMetadata || null
      });
    }

    if (action === 'json') {
      const activeModel = model && ALLOWED_TEXT_MODELS.has(model) ? model : 'gemini-flash-latest';

      let contents = prompt;
      if (imageDataUrl) {
        const match = imageDataUrl.match(/^data:([^;]+);base64,(.*)$/s);
        if (match) {
          contents = [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: match[1], data: match[2] } }
            ]
          }];
        }
      }

      const result = await generateWithOptionalFallback(ai, {
        model: activeModel,
        contents,
        config: {
          responseMimeType: 'application/json',
          ...(responseSchema ? { responseSchema } : {}),
          thinkingConfig: { thinkingBudget: 0 }
        }
      }, ['thinkingConfig']);

      let parsed = null;
      try {
        parsed = JSON.parse(result.text || '{}');
      } catch {
        return res.status(500).json({ error: 'Model response was not valid JSON', kind: 'no-image' });
      }

      return res.status(200).json({
        ok: true,
        data: parsed,
        model: activeModel,
        usage: result.usageMetadata || null
      });
    }
  } catch (err) {
    const status = err?.status ?? err?.code ?? 500;
    const message = err?.message || String(err);
    const isQuota = status === 429 || status === 402 || /credits are depleted|resource_exhausted/i.test(message);
    const kind = isQuota ? 'quota' : (status === 401 || status === 403 ? 'auth' : 'network');

    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: message,
      kind
    });
  }
}

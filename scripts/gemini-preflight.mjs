// Production Gemini API Preflight & Diagnostic Script (October 2026 Milestone)
//
// WHAT IT DOES:
// Reads the Gemini API key from .env (VITE_GEMINI_API_KEY or GEMINI_API_KEY)
// or from --key <key>. Executes targeted test calls across the model tiers:
//  1. Structured JSON (gemini-flash-latest)
//  2. Static slot model (gemini-3.1-flash-lite-image)
//  3. Consistency & fallback model (gemini-3.1-flash-image)
//  4. (Optional with --pro) gemini-3-pro-image
//
// SECURITY: NEVER prints the API key.
// Exit code is 0 on all passes, 1 on failure.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GoogleGenAI } from '@google/genai';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// CLI args parser
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
const apiKey = (args.key || env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();

if (!apiKey) {
  console.error('\x1b[31m[FAIL] No Gemini API key found in .env or arguments.\x1b[0m');
  console.error('Provide --key <key> or define VITE_GEMINI_API_KEY in .env');
  process.exit(1);
}

const maskedKey = apiKey.length > 8
  ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
  : '****';

console.log(`\x1b[36m=== PlayMint Gemini Production Preflight ===\x1b[0m`);
console.log(`Using Key: ${maskedKey}`);
console.log(`Timestamp: ${new Date().toISOString()}\n`);

const ai = new GoogleGenAI({ apiKey });
const results = [];

const PRICING = {
  'gemini-3.1-flash-lite-image': 30, // $30/1M output tokens
  'gemini-3.1-flash-image': 60,      // $60/1M output tokens
  'gemini-3-pro-image': 120,         // $120/1M output tokens
  'gemini-flash-latest': { in: 0.30, out: 2.50 }
};

// 1. Test Text/JSON Model
async function testText() {
  const model = 'gemini-flash-latest';
  const label = 'Text/JSON (Art Direction & Matcher)';
  const t0 = performance.now();
  try {
    const res = await ai.models.generateContent({
      model,
      contents: 'Respond with valid JSON: {"status": "ok", "engine": "gemini"}',
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    const elapsed = Math.round(performance.now() - t0);
    const text = res.text || '';
    const parsed = JSON.parse(text);
    const usage = res.usageMetadata || {};
    const promptTokens = usage.promptTokenCount || 0;
    const outTokens = usage.candidatesTokenCount || 0;
    const thoughts = usage.thoughtsTokenCount || 0;
    const cost = ((promptTokens * PRICING[model].in) + ((outTokens + thoughts) * PRICING[model].out)) / 1e6;

    results.push({
      tier: label,
      model,
      status: parsed.status === 'ok' ? 'PASS' : 'WARN',
      elapsed,
      tokens: `${promptTokens} in / ${outTokens} out / ${thoughts} think`,
      cost: `$${cost.toFixed(5)}`,
      detail: `Parsed JSON: ${JSON.stringify(parsed)}`
    });
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    results.push({
      tier: label,
      model,
      status: 'FAIL',
      elapsed,
      tokens: '-',
      cost: '$0.00000',
      detail: err?.message || String(err)
    });
  }
}

// 2. Test Image Generation Call
async function testImage(model, label, imageSize = null) {
  const t0 = performance.now();
  try {
    const config = {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '1:1', ...(imageSize ? { imageSize } : {}) },
      thinkingConfig: { thinkingBudget: 0 }
    };

    const res = await ai.models.generateContent({
      model,
      contents: 'A simple minimalist flat 2d red apple on a pure white background, pixel art sprite.',
      config
    });

    const elapsed = Math.round(performance.now() - t0);
    const candidate = res?.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(p => p.inlineData?.data);

    if (!imagePart) {
      throw new Error(`No image data returned (finishReason: ${candidate?.finishReason || 'unknown'})`);
    }

    const usage = res.usageMetadata || {};
    const promptTokens = usage.promptTokenCount || 0;
    const outTokens = usage.candidatesTokenCount || 1200;
    const thoughts = usage.thoughtsTokenCount || 0;
    const rate = PRICING[model] || 60;
    const cost = (((outTokens + thoughts) * rate) + (promptTokens * 0.5)) / 1e6;

    results.push({
      tier: label,
      model,
      status: 'PASS',
      elapsed,
      tokens: `${outTokens} tokens`,
      cost: `$${cost.toFixed(5)}`,
      detail: `Image mime: ${imagePart.inlineData.mimeType || 'image/png'}, size: ${imagePart.inlineData.data.length} b64 chars`
    });
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    results.push({
      tier: label,
      model,
      status: 'FAIL',
      elapsed,
      tokens: '-',
      cost: '$0.00000',
      detail: err?.message || String(err)
    });
  }
}

await testText();
await testImage('gemini-3.1-flash-lite-image', 'Slot Model (Primary Scenery/Props)');
await testImage('gemini-3.1-flash-image', 'Sheet Model (Player & Fallback)');

if (args.pro) {
  await testImage('gemini-3-pro-image', 'Pro Sheet Model (Quality Mode)');
}

if (args.banana) {
  await testImage('gemini-nano-banana-2.1', 'Sheet Candidate (A/B Test)');
}

console.log('Results Summary:');
console.table(results.map(r => ({
  Tier: r.tier,
  Model: r.model,
  Status: r.status,
  Latency: `${r.elapsed}ms`,
  EstCost: r.cost,
  Detail: r.detail.slice(0, 50)
})));

const failed = results.filter(r => r.status === 'FAIL');
if (failed.length > 0) {
  console.log(`\n\x1b[31m[FAILED] ${failed.length} call(s) failed:\x1b[0m`);
  for (const f of failed) {
    console.log(` - ${f.model} (${f.tier}): ${f.detail}`);
  }
  process.exit(1);
} else {
  console.log('\n\x1b[32m[SUCCESS] All Gemini production tiers verified successfully.\x1b[0m');
  process.exit(0);
}

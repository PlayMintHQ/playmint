// Test suite for Public Share, Preview & Minimal Remix (October 2026 Milestone §2C)
// Runs with: node scripts/test-public-share.mjs

import previewHandler from '../api/game-preview.js';
import { shareLink } from '../src/utils/shareUtils.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`\x1b[32m  ✓ PASS:\x1b[0m ${message}`);
    passed++;
  } else {
    console.error(`\x1b[31m  ✗ FAIL:\x1b[0m ${message}`);
    failed++;
  }
}

function mockRes() {
  const headers = {};
  let statusCode = 200;
  let body = '';
  return {
    setHeader(k, v) { headers[k] = v; },
    status(code) { statusCode = code; return this; },
    send(data) { body = data; return this; },
    json(data) { body = JSON.stringify(data); return this; },
    getHeaders() { return headers; },
    getStatusCode() { return statusCode; },
    getBody() { return body; }
  };
}

console.log('\x1b[36m=== Testing Public Sharing & Social Meta Tags ===\x1b[0m\n');

// Test 1: api/game-preview rejects non-GET/HEAD methods
{
  const req = { method: 'POST', query: {} };
  const res = mockRes();
  await previewHandler(req, res);
  assert(res.getStatusCode() === 405, 'Rejects POST with 405 Method Not Allowed');
}

// Test 2: api/game-preview returns HTML with default tags if no gameId
{
  const req = { method: 'GET', query: {} };
  const res = mockRes();
  await previewHandler(req, res);
  assert(res.getStatusCode() === 200, 'Answers GET without id with 200 OK');
  assert(res.getHeaders()['Content-Type'].includes('text/html'), 'Content-Type is text/html');
  assert(res.getBody().includes('PlayMint'), 'HTML contains PlayMint title');
}

// Test 3: shareLink fallback in Node / non-navigator environment
{
  const result = await shareLink({
    title: 'Test Game',
    url: 'https://playmintai.vercel.app/g/123-abc'
  });
  // In node.js without DOM/navigator, clipboard/execCommand fallback handles gracefully
  assert(result.method === 'clipboard', 'Falls back to clipboard method in absence of navigator.share');
}

// Test 4: Verify default Open Graph tags in index.html
{
  const req = { method: 'GET', query: { id: 'test-preview-id' } };
  const res = mockRes();
  await previewHandler(req, res);
  const body = res.getBody();
  assert(body.includes('og:title'), 'HTML includes og:title meta property');
  assert(body.includes('og:description'), 'HTML includes og:description meta property');
  assert(body.includes('twitter:card'), 'HTML includes twitter:card meta tag');
}

console.log(`\n\x1b[36m=== Public Share Tests: ${passed} passed, ${failed} failed ===\x1b[0m`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('\x1b[32mAll public sharing and social preview tests passed!\x1b[0m\n');
  process.exit(0);
}

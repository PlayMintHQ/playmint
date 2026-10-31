// Local Test Harness for api/generate.js (Server Generation & Protection Endpoint)
// Runs locally: node scripts/test-api-generate.mjs

import handler from '../api/generate.js';

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
  let body = null;
  return {
    setHeader(k, v) { headers[k] = v; },
    status(code) { statusCode = code; return this; },
    json(data) { body = data; return this; },
    getHeaders() { return headers; },
    getStatusCode() { return statusCode; },
    getBody() { return body; }
  };
}

console.log('\x1b[36m=== Testing api/generate Serverless Endpoint ===\x1b[0m\n');

// Test 1: Reject Non-POST requests
{
  const req = { method: 'GET', headers: {} };
  const res = mockRes();
  await handler(req, res);
  assert(res.getStatusCode() === 405, 'Rejects GET with 405 Method Not Allowed');
}

// Test 2: Reject Invalid Action
{
  const req = {
    method: 'POST',
    headers: { 'x-forwarded-for': '192.168.1.1' },
    body: { action: 'invalid-action', prompt: 'test' }
  };
  const res = mockRes();
  await handler(req, res);
  assert(res.getStatusCode() === 400, 'Rejects invalid action with 400 Bad Request');
}

// Test 3: Reject Empty Prompt
{
  const req = {
    method: 'POST',
    headers: { 'x-forwarded-for': '192.168.1.1' },
    body: { action: 'image', prompt: '   ' }
  };
  const res = mockRes();
  await handler(req, res);
  assert(res.getStatusCode() === 400, 'Rejects empty prompt with 400 Bad Request');
}

// Test 4: Rate Limiting Headers are present
{
  const req = {
    method: 'POST',
    headers: { 'x-forwarded-for': '10.0.0.1' },
    body: { action: 'image', prompt: 'a runner on a road' }
  };
  const res = mockRes();
  await handler(req, res);
  const headers = res.getHeaders();
  assert(headers['X-RateLimit-Limit'] === 25, 'Guest rate limit is set to 25 daily calls');
  assert(headers['X-RateLimit-Remaining'] !== undefined, 'X-RateLimit-Remaining header is returned');
}

// Test 5: Guest Rate Limiting Exceeded (429)
{
  const ip = '10.0.0.99';
  let lastRes = null;
  // Trigger 26 requests to exhaust the 25-request limit
  for (let i = 0; i < 26; i++) {
    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': ip },
      body: { action: 'image', prompt: 'prompt test' }
    };
    lastRes = mockRes();
    await handler(req, lastRes);
  }
  assert(lastRes.getStatusCode() === 429, 'Exceeding 25 requests returns HTTP 429 Too Many Requests');
  assert(lastRes.getBody()?.kind === 'quota', 'Error kind is "quota"');
  assert(lastRes.getBody()?.error?.includes('Guest generation limit reached'), 'Clear guest upgrade message returned');
}

console.log(`\n\x1b[36m=== Server Endpoint Tests: ${passed} passed, ${failed} failed ===\x1b[0m`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('\x1b[32mAll api/generate protection tests passed successfully!\x1b[0m\n');
  process.exit(0);
}

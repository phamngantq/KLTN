#!/usr/bin/env node
/** Read-only smoke for the isolated synthetic preview. Never creates accounts/data. */
import assert from 'node:assert/strict';

const baseUrl = process.argv[2];
if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
  console.error('Usage: node scripts/smoke-preview.mjs https://<preview-worker>.workers.dev');
  process.exit(2);
}

async function request(path, init) {
  const response = await fetch(new URL(path, baseUrl), {
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
  const body = await response.text();
  return { response, body: body ? JSON.parse(body) : null };
}

const home = await fetch(new URL('/', baseUrl), { signal: AbortSignal.timeout(15_000) });
assert.equal(home.status, 200);
assert.match(home.headers.get('content-type') ?? '', /text\/html/);

const health = await request('/api/v1/health');
assert.equal(health.response.status, 200);
assert.equal(health.body.data.status, 'ok');
assert.equal(health.response.headers.get('x-frame-options'), 'DENY');

const subjects = await request('/api/v1/subjects');
assert.equal(subjects.response.status, 200);
assert.ok(subjects.body.data.length >= 2);

const tutors = await request('/api/v1/tutors');
assert.equal(tutors.response.status, 200);
assert.equal(tutors.body.data.total, 2);
assert.ok(tutors.body.data.items.every((tutor) => tutor.displayName.startsWith('Gia sư mẫu')));

for (const path of ['/api/v1/auth/register', '/api/v1/bookings', '/api/v1/parent/requests']) {
  const result = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(result.response.status, 503, path);
  assert.equal(result.body.error.code, 'PREVIEW_READ_ONLY', path);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
}

console.log('preview smoke: PASS (SPA, health, subjects, 2 sample tutors, 3 write gates)');

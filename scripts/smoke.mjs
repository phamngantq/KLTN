#!/usr/bin/env node
/**
 * Read-only smoke check for the Figma-target Worker deployment.
 * Run the stateful parent → moderator → tutor journey against isolated local D1 with Playwright.
 * Usage: node scripts/smoke.mjs https://<worker>.workers.dev
 */
const base = process.argv[2]?.replace(/\/$/, '');
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/smoke.mjs <base-url>');
  process.exit(2);
}

let failures = 0;
function check(name, passed) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
  if (!passed) failures++;
}

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML is expected on SPA routes.
  }
  return { response, text, json };
}

try {
  const home = await get('/');
  check(
    'SPA and security headers',
    home.response.status === 200 &&
      home.text.includes('<div id="root">') &&
      (home.response.headers.get('content-security-policy') ?? '').includes(
        "frame-ancestors 'none'",
      ),
  );
  for (const path of ['/lop-hoc', '/dich-vu', '/bang-gia', '/lien-he', '/blog/phu-huynh']) {
    const page = await get(path);
    check(`SPA ${path}`, page.response.status === 200 && page.text.includes('<div id="root">'));
  }

  const health = await get('/api/v1/health');
  check('Worker health', health.response.status === 200 && health.json?.data?.status === 'ok');
  check('API security headers', health.response.headers.get('x-frame-options') === 'DENY');

  const subjects = await get('/api/v1/subjects');
  check(
    'Subject catalogue',
    subjects.response.status === 200 && Array.isArray(subjects.json?.data),
  );
  const classes = await get('/api/v1/classes?pageSize=1');
  const classPage = classes.json?.data;
  check(
    'Public classes API',
    classes.response.status === 200 &&
      Array.isArray(classPage?.items) &&
      Number.isInteger(classPage?.total),
  );
  check(
    'Public class projection omits contact',
    !/contactPhone|contactAddress|parentDisplayName/.test(JSON.stringify(classPage?.items ?? [])),
  );

  const content = await get('/api/v1/content?kind=page&audience=public&pageSize=1');
  check(
    'Published content API',
    content.response.status === 200 && Array.isArray(content.json?.data?.items),
  );
  const fees = await get('/api/v1/fee-options/published');
  check('Published fee API', fees.response.status === 200 && Array.isArray(fees.json?.data));

  for (const path of [
    '/api/v1/parent/dashboard',
    '/api/v1/tutor/dashboard',
    '/api/v1/admin/reports/overview',
  ]) {
    const restricted = await get(path);
    check(`Anonymous access denied ${path}`, restricted.response.status === 401);
  }
} catch (error) {
  failures++;
  console.error(
    'FAIL  Network or response error:',
    error instanceof Error ? error.message : String(error),
  );
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);

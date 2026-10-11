#!/usr/bin/env node
/**
 * End-to-end smoke test against a running deployment (no browser).
 *   node scripts/smoke.mjs https://<worker>.workers.dev [--admin-email a@x --admin-password ...]
 * Without admin credentials it stops after the tutor submits the profile for review.
 * Creates accounts named smoke-<timestamp>-*@example.com; remove them with the printed SQL.
 */
const args = process.argv.slice(2);
const base = args[0]?.replace(/\/$/, '');
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0
    ? args[i + 1]
    : process.env[flag.replace(/^--/, '').toUpperCase().replaceAll('-', '_')];
};
if (!base?.startsWith('http')) {
  console.error(
    'Usage: node scripts/smoke.mjs <base-url> [--admin-email <e> --admin-password <p>]',
  );
  process.exit(2);
}

const stamp = Date.now();
let failures = 0;

function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
  return condition;
}

class Client {
  cookie = '';
  csrf = '';
  async call(method, path, body, headers = {}) {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(this.cookie && { Cookie: this.cookie }),
        ...(this.csrf && method !== 'GET' && { 'X-CSRF-Token': this.csrf }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const json = await res.json().catch(() => null);
    if (json?.data?.csrfToken) this.csrf = json.data.csrfToken;
    return { status: res.status, data: json?.data, error: json?.error, headers: res.headers };
  }
}

function localDateInVietnam(daysAhead) {
  const ms = Date.now() + 7 * 3600_000 + daysAhead * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function weekdayOf(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

const page = await fetch(`${base}/tutors`);
check('SPA route served', page.status === 200 && (await page.text()).includes('<div id="root">'));
check(
  'SPA has CSP header',
  (page.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"),
);

const anon = new Client();
const health = await anon.call('GET', '/health');
check('health', health.status === 200 && health.data?.status === 'ok');
check('API security headers', health.headers.get('x-frame-options') === 'DENY');
const subjects = await anon.call('GET', '/subjects');
check(
  'subject catalogue',
  subjects.status === 200 && subjects.data.length >= 9,
  `${subjects.data?.length} subjects`,
);

const password = `Smoke-${stamp}-pw!`;
const tutor = new Client();
const tReg = await tutor.call('POST', '/auth/register', {
  email: `smoke-${stamp}-tutor@example.com`,
  password,
  displayName: `Smoke Tutor ${stamp}`,
  role: 'tutor',
});
check('tutor registers', tReg.status === 201);
check('session cookie is __Host- Secure', tutor.cookie.startsWith('__Host-tm_session='));

const profile = await tutor.call('PATCH', '/tutor/profile', {
  bio: 'Smoke test profile',
  subjectIds: ['subj_math'],
  hourlyRateMinor: 150000,
  teachesOnline: true,
});
check('tutor saves profile', profile.status === 200 && profile.data.missing.length === 0);
const date = localDateInVietnam(3);
const weekly = await tutor.call('PUT', '/tutor/availability', {
  rules: [{ weekday: weekdayOf(date), start: '18:00', end: '20:00' }],
});
check('tutor saves weekly availability', weekly.status === 200);
check(
  'tutor submits for review',
  (await tutor.call('POST', '/tutor/profile/submit', {})).status === 200,
);
check(
  'unapproved tutor hidden from search',
  !(await anon.call('GET', '/tutors?pageSize=48')).data.items.some(
    (t) => t.slug === profile.data.slug,
  ),
);

const adminEmail = opt('--admin-email');
const adminPassword = opt('--admin-password');
if (adminEmail && adminPassword) {
  const admin = new Client();
  check(
    'admin signs in',
    (await admin.call('POST', '/auth/login', { email: adminEmail, password: adminPassword }))
      .status === 200,
  );
  const approve = await admin.call('POST', `/admin/tutors/${tReg.data.user.id}/approve`, {});
  check('admin approves tutor', approve.status === 200 && approve.data.visibility === 'public');

  const found = await anon.call('GET', '/tutors?subject=toan&pageSize=48');
  check(
    'approved tutor listed',
    found.data.items.some((t) => t.id === tReg.data.user.id),
  );
  const slots = await anon.call(
    'GET',
    `/tutors/${tReg.data.user.id}/slots?from=${date}&to=${date}&duration=60`,
  );
  check(
    'slots projected',
    slots.status === 200 && slots.data.slots.length === 3,
    `${slots.data?.slots?.length} slots`,
  );

  const student = new Client();
  check(
    'student registers',
    (
      await student.call('POST', '/auth/register', {
        email: `smoke-${stamp}-student@example.com`,
        password,
        displayName: `Smoke Student ${stamp}`,
        role: 'student',
      })
    ).status === 201,
  );
  const body = {
    tutorId: tReg.data.user.id,
    startUtc: slots.data.slots[0].startUtc,
    durationMinutes: 60,
  };
  const key = `smoke-${stamp}`;
  const booked = await student.call('POST', '/bookings', body, { 'Idempotency-Key': key });
  check(
    'student books (PENDING, server price)',
    booked.status === 201 && booked.data.status === 'PENDING' && booked.data.priceMinor === 150000,
  );
  const replay = await student.call('POST', '/bookings', body, { 'Idempotency-Key': key });
  check(
    'idempotent replay returns same booking',
    replay.status === 201 && replay.data.id === booked.data.id,
  );
  const after = await anon.call(
    'GET',
    `/tutors/${tReg.data.user.id}/slots?from=${date}&to=${date}&duration=60`,
  );
  check(
    'booked slot disappears',
    after.data.slots.length === 1,
    `${after.data?.slots?.length} slots left`,
  );

  const confirm = await tutor.call('POST', `/bookings/${booked.data.id}/confirm`, {});
  check('tutor confirms', confirm.status === 200 && confirm.data.status === 'CONFIRMED');
  const list = await student.call('GET', '/bookings?status=CONFIRMED');
  check(
    'student sees confirmed booking',
    list.data.items.some((b) => b.id === booked.data.id),
  );
  const cancel = await student.call('POST', `/bookings/${booked.data.id}/cancel`, {});
  check('student cancels', cancel.status === 200 && cancel.data.status === 'CANCELLED');
  const reopened = await anon.call(
    'GET',
    `/tutors/${tReg.data.user.id}/slots?from=${date}&to=${date}&duration=60`,
  );
  check('slot released after cancel', reopened.data.slots.length === 3);

  const hide = await admin.call('POST', `/admin/tutors/${tReg.data.user.id}/hide`, {
    reason: 'Smoke test cleanup',
  });
  check('admin hides smoke tutor', hide.status === 200);
} else {
  console.log('SKIP  admin approval + booking flow (pass --admin-email/--admin-password)');
}

console.log(`\nCleanup SQL (smoke accounts only):
DELETE FROM bookings WHERE tutor_id IN (SELECT id FROM users WHERE email_normalized LIKE 'smoke-${stamp}-%');
DELETE FROM users WHERE email_normalized LIKE 'smoke-${stamp}-%';`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);

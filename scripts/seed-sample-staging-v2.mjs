#!/usr/bin/env node
/** Explicit, repeatable staging_v2 D1 seed. The only remote target is staging_v2. */
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER_ROOT = join(ROOT, '.wrangler');
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const SAMPLE_FILE = join(ROOT, '.env.example');
const STAGING_CONFIG_FILE = join(WRANGLER_ROOT, 'sample-staging-v2', 'config.vars');
const DEFAULT_CREDENTIALS = join(WRANGLER_ROOT, 'sample-staging-v2', 'credentials.vars');
const ADMIN_ID = '00000000-0000-4000-8000-000000000211';
const PARENT_ID = '00000000-0000-4000-8000-000000000212';
const FEE_DEFS = [
  [
    'first_lesson_percent',
    'SAMPLE_FEE_FIRST',
    10_000,
    null,
    '00000000-0000-4000-8000-000000000311',
  ],
  [
    'lesson_multiplier_with_deposit',
    'SAMPLE_FEE_LESSONS',
    100_000,
    'SAMPLE_FEE_LESSONS_DEPOSIT_BPS',
    '00000000-0000-4000-8000-000000000312',
  ],
  ['monthly_percent', 'SAMPLE_FEE_MONTHLY', 10_000, null, '00000000-0000-4000-8000-000000000313'],
];

function withinWrangler(path) {
  const target = resolve(ROOT, path);
  const part = relative(WRANGLER_ROOT, target);
  if (!part || part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) {
    throw new Error('Custom seed paths must be inside .wrangler/ in this repository.');
  }
  return target;
}

function parseArgs(args) {
  if (args.length === 0) return { local: false, credentials: DEFAULT_CREDENTIALS, persist: null };
  if (args[0] !== '--local-test' || args.length !== 5) {
    throw new Error(
      'Usage: node scripts/seed-sample-staging-v2.mjs [--local-test --persist-to .wrangler/<dir> --sample-env-file .wrangler/<file>]',
    );
  }
  const options = {};
  for (let i = 1; i < args.length; i += 2) {
    if (
      !['--persist-to', '--sample-env-file'].includes(args[i]) ||
      !args[i + 1] ||
      options[args[i]]
    ) {
      throw new Error('Local test requires --persist-to and --sample-env-file.');
    }
    options[args[i]] = withinWrangler(args[i + 1]);
  }
  if (!options['--persist-to'] || !options['--sample-env-file']) {
    throw new Error('Local test requires --persist-to and --sample-env-file.');
  }
  return {
    local: true,
    persist: options['--persist-to'],
    credentials: options['--sample-env-file'],
  };
}

function sql(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function required(config, key, max = 2000) {
  const value = config[key]?.trim();
  if (!value || value.length > max) throw new Error(`Invalid ${key} in sample config.`);
  return value;
}

function basisPoints(config, key, max) {
  const raw = required(config, key, 6);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid ${key} in sample config.`);
  }
  return value;
}

function configFromSample(options) {
  const file = options.local ? SAMPLE_FILE : STAGING_CONFIG_FILE;
  if (!existsSync(file)) {
    throw new Error(
      'Staging sample config is missing: copy .env.example to ignored .wrangler/sample-staging-v2/config.vars before remote seed.',
    );
  }
  const config = parseEnv(readFileSync(file, 'utf8'));
  const email = required(config, 'SAMPLE_STAGING_ADMIN_EMAIL', 254).toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email))
    throw new Error('Invalid staging admin email.');
  const parentEmail = required(config, 'SAMPLE_STAGING_PARENT_EMAIL', 254).toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(parentEmail) || parentEmail === email) {
    throw new Error('Invalid staging sample parent email.');
  }
  const fees = FEE_DEFS.map(([optionKey, prefix, max, depositKey, id]) => ({
    id,
    optionKey,
    title: required(config, `${prefix}_TITLE`, 120),
    policy: required(config, `${prefix}_POLICY`, 2000),
    rate: basisPoints(config, `${prefix}_RATE_BPS`, max),
    deposit: depositKey ? basisPoints(config, depositKey, 10_000) : null,
  }));
  for (const fee of fees)
    if (fee.policy.length < 10) throw new Error('Fee policy text is too short.');
  const source = JSON.parse(required(config, 'SAMPLE_CLASSES_JSON', 20_000));
  if (!Array.isArray(source) || source.length !== 8)
    throw new Error('Expected eight Figma class source rows.');
  const classes = source.filter((item) => item.seedOnStaging === true);
  if (classes.length !== 6 || source.some((item) => typeof item.seedOnStaging !== 'boolean')) {
    throw new Error('Expected six staging class rows and two excluded source rows.');
  }
  for (const item of classes) {
    const match = /^figma-public-class-(\d\d)$/.exec(item.sourceId);
    if (
      !match ||
      !/^subj_[a-z]+$/.test(item.subjectId) ||
      !/^Lớp (?:[1-9]|1[0-2])$/.test(item.grade) ||
      !['online', 'offline'].includes(item.mode) ||
      !Number.isInteger(item.expectedBudgetMinor) ||
      item.expectedBudgetMinor < 0 ||
      typeof item.description !== 'string' ||
      item.description.length > 1000 ||
      typeof item.publicArea !== 'string' ||
      !item.publicArea.includes('(lớp mẫu)') ||
      !Array.isArray(item.windows) ||
      !item.windows.length ||
      item.windows.length > 14
    ) {
      throw new Error(`Invalid class sample: ${item.sourceId}`);
    }
    const seen = new Set();
    for (const window of item.windows) {
      const key = `${window.weekday}:${window.startLocal}`;
      if (
        !Number.isInteger(window.weekday) ||
        window.weekday < 1 ||
        window.weekday > 7 ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.startLocal) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.endLocal) ||
        window.startLocal >= window.endLocal ||
        seen.has(key)
      ) {
        throw new Error(`Invalid schedule window: ${item.sourceId}`);
      }
      seen.add(key);
    }
    item.number = Number(match[1]);
  }
  if (new Set(classes.map((item) => item.number)).size !== classes.length)
    throw new Error('Duplicate Figma class source ID.');
  return {
    email,
    parentEmail,
    adminName: required(config, 'SAMPLE_ADMIN_DISPLAY_NAME', 100),
    fees,
    classes,
  };
}

function wrangler(args, json = false) {
  const logPath = join(WRANGLER_ROOT, 'logs');
  mkdirSync(logPath, { recursive: true });
  const output = execFileSync(process.execPath, [WRANGLER, ...args], {
    cwd: ROOT,
    env: { ...process.env, WRANGLER_LOG_PATH: logPath, CLOUDFLARE_ENV: '' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return json ? JSON.parse(output) : output;
}

function targetArgs(options) {
  return options.local
    ? ['--local', '--persist-to', options.persist]
    : ['--env', 'staging_v2', '--remote'];
}

function query(statement, options) {
  const result = wrangler(
    ['d1', 'execute', 'DB', ...targetArgs(options), '--command', statement, '--json'],
    true,
  );
  if (!result?.[0]?.success) throw new Error('D1 query failed.');
  return result[0].results;
}

function credential(options) {
  const file = options.credentials;
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const value = existing ? parseEnv(existing).SAMPLE_ADMIN_PASSWORD : undefined;
  if (value && value !== 'GENERATE') {
    if (value.length < 12 || value.length > 128)
      throw new Error('Invalid sample admin password length.');
    return value;
  }
  const generated = randomBytes(24).toString('base64url');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `SAMPLE_ADMIN_PASSWORD="${generated}"\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'w',
  });
  return generated;
}

function idFor(prefix, number) {
  return `00000000-0000-4000-8000-${String(prefix + number).padStart(12, '0')}`;
}

function audit(actor, action, type, target, metadata, now) {
  return `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at) SELECT ${sql(randomUUID())}, ${sql(actor)}, ${sql(action)}, ${sql(type)}, ${sql(target)}, ${sql(JSON.stringify(metadata))}, ${sql(now)} WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = ${sql(action)} AND target_type = ${sql(type)} AND target_id = ${sql(target)});`;
}

function seedSql(config, options, password) {
  const now = new Date().toISOString();
  const salt = randomBytes(16);
  const digest = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
  const hash = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${digest.toString('base64url')}`;
  const lines = [
    `INSERT OR IGNORE INTO users (id, email, email_normalized, display_name, role, status, created_at, updated_at) VALUES (${sql(ADMIN_ID)}, ${sql(config.email)}, ${sql(config.email)}, ${sql(config.adminName)}, 'admin', 'active', ${sql(now)}, ${sql(now)});`,
    `INSERT OR IGNORE INTO auth_credentials (user_id, password_hash, updated_at) VALUES (${sql(ADMIN_ID)}, ${sql(hash)}, ${sql(now)});`,
    `INSERT OR IGNORE INTO users (id, email, email_normalized, display_name, role, status, created_at, updated_at) VALUES (${sql(PARENT_ID)}, ${sql(config.parentEmail)}, ${sql(config.parentEmail)}, 'Phụ huynh lớp mẫu', 'student', 'active', ${sql(now)}, ${sql(now)});`,
  ];
  for (const fee of config.fees) {
    lines.push(
      `INSERT OR IGNORE INTO fee_option_versions (id, option_key, version, title, policy_text, rate_basis_points, deposit_basis_points, scope_subject_id, scope_mode, status, effective_from, effective_to, approved_by, published_at, mutation_id, created_at) VALUES (${sql(fee.id)}, ${sql(fee.optionKey)}, 1, ${sql(fee.title)}, ${sql(fee.policy)}, ${sql(fee.rate)}, ${sql(fee.deposit)}, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, ${sql(randomUUID())}, ${sql(now)});`,
    );
    lines.push(
      `UPDATE fee_option_versions SET status = 'published', approved_by = ${sql(ADMIN_ID)}, published_at = ${sql(now)}, mutation_id = ${sql(randomUUID())} WHERE id = ${sql(fee.id)} AND status = 'draft';`,
    );
    lines.push(
      audit(
        ADMIN_ID,
        'fee_option.published',
        'fee_option_version',
        fee.id,
        { source: 'staging_v2_sample', optionKey: fee.optionKey },
        now,
      ),
    );
  }
  for (const item of config.classes) {
    const requestId = idFor(5000, item.number);
    const classId = idFor(4000, item.number);
    const requestCode = `YC-${String(5000 + item.number).padStart(12, '0')}`;
    const classCode = `LH-${String(4000 + item.number).padStart(12, '0')}`;
    lines.push(
      `INSERT INTO parent_requests (id, code, parent_user_id, subject_id, grade, mode, area, expected_budget_minor, description, status, version, mutation_id, timezone, discuss_later, created_at, updated_at) SELECT ${sql(requestId)}, ${sql(requestCode)}, ${sql(PARENT_ID)}, ${sql(item.subjectId)}, ${sql(item.grade)}, ${sql(item.mode)}, ${sql(item.mode === 'online' ? null : item.publicArea)}, ${sql(item.expectedBudgetMinor)}, ${sql(item.description)}, 'submitted', 2, ${sql(randomUUID())}, 'Asia/Ho_Chi_Minh', 0, ${sql(now)}, ${sql(now)} WHERE NOT EXISTS (SELECT 1 FROM parent_requests WHERE id = ${sql(requestId)});`,
    );
    lines.push(
      `INSERT OR IGNORE INTO parent_request_private (request_id, contact_phone, contact_address, contact_consent_at, contact_consent_version) VALUES (${sql(requestId)}, NULL, NULL, ${sql(now)}, 'sample-staging-v2-1');`,
    );
    for (const window of item.windows) {
      lines.push(
        `INSERT INTO request_schedule_windows (request_id, weekday, start_local, end_local, timezone) SELECT ${sql(requestId)}, ${sql(window.weekday)}, ${sql(window.startLocal)}, ${sql(window.endLocal)}, 'Asia/Ho_Chi_Minh' WHERE NOT EXISTS (SELECT 1 FROM request_schedule_windows WHERE request_id = ${sql(requestId)} AND weekday = ${sql(window.weekday)} AND start_local = ${sql(window.startLocal)});`,
      );
    }
    lines.push(
      `INSERT INTO class_listings (id, code, source_request_id, source_request_version, parent_user_id, subject_id, grade, mode, public_area, expected_budget_minor, status, version, mutation_id, published_at, created_at, updated_at) SELECT ${sql(classId)}, ${sql(classCode)}, ${sql(requestId)}, 2, ${sql(PARENT_ID)}, ${sql(item.subjectId)}, ${sql(item.grade)}, ${sql(item.mode)}, ${sql(item.publicArea)}, ${sql(item.expectedBudgetMinor)}, 'draft', 1, ${sql(randomUUID())}, NULL, ${sql(now)}, ${sql(now)} WHERE NOT EXISTS (SELECT 1 FROM class_listings WHERE id = ${sql(classId)});`,
    );
    lines.push(
      `UPDATE class_listings SET status = 'open', version = 2, published_at = ${sql(now)}, updated_at = ${sql(now)}, mutation_id = ${sql(randomUUID())} WHERE id = ${sql(classId)} AND status = 'draft';`,
    );
    lines.push(
      `UPDATE parent_requests SET status = 'sourcing', version = 3, updated_at = ${sql(now)}, mutation_id = ${sql(randomUUID())} WHERE id = ${sql(requestId)} AND status = 'submitted';`,
    );
    lines.push(
      audit(
        ADMIN_ID,
        'class.published',
        'class_listing',
        classId,
        { source: item.sourceId, sample: true },
        now,
      ),
    );
  }
  const folder = options.local ? options.persist : join(WRANGLER_ROOT, 'sample-staging-v2');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `seed-${randomUUID()}.sql`);
  writeFileSync(file, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    wrangler(['d1', 'execute', 'DB', ...targetArgs(options), '--file', file]);
  } finally {
    if (existsSync(file)) unlinkSync(file);
  }
}

function preflight(config, options) {
  const identities = query(
    `SELECT id, email_normalized AS email, role, status FROM users WHERE id IN (${sql(ADMIN_ID)}, ${sql(PARENT_ID)}) OR email_normalized IN (${sql(config.email)}, ${sql(config.parentEmail)})`,
    options,
  );
  for (const row of identities) {
    if (
      row.id === ADMIN_ID &&
      row.email === config.email &&
      row.role === 'admin' &&
      row.status === 'active'
    )
      continue;
    if (
      row.id === PARENT_ID &&
      row.email === config.parentEmail &&
      row.role === 'student' &&
      row.status === 'active'
    )
      continue;
    throw new Error('Sample user ID or email conflicts with an existing account.');
  }
  const feeRows = query(
    `SELECT id, option_key AS optionKey, version, title, policy_text AS policy, rate_basis_points AS rate, deposit_basis_points AS deposit, status FROM fee_option_versions WHERE version = 1 OR id IN (${config.fees.map((item) => sql(item.id)).join(',')})`,
    options,
  );
  for (const row of feeRows) {
    const expected = config.fees.find(
      (fee) => fee.optionKey === row.optionKey && row.version === 1,
    );
    if (
      !expected ||
      row.id !== expected.id ||
      row.title !== expected.title ||
      row.policy !== expected.policy ||
      row.rate !== expected.rate ||
      row.deposit !== expected.deposit ||
      !['draft', 'published'].includes(row.status)
    ) {
      throw new Error('Existing fee option conflicts with staging sample config.');
    }
  }
  const existing = query(
    `SELECT id, source_request_id AS requestId, code, subject_id AS subjectId, grade, mode, public_area AS publicArea, expected_budget_minor AS budget FROM class_listings WHERE id LIKE '00000000-0000-4000-8000-0000000040%' OR code LIKE 'LH-0000000040%'`,
    options,
  );
  for (const row of existing) {
    const item = config.classes.find((value) => idFor(4000, value.number) === row.id);
    if (
      !item ||
      row.requestId !== idFor(5000, item.number) ||
      row.code !== `LH-${String(4000 + item.number).padStart(12, '0')}` ||
      row.subjectId !== item.subjectId ||
      row.grade !== item.grade ||
      row.mode !== item.mode ||
      row.publicArea !== item.publicArea ||
      row.budget !== item.expectedBudgetMinor
    ) {
      throw new Error('Existing class conflicts with staging sample config.');
    }
  }
}

function verify(config, options, password) {
  const rows = query(
    `SELECT u.id, u.role, u.status, c.password_hash AS hash FROM users u JOIN auth_credentials c ON c.user_id = u.id WHERE u.id = ${sql(ADMIN_ID)} AND u.email_normalized = ${sql(config.email)}`,
    options,
  );
  const admin = rows[0];
  if (!admin || admin.role !== 'admin' || admin.status !== 'active')
    throw new Error('Staging sample admin verification failed.');
  const [algorithm, iterations, saltText, digestText] = admin.hash.split('$');
  if (algorithm !== 'pbkdf2-sha256' || iterations !== '100000')
    throw new Error('Unsupported staging sample password hash.');
  const actual = pbkdf2Sync(password, Buffer.from(saltText, 'base64url'), 100_000, 32, 'sha256');
  const expected = Buffer.from(digestText, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('Staging sample admin password does not match the ignored credential file.');
  const fees = query(
    `SELECT id, option_key AS optionKey, status, approved_by AS approvedBy FROM fee_option_versions WHERE id IN (${config.fees.map((item) => sql(item.id)).join(',')})`,
    options,
  );
  if (
    fees.length !== 3 ||
    fees.some((item) => item.status !== 'published' || item.approvedBy !== ADMIN_ID)
  )
    throw new Error('Staging sample fees are not all published.');
  const classes = query(
    `SELECT c.id, c.status, r.status AS requestStatus, p.contact_consent_at AS consentAt, p.contact_phone AS phone, p.contact_address AS address FROM class_listings c JOIN parent_requests r ON r.id = c.source_request_id JOIN parent_request_private p ON p.request_id = r.id WHERE c.id IN (${config.classes.map((item) => sql(idFor(4000, item.number))).join(',')})`,
    options,
  );
  if (
    classes.length !== 6 ||
    classes.some(
      (item) =>
        item.status !== 'open' ||
        item.requestStatus !== 'sourcing' ||
        !item.consentAt ||
        item.phone !== null ||
        item.address !== null,
    )
  )
    throw new Error('Staging sample classes or request consent verification failed.');
  if (query('PRAGMA foreign_key_check', options).length)
    throw new Error('Staging D1 foreign key check failed.');
  console.log(
    `Staging V2 sample seed verified: ${fees.length} published fee options, ${classes.length} open sample classes, one admin.`,
  );
  console.log(
    `Admin email: ${config.email}; password file: ${relative(ROOT, options.credentials)} (ignored by Git).`,
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = configFromSample(options);
  if (options.local) {
    wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', options.persist]);
  }
  preflight(config, options);
  const password = credential(options);
  if (!options.local) {
    const bookmark = wrangler(['d1', 'time-travel', 'info', 'DB', '--env', 'staging_v2', '--json']);
    const file = join(
      WRANGLER_ROOT,
      'sample-staging-v2',
      `bookmark-${new Date().toISOString().replaceAll(':', '-')}.json`,
    );
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bookmark, { encoding: 'utf8', mode: 0o600 });
    console.log(`Pre-seed D1 bookmark saved: ${relative(ROOT, file)} (ignored by Git).`);
  }
  seedSql(config, options, password);
  verify(config, options, password);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

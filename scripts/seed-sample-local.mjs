#!/usr/bin/env node
/** Explicit, idempotent sample seed for local D1 only. */
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import {
  assertSamplePricingCatalog,
  parseSamplePricingCatalog,
  samplePricingCatalogStatements,
} from './sample-pricing-catalog.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SAMPLE_FILE = join(ROOT, '.env.example');
const DEFAULT_LOCAL_FILE = join(ROOT, '.wrangler', 'sample-local', 'credentials.vars');
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const ADMIN_ID = '00000000-0000-4000-8000-000000000201';
const FEES = [
  [
    'first_lesson_percent',
    'SAMPLE_FEE_FIRST',
    10_000,
    null,
    '00000000-0000-4000-8000-000000000301',
  ],
  [
    'lesson_multiplier_with_deposit',
    'SAMPLE_FEE_LESSONS',
    100_000,
    'SAMPLE_FEE_LESSONS_DEPOSIT_BPS',
    '00000000-0000-4000-8000-000000000302',
  ],
  ['monthly_percent', 'SAMPLE_FEE_MONTHLY', 10_000, null, '00000000-0000-4000-8000-000000000303'],
];

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (
      !['--persist-to', '--sample-env-file'].includes(key) ||
      !value ||
      value.startsWith('--') ||
      options[key]
    ) {
      throw new Error(
        'Usage: node scripts/seed-sample-local.mjs [--persist-to .wrangler/<dir>] [--sample-env-file .wrangler/<file>]',
      );
    }
    options[key] = value;
  }
  return options;
}

function withinWrangler(path) {
  const target = resolve(ROOT, path);
  const part = relative(join(ROOT, '.wrangler'), target);
  if (
    !part ||
    part === '..' ||
    part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(part)
  ) {
    throw new Error('Custom seed paths must be inside .wrangler/ in this repository.');
  }
  return target;
}

function sqlText(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function required(config, key, max = 2000) {
  const value = config[key]?.trim();
  if (!value || value.length > max) throw new Error(`Invalid ${key} in local sample config.`);
  return value;
}

function basisPoints(config, key, max) {
  const raw = required(config, key, 6);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid ${key} in local sample config.`);
  }
  return value;
}

function fee(config, [optionKey, prefix, max, depositKey, id]) {
  const title = required(config, `${prefix}_TITLE`, 120);
  const policy = required(config, `${prefix}_POLICY`, 2000);
  if (title.length < 2 || policy.length < 10) throw new Error(`Invalid copy for ${prefix}.`);
  return {
    id,
    optionKey,
    title,
    policy,
    rate: basisPoints(config, `${prefix}_RATE_BPS`, max),
    deposit: depositKey ? basisPoints(config, depositKey, 10_000) : null,
  };
}

function runWrangler(args, json = false) {
  const logPath = join(ROOT, '.wrangler', 'logs');
  mkdirSync(logPath, { recursive: true });
  const output = execFileSync(process.execPath, [WRANGLER, ...args], {
    cwd: ROOT,
    env: { ...process.env, WRANGLER_LOG_PATH: logPath, CLOUDFLARE_ENV: '' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return json ? JSON.parse(output) : null;
}

function query(sql, persistArgs) {
  const result = runWrangler(
    ['d1', 'execute', 'DB', '--local', ...persistArgs, '--command', sql, '--json'],
    true,
  );
  if (!result?.[0]?.success) throw new Error('Local D1 query failed.');
  return result[0].results;
}

function localConfig(file) {
  const sample = parseEnv(readFileSync(SAMPLE_FILE, 'utf8'));
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const overrides = existing ? parseEnv(existing) : {};
  const config = { ...sample, ...overrides };
  if (!config.SAMPLE_ADMIN_PASSWORD || config.SAMPLE_ADMIN_PASSWORD === 'GENERATE') {
    const password = randomBytes(24).toString('base64url');
    const line = `SAMPLE_ADMIN_PASSWORD="${password}"`;
    const updated = /^SAMPLE_ADMIN_PASSWORD=.*$/m.test(existing)
      ? existing.replace(/^SAMPLE_ADMIN_PASSWORD=.*$/gm, line)
      : `${existing.trimEnd()}${existing ? '\n' : ''}${line}\n`;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, updated, { encoding: 'utf8', mode: 0o600 });
    config.SAMPLE_ADMIN_PASSWORD = password;
  }
  if (config.SAMPLE_ADMIN_PASSWORD.length < 12 || config.SAMPLE_ADMIN_PASSWORD.length > 128) {
    throw new Error('SAMPLE_ADMIN_PASSWORD must contain 12-128 characters.');
  }
  return config;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envFile = args['--sample-env-file']
    ? withinWrangler(args['--sample-env-file'])
    : DEFAULT_LOCAL_FILE;
  const persistArgs = args['--persist-to']
    ? ['--persist-to', withinWrangler(args['--persist-to'])]
    : [];
  const config = localConfig(envFile);
  const email = required(config, 'SAMPLE_ADMIN_EMAIL', 254).toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email))
    throw new Error('Invalid SAMPLE_ADMIN_EMAIL.');
  const name = required(config, 'SAMPLE_ADMIN_DISPLAY_NAME', 100);
  const fees = FEES.map((item) => fee(config, item));
  const catalog = parseSamplePricingCatalog(config, 'local');

  console.log('Applying migrations to local D1 only...');
  runWrangler(['d1', 'migrations', 'apply', 'DB', '--local', ...persistArgs]);
  assertSamplePricingCatalog((statement) => query(statement, persistArgs), catalog, sqlText, {
    adminId: ADMIN_ID,
  });
  const existing = query(
    `SELECT id, role, status FROM users WHERE email_normalized = ${sqlText(email)}`,
    persistArgs,
  )[0];
  if (
    existing &&
    (existing.id !== ADMIN_ID || existing.role !== 'admin' || existing.status !== 'active')
  ) {
    throw new Error('Sample admin email belongs to another local account. No role changed.');
  }

  const now = new Date().toISOString();
  const salt = randomBytes(16);
  const digest = pbkdf2Sync(config.SAMPLE_ADMIN_PASSWORD, salt, 100_000, 32, 'sha256');
  const hash = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${digest.toString('base64url')}`;
  query(
    `INSERT OR IGNORE INTO users (id, email, email_normalized, display_name, role, status, created_at, updated_at)
     VALUES (${sqlText(ADMIN_ID)}, ${sqlText(email)}, ${sqlText(email)}, ${sqlText(name)}, 'admin', 'active', ${sqlText(now)}, ${sqlText(now)})`,
    persistArgs,
  );
  query(
    `INSERT OR IGNORE INTO auth_credentials (user_id, password_hash, updated_at)
     SELECT id, ${sqlText(hash)}, ${sqlText(now)} FROM users
     WHERE id = ${sqlText(ADMIN_ID)} AND email_normalized = ${sqlText(email)} AND role = 'admin'`,
    persistArgs,
  );
  const credential = query(
    `SELECT c.password_hash AS hash FROM auth_credentials c JOIN users u ON u.id = c.user_id
     WHERE u.id = ${sqlText(ADMIN_ID)} AND u.email_normalized = ${sqlText(email)} AND u.role = 'admin' AND u.status = 'active'`,
    persistArgs,
  )[0];
  if (!credential) throw new Error('Local sample admin account could not be created.');
  const [algorithm, iterations, saltText, digestText] = credential.hash.split('$');
  if (algorithm !== 'pbkdf2-sha256' || iterations !== '100000' || !saltText || !digestText) {
    throw new Error('Local sample admin has an unsupported password hash.');
  }
  const actual = pbkdf2Sync(
    config.SAMPLE_ADMIN_PASSWORD,
    Buffer.from(saltText, 'base64url'),
    100_000,
    32,
    'sha256',
  );
  const expected = Buffer.from(digestText, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Local sample admin password differs from the value in the sample env file.');
  }

  let created = 0;
  for (const item of fees) {
    const old = query(
      `SELECT id FROM fee_option_versions WHERE option_key = ${sqlText(item.optionKey)} AND version = 1`,
      persistArgs,
    );
    if (old.length) continue;
    query(
      `INSERT OR IGNORE INTO fee_option_versions
       (id, option_key, version, title, policy_text, rate_basis_points, deposit_basis_points,
        scope_subject_id, scope_mode, status, effective_from, effective_to, approved_by,
        published_at, mutation_id, created_at)
       VALUES (${sqlText(item.id)}, ${sqlText(item.optionKey)}, 1, ${sqlText(item.title)}, ${sqlText(item.policy)},
       ${item.rate}, ${item.deposit ?? 'NULL'}, NULL, NULL, 'draft', NULL, NULL, NULL, NULL,
       ${sqlText(randomUUID())}, ${sqlText(now)})`,
      persistArgs,
    );
    const inserted = query(
      `SELECT id FROM fee_option_versions WHERE id = ${sqlText(item.id)} AND option_key = ${sqlText(item.optionKey)} AND version = 1`,
      persistArgs,
    );
    if (!inserted.length) throw new Error(`Could not create local fee draft: ${item.optionKey}`);
    query(
      `INSERT OR IGNORE INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES (${sqlText(item.id.replace('0000000003', '0000000004'))}, ${sqlText(ADMIN_ID)},
       'fee_option.created', 'fee_option_version', ${sqlText(item.id)},
       ${sqlText(JSON.stringify({ optionKey: item.optionKey, version: 1, to: 'draft', source: 'local_sample' }))}, ${sqlText(now)})`,
      persistArgs,
    );
    created += 1;
  }
  const catalogFolder = join(ROOT, '.wrangler', 'sample-local');
  mkdirSync(catalogFolder, { recursive: true });
  const catalogSqlFile = join(catalogFolder, `catalog-${randomUUID()}.sql`);
  writeFileSync(
    catalogSqlFile,
    `${samplePricingCatalogStatements(catalog, sqlText, ADMIN_ID, now, 'local_sample').join('\n')}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  try {
    runWrangler(['d1', 'execute', 'DB', '--local', ...persistArgs, '--file', catalogSqlFile]);
  } finally {
    if (existsSync(catalogSqlFile)) unlinkSync(catalogSqlFile);
  }
  const storedCatalog = assertSamplePricingCatalog(
    (statement) => query(statement, persistArgs),
    catalog,
    sqlText,
    { published: true, adminId: ADMIN_ID },
  );
  console.log(`Local admin: ${email} (password in ${relative(ROOT, envFile)}).`);
  console.log(`Fee drafts created: ${created}; existing version-1 options left unchanged.`);
  console.log(
    `D1 sample pricing catalog: ${storedCatalog.tuition} tuition prices and ${storedCatalog.classFees} class-fee guidance rows published.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

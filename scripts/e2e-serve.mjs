#!/usr/bin/env node
/**
 * Starts an isolated production-like server for Playwright:
 * fresh local D1 in .wrangler/e2e (migrations + one E2E admin) → production build → Wrangler dev :4173.
 * Never touches remote resources; the admin exists only in this throwaway local database.
 */
import { execSync, spawn } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

const E2E_STATE_DIR = '.wrangler/e2e';
// Shared with e2e/support.ts. Local throwaway credentials, not a secret.
const ADMIN_EMAIL = 'e2e-admin@example.com';
const ADMIN_PASSWORD = 'e2e-admin-password';

const env = {
  ...process.env,
  E2E_STATE_DIR,
  WRANGLER_LOG_PATH: resolve(process.cwd(), E2E_STATE_DIR, 'logs'),
  WRANGLER_REGISTRY_PATH: resolve(process.cwd(), E2E_STATE_DIR, 'registry'),
  MINIFLARE_REGISTRY_PATH: resolve(process.cwd(), E2E_STATE_DIR, 'registry'),
};

function assertWithin(parent, target) {
  const path = relative(resolve(parent), resolve(target));
  if (
    !path ||
    path === '..' ||
    path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(path)
  ) {
    throw new Error(`Refusing to remove path outside its temporary parent: ${target}`);
  }
}

/** Same encoding as src/server/modules/auth/password.ts. */
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
  return `pbkdf2-sha256$100000$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

assertWithin(process.cwd(), E2E_STATE_DIR);
rmSync(E2E_STATE_DIR, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${E2E_STATE_DIR}`, {
  stdio: 'inherit',
  env,
});

const now = new Date().toISOString();
const adminId = randomUUID();
const seedDir = mkdtempSync(join(tmpdir(), 'e2e-seed-'));
const seedFile = join(seedDir, 'seed.sql');
writeFileSync(
  seedFile,
  `INSERT INTO users (id, email, email_normalized, display_name, role, created_at, updated_at)
   VALUES ('${adminId}', '${ADMIN_EMAIL}', '${ADMIN_EMAIL}', 'Quản trị E2E', 'admin', '${now}', '${now}');
INSERT INTO auth_credentials (user_id, password_hash, updated_at)
   VALUES ('${adminId}', '${hashPassword(ADMIN_PASSWORD)}', '${now}');
`,
);
try {
  execSync(
    `npx wrangler d1 execute DB --local --persist-to ${E2E_STATE_DIR} --file "${seedFile}"`,
    {
      stdio: 'inherit',
      env,
    },
  );
} finally {
  assertWithin(tmpdir(), seedDir);
  rmSync(seedDir, { recursive: true, force: true });
}

execSync('npx vite build', { stdio: 'inherit', env });
// Launch the built Worker directly; Vite preview's Miniflare proxy can return intermittent 500s.
// A shell wrapper leaves a grandchild running on Windows
// when Playwright stops the web server after the tests finish.
const server = spawn(
  process.execPath,
  [
    join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    'dev',
    '--config',
    join(process.cwd(), 'dist', 'tutor_matching', 'wrangler.json'),
    '--persist-to',
    E2E_STATE_DIR,
    '--port',
    '4173',
    '--ip',
    '127.0.0.1',
  ],
  {
    stdio: 'inherit',
    env,
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));

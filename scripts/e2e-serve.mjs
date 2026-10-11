#!/usr/bin/env node
/**
 * Starts an isolated production-like server for Playwright:
 * fresh local D1 in .wrangler/e2e (migrations + one E2E admin) → production build → vite preview :4173.
 * Never touches remote resources; the admin exists only in this throwaway local database.
 */
import { execSync, spawn } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const E2E_STATE_DIR = '.wrangler/e2e';
// Shared with e2e/support.ts. Local throwaway credentials, not a secret.
const ADMIN_EMAIL = 'e2e-admin@example.com';
const ADMIN_PASSWORD = 'e2e-admin-password';

const env = { ...process.env, E2E_STATE_DIR };

/** Same encoding as src/server/modules/auth/password.ts. */
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
  return `pbkdf2-sha256$100000$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

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
  rmSync(seedDir, { recursive: true, force: true });
}

execSync('npx vite build', { stdio: 'inherit', env });
const server = spawn('npx vite preview --port 4173 --strictPort', {
  stdio: 'inherit',
  env,
  shell: true,
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));

#!/usr/bin/env node
/**
 * Controlled operator step to grant the admin role (docs/ADMIN_PROVISIONING.md).
 * Usage: node scripts/grant-admin.mjs --email someone@example.com (--local | --env staging)
 * Only an existing *student* account is promoted; tutors are never converted.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const email = value('--email')?.trim().toLowerCase();
const env = value('--env');
const local = args.includes('--local');

// Strict whitelist: the address is embedded in SQL, so quotes/whitespace are impossible here.
if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error('Usage: node scripts/grant-admin.mjs --email <address> (--local | --env <name>)');
  process.exit(2);
}
if (local === Boolean(env)) {
  console.error('Choose exactly one target: --local or --env <name> (remote).');
  process.exit(2);
}

const sql = `UPDATE users SET role = 'admin', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE email_normalized = '${email}' AND role = 'student' AND status = 'active';
SELECT email_normalized, role FROM users WHERE email_normalized = '${email}';
`;

const dir = mkdtempSync(join(tmpdir(), 'grant-admin-'));
const file = join(dir, 'grant.sql');
try {
  writeFileSync(file, sql);
  const target = local ? ['--local'] : ['--env', env, '--remote'];
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', ...target, '--file', `"${file}"`], {
    stdio: 'inherit',
    shell: true,
  });
  console.log(`\nIf the row above shows role "admin", ${email} is now an administrator.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

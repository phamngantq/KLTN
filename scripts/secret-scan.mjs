#!/usr/bin/env node
/**
 * Fails (exit 1) when tracked or new, non-ignored files look like they contain
 * credentials or account-specific Cloudflare identifiers. Runs in CI and before commits.
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';

const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  ),
];

// Generated or third-party files whose hashes/fixtures are not secrets.
const SKIP = [
  /^package-lock\.json$/,
  /worker-configuration\.d\.ts$/,
  /\.(png|jpe?g|webp|ico|woff2?)$/,
];

/** wrangler.jsonc, wrangler.staging.json, wrangler.toml, … */
const WRANGLER_CONFIG = /(^|\/)wrangler[^/]*\.(json|jsonc|toml)$/;

const RULES = [
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: 'Cloudflare API token variable',
    re: /CLOUDFLARE_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]{20,}/,
  },
  {
    name: 'committed .dev.vars / .env',
    re: null,
    path: /(^|\/)(\.dev\.vars|\.env)(\.[^/]*)?$/,
    allow: /\.example$/,
  },
  {
    name: 'D1 database_id in config',
    re: /database_id"?\s*[:=]\s*"[0-9a-f-]{32,36}"/,
    path: WRANGLER_CONFIG,
  },
  {
    name: 'Cloudflare account_id in config',
    re: /account_id"?\s*[:=]\s*"[0-9a-f]{32}"/,
    path: WRANGLER_CONFIG,
  },
  {
    name: 'hard-coded credential',
    re: /\b(api[_-]?key|secret|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'][A-Za-z0-9/+_=-]{16,}["']/i,
  },
];

const findings = [];
for (const file of files) {
  const normalized = file.replaceAll('\\', '/');
  if (SKIP.some((re) => re.test(normalized))) continue;
  let kind;
  try {
    kind = lstatSync(file);
  } catch (error) {
    if (error?.code === 'ENOENT') continue; // tracked file deleted in the working tree
    throw error;
  }
  if (!kind.isFile()) continue;
  for (const rule of RULES) {
    if (rule.path && !rule.path.test(normalized)) continue;
    if (rule.allow?.test(normalized)) continue;
    if (rule.re === null) {
      findings.push(`${normalized}: ${rule.name}`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const match = text.match(rule.re);
    if (match) findings.push(`${normalized}: ${rule.name} (${match[0].slice(0, 40)}…)`);
  }
}

if (findings.length) {
  console.error(`secret-scan: ${findings.length} finding(s)\n  ${findings.join('\n  ')}`);
  process.exit(1);
}
console.log(`secret-scan: OK (${files.length} tracked and new paths checked)`);

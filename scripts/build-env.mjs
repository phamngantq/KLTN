#!/usr/bin/env node
/**
 * Production build for a named wrangler environment (cross-platform CLOUDFLARE_ENV).
 *   node scripts/build-env.mjs staging|production
 * The Cloudflare Vite plugin then writes dist/<worker>/wrangler.json for that environment,
 * which `wrangler deploy` picks up via .wrangler/deploy/config.json.
 */
import { execSync } from 'node:child_process';

const target = process.argv[2];
if (!['staging', 'production'].includes(target)) {
  console.error('Usage: node scripts/build-env.mjs staging|production');
  process.exit(2);
}
execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ENV: target } });

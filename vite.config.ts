import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vite';

// E2E runs use an isolated local state directory (scripts/e2e-serve.mjs); dev keeps .wrangler/state.
const stateDir = process.env.E2E_STATE_DIR;
const sampleContactEnv = parseEnv(readFileSync(new URL('./.env.example', import.meta.url), 'utf8'));
const contactFile = new URL('./.wrangler/contact-links.vars', import.meta.url);
const localContactEnv = existsSync(contactFile) ? parseEnv(readFileSync(contactFile, 'utf8')) : {};

function contactLink(key: 'VITE_FACEBOOK_CONTACT_URL' | 'VITE_ZALO_CONTACT_URL') {
  return process.env[key] ?? localContactEnv[key] ?? sampleContactEnv[key] ?? '';
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_FACEBOOK_CONTACT_URL': JSON.stringify(
      contactLink('VITE_FACEBOOK_CONTACT_URL'),
    ),
    'import.meta.env.VITE_ZALO_CONTACT_URL': JSON.stringify(contactLink('VITE_ZALO_CONTACT_URL')),
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ persistState: stateDir ? { path: stateDir } : true }),
  ],
});

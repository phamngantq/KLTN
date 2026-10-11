import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// E2E runs use an isolated local state directory (scripts/e2e-serve.mjs); dev keeps .wrangler/state.
const stateDir = process.env.E2E_STATE_DIR;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ persistState: stateDir ? { path: stateDir } : true }),
  ],
});

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');

  return {
    test: {
      projects: [
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: { bindings: { APP_ENV: 'test', TEST_MIGRATIONS: migrations } },
            }),
          ],
          test: {
            name: 'server',
            include: ['tests/server/**/*.test.ts'],
            setupFiles: ['./tests/server/setup.ts'],
          },
        },
        {
          plugins: [react()],
          test: {
            name: 'client',
            environment: 'jsdom',
            include: ['tests/client/**/*.test.{ts,tsx}'],
          },
        },
      ],
    },
  };
});

import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Applies migrations/*.sql to the local test D1 before each test file (no-op when already applied).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

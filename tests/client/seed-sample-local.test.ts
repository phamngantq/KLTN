// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { pbkdf2Sync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';

const workspace = resolve();
const wranglerRoot = resolve(workspace, '.wrangler');
const wranglerCli = resolve(workspace, 'node_modules/wrangler/bin/wrangler.js');
const seedScript = resolve(workspace, 'scripts/seed-sample-local.mjs');

interface AdminRow {
  id: string;
  email: string;
  role: string;
  passwordHash: string;
}

interface FeeRow {
  optionKey: string;
  version: number;
  rateBasisPoints: number;
  depositBasisPoints: number | null;
  status: string;
  approvedBy: string | null;
  publishedAt: string | null;
}

interface TuitionRow {
  subjectId: string;
  gradeLabel: string;
  level: string;
  mode: string;
  pricePerSessionMinor: number;
  status: string;
}

interface ClassFeeRow {
  mode: string;
  minFeeMinor: number;
  maxFeeMinor: number;
  description: string;
  status: string;
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function run(script: string, args: string[], stateDir: string) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: join(stateDir, 'logs'),
      WRANGLER_REGISTRY_PATH: join(stateDir, 'registry'),
      MINIFLARE_REGISTRY_PATH: join(stateDir, 'registry'),
    },
  });
}

function query<T>(sql: string, stateDir: string): T[] {
  const result = run(
    wranglerCli,
    ['d1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--command', sql, '--json'],
    stateDir,
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  const response = JSON.parse(result.stdout) as Array<{ results: T[] }>;
  return response[0]?.results ?? [];
}

describe('opt-in local sample seed', () => {
  it('creates one hashed admin and three draft fee options without duplicating them', () => {
    mkdirSync(wranglerRoot, { recursive: true });
    const stateDir = mkdtempSync(join(wranglerRoot, 'seed-sample-test-'));
    const envFile = join(stateDir, 'sample.vars');
    const args = ['--persist-to', stateDir, '--sample-env-file', envFile];

    try {
      const unsupported = run(seedScript, [...args, '--remote'], stateDir);
      expect(unsupported.error).toBeUndefined();
      expect(unsupported.status, unsupported.stderr).toBe(1);
      expect(existsSync(envFile)).toBe(false);

      const first = run(seedScript, args, stateDir);
      expect(first.error).toBeUndefined();
      expect(first.status, first.stderr).toBe(0);
      const passwordLine = readFileSync(envFile, 'utf8').match(
        /^SAMPLE_ADMIN_PASSWORD\s*=\s*(.+)$/m,
      );
      const password = passwordLine?.[1]?.trim().replace(/^["']|["']$/g, '');
      expect(password).toBeTruthy();
      expect(password).not.toBe('GENERATE');

      const adminBefore = query<AdminRow>(
        `SELECT u.id, u.email_normalized AS email, u.role, c.password_hash AS passwordHash
         FROM users u JOIN auth_credentials c ON c.user_id = u.id WHERE u.role = 'admin'`,
        stateDir,
      );
      expect(adminBefore).toHaveLength(1);
      expect(adminBefore[0]).toMatchObject({
        email: 'local-admin@example.test',
        role: 'admin',
      });
      const [algorithm, iterationsText, salt, digest] = adminBefore[0]!.passwordHash.split('$');
      expect(algorithm).toBe('pbkdf2-sha256');
      expect(Number(iterationsText)).toBe(100_000);
      const derived = pbkdf2Sync(password!, Buffer.from(salt!, 'base64url'), 100_000, 32, 'sha256');
      expect(derived.toString('base64url')).toBe(digest);
      expect(adminBefore[0]!.passwordHash).not.toContain(password!);

      const sample = parseEnv(readFileSync(join(workspace, '.env.example'), 'utf8'));
      const tuitionBefore = query<TuitionRow>(
        `SELECT subject_id AS subjectId, grade_label AS gradeLabel, level, mode,
          price_per_session_minor AS pricePerSessionMinor, status
         FROM tuition_price_versions ORDER BY subject_id, grade_label, level, mode`,
        stateDir,
      );
      const classFeesBefore = query<ClassFeeRow>(
        `SELECT mode, min_fee_minor AS minFeeMinor, max_fee_minor AS maxFeeMinor,
          description, status FROM class_fee_guidance_versions ORDER BY mode`,
        stateDir,
      );
      const sourceTuition = JSON.parse(sample.SAMPLE_TUITION_PRICES_JSON!) as Array<{
        subject: string;
        grade: string;
        level: string;
        mode: string;
        pricePerSessionMinor: number;
      }>;
      const sourceClassFees = JSON.parse(sample.SAMPLE_CLASS_FEES_JSON!) as ClassFeeRow[];
      expect(tuitionBefore).toHaveLength(6);
      expect(classFeesBefore).toHaveLength(2);
      expect(tuitionBefore).toEqual(
        expect.arrayContaining(
          sourceTuition.map((row) =>
            expect.objectContaining({
              subjectId: row.subject === 'Toán' ? 'subj_math' : 'subj_english',
              gradeLabel: row.grade,
              level: row.level,
              mode: row.mode,
              pricePerSessionMinor: row.pricePerSessionMinor,
              status: 'published',
            }),
          ),
        ),
      );
      expect(classFeesBefore).toEqual(
        expect.arrayContaining(
          sourceClassFees.map((row) =>
            expect.objectContaining({
              mode: row.mode,
              minFeeMinor: row.minFeeMinor,
              maxFeeMinor: row.maxFeeMinor,
              description: row.description,
              status: 'published',
            }),
          ),
        ),
      );

      const second = run(seedScript, args, stateDir);
      expect(second.error).toBeUndefined();
      expect(second.status, second.stderr).toBe(0);

      const adminAfter = query<AdminRow>(
        `SELECT u.id, u.email_normalized AS email, u.role, c.password_hash AS passwordHash
         FROM users u JOIN auth_credentials c ON c.user_id = u.id WHERE u.role = 'admin'`,
        stateDir,
      );
      expect(adminAfter).toEqual(adminBefore);
      expect(
        query<TuitionRow>(
          `SELECT subject_id AS subjectId, grade_label AS gradeLabel, level, mode,
            price_per_session_minor AS pricePerSessionMinor, status
           FROM tuition_price_versions ORDER BY subject_id, grade_label, level, mode`,
          stateDir,
        ),
      ).toEqual(tuitionBefore);
      expect(
        query<ClassFeeRow>(
          `SELECT mode, min_fee_minor AS minFeeMinor, max_fee_minor AS maxFeeMinor,
            description, status FROM class_fee_guidance_versions ORDER BY mode`,
          stateDir,
        ),
      ).toEqual(classFeesBefore);

      const fees = query<FeeRow>(
        `SELECT option_key AS optionKey, version, rate_basis_points AS rateBasisPoints,
           deposit_basis_points AS depositBasisPoints, status, approved_by AS approvedBy,
           published_at AS publishedAt FROM fee_option_versions ORDER BY option_key`,
        stateDir,
      );
      expect(fees).toEqual([
        {
          optionKey: 'first_lesson_percent',
          version: 1,
          rateBasisPoints: 5000,
          depositBasisPoints: null,
          status: 'draft',
          approvedBy: null,
          publishedAt: null,
        },
        {
          optionKey: 'lesson_multiplier_with_deposit',
          version: 1,
          rateBasisPoints: 30_000,
          depositBasisPoints: 5000,
          status: 'draft',
          approvedBy: null,
          publishedAt: null,
        },
        {
          optionKey: 'monthly_percent',
          version: 1,
          rateBasisPoints: 4000,
          depositBasisPoints: null,
          status: 'draft',
          approvedBy: null,
          publishedAt: null,
        },
      ]);
    } finally {
      const realRoot = realpathSync(wranglerRoot);
      expect(inside(workspace, realRoot)).toBe(true);
      expect(inside(realRoot, realpathSync(stateDir))).toBe(true);
      rmSync(stateDir, { recursive: true, force: true });
    }
  }, 180_000);
});

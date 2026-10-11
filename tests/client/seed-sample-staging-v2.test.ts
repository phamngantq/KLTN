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
const seedScript = resolve(workspace, 'scripts/seed-sample-staging-v2.mjs');

interface AdminRow {
  id: string;
  email: string;
  role: string;
  status: string;
  passwordHash: string;
}

interface FeeRow {
  optionKey: string;
  rateBasisPoints: number;
  depositBasisPoints: number | null;
  status: string;
  approvedBy: string;
  publishedAt: string;
}

interface ClassRow {
  code: string;
  subjectId: string;
  grade: string;
  mode: string;
  publicArea: string | null;
  expectedBudgetMinor: number | null;
  requestStatus: string;
  consentAt: string | null;
  consentVersion: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
}

interface SampleClass {
  subjectId: string;
  grade: string;
  mode: string;
  publicArea: string | null;
  expectedBudgetMinor: number | null;
  seedOnStaging: boolean;
  windows: unknown[];
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function run(script: string, args: string[], stateDir: string) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    timeout: 180_000,
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
  expect(result.status, result.stderr).toBe(0);
  const response = JSON.parse(result.stdout) as Array<{ results: T[] }>;
  return response[0]?.results ?? [];
}

function rows(stateDir: string) {
  const admins = query<AdminRow>(
    `SELECT u.id, u.email_normalized AS email, u.role, u.status,
       c.password_hash AS passwordHash
     FROM users u JOIN auth_credentials c ON c.user_id = u.id
     WHERE u.role = 'admin' ORDER BY u.id`,
    stateDir,
  );
  const fees = query<FeeRow>(
    `SELECT option_key AS optionKey, rate_basis_points AS rateBasisPoints,
       deposit_basis_points AS depositBasisPoints, status, approved_by AS approvedBy,
       published_at AS publishedAt
     FROM fee_option_versions ORDER BY option_key`,
    stateDir,
  );
  const classes = query<ClassRow>(
    `SELECT c.code, c.subject_id AS subjectId, c.grade, c.mode,
       c.public_area AS publicArea, c.expected_budget_minor AS expectedBudgetMinor,
       r.status AS requestStatus, p.contact_consent_at AS consentAt,
       p.contact_consent_version AS consentVersion, p.contact_phone AS contactPhone,
       p.contact_address AS contactAddress
     FROM class_listings c
     JOIN parent_requests r ON r.id = c.source_request_id
     JOIN parent_request_private p ON p.request_id = r.id
     WHERE c.status = 'open' ORDER BY c.code`,
    stateDir,
  );
  const counts = query<{
    requests: number;
    classes: number;
    admins: number;
    fees: number;
    scheduleWindows: number;
    auditLogs: number;
  }>(
    `SELECT (SELECT COUNT(*) FROM parent_requests) AS requests,
       (SELECT COUNT(*) FROM class_listings) AS classes,
       (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins,
       (SELECT COUNT(*) FROM fee_option_versions) AS fees,
       (SELECT COUNT(*) FROM request_schedule_windows) AS scheduleWindows,
       (SELECT COUNT(*) FROM audit_logs) AS auditLogs`,
    stateDir,
  )[0];
  return { admins, fees, classes, counts };
}

describe('explicit staging V2 sample seed in isolated local D1', () => {
  it('rejects unsafe args and creates idempotent public sample data', () => {
    mkdirSync(wranglerRoot, { recursive: true });
    const stateDir = mkdtempSync(join(wranglerRoot, 'seed-staging-v2-test-'));
    const envFile = join(stateDir, 'credentials.vars');
    const args = ['--local-test', '--persist-to', stateDir, '--sample-env-file', envFile];

    try {
      for (const unsafeArgs of [
        [...args, '--remote'],
        ['--local-test', '--persist-to', workspace, '--sample-env-file', envFile],
        ['--local-test', '--persist-to', stateDir, '--sample-env-file', join(workspace, '.env')],
      ]) {
        const rejected = run(seedScript, unsafeArgs, stateDir);
        expect(rejected.error).toBeUndefined();
        expect(rejected.status, rejected.stderr).toBe(1);
      }
      expect(existsSync(envFile)).toBe(false);

      const first = run(seedScript, args, stateDir);
      expect(first.error).toBeUndefined();
      expect(first.status, first.stderr).toBe(0);
      expect(existsSync(envFile)).toBe(true);

      const password = parseEnv(readFileSync(envFile, 'utf8')).SAMPLE_ADMIN_PASSWORD;
      expect(password).toBeTruthy();
      expect(password).not.toBe('GENERATE');

      const sample = parseEnv(readFileSync(join(workspace, '.env.example'), 'utf8'));
      const expectedClasses = (JSON.parse(sample.SAMPLE_CLASSES_JSON!) as SampleClass[]).filter(
        (item) => item.seedOnStaging,
      );
      expect(expectedClasses).toHaveLength(6);

      const before = rows(stateDir);
      expect(before.counts).toMatchObject({ requests: 6, classes: 6, admins: 1, fees: 3 });
      expect(before.counts?.scheduleWindows).toBe(
        expectedClasses.reduce((total, item) => total + item.windows.length, 0),
      );
      expect(before.admins).toHaveLength(1);
      expect(before.admins[0]).toMatchObject({
        email: sample.SAMPLE_STAGING_ADMIN_EMAIL,
        role: 'admin',
        status: 'active',
      });
      const [algorithm, iterations, salt, digest] = before.admins[0]!.passwordHash.split('$');
      expect(algorithm).toBe('pbkdf2-sha256');
      expect(iterations).toBe('100000');
      expect(
        pbkdf2Sync(password!, Buffer.from(salt!, 'base64url'), 100_000, 32, 'sha256').toString(
          'base64url',
        ),
      ).toBe(digest);
      expect(before.admins[0]!.passwordHash).not.toContain(password!);

      expect(before.fees).toHaveLength(3);
      expect(before.fees.map((fee) => fee.optionKey).sort()).toEqual([
        'first_lesson_percent',
        'lesson_multiplier_with_deposit',
        'monthly_percent',
      ]);
      for (const fee of before.fees) {
        expect(fee.status).toBe('published');
        expect(fee.approvedBy).toBe(before.admins[0]!.id);
        expect(fee.publishedAt).toBeTruthy();
      }
      expect(before.fees.map((fee) => [fee.rateBasisPoints, fee.depositBasisPoints])).toEqual([
        [5000, null],
        [30_000, 5000],
        [4000, null],
      ]);

      expect(before.classes).toHaveLength(6);
      expect(new Set(before.classes.map((item) => item.code)).size).toBe(6);
      for (const item of before.classes) {
        expect(item.code).toMatch(/^LH-[A-F0-9]{12}$/);
        expect(item.requestStatus).toBe('sourcing');
        expect(item.consentAt).toBeTruthy();
        expect(item.consentVersion).toBeTruthy();
        expect(item.contactPhone).toBeNull();
        expect(item.contactAddress).toBeNull();
      }
      expect(before.classes).toEqual(
        expect.arrayContaining(
          expectedClasses.map((item) =>
            expect.objectContaining({
              subjectId: item.subjectId,
              grade: item.grade,
              mode: item.mode,
              publicArea: item.publicArea,
              expectedBudgetMinor: item.expectedBudgetMinor,
            }),
          ),
        ),
      );

      const second = run(seedScript, args, stateDir);
      expect(second.error).toBeUndefined();
      expect(second.status, second.stderr).toBe(0);
      expect(JSON.stringify(rows(stateDir)) === JSON.stringify(before)).toBe(true);
    } finally {
      const realRoot = realpathSync(wranglerRoot);
      expect(inside(workspace, realRoot)).toBe(true);
      expect(inside(realRoot, realpathSync(stateDir))).toBe(true);
      rmSync(stateDir, { recursive: true, force: true });
    }
  }, 300_000);
});

import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';

const db = env.DB;
const NOW = '2026-10-11T00:00:00.000Z';

async function insertUser(role: 'student' | 'tutor' | 'admin' = 'student') {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, email, email_normalized, display_name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, `${id}@Example.com`, `${id}@example.com`, 'Test User', role, NOW, NOW)
    .run();
  return id;
}

function insertBooking(id: string, tutorId: string, studentId: string, start: string, end: string) {
  return db
    .prepare(
      `INSERT INTO bookings (id, tutor_id, student_id, starts_at_utc, ends_at_utc, duration_minutes,
         status, hourly_rate_minor, price_minor, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 60, 'PENDING', 200000, 200000, ?, ?)`,
    )
    .bind(id, tutorId, studentId, start, end, NOW, NOW);
}

function insertClaim(tutorId: string, slot: string, bookingId: string) {
  return db
    .prepare(
      'INSERT INTO booking_slot_claims (tutor_id, slot_start_utc, booking_id) VALUES (?, ?, ?)',
    )
    .bind(tutorId, slot, bookingId);
}

function insertParentRequest(id: string, code: string, parentId: string, subjectId = 'subj_math') {
  return db
    .prepare(
      `INSERT INTO parent_requests
       (id, code, parent_user_id, subject_id, grade, mode, description,
        mutation_id, discuss_later, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Lớp 10', 'online', 'Need tutor', ?, 1, ?, ?)`,
    )
    .bind(id, code, parentId, subjectId, crypto.randomUUID(), NOW, NOW);
}

const drizzleTables = Object.values(schema as Record<string, unknown>).filter(
  (value: unknown): value is SQLiteTable => value instanceof SQLiteTable,
);

describe('D1 migrations', () => {
  it('creates every core table', async () => {
    const { results } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all<{ name: string }>();
    // Skip SQLite/D1/Cloudflare internal bookkeeping tables.
    const appTables = results
      .map((r) => r.name)
      .filter((name) => !/^(sqlite_|d1_|_cf_)/.test(name));
    expect(appTables).toEqual(drizzleTables.map((t) => getTableConfig(t).name).sort());
    expect(drizzleTables).toHaveLength(40);
  });

  it('is idempotent when re-applied', async () => {
    await applyD1Migrations(db, env.TEST_MIGRATIONS);
    await applyD1Migrations(db, env.TEST_MIGRATIONS);
    const row = await db.prepare('SELECT count(*) AS n FROM d1_migrations').first<{ n: number }>();
    expect(row?.n).toBe(env.TEST_MIGRATIONS.length);
  });
});

describe('Drizzle schema mirrors the migrated database', () => {
  for (const table of drizzleTables) {
    const config = getTableConfig(table);

    it(`${config.name}: columns, nullability and primary key`, async () => {
      const { results } = await db
        .prepare('SELECT name, "notnull" AS isNotNull, pk FROM pragma_table_info(?)')
        .bind(config.name)
        .all<{ name: string; isNotNull: number; pk: number }>();
      const dbCols = new Map(results.map((r) => [r.name, r]));

      const compositePk = config.primaryKeys[0]?.columns.map((c) => c.name) ?? [];
      expect([...dbCols.keys()].sort()).toEqual(config.columns.map((c) => c.name).sort());
      for (const col of config.columns) {
        const dbCol = dbCols.get(col.name)!;
        const isPk = col.primary || compositePk.includes(col.name);
        expect({ col: col.name, pk: dbCol.pk > 0 }).toEqual({ col: col.name, pk: isPk });
        expect({ col: col.name, notNull: dbCol.isNotNull === 1 || isPk }).toEqual({
          col: col.name,
          notNull: col.notNull || isPk,
        });
      }
    });

    it(`${config.name}: named indexes`, async () => {
      const { results } = await db
        .prepare('SELECT name, "unique" AS isUnique FROM pragma_index_list(?) WHERE origin = \'c\'')
        .bind(config.name)
        .all<{ name: string; isUnique: number }>();
      const expected = config.indexes
        .map((i) => ({ name: i.config.name, isUnique: i.config.unique ? 1 : 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
      expect(results.sort((a, b) => a.name.localeCompare(b.name))).toEqual(expected);
    });
  }
});

describe('constraints', () => {
  it('keeps request codes unique, subject FK valid and history safe from account cascade', async () => {
    const parent = await insertUser();
    const requestId = crypto.randomUUID();
    await insertParentRequest(requestId, 'YC-123456ABCDEF', parent).run();
    await expect(
      insertParentRequest(crypto.randomUUID(), 'YC-123456ABCDEF', parent).run(),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      insertParentRequest(crypto.randomUUID(), 'YC-987654ABCDEF', parent, 'missing-subject').run(),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(db.prepare('DELETE FROM users WHERE id = ?').bind(parent).run()).rejects.toThrow(
      /FOREIGN KEY/,
    );
  });

  it('rejects overlapping request windows and incomplete consent pairs', async () => {
    const parent = await insertUser();
    const requestId = crypto.randomUUID();
    await insertParentRequest(requestId, 'YC-ABCDEF123456', parent).run();
    const insertWindow = (start: string, end: string) =>
      db
        .prepare(
          `INSERT INTO request_schedule_windows
           (request_id, weekday, start_local, end_local, timezone)
           VALUES (?, 1, ?, ?, 'Asia/Ho_Chi_Minh')`,
        )
        .bind(requestId, start, end)
        .run();
    await insertWindow('18:00', '19:00');
    await expect(insertWindow('18:30', '19:30')).rejects.toThrow(/REQUEST_WINDOWS_INVALID/);
    await expect(
      db
        .prepare(
          `INSERT INTO parent_request_private
           (request_id, contact_phone, contact_consent_at)
           VALUES (?, '0912345678', ?)`,
        )
        .bind(requestId, NOW)
        .run(),
    ).rejects.toThrow(/CHECK/);
  });

  it('keeps parent profiles tied to an existing account', async () => {
    await expect(
      db
        .prepare(
          'INSERT INTO parent_profiles (user_id, phone, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind('missing-user', null, NOW, NOW)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('enforces foreign keys', async () => {
    await expect(
      db
        .prepare(
          'INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(crypto.randomUUID(), 'missing-user', 'a'.repeat(64), NOW, NOW)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('rejects duplicate normalized emails', async () => {
    const id = await insertUser();
    await expect(
      db
        .prepare(
          `INSERT INTO users (id, email, email_normalized, display_name, role, created_at, updated_at)
           VALUES (?, ?, ?, 'Dup', 'student', ?, ?)`,
        )
        .bind(crypto.randomUUID(), `${id}@EXAMPLE.COM`, `${id}@example.com`, NOW, NOW)
        .run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('rejects unknown roles and non-normalized emails', async () => {
    const insert = (role: string, normalized: string) =>
      db
        .prepare(
          `INSERT INTO users (id, email, email_normalized, display_name, role, created_at, updated_at)
           VALUES (?, 'x@y.z', ?, 'X', ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), normalized, role, NOW, NOW)
        .run();
    await expect(insert('superuser', 'a@b.c')).rejects.toThrow(/CHECK/);
    await expect(insert('student', 'A@B.C')).rejects.toThrow(/CHECK/);
  });

  it('allows only one claim per tutor and 30-minute slot', async () => {
    const tutor = await insertUser('tutor');
    const [s1, s2] = [await insertUser(), await insertUser()];
    const slot = '2026-11-02T11:00:00.000Z';
    await db.batch([
      insertBooking('b1-' + tutor, tutor, s1, slot, '2026-11-02T12:00:00.000Z'),
      insertClaim(tutor, slot, 'b1-' + tutor),
    ]);

    // Second booking + overlapping claim in one batch: the whole batch must roll back.
    await expect(
      db.batch([
        insertBooking('b2-' + tutor, tutor, s2, slot, '2026-11-02T12:00:00.000Z'),
        insertClaim(tutor, slot, 'b2-' + tutor),
      ]),
    ).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
    const orphan = await db
      .prepare('SELECT id FROM bookings WHERE id = ?')
      .bind('b2-' + tutor)
      .first();
    expect(orphan).toBeNull();
  });

  it('rejects misaligned slot instants and self-bookings', async () => {
    const tutor = await insertUser('tutor');
    const student = await insertUser();
    await expect(
      insertBooking(
        crypto.randomUUID(),
        tutor,
        student,
        '2026-11-02T11:15:00.000Z',
        '2026-11-02T12:15:00.000Z',
      ).run(),
    ).rejects.toThrow(/CHECK/);
    await expect(
      insertBooking(
        crypto.randomUUID(),
        tutor,
        tutor,
        '2026-11-02T11:00:00.000Z',
        '2026-11-02T12:00:00.000Z',
      ).run(),
    ).rejects.toThrow(/CHECK/);
  });

  it('cascades claim deletion with the booking', async () => {
    const tutor = await insertUser('tutor');
    const student = await insertUser();
    const bookingId = crypto.randomUUID();
    await db.batch([
      insertBooking(
        bookingId,
        tutor,
        student,
        '2026-11-03T01:00:00.000Z',
        '2026-11-03T02:00:00.000Z',
      ),
      insertClaim(tutor, '2026-11-03T01:00:00.000Z', bookingId),
      insertClaim(tutor, '2026-11-03T01:30:00.000Z', bookingId),
    ]);
    await db.prepare('DELETE FROM bookings WHERE id = ?').bind(bookingId).run();
    const row = await db
      .prepare('SELECT count(*) AS n FROM booking_slot_claims WHERE booking_id = ?')
      .bind(bookingId)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('rejects availability windows that are inverted or off the 30-minute grid', async () => {
    const tutor = await insertUser('tutor');
    const insert = (start: string, end: string) =>
      db
        .prepare(
          'INSERT INTO availability_rules (id, tutor_id, weekday, start_local, end_local, created_at) VALUES (?, ?, 1, ?, ?, ?)',
        )
        .bind(crypto.randomUUID(), tutor, start, end, NOW)
        .run();
    await expect(insert('18:00', '19:30')).resolves.toBeTruthy();
    await expect(insert('19:00', '18:00')).rejects.toThrow(/CHECK/);
    await expect(insert('18:15', '19:00')).rejects.toThrow(/CHECK/);
  });
});

describe('reference data', () => {
  it('ships the subject catalogue with the migrations (every environment)', async () => {
    const row = await db.prepare('SELECT count(*) AS n FROM subjects').first<{ n: number }>();
    expect(row?.n).toBe(9);
  });
});

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { Booking } from '../../src/shared/schemas/bookings';
import { addDays, localToUtc, todayIn, weekdayOf } from '../../src/shared/time';
import { api, createPublicTutor, errorCode, jsonInit, register, type Session } from './helpers';

const VN = 'Asia/Ho_Chi_Minh';
const ahead = (days: number) => addDays(todayIn(VN), days);
const at = (date: string, hh: number, mm = 0) => localToUtc(date, hh * 60 + mm, VN).toISOString();

async function tutorOn(date: string) {
  const tutor = await createPublicTutor();
  await api(
    '/tutor/availability',
    jsonInit('PUT', { rules: [{ weekday: weekdayOf(date), start: '08:00', end: '21:00' }] }, tutor),
  );
  return tutor;
}

function book(student: Session, body: unknown, key?: string) {
  return api('/bookings', jsonInit('POST', body, student, key ? { 'Idempotency-Key': key } : {}));
}

async function bookingCount(tutorId: string) {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM bookings WHERE tutor_id = ?')
    .bind(tutorId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe('Idempotency-Key on POST /bookings', () => {
  it('replays the same booking for a repeated key + payload (double click / lost response)', async () => {
    const date = ahead(3);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const body = { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 };
    const key = `key-${crypto.randomUUID()}`;

    const first = await book(student, body, key);
    const second = await book(student, body, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    const [a, b] = [
      await first.json<ApiSuccess<Booking>>(),
      await second.json<ApiSuccess<Booking>>(),
    ];
    expect(b.data.id).toBe(a.data.id);
    expect(await bookingCount(tutor.userId)).toBe(1);

    const row = await env.DB.prepare(
      'SELECT status, result_ref FROM idempotency_keys WHERE idempotency_key = ?',
    )
      .bind(key)
      .first<{ status: string; result_ref: string }>();
    expect(row).toEqual({ status: 'completed', result_ref: a.data.id });
  });

  it('creates exactly one booking for concurrent identical requests', async () => {
    const date = ahead(4);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const body = { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 };
    const key = `key-${crypto.randomUUID()}`;
    const results = await Promise.all([
      book(student, body, key),
      book(student, body, key),
      book(student, body, key),
    ]);
    const ids = new Set<string>();
    for (const res of results) {
      if (res.status === 201) ids.add((await res.json<ApiSuccess<Booking>>()).data.id);
      else {
        expect(res.status).toBe(409);
        expect(await errorCode(res)).toBe('IDEMPOTENCY_IN_PROGRESS');
      }
    }
    expect(ids.size).toBe(1);
    expect(await bookingCount(tutor.userId)).toBe(1);

    // A later retry with the same key gets the stored result.
    const retry = await book(student, body, key);
    expect(retry.status).toBe(201);
    expect((await retry.json<ApiSuccess<Booking>>()).data.id).toBe([...ids][0]);
  });

  it('rejects reusing a key with a different payload (409)', async () => {
    const date = ahead(5);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const key = `key-${crypto.randomUUID()}`;
    expect(
      (
        await book(
          student,
          { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 },
          key,
        )
      ).status,
    ).toBe(201);
    const reused = await book(
      student,
      { tutorId: tutor.userId, startUtc: at(date, 10), durationMinutes: 60 },
      key,
    );
    expect(reused.status).toBe(409);
    expect(await errorCode(reused)).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await bookingCount(tutor.userId)).toBe(1);
  });

  it('scopes keys per user', async () => {
    const date = ahead(6);
    const tutor = await tutorOn(date);
    const [s1, s2] = await Promise.all([register('student'), register('student')]);
    const key = 'shared-key-123';
    expect(
      (await book(s1, { tutorId: tutor.userId, startUtc: at(date, 9), durationMinutes: 60 }, key))
        .status,
    ).toBe(201);
    expect(
      (await book(s2, { tutorId: tutor.userId, startUtc: at(date, 11), durationMinutes: 60 }, key))
        .status,
    ).toBe(201);
    expect(await bookingCount(tutor.userId)).toBe(2);
  });

  it('releases the key when the attempt fails so the same key can be retried', async () => {
    const date = ahead(7);
    const tutor = await tutorOn(date);
    const [winner, retrier] = await Promise.all([register('student'), register('student')]);
    const body = { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 };
    const won = await (await book(winner, body)).json<ApiSuccess<Booking>>();

    const key = `key-${crypto.randomUUID()}`;
    const lost = await book(retrier, body, key);
    expect(lost.status).toBe(409);
    expect(await errorCode(lost)).toBe('SLOT_UNAVAILABLE');
    const leftover = await env.DB.prepare(
      'SELECT count(*) AS n FROM idempotency_keys WHERE idempotency_key = ?',
    )
      .bind(key)
      .first<{ n: number }>();
    expect(leftover?.n).toBe(0);

    // Slot frees up (claims released) → retry with the same key succeeds.
    await env.DB.prepare('DELETE FROM booking_slot_claims WHERE booking_id = ?')
      .bind(won.data.id)
      .run();
    expect((await book(retrier, body, key)).status).toBe(201);
  });

  it('takes over an abandoned processing key but refuses a fresh one', async () => {
    const date = ahead(8);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const body = { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 };
    const { buildContext } = await import('../../src/server/modules/idempotency/service');
    const insertProcessing = async (key: string, createdAt: string) => {
      const ctx = await buildContext(student.userId, 'POST /bookings', key, body);
      await env.DB.prepare(
        `INSERT INTO idempotency_keys (actor_id, endpoint, idempotency_key, request_hash, status, created_at, expires_at)
         VALUES (?, 'POST /bookings', ?, ?, 'processing', ?, ?)`,
      )
        .bind(
          student.userId,
          key,
          ctx.requestHash,
          createdAt,
          new Date(Date.now() + 3600_000).toISOString(),
        )
        .run();
    };

    await insertProcessing('fresh-key-0001', new Date().toISOString());
    const fresh = await book(student, body, 'fresh-key-0001');
    expect(fresh.status).toBe(409);
    expect(await errorCode(fresh)).toBe('IDEMPOTENCY_IN_PROGRESS');

    await insertProcessing('stale-key-0001', new Date(Date.now() - 5 * 60_000).toISOString());
    expect((await book(student, body, 'stale-key-0001')).status).toBe(201);
  });

  it('treats an expired key as new', async () => {
    const date = ahead(9);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const key = `key-${crypto.randomUUID()}`;
    const body = { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 };
    const first = await (await book(student, body, key)).json<ApiSuccess<Booking>>();
    await env.DB.prepare(
      "UPDATE idempotency_keys SET expires_at = '2000-01-01T00:00:00.000Z' WHERE idempotency_key = ?",
    )
      .bind(key)
      .run();
    const other = { ...body, startUtc: at(date, 10) };
    const second = await book(student, other, key);
    expect(second.status).toBe(201);
    expect((await second.json<ApiSuccess<Booking>>()).data.id).not.toBe(first.data.id);
  });

  it('rejects malformed keys with 422', async () => {
    const date = ahead(10);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const res = await book(
      student,
      { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 },
      'bad key!',
    );
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('INVALID_IDEMPOTENCY_KEY');
  });
});

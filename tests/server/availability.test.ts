import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiErrorBody, ApiSuccess } from '../../src/shared/api';
import type {
  WeeklyAvailability,
  WeeklyAvailabilitySaveResult,
} from '../../src/shared/schemas/availability';
import { findOverlaps } from '../../src/shared/availability';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

const PATH = '/tutor/availability';

function put(session: Session, body: unknown) {
  return api(PATH, jsonInit('PUT', body, session));
}

async function get(session: Session) {
  const res = await api(PATH, { headers: { Cookie: session.cookie } });
  expect(res.status).toBe(200);
  return (await res.json<ApiSuccess<WeeklyAvailability>>()).data;
}

describe('findOverlaps', () => {
  const rule = (weekday: number, start: string, end: string, from?: string, to?: string) => ({
    weekday,
    start,
    end,
    effectiveFrom: from ?? null,
    effectiveTo: to ?? null,
  });

  it('detects same-day overlaps but allows touching windows and other days', () => {
    expect(findOverlaps([rule(1, '18:00', '19:30'), rule(1, '19:00', '20:00')])).toEqual([
      { first: 0, second: 1 },
    ]);
    expect(findOverlaps([rule(1, '10:00', '12:00'), rule(1, '12:00', '14:00')])).toEqual([]);
    expect(findOverlaps([rule(1, '10:00', '12:00'), rule(2, '10:00', '12:00')])).toEqual([]);
  });

  it('ignores overlaps whose effective date ranges do not intersect', () => {
    expect(
      findOverlaps([
        rule(3, '08:00', '10:00', '2026-01-01', '2026-06-30'),
        rule(3, '09:00', '11:00', '2026-07-01'),
      ]),
    ).toEqual([]);
    expect(
      findOverlaps([
        rule(3, '08:00', '10:00', '2026-01-01', '2026-07-01'),
        rule(3, '09:00', '11:00', '2026-07-01'),
      ]),
    ).toHaveLength(1);
  });
});

describe('GET/PUT /tutor/availability', () => {
  it('starts empty with the default timezone', async () => {
    const tutor = await register('tutor');
    expect(await get(tutor)).toEqual({ timezone: 'Asia/Ho_Chi_Minh', rules: [] });
  });

  it('saves a valid 60-minute window and round-trips it', async () => {
    const tutor = await register('tutor');
    const res = await put(tutor, { rules: [{ weekday: 1, start: '18:00', end: '19:00' }] });
    expect(res.status).toBe(200);
    const { affectedBookings, ...saved } = (
      await res.json<ApiSuccess<WeeklyAvailabilitySaveResult>>()
    ).data;
    expect(affectedBookings).toBe(0);
    expect(saved.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(saved.rules).toEqual([
      {
        id: expect.any(String),
        weekday: 1,
        start: '18:00',
        end: '19:00',
        effectiveFrom: null,
        effectiveTo: null,
      },
    ]);
    expect(await get(tutor)).toEqual(saved);
  });

  it('replaces the whole schedule atomically, sorted by weekday then start', async () => {
    const tutor = await register('tutor');
    await put(tutor, { rules: [{ weekday: 2, start: '08:00', end: '09:00' }] });
    const res = await put(tutor, {
      timezone: 'Asia/Tokyo',
      rules: [
        { weekday: 7, start: '20:00', end: '24:00' },
        {
          weekday: 1,
          start: '14:00',
          end: '16:30',
          effectiveFrom: '2026-11-01',
          effectiveTo: '2026-12-31',
        },
        { weekday: 1, start: '08:00', end: '10:00' },
      ],
    });
    expect(res.status).toBe(200);
    const data = await get(tutor);
    expect(data.timezone).toBe('Asia/Tokyo');
    expect(data.rules.map((r) => `${r.weekday} ${r.start}-${r.end}`)).toEqual([
      '1 08:00-10:00',
      '1 14:00-16:30',
      '7 20:00-24:00',
    ]);

    expect((await put(tutor, { rules: [] })).status).toBe(200);
    expect((await get(tutor)).rules).toEqual([]);
  });

  it('rejects overlapping windows with 422 and keeps the previous schedule', async () => {
    const tutor = await register('tutor');
    await put(tutor, { rules: [{ weekday: 4, start: '09:00', end: '10:00' }] });
    const res = await put(tutor, {
      rules: [
        { weekday: 1, start: '18:00', end: '19:30' },
        { weekday: 1, start: '19:00', end: '20:00' },
      ],
    });
    expect(res.status).toBe(422);
    const body = await res.json<ApiErrorBody>();
    expect(body.error.code).toBe('AVAILABILITY_OVERLAP');
    expect(body.error.details).toEqual([{ rules: [0, 1] }]);
    expect((await get(tutor)).rules.map((r) => r.weekday)).toEqual([4]);
  });

  it.each([
    ['weekday 0', { weekday: 0, start: '08:00', end: '09:00' }],
    ['weekday 8', { weekday: 8, start: '08:00', end: '09:00' }],
    ['fractional weekday', { weekday: 1.5, start: '08:00', end: '09:00' }],
    ['off-grid minutes', { weekday: 1, start: '08:15', end: '09:00' }],
    ['invalid hour', { weekday: 1, start: '25:00', end: '26:00' }],
    ['start 24:00', { weekday: 1, start: '24:00', end: '24:00' }],
    ['end before start', { weekday: 1, start: '10:00', end: '09:00' }],
    ['empty window', { weekday: 1, start: '10:00', end: '10:00' }],
    ['crossing midnight', { weekday: 1, start: '23:00', end: '01:00' }],
    [
      'bad effective date',
      { weekday: 1, start: '08:00', end: '09:00', effectiveFrom: '2026-02-30' },
    ],
    [
      'inverted effective range',
      {
        weekday: 1,
        start: '08:00',
        end: '09:00',
        effectiveFrom: '2026-05-01',
        effectiveTo: '2026-04-01',
      },
    ],
    ['unknown field', { weekday: 1, start: '08:00', end: '09:00', tutorId: 'someone-else' }],
  ])('rejects %s with 422', async (_label, rule) => {
    const tutor = await register('tutor');
    const res = await put(tutor, { rules: [rule] });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid timezones with 422', async () => {
    const tutor = await register('tutor');
    const res = await put(tutor, { timezone: 'Mars/Phobos', rules: [] });
    expect(res.status).toBe(422);
  });

  it('is tutor-only: 401 anonymous, 403 for students', async () => {
    expect((await api(PATH)).status).toBe(401);
    const student = await register('student');
    expect((await api(PATH, { headers: { Cookie: student.cookie } })).status).toBe(403);
    const res = await put(student, { rules: [{ weekday: 1, start: '08:00', end: '09:00' }] });
    expect(res.status).toBe(403);
  });

  it('scopes every read and write to the session tutor (A cannot touch B)', async () => {
    const a = await register('tutor');
    const b = await register('tutor');
    await put(b, { rules: [{ weekday: 5, start: '10:00', end: '12:00' }] });

    // Supplying B's id in the body is rejected outright.
    const spoof = await put(a, { tutorId: b.userId, rules: [] });
    expect(spoof.status).toBe(422);

    // A replacing its own schedule never affects B.
    expect((await put(a, { rules: [] })).status).toBe(200);
    expect((await get(b)).rules.map((r) => r.weekday)).toEqual([5]);
    expect((await get(a)).rules).toEqual([]);
  });

  it('requires the CSRF token for writes', async () => {
    const tutor = await register('tutor');
    const res = await api(PATH, {
      method: 'PUT',
      body: JSON.stringify({ rules: [] }),
      headers: { 'Content-Type': 'application/json', Cookie: tutor.cookie },
    });
    expect(res.status).toBe(403);
  });

  it('does not modify existing bookings when the schedule changes', async () => {
    const tutor = await register('tutor');
    const student = await register('student');
    await put(tutor, { rules: [{ weekday: 1, start: '18:00', end: '20:00' }] });
    const now = new Date().toISOString();
    const bookingId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO bookings (id, tutor_id, student_id, starts_at_utc, ends_at_utc, duration_minutes,
           status, hourly_rate_minor, price_minor, created_at, updated_at)
         VALUES (?, ?, ?, '2026-11-02T11:00:00.000Z', '2026-11-02T12:00:00.000Z', 60, 'CONFIRMED', 1, 1, ?, ?)`,
      ).bind(bookingId, tutor.userId, student.userId, now, now),
      env.DB.prepare(
        "INSERT INTO booking_slot_claims (tutor_id, slot_start_utc, booking_id) VALUES (?, '2026-11-02T11:00:00.000Z', ?)",
      ).bind(tutor.userId, bookingId),
    ]);

    expect((await put(tutor, { rules: [] })).status).toBe(200);

    const booking = await env.DB.prepare('SELECT status FROM bookings WHERE id = ?')
      .bind(bookingId)
      .first<{ status: string }>();
    expect(booking?.status).toBe('CONFIRMED');
    const claims = await env.DB.prepare(
      'SELECT count(*) AS n FROM booking_slot_claims WHERE booking_id = ?',
    )
      .bind(bookingId)
      .first<{ n: number }>();
    expect(claims?.n).toBe(1);
  });
});

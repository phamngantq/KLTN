import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiErrorBody, ApiSuccess } from '../../src/shared/api';
import type {
  ExceptionList,
  ExceptionSaveResult,
  WeeklyAvailabilitySaveResult,
} from '../../src/shared/schemas/availability';
import { addDays, localToUtc, todayIn, weekdayOf } from '../../src/shared/time';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

const VN = 'Asia/Ho_Chi_Minh';
const PATH = '/tutor/availability/exceptions';

/** A local date `days` ahead in Vietnam. */
function ahead(days: number) {
  return addDays(todayIn(VN), days);
}

function create(session: Session, body: unknown) {
  return api(PATH, jsonInit('POST', body, session));
}

async function list(session: Session) {
  const res = await api(PATH, { headers: { Cookie: session.cookie } });
  expect(res.status).toBe(200);
  return (await res.json<ApiSuccess<ExceptionList>>()).data;
}

/** Inserts an active booking at `date` 18:00–19:00 Vietnam time with its slot claims. */
async function bookAt(tutor: Session, date: string, status = 'CONFIRMED') {
  const student = await register('student');
  const start = localToUtc(date, 18 * 60, VN).toISOString();
  const mid = localToUtc(date, 18 * 60 + 30, VN).toISOString();
  const end = localToUtc(date, 19 * 60, VN).toISOString();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO bookings (id, tutor_id, student_id, starts_at_utc, ends_at_utc, duration_minutes, status,
         hourly_rate_minor, price_minor, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 60, ?, 200000, 200000, ?, ?)`,
    ).bind(id, tutor.userId, student.userId, start, end, status, now, now),
    env.DB.prepare(
      'INSERT INTO booking_slot_claims (tutor_id, slot_start_utc, booking_id) VALUES (?, ?, ?)',
    ).bind(tutor.userId, start, id),
    env.DB.prepare(
      'INSERT INTO booking_slot_claims (tutor_id, slot_start_utc, booking_id) VALUES (?, ?, ?)',
    ).bind(tutor.userId, mid, id),
  ]);
  return id;
}

describe('availability exceptions', () => {
  it('creates a whole-day closure and a one-off extra window, listed by date', async () => {
    const tutor = await register('tutor');
    const holiday = await create(tutor, { date: ahead(10), kind: 'closed' });
    expect(holiday.status).toBe(201);
    const extra = await create(tutor, {
      date: ahead(3),
      kind: 'extra',
      start: '08:00',
      end: '10:00',
    });
    expect(extra.status).toBe(201);
    const data = await list(tutor);
    expect(data.timezone).toBe(VN);
    expect(data.exceptions.map((e) => [e.date, e.kind, e.start, e.end])).toEqual([
      [ahead(3), 'extra', '08:00', '10:00'],
      [ahead(10), 'closed', null, null],
    ]);
  });

  it.each([
    ['extra without times', { kind: 'extra' }],
    ['only a start time', { kind: 'closed', start: '08:00' }],
    ['inverted window', { kind: 'closed', start: '10:00', end: '09:00' }],
    ['off-grid time', { kind: 'extra', start: '08:15', end: '09:00' }],
    ['invalid date', { kind: 'closed', date: '2026-02-30' }],
    ['unknown field', { kind: 'closed', tutorId: 'other' }],
  ])('rejects %s with 422', async (_label, body) => {
    const tutor = await register('tutor');
    const res = await create(tutor, { date: ahead(2), ...body });
    expect(res.status).toBe(422);
  });

  it('rejects past dates and conflicting exceptions on the same date', async () => {
    const tutor = await register('tutor');
    const past = await create(tutor, { date: ahead(-1), kind: 'closed' });
    expect(past.status).toBe(422);
    expect(await errorCode(past)).toBe('EXCEPTION_IN_PAST');

    const date = ahead(5);
    expect(
      (await create(tutor, { date, kind: 'extra', start: '08:00', end: '10:00' })).status,
    ).toBe(201);
    const overlapping = await create(tutor, { date, kind: 'closed', start: '09:00', end: '11:00' });
    expect(overlapping.status).toBe(422);
    expect(await errorCode(overlapping)).toBe('EXCEPTION_OVERLAP');
    expect((await create(tutor, { date, kind: 'closed' })).status).toBe(422); // whole day conflicts
    expect(
      (await create(tutor, { date, kind: 'closed', start: '10:00', end: '11:00' })).status,
    ).toBe(201);
  });

  it('updates and deletes only the owner’s exceptions', async () => {
    const a = await register('tutor');
    const b = await register('tutor');
    const created = (
      await (
        await create(a, { date: ahead(4), kind: 'closed' })
      ).json<ApiSuccess<ExceptionSaveResult>>()
    ).data.exception;

    const foreignPatch = await api(
      `${PATH}/${created.id}`,
      jsonInit('PATCH', { date: ahead(4), kind: 'extra', start: '07:00', end: '08:00' }, b),
    );
    expect(foreignPatch.status).toBe(404);
    expect(
      (await api(`${PATH}/${created.id}`, { ...jsonInit('DELETE', {}, b), body: null })).status,
    ).toBe(404);

    const patched = await api(
      `${PATH}/${created.id}`,
      jsonInit('PATCH', { date: ahead(6), kind: 'extra', start: '07:00', end: '08:00' }, a),
    );
    expect(patched.status).toBe(200);
    expect((await list(a)).exceptions.map((e) => [e.date, e.kind])).toEqual([[ahead(6), 'extra']]);

    const deleted = await api(`${PATH}/${created.id}`, {
      ...jsonInit('DELETE', {}, a),
      body: null,
    });
    expect(deleted.status).toBe(200);
    expect((await list(a)).exceptions).toEqual([]);
  });

  it('is tutor-only', async () => {
    expect((await api(PATH)).status).toBe(401);
    const student = await register('student');
    expect((await create(student, { date: ahead(2), kind: 'closed' })).status).toBe(403);
  });
});

describe('affected bookings warnings (bookings are never modified)', () => {
  it('counts upcoming bookings no longer covered after closures, weekly edits and deletions', async () => {
    const tutor = await register('tutor');
    const date = ahead(8);
    const weekday = weekdayOf(date);
    const put = (rules: unknown[]) => api('/tutor/availability', jsonInit('PUT', { rules }, tutor));

    await put([{ weekday, start: '18:00', end: '20:00' }]);
    const bookingId = await bookAt(tutor, date);

    // Closing the day uncovers the booking.
    const closed = (
      await (await create(tutor, { date, kind: 'closed' })).json<ApiSuccess<ExceptionSaveResult>>()
    ).data;
    expect(closed.affectedBookings).toBe(1);

    // Removing the closure restores coverage.
    const del = await api(`${PATH}/${closed.exception.id}`, {
      ...jsonInit('DELETE', {}, tutor),
      body: null,
    });
    expect((await del.json<ApiSuccess<{ affectedBookings: number }>>()).data.affectedBookings).toBe(
      0,
    );

    // Weekly edit that no longer covers 18:00–19:00 is reported.
    const edited = (
      await (
        await put([{ weekday, start: '08:00', end: '10:00' }])
      ).json<ApiSuccess<WeeklyAvailabilitySaveResult>>()
    ).data;
    expect(edited.affectedBookings).toBe(1);

    // An extra window on that date covers it again.
    const extra = (
      await (
        await create(tutor, { date, kind: 'extra', start: '18:00', end: '19:00' })
      ).json<ApiSuccess<ExceptionSaveResult>>()
    ).data;
    expect(extra.affectedBookings).toBe(0);

    const booking = await env.DB.prepare('SELECT status FROM bookings WHERE id = ?')
      .bind(bookingId)
      .first<{ status: string }>();
    expect(booking?.status).toBe('CONFIRMED');
  });

  it('ignores cancelled bookings', async () => {
    const tutor = await register('tutor');
    const date = ahead(9);
    await bookAt(tutor, date, 'CANCELLED');
    const res = await create(tutor, { date, kind: 'closed' });
    expect((await res.json<ApiSuccess<ExceptionSaveResult>>()).data.affectedBookings).toBe(0);
  });

  it('returns field details for validation errors', async () => {
    const tutor = await register('tutor');
    const res = await create(tutor, { date: ahead(2), kind: 'extra' });
    const body = await res.json<ApiErrorBody>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body.error.details)).toContain('start');
  });
});

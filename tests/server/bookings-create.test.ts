import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { Booking } from '../../src/shared/schemas/bookings';
import { addDays, localToUtc, todayIn, weekdayOf } from '../../src/shared/time';
import { api, createPublicTutor, errorCode, jsonInit, register, type Session } from './helpers';

const VN = 'Asia/Ho_Chi_Minh';
const ahead = (days: number) => addDays(todayIn(VN), days);
const at = (date: string, hh: number, mm = 0) => localToUtc(date, hh * 60 + mm, VN).toISOString();

/** Public tutor (200 000 ₫/h) teaching 17:00–21:00 on `date`'s weekday. */
async function tutorOn(date: string) {
  const tutor = await createPublicTutor({ hourlyRateMinor: 200_000 });
  await api(
    '/tutor/availability',
    jsonInit('PUT', { rules: [{ weekday: weekdayOf(date), start: '17:00', end: '21:00' }] }, tutor),
  );
  return tutor;
}

function book(student: Session, body: Record<string, unknown>) {
  return api('/bookings', jsonInit('POST', body, student));
}

async function counts(tutorId: string) {
  const b = await env.DB.prepare('SELECT count(*) AS n FROM bookings WHERE tutor_id = ?')
    .bind(tutorId)
    .first<{ n: number }>();
  const c = await env.DB.prepare('SELECT count(*) AS n FROM booking_slot_claims WHERE tutor_id = ?')
    .bind(tutorId)
    .first<{ n: number }>();
  return { bookings: b?.n ?? 0, claims: c?.n ?? 0 };
}

describe('POST /bookings', () => {
  it('creates a PENDING booking with server-derived price and one claim per 30 minutes', async () => {
    const date = ahead(3);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const res = await book(student, {
      tutorId: tutor.userId,
      startUtc: at(date, 18),
      durationMinutes: 90,
    });
    expect(res.status).toBe(201);
    const booking = (await res.json<ApiSuccess<Booking>>()).data;
    expect(booking).toMatchObject({
      tutorId: tutor.userId,
      studentId: student.userId,
      status: 'PENDING',
      startsAtUtc: at(date, 18),
      endsAtUtc: at(date, 19, 30),
      durationMinutes: 90,
      hourlyRateMinor: 200_000,
      priceMinor: 300_000,
      currency: 'VND',
    });
    expect(await counts(tutor.userId)).toEqual({ bookings: 1, claims: 3 });
    const audit = await env.DB.prepare(
      "SELECT actor_id FROM audit_logs WHERE target_id = ? AND action = 'booking.created'",
    )
      .bind(booking.id)
      .first<{ actor_id: string }>();
    expect(audit?.actor_id).toBe(student.userId);

    // The booked cells disappear from the public slot listing.
    const slots = await api(`/tutors/${tutor.userId}/slots?from=${date}&to=${date}&duration=30`);
    const starts = (
      await slots.json<ApiSuccess<{ slots: { startUtc: string }[] }>>()
    ).data.slots.map((s) => s.startUtc);
    expect(starts).not.toContain(at(date, 18));
    expect(starts).not.toContain(at(date, 19));
    expect(starts).toContain(at(date, 19, 30));
  });

  it('lets exactly one of two concurrent students win the same slot (409 for the other, no orphans)', async () => {
    const date = ahead(4);
    const tutor = await tutorOn(date);
    const [s1, s2] = await Promise.all([register('student'), register('student')]);
    const body = { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 };
    const results = await Promise.all([book(s1, body), book(s2, body)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(await errorCode(loser)).toBe('SLOT_UNAVAILABLE');
    expect(await counts(tutor.userId)).toEqual({ bookings: 1, claims: 2 });
  });

  it('rejects any overlap across durations (60 vs 90 minutes)', async () => {
    const date = ahead(5);
    const tutor = await tutorOn(date);
    const [s1, s2] = await Promise.all([register('student'), register('student')]);
    expect(
      (await book(s1, { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 }))
        .status,
    ).toBe(201);
    const overlap = await book(s2, {
      tutorId: tutor.userId,
      startUtc: at(date, 17, 30),
      durationMinutes: 90,
    });
    expect(overlap.status).toBe(409);
    expect(await counts(tutor.userId)).toEqual({ bookings: 1, claims: 2 });
    expect(
      (await book(s2, { tutorId: tutor.userId, startUtc: at(date, 19), durationMinutes: 90 }))
        .status,
    ).toBe(201);
    expect(await counts(tutor.userId)).toEqual({ bookings: 2, claims: 5 });
  });

  it.each([
    ['client price', { priceMinor: 1 }],
    ['client rate', { hourlyRateMinor: 1 }],
    ['client student id', { studentId: '00000000-0000-4000-8000-000000000000' }],
    ['client status', { status: 'CONFIRMED' }],
    ['bad duration', { durationMinutes: 45 }],
    ['non-canonical start', { startUtc: '2099-01-01T10:00:00Z' }],
  ])('rejects %s with 422', async (_label, override) => {
    const date = ahead(6);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const res = await book(student, {
      tutorId: tutor.userId,
      startUtc: at(date, 18),
      durationMinutes: 60,
      ...override,
    });
    expect(res.status).toBe(422);
    expect((await counts(tutor.userId)).bookings).toBe(0);
  });

  it('rejects misaligned, past, out-of-schedule and beyond-horizon starts', async () => {
    const date = ahead(7);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const misaligned = await book(student, {
      tutorId: tutor.userId,
      startUtc: at(date, 18, 15),
      durationMinutes: 60,
    });
    expect(await errorCode(misaligned)).toBe('INVALID_START');
    const past = await book(student, {
      tutorId: tutor.userId,
      startUtc: at(ahead(-1), 18),
      durationMinutes: 60,
    });
    expect(await errorCode(past)).toBe('START_IN_PAST');
    const outside = await book(student, {
      tutorId: tutor.userId,
      startUtc: at(date, 20, 30),
      durationMinutes: 60,
    });
    expect(outside.status).toBe(422);
    expect(await errorCode(outside)).toBe('SLOT_NOT_AVAILABLE');
    const far = await book(student, {
      tutorId: tutor.userId,
      startUtc: at(ahead(35), 18),
      durationMinutes: 60,
    });
    expect(await errorCode(far)).toBe('BEYOND_HORIZON');
    expect((await counts(tutor.userId)).bookings).toBe(0);
  });

  it('is student-only and only for publicly listed tutors', async () => {
    const date = ahead(8);
    const tutor = await tutorOn(date);
    const body = { tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 };
    expect((await api('/bookings', jsonInit('POST', body))).status).toBe(401);
    const otherTutor = await register('tutor');
    expect((await book(otherTutor, body)).status).toBe(403);

    const hidden = await tutorOn(date);
    await env.DB.prepare("UPDATE tutor_profiles SET visibility = 'private' WHERE user_id = ?")
      .bind(hidden.userId)
      .run();
    const student = await register('student');
    const res = await book(student, { ...body, tutorId: hidden.userId });
    expect(res.status).toBe(404);
  });

  it('requires the CSRF token', async () => {
    const date = ahead(9);
    const tutor = await tutorOn(date);
    const student = await register('student');
    const res = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({ tutorId: tutor.userId, startUtc: at(date, 18), durationMinutes: 60 }),
      headers: { 'Content-Type': 'application/json', Cookie: student.cookie },
    });
    expect(res.status).toBe(403);
  });
});

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { SlotList } from '../../src/shared/schemas/availability';
import { addDays, localToUtc, todayIn, utcToLocal, weekdayOf } from '../../src/shared/time';
import { api, createPublicTutor, errorCode, jsonInit, register, type Session } from './helpers';

const VN = 'Asia/Ho_Chi_Minh';
const ahead = (days: number) => addDays(todayIn(VN), days);

async function tutorWithEvening(date: string) {
  const tutor = await createPublicTutor();
  const res = await api(
    '/tutor/availability',
    jsonInit('PUT', { rules: [{ weekday: weekdayOf(date), start: '18:00', end: '20:00' }] }, tutor),
  );
  expect(res.status).toBe(200);
  return tutor;
}

async function slots(tutor: Session, query: string) {
  const res = await api(`/tutors/${tutor.userId}/slots${query}`);
  expect(res.status).toBe(200);
  return (await res.json<ApiSuccess<SlotList>>()).data;
}

const localTimes = (list: SlotList) =>
  list.slots.map((s) => {
    const { minutes } = utcToLocal(Date.parse(s.startUtc), VN);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  });

async function claim(tutor: Session, date: string, localMinutes: number[]) {
  const student = await register('student');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const start = localToUtc(date, localMinutes[0]!, VN).toISOString();
  const end = localToUtc(date, localMinutes.at(-1)! + 30, VN).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO bookings (id, tutor_id, student_id, starts_at_utc, ends_at_utc, duration_minutes, status,
         hourly_rate_minor, price_minor, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 200000, 200000, ?, ?)`,
    ).bind(id, tutor.userId, student.userId, start, end, localMinutes.length * 30, now, now),
    ...localMinutes.map((m) =>
      env.DB.prepare(
        'INSERT INTO booking_slot_claims (tutor_id, slot_start_utc, booking_id) VALUES (?, ?, ?)',
      ).bind(tutor.userId, localToUtc(date, m, VN).toISOString(), id),
    ),
  ]);
}

describe('GET /tutors/:id/slots', () => {
  it('lists start times inside weekly windows for each duration, in UTC', async () => {
    const date = ahead(2);
    const tutor = await tutorWithEvening(date);
    const sixty = await slots(tutor, `?from=${date}&to=${date}&duration=60`);
    expect(sixty).toMatchObject({
      tutorId: tutor.userId,
      timezone: VN,
      duration: 60,
      from: date,
      to: date,
    });
    expect(localTimes(sixty)).toEqual(['18:00', '18:30', '19:00']);
    expect(sixty.slots[0]).toEqual({
      startUtc: localToUtc(date, 18 * 60, VN).toISOString(),
      endUtc: localToUtc(date, 19 * 60, VN).toISOString(),
    });
    expect(localTimes(await slots(tutor, `?from=${date}&to=${date}&duration=30`))).toHaveLength(4);
    expect(localTimes(await slots(tutor, `?from=${date}&to=${date}&duration=90`))).toEqual([
      '18:00',
      '18:30',
    ]);
    expect(localTimes(await slots(tutor, `?from=${date}&to=${date}&duration=120`))).toEqual([
      '18:00',
    ]);
  });

  it('defaults to a 7-day window from today with 60-minute slots', async () => {
    const tutor = await tutorWithEvening(ahead(2));
    const data = await slots(tutor, '');
    expect(data.from).toBe(ahead(0));
    expect(data.to).toBe(ahead(6));
    expect(data.duration).toBe(60);
  });

  it('removes closed days, adds extra windows', async () => {
    const date = ahead(3);
    const tutor = await tutorWithEvening(date);
    await api(
      '/tutor/availability/exceptions',
      jsonInit('POST', { date, kind: 'extra', start: '08:00', end: '09:00' }, tutor),
    );
    expect(localTimes(await slots(tutor, `?from=${date}&to=${date}`))).toEqual([
      '08:00',
      '18:00',
      '18:30',
      '19:00',
    ]);

    const other = ahead(10);
    const tutor2 = await tutorWithEvening(other);
    await api(
      '/tutor/availability/exceptions',
      jsonInit('POST', { date: other, kind: 'closed' }, tutor2),
    );
    expect((await slots(tutor2, `?from=${other}&to=${other}`)).slots).toEqual([]);
  });

  it('hides claimed cells; longer sessions need every consecutive cell free', async () => {
    const date = ahead(4);
    const tutor = await tutorWithEvening(date);
    await claim(tutor, date, [18 * 60 + 30]); // 18:30–19:00 taken
    expect(localTimes(await slots(tutor, `?from=${date}&to=${date}&duration=30`))).toEqual([
      '18:00',
      '19:00',
      '19:30',
    ]);
    expect(localTimes(await slots(tutor, `?from=${date}&to=${date}&duration=60`))).toEqual([
      '19:00',
    ]);
    expect((await slots(tutor, `?from=${date}&to=${date}&duration=90`)).slots).toEqual([]);
  });

  it('never offers past start times', async () => {
    const today = ahead(0);
    const tutor = await createPublicTutor();
    await api(
      '/tutor/availability',
      jsonInit(
        'PUT',
        { rules: [{ weekday: weekdayOf(today), start: '00:00', end: '24:00' }] },
        tutor,
      ),
    );
    const data = await slots(tutor, `?from=${today}&to=${today}&duration=30`);
    const now = Date.now();
    expect(data.slots.every((s) => Date.parse(s.startUtc) >= now)).toBe(true);
  });

  it.each([
    ['past range', () => `?from=${ahead(-1)}&to=${ahead(0)}`, 'RANGE_IN_PAST'],
    ['beyond horizon', () => `?from=${ahead(1)}&to=${ahead(31)}`, 'BEYOND_HORIZON'],
    ['bad duration', () => '?duration=45', 'VALIDATION_ERROR'],
    ['inverted range', () => `?from=${ahead(5)}&to=${ahead(2)}`, 'VALIDATION_ERROR'],
    ['invalid date', () => '?from=2026-02-30', 'VALIDATION_ERROR'],
  ])('rejects %s with 422', async (_label, query, code) => {
    const tutor = await tutorWithEvening(ahead(2));
    const res = await api(`/tutors/${tutor.userId}/slots${query()}`);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe(code);
  });

  it('returns 404 for tutors that are not publicly listed', async () => {
    const draft = await register('tutor');
    await api(
      '/tutor/availability',
      jsonInit('PUT', { rules: [{ weekday: 1, start: '08:00', end: '10:00' }] }, draft),
    );
    const res = await api(`/tutors/${draft.userId}/slots`);
    expect(res.status).toBe(404);
    expect((await api(`/tutors/${crypto.randomUUID()}/slots`)).status).toBe(404);
  });
});

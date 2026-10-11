import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { BookingWithActions } from '../../src/shared/schemas/bookings';
import type { Page } from '../../src/shared/schemas/discovery';
import { addDays, localToUtc, todayIn, weekdayOf } from '../../src/shared/time';
import { api, createPublicTutor, errorCode, jsonInit, register, type Session } from './helpers';

const VN = 'Asia/Ho_Chi_Minh';
const ahead = (days: number) => addDays(todayIn(VN), days);
const at = (date: string, hh: number) => localToUtc(date, hh * 60, VN).toISOString();

interface Fixture {
  tutor: Session;
  student: Session;
  bookingId: string;
  date: string;
}

async function bookedFixture(days = 3, hour = 18): Promise<Fixture> {
  const date = ahead(days);
  const tutor = await createPublicTutor();
  await api(
    '/tutor/availability',
    jsonInit('PUT', { rules: [{ weekday: weekdayOf(date), start: '08:00', end: '21:00' }] }, tutor),
  );
  const student = await register('student', { displayName: 'Học viên Bình' });
  const res = await api(
    '/bookings',
    jsonInit(
      'POST',
      { tutorId: tutor.userId, startUtc: at(date, hour), durationMinutes: 60 },
      student,
    ),
  );
  expect(res.status).toBe(201);
  const { data } = await res.json<ApiSuccess<{ id: string }>>();
  return { tutor, student, bookingId: data.id, date };
}

function act(session: Session, id: string, action: string) {
  return api(`/bookings/${id}/${action}`, jsonInit('POST', {}, session));
}

async function state(id: string) {
  const booking = await env.DB.prepare('SELECT status, version FROM bookings WHERE id = ?')
    .bind(id)
    .first<{ status: string; version: number }>();
  const claims = await env.DB.prepare(
    'SELECT count(*) AS n FROM booking_slot_claims WHERE booking_id = ?',
  )
    .bind(id)
    .first<{ n: number }>();
  const audits = await env.DB.prepare(
    "SELECT action, actor_id FROM audit_logs WHERE target_id = ? AND action <> 'booking.created' ORDER BY created_at",
  )
    .bind(id)
    .all<{ action: string; actor_id: string }>();
  return { ...booking!, claims: claims?.n ?? 0, audits: audits.results };
}

describe('booking transitions', () => {
  it('tutor confirms own PENDING booking; claims are kept and audited', async () => {
    const f = await bookedFixture();
    const res = await act(f.tutor, f.bookingId, 'confirm');
    expect(res.status).toBe(200);
    const body = (await res.json<ApiSuccess<BookingWithActions>>()).data;
    expect(body.status).toBe('CONFIRMED');
    expect(body.allowedActions).toEqual(['cancel']);
    expect(await state(f.bookingId)).toEqual({
      status: 'CONFIRMED',
      version: 1,
      claims: 2,
      audits: [{ action: 'booking.confirm', actor_id: f.tutor.userId }],
    });
  });

  it('enforces ownership: other tutor 404, participating student 403 for tutor-only actions', async () => {
    const f = await bookedFixture();
    const otherTutor = await register('tutor');
    const otherStudent = await register('student');
    expect((await act(otherTutor, f.bookingId, 'confirm')).status).toBe(404);
    expect((await act(otherStudent, f.bookingId, 'cancel')).status).toBe(404);
    const studentConfirm = await act(f.student, f.bookingId, 'confirm');
    expect(studentConfirm.status).toBe(403);
    expect((await state(f.bookingId)).status).toBe('PENDING');
  });

  it('reject releases the slot so it can be booked again', async () => {
    const f = await bookedFixture();
    expect((await act(f.tutor, f.bookingId, 'reject')).status).toBe(200);
    expect(await state(f.bookingId)).toMatchObject({ status: 'REJECTED', claims: 0 });
    const again = await register('student');
    const rebook = await api(
      '/bookings',
      jsonInit(
        'POST',
        { tutorId: f.tutor.userId, startUtc: at(f.date, 18), durationMinutes: 60 },
        again,
      ),
    );
    expect(rebook.status).toBe(201);
  });

  it('cancel frees the slot exactly once; repeating is 409', async () => {
    const f = await bookedFixture();
    expect((await act(f.tutor, f.bookingId, 'confirm')).status).toBe(200);
    expect((await act(f.student, f.bookingId, 'cancel')).status).toBe(200);
    const second = await act(f.student, f.bookingId, 'cancel');
    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe('INVALID_TRANSITION');
    const s = await state(f.bookingId);
    expect(s).toMatchObject({ status: 'CANCELLED', version: 2, claims: 0 });
    expect(s.audits.map((a) => a.action)).toEqual(['booking.confirm', 'booking.cancel']);
  });

  it('parallel cancel vs confirm leaves a consistent state (exactly one wins)', async () => {
    for (let i = 0; i < 3; i++) {
      const f = await bookedFixture(4 + i);
      const results = await Promise.all([
        act(f.student, f.bookingId, 'cancel'),
        act(f.tutor, f.bookingId, 'confirm'),
      ]);
      const codes = results.map((r) => r.status);
      const s = await state(f.bookingId);
      if (s.status === 'CANCELLED') {
        // cancel won; confirm either lost the race (409) or ran first and was then cancelled.
        expect(s.claims).toBe(0);
        expect(codes[0]).toBe(200);
      } else {
        expect(s.status).toBe('CONFIRMED');
        expect(s.claims).toBe(2);
        expect(codes).toEqual([409, 200]);
      }
      expect(s.audits.length).toBe(codes.filter((c) => c === 200).length);
    }
  });

  it('applies timing rules: no confirm/cancel after start, complete only after end', async () => {
    const f = await bookedFixture();
    expect((await act(f.tutor, f.bookingId, 'confirm')).status).toBe(200);
    const early = await act(f.tutor, f.bookingId, 'complete');
    expect(early.status).toBe(409);
    expect(await errorCode(early)).toBe('TRANSITION_NOT_ALLOWED');

    // Move the session into the past.
    await env.DB.prepare(
      "UPDATE bookings SET starts_at_utc = '2020-01-01T01:00:00.000Z', ends_at_utc = '2020-01-01T02:00:00.000Z' WHERE id = ?",
    )
      .bind(f.bookingId)
      .run();
    expect((await act(f.student, f.bookingId, 'cancel')).status).toBe(409);
    const done = await act(f.tutor, f.bookingId, 'complete');
    expect(done.status).toBe(200);
    expect(await state(f.bookingId)).toMatchObject({ status: 'COMPLETED', claims: 2 });
    expect((await act(f.tutor, f.bookingId, 'cancel')).status).toBe(409);

    const late = await bookedFixture(5);
    await env.DB.prepare(
      "UPDATE bookings SET starts_at_utc = '2020-01-01T01:00:00.000Z' WHERE id = ?",
    )
      .bind(late.bookingId)
      .run();
    expect(await errorCode(await act(late.tutor, late.bookingId, 'confirm'))).toBe(
      'TRANSITION_NOT_ALLOWED',
    );
  });

  it('rejects unknown actions and requires CSRF', async () => {
    const f = await bookedFixture();
    expect((await act(f.tutor, f.bookingId, 'approve')).status).toBe(404);
    const noCsrf = await api(`/bookings/${f.bookingId}/confirm`, {
      method: 'POST',
      headers: { Cookie: f.tutor.cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(noCsrf.status).toBe(403);
  });
});

describe('GET /bookings', () => {
  it('lists only the viewer’s bookings with role-specific actions', async () => {
    const f = await bookedFixture();
    const intruder = await register('student');

    const asStudent = await api('/bookings', { headers: { Cookie: f.student.cookie } });
    const studentPage = (await asStudent.json<ApiSuccess<Page<BookingWithActions>>>()).data;
    expect(studentPage.total).toBe(1);
    expect(studentPage.items[0]).toMatchObject({
      id: f.bookingId,
      allowedActions: ['cancel'],
      tutorId: f.tutor.userId,
      studentId: f.student.userId,
      tutorName: 'Người dùng thử',
      studentName: 'Học viên Bình',
      status: 'PENDING',
      durationMinutes: 60,
    });

    const asTutor = await api('/bookings', { headers: { Cookie: f.tutor.cookie } });
    expect(
      (await asTutor.json<ApiSuccess<Page<BookingWithActions>>>()).data.items[0]!.allowedActions,
    ).toEqual(['confirm', 'reject', 'cancel']);

    const other = await api('/bookings', { headers: { Cookie: intruder.cookie } });
    expect((await other.json<ApiSuccess<Page<BookingWithActions>>>()).data.total).toBe(0);
    expect(
      (await api(`/bookings/${f.bookingId}`, { headers: { Cookie: intruder.cookie } })).status,
    ).toBe(404);
    expect(
      (await api(`/bookings/${f.bookingId}`, { headers: { Cookie: f.student.cookie } })).status,
    ).toBe(200);
  });

  it('filters by status and paginates', async () => {
    const f = await bookedFixture();
    await act(f.tutor, f.bookingId, 'confirm');
    const q = (s: string) => api(`/bookings${s}`, { headers: { Cookie: f.student.cookie } });
    const pending = (
      await (await q('?status=PENDING')).json<ApiSuccess<Page<BookingWithActions>>>()
    ).data;
    expect(pending.total).toBe(0);
    const active = (
      await (
        await q('?status=PENDING,CONFIRMED&pageSize=1')
      ).json<ApiSuccess<Page<BookingWithActions>>>()
    ).data;
    expect(active).toMatchObject({ total: 1, pageSize: 1 });
    expect((await q('?status=DONE')).status).toBe(422);
  });

  it('is not available to anonymous users or admins', async () => {
    expect((await api('/bookings')).status).toBe(401);
    const admin = await register('student');
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(admin.userId).run();
    expect((await api('/bookings', { headers: { Cookie: admin.cookie } })).status).toBe(403);
  });
});

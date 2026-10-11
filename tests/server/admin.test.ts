import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiErrorBody, ApiSuccess } from '../../src/shared/api';
import type { AdminTutor } from '../../src/shared/schemas/admin';
import type { Page } from '../../src/shared/schemas/discovery';
import type { TutorProfile } from '../../src/shared/schemas/tutors';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

async function makeAdmin(): Promise<Session> {
  const admin = await register('student');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(admin.userId).run();
  return admin;
}

/** Tutor with a complete profile submitted for review. */
async function pendingTutor(): Promise<Session> {
  const tutor = await register('tutor');
  await api(
    '/tutor/profile',
    jsonInit(
      'PATCH',
      {
        bio: 'Kinh nghiệm',
        subjectIds: ['subj_math'],
        hourlyRateMinor: 200_000,
        teachesOnline: true,
      },
      tutor,
    ),
  );
  const res = await api('/tutor/profile/submit', jsonInit('POST', {}, tutor));
  expect(res.status).toBe(200);
  return tutor;
}

function moderate(admin: Session, tutorId: string, action: string, body: unknown = {}) {
  return api(`/admin/tutors/${tutorId}/${action}`, jsonInit('POST', body, admin));
}

async function queue(admin: Session, status = 'pending') {
  const res = await api(`/admin/tutors?status=${status}`, { headers: { Cookie: admin.cookie } });
  expect(res.status).toBe(200);
  return (await res.json<ApiSuccess<Page<AdminTutor>>>()).data;
}

const isPublic = async (tutorId: string) =>
  (await api('/tutors?pageSize=48'))
    .json<ApiSuccess<Page<{ id: string }>>>()
    .then((p) => p.data.items.some((t) => t.id === tutorId));

describe('admin authorization', () => {
  it('is admin-only (401 anonymous, 403 for students and tutors)', async () => {
    const tutor = await pendingTutor();
    const student = await register('student');
    expect((await api('/admin/tutors')).status).toBe(401);
    expect((await api('/admin/tutors', { headers: { Cookie: student.cookie } })).status).toBe(403);
    expect((await api('/admin/tutors', { headers: { Cookie: tutor.cookie } })).status).toBe(403);
    expect((await moderate(tutor, tutor.userId, 'approve')).status).toBe(403);
    expect((await moderate(student, tutor.userId, 'approve')).status).toBe(403);
  });
});

describe('moderation queue', () => {
  it('lists pending tutors with email and subjects, paginated', async () => {
    const admin = await makeAdmin();
    const a = await pendingTutor();
    const b = await pendingTutor();
    const page = await queue(admin);
    // D1 is isolated per file, not per test: earlier tests in this file may add pending tutors.
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect(page.items.map((t) => t.userId)).toEqual(expect.arrayContaining([a.userId, b.userId]));
    expect(page.items.every((t) => t.approvalStatus === 'pending')).toBe(true);
    expect(page.items[0]).toMatchObject({
      approvalStatus: 'pending',
      visibility: 'private',
      email: expect.stringContaining('@'),
    });
    expect(page.items[0]!.subjects.map((s) => s.id)).toEqual(['subj_math']);
    const small = await api('/admin/tutors?status=pending&pageSize=1', {
      headers: { Cookie: admin.cookie },
    });
    expect((await small.json<ApiSuccess<Page<AdminTutor>>>()).data.items).toHaveLength(1);
    expect(
      (await api('/admin/tutors?status=bogus', { headers: { Cookie: admin.cookie } })).status,
    ).toBe(422);
  });
});

describe('approve / reject / hide', () => {
  it('approval makes the profile public only after approval, and is audited', async () => {
    const admin = await makeAdmin();
    const tutor = await pendingTutor();
    expect(await isPublic(tutor.userId)).toBe(false);

    const res = await moderate(admin, tutor.userId, 'approve');
    expect(res.status).toBe(200);
    expect((await res.json<ApiSuccess<AdminTutor>>()).data).toMatchObject({
      approvalStatus: 'approved',
      visibility: 'public',
    });
    expect(await isPublic(tutor.userId)).toBe(true);

    const audit = await env.DB.prepare(
      "SELECT actor_id, metadata FROM audit_logs WHERE target_id = ? AND action = 'tutor.approve'",
    )
      .bind(tutor.userId)
      .all<{ actor_id: string; metadata: string }>();
    expect(audit.results).toHaveLength(1);
    expect(audit.results[0]!.actor_id).toBe(admin.userId);
    expect(JSON.parse(audit.results[0]!.metadata)).toMatchObject({
      to: { approvalStatus: 'approved', visibility: 'public' },
    });
  });

  it('reject requires a reason, hides the tutor and shows the reason to them; resubmission works', async () => {
    const admin = await makeAdmin();
    const tutor = await pendingTutor();
    const noReason = await moderate(admin, tutor.userId, 'reject');
    expect(noReason.status).toBe(422);

    expect(
      (await moderate(admin, tutor.userId, 'reject', { reason: 'Thiếu bằng cấp' })).status,
    ).toBe(200);
    expect(await isPublic(tutor.userId)).toBe(false);
    const own = await api('/tutor/profile', { headers: { Cookie: tutor.cookie } });
    expect((await own.json<ApiSuccess<TutorProfile>>()).data).toMatchObject({
      approvalStatus: 'rejected',
      moderationNote: 'Thiếu bằng cấp',
    });
    const audit = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE target_id = ? AND action = 'tutor.reject'",
    )
      .bind(tutor.userId)
      .first<{ metadata: string }>();
    expect(JSON.parse(audit!.metadata).reason).toBe('Thiếu bằng cấp');

    expect((await api('/tutor/profile/submit', jsonInit('POST', {}, tutor))).status).toBe(200);
    expect((await queue(admin)).items.map((t) => t.userId)).toContain(tutor.userId);
  });

  it('hide removes an approved tutor from public listing; approve re-publishes', async () => {
    const admin = await makeAdmin();
    const tutor = await pendingTutor();
    await moderate(admin, tutor.userId, 'approve');
    expect(
      (await moderate(admin, tutor.userId, 'hide', { reason: 'Báo cáo vi phạm' })).status,
    ).toBe(200);
    expect(await isPublic(tutor.userId)).toBe(false);
    expect((await api(`/tutors/${(await queue(admin, 'hidden')).items[0]!.slug}`)).status).toBe(
      404,
    );
    expect((await queue(admin, 'hidden')).items.map((t) => t.userId)).toEqual([tutor.userId]);
    expect((await moderate(admin, tutor.userId, 'approve')).status).toBe(200);
    expect(await isPublic(tutor.userId)).toBe(true);
  });

  it('rejects invalid transitions, unknown tutors and incomplete profiles', async () => {
    const admin = await makeAdmin();
    const tutor = await pendingTutor();
    await moderate(admin, tutor.userId, 'approve');
    const twice = await moderate(admin, tutor.userId, 'approve');
    expect(twice.status).toBe(409);
    expect(await errorCode(twice)).toBe('INVALID_STATE');
    expect((await moderate(admin, crypto.randomUUID(), 'approve')).status).toBe(404);

    const draft = await register('tutor');
    await api('/tutor/profile', jsonInit('PATCH', { bio: 'x' }, draft));
    await env.DB.prepare("UPDATE tutor_profiles SET approval_status = 'pending' WHERE user_id = ?")
      .bind(draft.userId)
      .run();
    const incomplete = await moderate(admin, draft.userId, 'approve');
    expect(incomplete.status).toBe(422);
    expect((await incomplete.json<ApiErrorBody>()).error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('rejects unknown body fields', async () => {
    const admin = await makeAdmin();
    const tutor = await pendingTutor();
    const res = await moderate(admin, tutor.userId, 'approve', { visibility: 'public' });
    expect(res.status).toBe(422);
  });
});

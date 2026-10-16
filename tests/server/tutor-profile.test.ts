import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiErrorBody, ApiSuccess } from '../../src/shared/api';
import type { Subject, TutorProfile } from '../../src/shared/schemas/tutors';
import { slugify } from '../../src/server/modules/tutors/slug';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

const PATH = '/tutor/profile';

const COMPLETE = {
  displayName: 'Nguyễn Văn Đức',
  bio: 'Giáo viên Toán THPT, 5 năm kinh nghiệm luyện thi.',
  subjectIds: ['subj_math', 'subj_physics'],
  hourlyRateMinor: 250_000,
  teachesOnline: true,
  teachesOffline: false,
};

function patch(session: Session, body: unknown) {
  return api(PATH, jsonInit('PATCH', body, session));
}

async function getProfile(session: Session) {
  const res = await api(PATH, { headers: { Cookie: session.cookie } });
  expect(res.status).toBe(200);
  return (await res.json<ApiSuccess<TutorProfile | null>>()).data;
}

describe('GET /subjects', () => {
  it('is public and returns the catalogue sorted by name', async () => {
    const res = await api('/subjects');
    expect(res.status).toBe(200);
    const subjects = (await res.json<ApiSuccess<Subject[]>>()).data;
    expect(subjects.length).toBe(9);
    expect(subjects.map((s) => s.name)).toEqual(
      [...subjects.map((s) => s.name)].sort(new Intl.Collator('vi').compare),
    );
    expect(subjects.map((s) => s.name).indexOf('Địa lý')).toBeLessThan(
      subjects.map((s) => s.name).indexOf('Hóa học'),
    );
    expect(subjects[0]).toEqual({
      id: expect.any(String),
      slug: expect.any(String),
      name: expect.any(String),
    });
  });
});

describe('slugify', () => {
  it('strips Vietnamese diacritics', () => {
    expect(slugify('Nguyễn Văn Đức')).toBe('nguyen-van-duc');
    expect(slugify('  !!! ')).toBe('gia-su');
  });
});

describe('tutor profile', () => {
  it('returns null before the profile exists', async () => {
    const tutor = await register('tutor');
    expect(await getProfile(tutor)).toBeNull();
  });

  it('creates a private draft profile on first save and lists what is missing', async () => {
    const tutor = await register('tutor');
    const res = await patch(tutor, { bio: 'Xin chào' });
    expect(res.status).toBe(200);
    const profile = (await res.json<ApiSuccess<TutorProfile>>()).data;
    expect(profile).toMatchObject({
      userId: tutor.userId,
      approvalStatus: 'draft',
      visibility: 'private',
      bio: 'Xin chào',
      hourlyRateMinor: null,
      subjects: [],
    });
    expect(profile.slug).toMatch(/^nguoi-dung-thu-[a-z0-9]{6}$/);
    expect(profile.missing).toEqual(['subjects', 'hourlyRate', 'teachingMode']);
  });

  it('saves all fields, updates the display name and replaces subjects atomically', async () => {
    const tutor = await register('tutor');
    await patch(tutor, COMPLETE);
    const res = await patch(tutor, { subjectIds: ['subj_english'] });
    const profile = (await res.json<ApiSuccess<TutorProfile>>()).data;
    expect(profile.displayName).toBe('Nguyễn Văn Đức');
    expect(profile.subjects.map((s) => s.id)).toEqual(['subj_english']);
    expect(profile.hourlyRateMinor).toBe(250_000);
    expect(profile.missing).toEqual([]);

    const me = await api('/me', { headers: { Cookie: tutor.cookie } });
    expect(
      (await me.json<ApiSuccess<{ user: { displayName: string } }>>()).data.user.displayName,
    ).toBe('Nguyễn Văn Đức');
  });

  it('persists bounded class preferences for the owner and replaces them atomically', async () => {
    const tutor = await register('tutor');
    const other = await register('tutor');
    const first = await patch(tutor, {
      preferredGrades: ['Lớp 10', 'Lớp 12'],
      preferredAreas: ['Cầu Giấy', 'Thanh Xuân'],
      negotiableTime: true,
      teachesOnline: true,
      teachesOffline: true,
    });
    expect(first.status).toBe(200);
    expect(await getProfile(tutor)).toMatchObject({
      preferredGrades: ['Lớp 10', 'Lớp 12'],
      preferredAreas: ['Cầu Giấy', 'Thanh Xuân'],
      negotiableTime: true,
    });
    expect(await getProfile(other)).toBeNull();

    const second = await patch(tutor, { preferredGrades: ['Lớp 7'], preferredAreas: [] });
    expect(second.status).toBe(200);
    expect(await getProfile(tutor)).toMatchObject({
      preferredGrades: ['Lớp 7'],
      preferredAreas: [],
      negotiableTime: true,
    });
    const gradeRows = await env.DB.prepare(
      'SELECT grade FROM tutor_preference_grades WHERE tutor_id = ?',
    )
      .bind(tutor.userId)
      .all<{ grade: string }>();
    expect(gradeRows.results.map((row) => row.grade)).toEqual(['Lớp 7']);
  });

  it('saves tutor-added options, keeps grade/area selection in the preference lists', async () => {
    const tutor = await register('tutor');
    const saved = await patch(tutor, {
      subjectIds: ['subj_math'],
      teachesOnline: true,
      preferredGrades: ['Lớp 9', 'Tiền tiểu học', 'Luyện thi chuyên'],
      preferredAreas: ['Hà Nội', 'Phường Cầu Giấy, Hà Nội'],
      customOptions: [
        { kind: 'subject', label: 'Cờ vua', selected: true },
        { kind: 'subject', label: 'Vẽ', selected: false },
        { kind: 'grade', label: 'Luyện thi chuyên', selected: false },
        { kind: 'grade', label: 'IELTS', selected: true },
        { kind: 'mode', label: 'Kèm cặp tại trung tâm', selected: true },
        { kind: 'area', label: 'Phường Cầu Giấy, Hà Nội', selected: false },
        { kind: 'area', label: 'Xã Sóc Sơn, Hà Nội', selected: true },
      ],
    });
    expect(saved.status).toBe(200);
    const profile = await getProfile(tutor);
    expect(profile?.preferredGrades).toEqual(
      expect.arrayContaining(['Lớp 9', 'Tiền tiểu học', 'Luyện thi chuyên']),
    );
    // Grade/area flags follow the preference lists, not the client's flag.
    expect(profile?.customOptions).toEqual([
      { kind: 'area', label: 'Phường Cầu Giấy, Hà Nội', selected: true },
      { kind: 'area', label: 'Xã Sóc Sơn, Hà Nội', selected: false },
      { kind: 'grade', label: 'Luyện thi chuyên', selected: true },
      { kind: 'grade', label: 'IELTS', selected: false },
      { kind: 'mode', label: 'Kèm cặp tại trung tâm', selected: true },
      { kind: 'subject', label: 'Cờ vua', selected: true },
      { kind: 'subject', label: 'Vẽ', selected: false },
    ]);

    // A custom grade must exist among the tutor's options to be preferred.
    const removed = await patch(tutor, {
      preferredGrades: ['Luyện thi chuyên'],
      customOptions: [{ kind: 'subject', label: 'Cờ vua', selected: true }],
    });
    expect(removed.status).toBe(422);
    const kept = await patch(tutor, { preferredGrades: ['Lớp 1', 'Luyện thi chuyên'] });
    expect(kept.status).toBe(200);
    const cleared = await patch(tutor, { customOptions: [], preferredGrades: ['Lớp 1'] });
    expect(cleared.status).toBe(200);
    expect((await getProfile(tutor))?.customOptions).toEqual([]);
  });

  it.each([
    ['rate not a multiple of 1000', { hourlyRateMinor: 250_500 }],
    ['rate below minimum', { hourlyRateMinor: 5_000 }],
    ['fractional rate', { hourlyRateMinor: 100_000.5 }],
    ['duplicate subjects', { subjectIds: ['subj_math', 'subj_math'] }],
    ['moderation field', { approvalStatus: 'approved' }],
    ['visibility field', { visibility: 'public' }],
    ['slug field', { slug: 'chosen' }],
    ['owner override', { userId: 'someone-else' }],
    ['unknown grade', { preferredGrades: ['Lớp 13'] }],
    ['duplicate grade', { preferredGrades: ['Lớp 10', 'Lớp 10'] }],
    ['too many areas', { preferredAreas: Array.from({ length: 41 }, (_, i) => `Area ${i}`) }],
    ['empty custom option', { customOptions: [{ kind: 'subject', label: '  ', selected: true }] }],
    [
      'duplicate custom option',
      {
        customOptions: [
          { kind: 'mode', label: 'Kèm cặp tại trung tâm', selected: true },
          { kind: 'mode', label: 'kèm cặp  tại trung tâm', selected: false },
        ],
      },
    ],
    [
      'custom option repeating a default',
      { customOptions: [{ kind: 'subject', label: 'toán', selected: true }] },
    ],
    [
      'custom option repeating a province',
      { customOptions: [{ kind: 'area', label: 'Hà Nội', selected: true }] },
    ],
    ['duplicate areas', { preferredAreas: ['Cầu Giấy', 'cầu giấy'] }],
    ['invalid negotiable time', { negotiableTime: 'yes' }],
  ])('rejects %s with 422', async (_label, body) => {
    const tutor = await register('tutor');
    const res = await patch(tutor, body);
    expect(res.status).toBe(422);
  });

  it('rejects unknown subject ids with 422 UNKNOWN_SUBJECT', async () => {
    const tutor = await register('tutor');
    const res = await patch(tutor, { subjectIds: ['subj_math', 'subj_alchemy'] });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('UNKNOWN_SUBJECT');
  });

  it('is tutor-only and scoped to the session user', async () => {
    expect((await api(PATH)).status).toBe(401);
    const student = await register('student');
    expect((await api(PATH, { headers: { Cookie: student.cookie } })).status).toBe(403);
    expect((await patch(student, { bio: 'x' })).status).toBe(403);

    const a = await register('tutor');
    const b = await register('tutor');
    await patch(b, COMPLETE);
    await patch(a, { bio: 'A only' });
    expect((await getProfile(b))?.bio).toBe(COMPLETE.bio);
  });
});

describe('POST /tutor/profile/submit', () => {
  it('requires a complete profile', async () => {
    const tutor = await register('tutor');
    expect((await api(`${PATH}/submit`, jsonInit('POST', {}, tutor))).status).toBe(404);
    await patch(tutor, { bio: 'x' });
    const res = await api(`${PATH}/submit`, jsonInit('POST', {}, tutor));
    expect(res.status).toBe(422);
    const body = await res.json<ApiErrorBody>();
    expect(body.error.code).toBe('PROFILE_INCOMPLETE');
    expect(body.error.details).toEqual(['subjects', 'hourlyRate', 'teachingMode']);
  });

  it('moves draft → pending once, keeps the profile private', async () => {
    const tutor = await register('tutor');
    await patch(tutor, COMPLETE);
    const res = await api(`${PATH}/submit`, jsonInit('POST', {}, tutor));
    expect(res.status).toBe(200);
    expect((await res.json<ApiSuccess<TutorProfile>>()).data).toMatchObject({
      approvalStatus: 'pending',
      visibility: 'private',
    });
    const again = await api(`${PATH}/submit`, jsonInit('POST', {}, tutor));
    expect(again.status).toBe(409);
  });

  it('allows resubmission after rejection', async () => {
    const tutor = await register('tutor');
    await patch(tutor, COMPLETE);
    await env.DB.prepare("UPDATE tutor_profiles SET approval_status = 'rejected' WHERE user_id = ?")
      .bind(tutor.userId)
      .run();
    expect((await api(`${PATH}/submit`, jsonInit('POST', {}, tutor))).status).toBe(200);
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = new TextEncoder().encode('%PDF-1.4\n%mock\n');

function uploadDocument(session: Session, kind: string, file: File) {
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', file);
  return api(`${PATH}/documents`, {
    method: 'POST',
    body: form,
    headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken },
  });
}

describe('tutor identity and documents', () => {
  it('keeps contact and citizen-ID facts private to the owner and moderators', async () => {
    const tutor = await register('tutor');
    const saved = await patch(tutor, {
      ...COMPLETE,
      major: 'Toán học',
      graduationYear: 2022,
      phone: '0123456789',
      dateOfBirth: '1998-01-01',
      idNumber: '008305000649',
      idIssuedOn: '2021-01-21',
      idResidence: 'Tân An',
      idVerification: 'upload',
    });
    expect(saved.status).toBe(200);
    expect(await getProfile(tutor)).toMatchObject({
      email: expect.stringContaining('@'),
      major: 'Toán học',
      graduationYear: 2022,
      phone: '0123456789',
      idNumber: '008305000649',
      idVerification: 'upload',
      documents: [],
    });
    for (const [label, body] of [
      ['short CCCD', { idNumber: '12345' }],
      ['letters in CCCD', { idNumber: '00830500064A' }],
      ['future birth date', { dateOfBirth: '2999-01-01' }],
      ['bad phone', { phone: 'abc' }],
      ['unknown method', { idVerification: 'post' }],
    ] as const) {
      expect({ label, status: (await patch(tutor, body)).status }).toEqual({ label, status: 422 });
    }

    // Public discovery never carries the private facts.
    await env.DB.prepare(
      "UPDATE tutor_profiles SET approval_status = 'approved', visibility = 'public' WHERE user_id = ?",
    )
      .bind(tutor.userId)
      .run();
    const listing = await (await api('/tutors?pageSize=50')).text();
    expect(listing).not.toContain('008305000649');
    expect(listing).not.toContain('0123456789');

    const moderator = await register('parent');
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(moderator.userId)
      .run();
    const verification = await api(`/admin/tutors/${tutor.userId}/verification`, {
      headers: { Cookie: moderator.cookie },
    });
    expect(verification.status).toBe(200);
    expect((await verification.json<ApiSuccess<{ idNumber: string }>>()).data.idNumber).toBe(
      '008305000649',
    );
    const other = await register('tutor');
    expect(
      (
        await api(`/admin/tutors/${tutor.userId}/verification`, {
          headers: { Cookie: other.cookie },
        })
      ).status,
    ).toBe(403);
  });

  it('stores ID photos one per side and credentials, signature-checked and owner-scoped', async () => {
    const tutor = await register('tutor');
    expect((await uploadDocument(tutor, 'credential', new File([PDF], 'bang.pdf'))).status).toBe(
      409,
    );
    await patch(tutor, { bio: 'Hồ sơ' });

    const front = await uploadDocument(tutor, 'id_front', new File([PNG], 'mat-truoc.png'));
    expect(front.status).toBe(201);
    const replaced = await uploadDocument(tutor, 'id_front', new File([PNG], 'moi.png'));
    expect(replaced.status).toBe(201);
    expect((await uploadDocument(tutor, 'id_back', new File([PDF], 'mat-sau.pdf'))).status).toBe(
      422,
    );
    expect((await uploadDocument(tutor, 'credential', new File(['<html>'], 'x.pdf'))).status).toBe(
      422,
    );
    expect((await uploadDocument(tutor, 'passport', new File([PNG], 'p.png'))).status).toBe(422);
    const credential = await uploadDocument(
      tutor,
      'credential',
      new File([PDF], 'bang tot nghiep.pdf'),
    );
    expect(credential.status).toBe(201);
    const credentialId = (await credential.json<ApiSuccess<{ id: string }>>()).data.id;

    const profile = await getProfile(tutor);
    expect(profile?.documents.map((doc) => [doc.kind, doc.fileName])).toEqual([
      ['id_front', 'moi.png'],
      ['credential', 'bang tot nghiep.pdf'],
    ]);
    const download = await api(`${PATH}/documents/${credentialId}`, {
      headers: { Cookie: tutor.cookie },
    });
    expect(download.status).toBe(200);
    expect(download.headers.get('Content-Disposition')).toMatch(/^attachment/);
    expect(download.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const other = await register('tutor');
    expect(
      (await api(`${PATH}/documents/${credentialId}`, { headers: { Cookie: other.cookie } }))
        .status,
    ).toBe(404);
    expect(
      (await api(`${PATH}/documents/${credentialId}`, jsonInit('DELETE', {}, other))).status,
    ).toBe(404);
    expect(
      (await api(`${PATH}/documents/${credentialId}`, jsonInit('DELETE', {}, tutor))).status,
    ).toBe(200);
    expect((await getProfile(tutor))?.documents).toHaveLength(1);
  });
});

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { Page } from '../../src/shared/schemas/discovery';
import {
  CONTACT_SHARING_CONSENT_VERSION,
  type OwnParentRequest,
  type ParentRequestSummary,
} from '../../src/shared/schemas/requests';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

const PATH = '/parent/requests';
const VALID = {
  subjectId: 'subj_math',
  grade: 'Lớp 10',
  mode: 'offline',
  area: 'Phường Cầu Giấy, Hà Nội',
  expectedBudgetMinor: 250_000,
  description: 'Cần gia sư Toán buổi tối.',
  schedule: {
    timezone: 'Asia/Ho_Chi_Minh',
    discussLater: false,
    windows: [
      { weekday: 1, startLocal: '18:00', endLocal: '19:30' },
      { weekday: 3, startLocal: '18:00', endLocal: '19:30' },
    ],
  },
  contactPhone: '0912345678',
  studentName: 'Học sinh mẫu',
  contactAddress: 'Số 10, đường thử nghiệm',
} as const;

function key() {
  return `request-${crypto.randomUUID()}`;
}

async function create(parent: Session, body: unknown = VALID, idempotencyKey = key()) {
  return api(PATH, jsonInit('POST', body, parent, { 'Idempotency-Key': idempotencyKey }));
}

async function data(res: Response): Promise<OwnParentRequest> {
  return (await res.json<ApiSuccess<OwnParentRequest>>()).data;
}

describe('parent find-tutor requests', () => {
  it('allows only parents and never trusts an owner, status or code from the client', async () => {
    expect((await api(PATH)).status).toBe(401);
    const tutor = await register('tutor');
    expect((await api(PATH, { headers: { Cookie: tutor.cookie } })).status).toBe(403);
    expect((await create(tutor)).status).toBe(403);

    const moderator = await register('parent');
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(moderator.userId)
      .run();
    expect((await create(moderator)).status).toBe(403);

    const parent = await register('parent');
    for (const forbidden of [
      { parentId: tutor.userId },
      { status: 'submitted' },
      { code: 'YC-000001' },
      { agreedTuitionPerSessionMinor: 1 },
      { childName: 'Private child' },
      { cccd: '012345678901' },
    ]) {
      const res = await create(parent, { ...VALID, ...forbidden });
      expect(res.status).toBe(422);
      expect(await errorCode(res)).toBe('VALIDATION_ERROR');
    }
  });

  it('creates a private draft with server code, weekly windows, owner list/detail and metadata-only audit', async () => {
    const parent = await register('parent');
    const other = await register('parent');
    const response = await create(parent);
    expect(response.status).toBe(201);
    const request = await data(response);
    expect(request).toMatchObject({
      code: expect.stringMatching(/^YC-[A-F0-9]{12}$/),
      status: 'draft',
      version: 1,
      contactPhone: VALID.contactPhone,
      contactAddress: VALID.contactAddress,
      contactConsentAt: null,
      contactConsentVersion: null,
      agreedTuitionPerSessionMinor: null,
      schedule: VALID.schedule,
    });

    const list = await api(PATH, { headers: { Cookie: parent.cookie } });
    expect(list.status).toBe(200);
    const page = (await list.json<ApiSuccess<Page<ParentRequestSummary>>>()).data;
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(request.id);
    // The owner's own list shows the student name and phone; address stays detail-only.
    expect(page.items[0]).toMatchObject({
      studentName: VALID.studentName,
      contactPhone: VALID.contactPhone,
      educationLevel: 'upper_secondary',
    });
    expect(JSON.stringify(page.items)).not.toContain(VALID.contactAddress);
    expect(JSON.stringify(page.items)).not.toContain('contactConsent');
    expect(JSON.stringify(page.items)).not.toContain('agreedTuitionPerSessionMinor');

    const own = await api(`${PATH}/${request.id}`, { headers: { Cookie: parent.cookie } });
    expect((await data(own)).contactPhone).toBe(VALID.contactPhone);
    const notOwn = await api(`${PATH}/${request.id}`, { headers: { Cookie: other.cookie } });
    expect(notOwn.status).toBe(404);
    expect((await api(PATH, { headers: { Cookie: other.cookie } })).status).toBe(200);

    const audit = await env.DB.prepare(
      "SELECT actor_id, metadata FROM audit_logs WHERE target_type = 'parent_request' AND target_id = ? AND action = 'parent_request.created'",
    )
      .bind(request.id)
      .first<{ actor_id: string; metadata: string }>();
    expect(audit?.actor_id).toBe(parent.userId);
    expect(audit?.metadata).toBe('{"to":"draft","version":1}');
    expect(audit?.metadata).not.toContain(VALID.contactPhone);
    expect(audit?.metadata).not.toContain(VALID.contactAddress);
    const privateRow = await env.DB.prepare(
      'SELECT contact_phone, contact_address FROM parent_request_private WHERE request_id = ?',
    )
      .bind(request.id)
      .first<{ contact_phone: string; contact_address: string }>();
    expect(privateRow?.contact_phone).toBe(VALID.contactPhone);
    expect(privateRow?.contact_address).toBe(VALID.contactAddress);
  });

  it('validates subject, area, schedule, timezone, contact, idempotency key and page bounds', async () => {
    const parent = await register('parent');
    const invalid: unknown[] = [
      { ...VALID, subjectId: 'missing' },
      { ...VALID, grade: 'Lớp 13' },
      { ...VALID, mode: 'offline', area: null },
      { ...VALID, schedule: { ...VALID.schedule, timezone: 'Mars/Olympus_Mons' } },
      {
        ...VALID,
        schedule: {
          ...VALID.schedule,
          windows: [{ weekday: 8, startLocal: '18:00', endLocal: '19:00' }],
        },
      },
      {
        ...VALID,
        schedule: {
          ...VALID.schedule,
          windows: [{ weekday: 1, startLocal: '19:00', endLocal: '18:00' }],
        },
      },
      {
        ...VALID,
        schedule: {
          ...VALID.schedule,
          windows: [
            { weekday: 1, startLocal: '18:00', endLocal: '19:30' },
            { weekday: 1, startLocal: '19:00', endLocal: '20:00' },
          ],
        },
      },
      { ...VALID, schedule: { ...VALID.schedule, discussLater: true } },
      {
        ...VALID,
        schedule: {
          ...VALID.schedule,
          windows: Array.from({ length: 15 }, (_, i) => ({
            weekday: (i % 7) + 1,
            startLocal: '18:00',
            endLocal: '19:00',
          })),
        },
      },
      { ...VALID, contactPhone: '123' },
      { ...VALID, contactAddress: 'x'.repeat(201) },
      { ...VALID, description: 'x'.repeat(1001) },
    ];
    for (const body of invalid) expect((await create(parent, body)).status).toBe(422);
    expect((await api(PATH, jsonInit('POST', VALID, parent))).status).toBe(422);
    expect((await api(`${PATH}?pageSize=49`, { headers: { Cookie: parent.cookie } })).status).toBe(
      422,
    );
    expect(
      (await api(`${PATH}?status=made-up`, { headers: { Cookie: parent.cookie } })).status,
    ).toBe(422);
  });

  it('replays a create once, rejects a reused key with different body, and requires CSRF', async () => {
    const parent = await register('parent');
    const idempotencyKey = key();
    const first = await create(parent, VALID, idempotencyKey);
    expect(first.status).toBe(201);
    const firstRequest = await data(first);
    const replay = await create(parent, VALID, idempotencyKey);
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    expect((await data(replay)).id).toBe(firstRequest.id);
    const conflict = await create(parent, { ...VALID, grade: 'Lớp 11' }, idempotencyKey);
    expect(conflict.status).toBe(409);
    expect(await errorCode(conflict)).toBe('IDEMPOTENCY_KEY_REUSED');
    const noCsrf = await api(PATH, {
      method: 'POST',
      headers: {
        Cookie: parent.cookie,
        'Content-Type': 'application/json',
        'Idempotency-Key': key(),
      },
      body: JSON.stringify(VALID),
    });
    expect(noCsrf.status).toBe(403);
    const count = await env.DB.prepare(
      'SELECT count(*) AS n FROM parent_requests WHERE parent_user_id = ?',
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('edits with version CAS; stale and non-owner writes leave private data/windows/audit intact', async () => {
    const parent = await register('parent');
    const other = await register('parent');
    const created = await data(await create(parent));
    const edit = {
      ...VALID,
      version: created.version,
      grade: 'Lớp 11',
      contactPhone: '+84987654321',
      contactAddress: 'Số 20, đường thử nghiệm',
      schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
    };
    expect((await api(`${PATH}/${created.id}`, jsonInit('PATCH', edit, other))).status).toBe(404);
    const updatedRes = await api(`${PATH}/${created.id}`, jsonInit('PATCH', edit, parent));
    expect(updatedRes.status).toBe(200);
    expect(await data(updatedRes)).toMatchObject({
      version: 2,
      grade: 'Lớp 11',
      contactPhone: '+84987654321',
      contactAddress: 'Số 20, đường thử nghiệm',
      schedule: edit.schedule,
    });
    const staleRes = await api(`${PATH}/${created.id}`, jsonInit('PATCH', edit, parent));
    expect(staleRes.status).toBe(409);
    expect(await errorCode(staleRes)).toBe('STALE_REQUEST');
    const after = await data(
      await api(`${PATH}/${created.id}`, { headers: { Cookie: parent.cookie } }),
    );
    expect(after.contactPhone).toBe('+84987654321');
    expect(after.contactAddress).toBe('Số 20, đường thử nghiệm');
    expect(after.schedule.windows).toEqual([]);
    const audits = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE target_type = 'parent_request' AND target_id = ? AND action = 'parent_request.updated'",
    )
      .bind(created.id)
      .all<{ metadata: string }>();
    expect(audits.results).toHaveLength(1);
    expect(audits.results[0]?.metadata).not.toContain('+84987654321');
    expect(audits.results[0]?.metadata).not.toContain('Số 20');
  });

  it('lets only one concurrent edit win and writes exactly one private snapshot and audit', async () => {
    const parent = await register('parent');
    const draft = await data(await create(parent));
    const [a, b] = await Promise.all([
      api(
        `${PATH}/${draft.id}`,
        jsonInit('PATCH', { ...VALID, version: 1, contactPhone: '0911111111' }, parent),
      ),
      api(
        `${PATH}/${draft.id}`,
        jsonInit('PATCH', { ...VALID, version: 1, contactPhone: '0922222222' }, parent),
      ),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = await data(a.status === 200 ? a : b);
    const after = await data(
      await api(`${PATH}/${draft.id}`, { headers: { Cookie: parent.cookie } }),
    );
    expect(after.contactPhone).toBe(winner.contactPhone);
    expect(after.version).toBe(2);
    const audits = await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_logs WHERE target_type = 'parent_request' AND target_id = ? AND action = 'parent_request.updated'",
    )
      .bind(draft.id)
      .first<{ n: number }>();
    expect(audits?.n).toBe(1);
  });

  it('publishes a safe public class with the request and consent in one confirmation', async () => {
    const parent = await register('parent');
    const other = await register('parent');
    const tutor = await register('tutor');
    const draft = await data(await create(parent));
    const otherSubmit = await api(
      `${PATH}/${draft.id}/submit`,
      jsonInit('POST', { version: 1, consentToShareContact: true }, other),
    );
    expect(otherSubmit.status).toBe(404);
    for (const body of [{ version: 1 }, { version: 1, consentToShareContact: false }]) {
      const invalid = await api(`${PATH}/${draft.id}/submit`, jsonInit('POST', body, parent));
      expect(invalid.status).toBe(422);
    }
    const submittedRes = await api(
      `${PATH}/${draft.id}/submit`,
      jsonInit('POST', { version: 1, consentToShareContact: true }, parent),
    );
    expect(submittedRes.status).toBe(200);
    const submitted = await data(submittedRes);
    expect(submitted).toMatchObject({
      status: 'sourcing',
      version: 3,
      publishedClassId: expect.any(String),
      publishedClassCode: expect.stringMatching(/^LH-[A-F0-9]{12}$/),
      contactPhone: VALID.contactPhone,
      contactAddress: VALID.contactAddress,
      contactConsentVersion: CONTACT_SHARING_CONSENT_VERSION,
      contactConsentAt: expect.any(String),
    });
    expect(Date.parse(submitted.contactConsentAt!)).not.toBeNaN();
    const publicResponse = await api(`/classes/${submitted.publishedClassId}`);
    expect(publicResponse.status).toBe(200);
    const publicClass = (await publicResponse.json<ApiSuccess<Record<string, unknown>>>()).data;
    expect(publicClass).toMatchObject({
      id: submitted.publishedClassId,
      code: submitted.publishedClassCode,
      status: 'open',
      publicArea: null,
      expectedBudgetMinor: VALID.expectedBudgetMinor,
    });
    for (const privateValue of [VALID.contactPhone, VALID.contactAddress, VALID.description]) {
      expect(JSON.stringify(publicClass)).not.toContain(privateValue);
    }
    const listed = await api('/classes?subjectId=subj_math');
    const listPage = (await listed.json<ApiSuccess<Page<{ id: string }>>>()).data;
    expect(listPage.items.some((item) => item.id === submitted.publishedClassId)).toBe(true);
    const staleSubmit = await api(
      `${PATH}/${draft.id}/submit`,
      jsonInit('POST', { version: 1, consentToShareContact: true }, parent),
    );
    expect(staleSubmit.status).toBe(409);
    const removeContact = await api(
      `${PATH}/${draft.id}`,
      jsonInit('PATCH', { ...VALID, version: submitted.version, contactPhone: null }, parent),
    );
    expect(removeContact.status).toBe(409);
    expect((await api(`${PATH}/${draft.id}`, { headers: { Cookie: tutor.cookie } })).status).toBe(
      403,
    );
    const audit = await env.DB.prepare(
      "SELECT actor_id, metadata, created_at FROM audit_logs WHERE target_type = 'parent_request' AND target_id = ? AND action = 'parent_request.submitted'",
    )
      .bind(draft.id)
      .first<{ actor_id: string; metadata: string; created_at: string }>();
    expect(audit?.actor_id).toBe(parent.userId);
    expect(JSON.parse(audit!.metadata)).toMatchObject({
      contactConsentVersion: CONTACT_SHARING_CONSENT_VERSION,
    });
    expect(audit?.created_at).toBe(submitted.contactConsentAt);
    expect(audit?.metadata).not.toContain(VALID.contactPhone);
    expect(audit?.metadata).not.toContain(VALID.contactAddress);
    const classRow = await env.DB.prepare(
      'SELECT source_request_id, source_request_version, parent_user_id, public_area, status FROM class_listings WHERE id = ?',
    )
      .bind(submitted.publishedClassId)
      .first<{
        source_request_id: string;
        source_request_version: number;
        parent_user_id: string;
        public_area: string | null;
        status: string;
      }>();
    expect(classRow).toMatchObject({
      source_request_id: draft.id,
      source_request_version: 2,
      parent_user_id: parent.userId,
      public_area: null,
      status: 'open',
    });
  });

  it('requires a contact number before submit and keeps consent unset on failure', async () => {
    const parent = await register('parent');
    const draft = await data(
      await create(parent, { ...VALID, contactPhone: null, contactAddress: null }),
    );
    const response = await api(
      `${PATH}/${draft.id}/submit`,
      jsonInit('POST', { version: draft.version, consentToShareContact: true }, parent),
    );
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe('CONTACT_REQUIRED');
    const after = await data(
      await api(`${PATH}/${draft.id}`, { headers: { Cookie: parent.cookie } }),
    );
    expect(after.status).toBe('draft');
    expect(after.contactConsentAt).toBeNull();
    expect(after.contactAddress).toBeNull();
    const unpublished = await env.DB.prepare(
      'SELECT count(*) AS n FROM class_listings WHERE source_request_id = ?',
    )
      .bind(draft.id)
      .first<{ n: number }>();
    expect(unpublished?.n).toBe(0);
    const filled = await data(
      await api(
        `${PATH}/${draft.id}`,
        jsonInit('PATCH', { ...VALID, contactAddress: null, version: 1 }, parent),
      ),
    );
    const submitted = await data(
      await api(
        `${PATH}/${draft.id}/submit`,
        jsonInit('POST', { version: filled.version, consentToShareContact: true }, parent),
      ),
    );
    expect(submitted.status).toBe('sourcing');
    expect(submitted.contactAddress).toBeNull();
  });

  it('keeps one published class and one sourcing request under concurrent confirmation', async () => {
    const parent = await register('parent');
    const draft = await data(await create(parent));
    const body = { version: draft.version, consentToShareContact: true };
    const responses = await Promise.all([
      api(`${PATH}/${draft.id}/submit`, jsonInit('POST', body, parent)),
      api(`${PATH}/${draft.id}/submit`, jsonInit('POST', body, parent)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const row = await env.DB.prepare(
      `SELECT r.status AS request_status, r.version AS request_version,
       count(c.id) AS class_count, min(c.status) AS class_status
       FROM parent_requests r LEFT JOIN class_listings c ON c.source_request_id = r.id
       WHERE r.id = ? GROUP BY r.id`,
    )
      .bind(draft.id)
      .first<{
        request_status: string;
        request_version: number;
        class_count: number;
        class_status: string;
      }>();
    expect(row).toMatchObject({
      request_status: 'sourcing',
      request_version: draft.version + 2,
      class_count: 1,
      class_status: 'open',
    });
    const audits = await env.DB.prepare(
      `SELECT action, count(*) AS n FROM audit_logs
       WHERE target_id = ? AND action IN ('parent_request.submitted', 'parent_request.sourcing')
       GROUP BY action`,
    )
      .bind(draft.id)
      .all<{ action: string; n: number }>();
    expect(audits.results).toEqual(
      expect.arrayContaining([
        { action: 'parent_request.submitted', n: 1 },
        { action: 'parent_request.sourcing', n: 1 },
      ]),
    );
  });

  it('never leaves an open class when confirmation races a draft edit', async () => {
    const parent = await register('parent');
    const draft = await data(await create(parent));
    const [submit, edit] = await Promise.all([
      api(
        `${PATH}/${draft.id}/submit`,
        jsonInit('POST', { version: draft.version, consentToShareContact: true }, parent),
      ),
      api(
        `${PATH}/${draft.id}`,
        jsonInit('PATCH', { ...VALID, version: draft.version, grade: 'Lớp 11' }, parent),
      ),
    ]);
    expect([submit.status, edit.status].sort()).toEqual([200, 409]);
    const state = await env.DB.prepare(
      `SELECT r.status, r.version, count(c.id) AS class_count,
       min(c.status) AS class_status
       FROM parent_requests r LEFT JOIN class_listings c ON c.source_request_id = r.id
       WHERE r.id = ? GROUP BY r.id`,
    )
      .bind(draft.id)
      .first<{
        status: string;
        version: number;
        class_count: number;
        class_status: string | null;
      }>();
    expect(state).toMatchObject(
      submit.status === 200
        ? { status: 'sourcing', version: 3, class_count: 1, class_status: 'open' }
        : { status: 'draft', version: 2, class_count: 0, class_status: null },
    );
  });

  it('enforces the open-request quota atomically in D1', async () => {
    const parent = await register('parent');
    for (let i = 0; i < 20; i++) {
      const response = await create(parent, { ...VALID, description: `Request ${i}` });
      expect(response.status).toBe(201);
    }
    const rejected = await create(parent, { ...VALID, description: 'Request overflow' });
    expect(rejected.status).toBe(409);
    expect(await errorCode(rejected)).toBe('REQUEST_QUOTA_EXCEEDED');
    const count = await env.DB.prepare(
      'SELECT count(*) AS n FROM parent_requests WHERE parent_user_id = ?',
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    expect(count?.n).toBe(20);
  });

  it('stores Figma request details, derives the stage and keeps the student name private', async () => {
    const parent = await register('parent');
    const draft = await data(
      await create(parent, {
        ...VALID,
        grade: 'Lớp 8',
        sessionsPerWeek: 3,
        tutorRequirements: 'Gia sư nữ, có kinh nghiệm luyện thi.',
        studentTraits: 'Cần phương pháp giảng dạy sáng tạo.',
      }),
    );
    expect(draft).toMatchObject({
      studentName: VALID.studentName,
      educationLevel: 'lower_secondary',
      sessionsPerWeek: 3,
      tutorRequirements: 'Gia sư nữ, có kinh nghiệm luyện thi.',
      studentTraits: 'Cần phương pháp giảng dạy sáng tạo.',
    });
    const privateRow = await env.DB.prepare(
      'SELECT student_name FROM parent_request_private WHERE request_id = ?',
    )
      .bind(draft.id)
      .first<{ student_name: string }>();
    expect(privateRow?.student_name).toBe(VALID.studentName);

    for (const invalid of [
      { ...VALID, educationLevel: 'primary' },
      { ...VALID, sessionsPerWeek: 0 },
      { ...VALID, sessionsPerWeek: 15 },
      { ...VALID, tutorRequirements: 'x'.repeat(501) },
      { ...VALID, studentName: 'x'.repeat(101) },
    ]) {
      const response = await create(parent, invalid);
      expect(response.status).toBe(422);
    }

    const submitted = await data(
      await api(
        `${PATH}/${draft.id}/submit`,
        jsonInit('POST', { version: draft.version, consentToShareContact: true }, parent),
      ),
    );
    expect(submitted.status).toBe('sourcing');
    const publicClass = await api(`/classes/${submitted.publishedClassId}`);
    expect(publicClass.status).toBe(200);
    expect(JSON.stringify(await publicClass.json())).not.toContain(VALID.studentName);
  });

  it('requires the student name before submit', async () => {
    const parent = await register('parent');
    const draft = await data(await create(parent, { ...VALID, studentName: null }));
    const response = await api(
      `${PATH}/${draft.id}/submit`,
      jsonInit('POST', { version: draft.version, consentToShareContact: true }, parent),
    );
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe('STUDENT_NAME_REQUIRED');
    const after = await data(
      await api(`${PATH}/${draft.id}`, { headers: { Cookie: parent.cookie } }),
    );
    expect(after.status).toBe('draft');
    expect(after.contactConsentAt).toBeNull();
  });

  it('filters the owner list by status group, keyword, subject, mode and local date', async () => {
    const parent = await register('parent');
    const other = await register('parent');
    const math = await data(await create(parent, { ...VALID, studentName: 'Phạm Văn Bình' }));
    await create(parent, {
      ...VALID,
      subjectId: 'subj_english',
      mode: 'online',
      area: null,
      studentName: 'Trần Đức Anh',
    });
    await create(other, { ...VALID, studentName: 'Phạm Văn Bình' });
    await api(
      `${PATH}/${math.id}/submit`,
      jsonInit('POST', { version: math.version, consentToShareContact: true }, parent),
    );

    async function list(query: string) {
      const response = await api(`${PATH}?${query}`, { headers: { Cookie: parent.cookie } });
      expect(response.status).toBe(200);
      return (await response.json<ApiSuccess<Page<ParentRequestSummary>>>()).data;
    }
    expect((await list('group=searching')).items.map((item) => item.id)).toEqual([math.id]);
    expect((await list('group=other')).total).toBe(1);
    expect((await list('group=found')).total).toBe(0);
    expect((await list(`q=${encodeURIComponent('Văn Bình')}`)).items.map((i) => i.id)).toEqual([
      math.id,
    ]);
    expect((await list(`q=${encodeURIComponent(math.code)}`)).total).toBe(1);
    expect((await list('q=%25')).total).toBe(0);
    expect((await list('subjectId=subj_english')).total).toBe(1);
    expect((await list('mode=online')).total).toBe(1);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(),
    );
    expect((await list(`from=${today}&to=${today}`)).total).toBe(2);
    expect((await list('to=2020-01-01')).total).toBe(0);
    const invalid = await api(`${PATH}?group=unknown`, { headers: { Cookie: parent.cookie } });
    expect(invalid.status).toBe(422);
  });

  it('accepts only current Hà Nội phường/xã, keeps a legacy area on edit and allows online without one', async () => {
    const parent = await register('parent');
    for (const area of ['Cầu Giấy, Hà Nội', 'Phường Cầu Giấy', 'Quận 1, TP.HCM']) {
      const response = await create(parent, { ...VALID, area });
      expect(response.status).toBe(422);
    }
    const online = await create(parent, { ...VALID, mode: 'online', area: null });
    expect(online.status).toBe(201);
    expect((await create(parent, { ...VALID, mode: 'offline', area: null })).status).toBe(422);

    const draft = await data(await create(parent, VALID));
    await env.DB.prepare("UPDATE parent_requests SET area = 'Cầu Giấy, Hà Nội' WHERE id = ?")
      .bind(draft.id)
      .run();
    const kept = await api(
      `${PATH}/${draft.id}`,
      jsonInit('PATCH', { ...VALID, area: 'Cầu Giấy, Hà Nội', version: draft.version }, parent),
    );
    expect(kept.status).toBe(200);
    const keptBody = await data(kept);
    const changed = await api(
      `${PATH}/${draft.id}`,
      jsonInit(
        'PATCH',
        { ...VALID, area: 'Thanh Xuân, Hà Nội', version: keptBody.version },
        parent,
      ),
    );
    expect(changed.status).toBe(422);
    expect(await errorCode(changed)).toBe('VALIDATION_ERROR');
  });

  it('stores more than 14 weekly windows and records the notice consent version', async () => {
    const parent = await register('parent');
    const windows = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) =>
      ['09:00', '10:30', '13:30'].map((startLocal, index) => ({
        weekday,
        startLocal,
        endLocal: ['10:30', '12:00', '15:00'][index]!,
      })),
    );
    const response = await create(parent, {
      ...VALID,
      schedule: { ...VALID.schedule, windows },
    });
    expect(response.status).toBe(201);
    const draft = await data(response);
    expect(draft.schedule.windows).toHaveLength(21);
    const submitted = await data(
      await api(
        `${PATH}/${draft.id}/submit`,
        jsonInit('POST', { version: draft.version, consentToShareContact: true }, parent),
      ),
    );
    expect(submitted.contactConsentVersion).toBe(CONTACT_SHARING_CONSENT_VERSION);
    expect(CONTACT_SHARING_CONSENT_VERSION).toBe('2026-10-12-v2');
  });
});

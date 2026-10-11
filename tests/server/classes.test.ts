import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type {
  AdminClass,
  ClassRecommendation,
  FeeOptionVersion,
  PublicClass,
  TutorApplication,
} from '../../src/shared/schemas/classes';
import type { Page } from '../../src/shared/schemas/discovery';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import { createDb } from '../../src/server/db/client';
import { insertApplication } from '../../src/server/modules/classes/repository';
import { api, createPublicTutor, jsonInit, register, type Session } from './helpers';
import { markLegacySubmittedRequest } from './legacy-request-fixture';
import { passAndAcknowledgeTutorTerms, publishTutorTermsQuiz } from './terms-fixture';

const REQUEST = {
  subjectId: 'subj_math',
  grade: 'Lớp 10',
  mode: 'online',
  area: null,
  expectedBudgetMinor: 180_000,
  description: 'Liên hệ riêng: 0912345678, học sinh có thông tin riêng.',
  schedule: {
    timezone: 'Asia/Ho_Chi_Minh',
    discussLater: false,
    windows: [{ weekday: 2, startLocal: '18:00', endLocal: '19:30' }],
  },
  contactPhone: '0912345678',
  contactAddress: 'Số 41 đường riêng',
} as const;
const FEE = {
  optionKey: 'first_lesson_percent',
  title: 'Theo buổi đầu tiên',
  policyText: 'Gia sư chọn phương án phí theo phần trăm học phí buổi đầu tiên.',
  rateBasisPoints: 5000,
  depositBasisPoints: null,
  scopeSubjectId: null,
  scopeMode: null,
  effectiveFrom: null,
  effectiveTo: null,
} as const;

async function moderator() {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

async function createSubmittedRequest(
  parent: Session,
  overrides: Record<string, unknown> = {},
): Promise<OwnParentRequest> {
  const created = await api(
    '/parent/requests',
    jsonInit('POST', { ...REQUEST, ...overrides }, parent, {
      'Idempotency-Key': `class-request-${crypto.randomUUID()}`,
    }),
  );
  expect(created.status).toBe(201);
  const draft = (await created.json<ApiSuccess<OwnParentRequest>>()).data;
  return markLegacySubmittedRequest(parent, draft);
}

async function createClass(
  admin: Session,
  request: OwnParentRequest,
  publicArea: string | null = 'Cầu Giấy, Hà Nội',
) {
  return api(
    '/admin/classes',
    jsonInit(
      'POST',
      { sourceRequestId: request.id, requestVersion: request.version, publicArea },
      admin,
    ),
  );
}

async function publishClass(admin: Session, cls: AdminClass): Promise<AdminClass> {
  const response = await api(
    `/admin/classes/${cls.id}/publish`,
    jsonInit('POST', { version: cls.version }, admin),
  );
  expect(response.status).toBe(200);
  return (await response.json<ApiSuccess<AdminClass>>()).data;
}

async function createPublishedFee(
  admin: Session,
  overrides: Record<string, unknown> = {},
): Promise<FeeOptionVersion> {
  const created = await api(
    '/admin/fee-options',
    jsonInit('POST', { ...FEE, ...overrides }, admin),
  );
  expect(created.status).toBe(201);
  const draft = (await created.json<ApiSuccess<FeeOptionVersion>>()).data;
  const published = await api(
    `/admin/fee-options/${draft.id}/publish`,
    jsonInit('POST', { version: draft.version }, admin),
  );
  expect(published.status).toBe(200);
  return (await published.json<ApiSuccess<FeeOptionVersion>>()).data;
}

async function setupOpenClass() {
  const parent = await register('parent');
  const admin = await moderator();
  const request = await createSubmittedRequest(parent);
  const created = await createClass(admin, request);
  expect(created.status).toBe(201);
  const draft = (await created.json<ApiSuccess<AdminClass>>()).data;
  const cls = await publishClass(admin, draft);
  return { parent, admin, request, cls };
}

describe('published classes and tutor applications', () => {
  it('preserves moderator publication for legacy submitted requests', async () => {
    const parent = await register('parent');
    const admin = await moderator();
    const tutor = await register('tutor');
    const created = await api(
      '/parent/requests',
      jsonInit('POST', REQUEST, parent, { 'Idempotency-Key': `draft-${crypto.randomUUID()}` }),
    );
    const draftRequest = (await created.json<ApiSuccess<OwnParentRequest>>()).data;
    expect((await createClass(admin, draftRequest)).status).toBe(409);
    expect((await createClass(parent, draftRequest)).status).toBe(403);
    expect((await createClass(tutor, draftRequest)).status).toBe(403);
    expect((await createClass(admin, { ...draftRequest, id: crypto.randomUUID() })).status).toBe(
      404,
    );
    const submitted = await markLegacySubmittedRequest(parent, draftRequest);
    const classResponse = await createClass(admin, submitted);
    expect(classResponse.status).toBe(201);
    const cls = (await classResponse.json<ApiSuccess<AdminClass>>()).data;
    expect(cls).toMatchObject({
      status: 'draft',
      version: 1,
      subjectId: REQUEST.subjectId,
      sourceRequestId: submitted.id,
      publicArea: 'Cầu Giấy, Hà Nội',
      expectedBudgetMinor: REQUEST.expectedBudgetMinor,
    });
    const storedTuition = await env.DB.prepare(
      'SELECT expected_budget_minor AS amount FROM class_listings WHERE id = ?',
    )
      .bind(cls.id)
      .first<{ amount: number }>();
    expect(storedTuition?.amount).toBe(REQUEST.expectedBudgetMinor);
    expect((await createClass(admin, submitted)).status).toBe(409);
    expect((await api(`/classes/${cls.id}`)).status).toBe(404);
    expect(
      (await api(`/admin/classes/${cls.id}/publish`, jsonInit('POST', { version: 99 }, admin)))
        .status,
    ).toBe(409);
    const published = await publishClass(admin, cls);
    expect(published).toMatchObject({ status: 'open', version: 2 });
    expect(
      (await api(`/admin/classes/${cls.id}/publish`, jsonInit('POST', { version: 1 }, admin)))
        .status,
    ).toBe(409);
    const requestAfter = await api(`/parent/requests/${submitted.id}`, {
      headers: { Cookie: parent.cookie },
    });
    expect((await requestAfter.json<ApiSuccess<OwnParentRequest>>()).data).toMatchObject({
      status: 'sourcing',
      version: submitted.version + 1,
    });
    const audits = await env.DB.prepare(
      "SELECT action FROM audit_logs WHERE target_type = 'class_listing' AND target_id = ? ORDER BY created_at",
    )
      .bind(cls.id)
      .all<{ action: string }>();
    expect(audits.results.map((row) => row.action)).toEqual(['class.created', 'class.published']);
  });

  it('refreshes a draft after a parent edit with moderator-reviewed broad area', async () => {
    const parent = await register('parent');
    const admin = await moderator();
    const request = await createSubmittedRequest(parent);
    const draftResponse = await createClass(admin, request);
    const draft = (await draftResponse.json<ApiSuccess<AdminClass>>()).data;
    const editedResponse = await api(
      `/parent/requests/${request.id}`,
      jsonInit(
        'PATCH',
        {
          ...REQUEST,
          version: request.version,
          grade: 'Lớp 11',
          contactPhone: '0987654321',
          contactAddress: 'Số 99 đường riêng',
        },
        parent,
      ),
    );
    expect(editedResponse.status).toBe(200);
    const edited = (await editedResponse.json<ApiSuccess<OwnParentRequest>>()).data;
    const stalePublish = await api(
      `/admin/classes/${draft.id}/publish`,
      jsonInit('POST', { version: draft.version }, admin),
    );
    expect(stalePublish.status).toBe(409);
    const staleRefresh = await api(
      `/admin/classes/${draft.id}/refresh`,
      jsonInit(
        'POST',
        {
          version: draft.version,
          requestVersion: request.version,
          publicArea: 'Thanh Xuân, Hà Nội',
        },
        admin,
      ),
    );
    expect(staleRefresh.status).toBe(409);
    const refreshedResponse = await api(
      `/admin/classes/${draft.id}/refresh`,
      jsonInit(
        'POST',
        {
          version: draft.version,
          requestVersion: edited.version,
          publicArea: 'Thanh Xuân, Hà Nội',
        },
        admin,
      ),
    );
    expect(refreshedResponse.status).toBe(200);
    const refreshed = (await refreshedResponse.json<ApiSuccess<AdminClass>>()).data;
    expect(refreshed).toMatchObject({
      version: draft.version + 1,
      sourceRequestVersion: edited.version,
      grade: 'Lớp 11',
      publicArea: 'Thanh Xuân, Hà Nội',
    });
    expect(JSON.stringify(refreshed)).not.toContain('0987654321');
    const published = await publishClass(admin, refreshed);
    expect(published.status).toBe('open');
    const publicResponse = await api(`/classes/${draft.id}`);
    const publicClass = (await publicResponse.json<ApiSuccess<PublicClass>>()).data;
    expect(JSON.stringify(publicClass)).not.toContain('Số 99 đường riêng');
  });

  it('exposes only approved broad class data, supports deterministic filters and hides drafts', async () => {
    const { cls, request, admin, parent } = await setupOpenClass();
    const response = await api(`/classes/${cls.id}`);
    expect(response.status).toBe(200);
    const publicClass = (await response.json<ApiSuccess<PublicClass>>()).data;
    expect(publicClass).toMatchObject({
      id: cls.id,
      code: expect.stringMatching(/^LH-[A-F0-9]{12}$/),
      subjectName: expect.any(String),
      expectedBudgetMinor: REQUEST.expectedBudgetMinor,
      schedule: REQUEST.schedule,
    });
    const serialized = JSON.stringify(publicClass);
    for (const hidden of [
      REQUEST.contactPhone,
      REQUEST.contactAddress,
      REQUEST.description,
      parent.userId,
      request.id,
    ])
      expect(serialized).not.toContain(hidden);
    const listing = await api(
      '/classes?subjectId=subj_math&grade=L%E1%BB%9Bp%2010&mode=online&area=C%E1%BA%A7u&sort=newest',
    );
    expect(listing.status).toBe(200);
    const page = (await listing.json<ApiSuccess<Page<PublicClass>>>()).data;
    expect(page.items.some((item) => item.id === cls.id)).toBe(true);
    expect((await api('/classes?pageSize=49')).status).toBe(422);
    expect((await api('/classes?sort=random')).status).toBe(422);
    const other = await register('parent');
    const secondRequest = await createSubmittedRequest(other);
    const draftResponse = await createClass(admin, secondRequest, null);
    const draft = (await draftResponse.json<ApiSuccess<AdminClass>>()).data;
    expect((await api(`/classes/${draft.id}`)).status).toBe(404);
    const search = await api(`/classes?subjectId=${draft.subjectId}`);
    const visible = (await search.json<ApiSuccess<Page<PublicClass>>>()).data.items;
    expect(visible.some((item) => item.id === draft.id)).toBe(false);
  });

  it('requires a published, effective option; preserves immutable versions and validates parameters', async () => {
    const { admin, cls } = await setupOpenClass();
    const tutor = await createPublicTutor();
    const applicationPath = `/classes/${cls.id}/applications`;
    const body = { feeOptionVersionId: crypto.randomUUID(), classVersion: cls.version };
    const apply = (session: Session, payload: unknown = body) =>
      api(
        applicationPath,
        jsonInit('POST', payload, session, { 'Idempotency-Key': `apply-${crypto.randomUUID()}` }),
      );
    expect((await apply(tutor)).status).toBe(409);
    expect((await apply(await register('parent'))).status).toBe(403);
    expect((await apply(await register('tutor'))).status).toBe(403);
    for (const bad of [
      { ...FEE, optionKey: 'unapproved' },
      { ...FEE, rateBasisPoints: 10_001 },
      { ...FEE, depositBasisPoints: 5000 },
      { ...FEE, optionKey: 'lesson_multiplier_with_deposit', depositBasisPoints: null },
    ]) {
      expect((await api('/admin/fee-options', jsonInit('POST', bad, admin))).status).toBe(422);
    }
    const fee = await createPublishedFee(admin);
    expect(fee).toMatchObject({
      optionKey: 'first_lesson_percent',
      rateBasisPoints: 5000,
      version: 1,
      status: 'published',
    });
    const options = await api(`/tutor/fee-options?classId=${cls.id}`, {
      headers: { Cookie: tutor.cookie },
    });
    expect(options.status).toBe(200);
    expect((await options.json<ApiSuccess<FeeOptionVersion[]>>()).data).toEqual(
      expect.arrayContaining([fee]),
    );
    expect(
      (
        await api(
          `/admin/fee-options/${fee.id}/publish`,
          jsonInit('POST', { version: fee.version }, admin),
        )
      ).status,
    ).toBe(409);
    await expect(
      env.DB.prepare('UPDATE fee_option_versions SET rate_basis_points = 9999 WHERE id = ?')
        .bind(fee.id)
        .run(),
    ).rejects.toThrow();
    const second = await createPublishedFee(admin, {
      optionKey: 'lesson_multiplier_with_deposit',
      rateBasisPoints: 30_000,
      depositBasisPoints: 5000,
    });
    expect(second.version).toBe(1);
    const third = await createPublishedFee(admin, {
      optionKey: 'monthly_percent',
      rateBasisPoints: 4000,
    });
    expect(third.version).toBe(1);
    const successor = await createPublishedFee(admin, { rateBasisPoints: 6000 });
    expect(successor.version).toBe(2);
    const currentResponse = await api(`/tutor/fee-options?classId=${cls.id}`, {
      headers: { Cookie: tutor.cookie },
    });
    const current = (await currentResponse.json<ApiSuccess<FeeOptionVersion[]>>()).data;
    expect(current).toHaveLength(3);
    expect(current.find((option) => option.optionKey === 'first_lesson_percent')?.id).toBe(
      successor.id,
    );
    expect(
      (await apply(tutor, { feeOptionVersionId: fee.id, classVersion: cls.version })).status,
    ).toBe(409);
    await publishTutorTermsQuiz(admin);
    await passAndAcknowledgeTutorTerms(tutor);
    await expect(
      env.DB.prepare(
        `INSERT INTO tutor_applications
       (id, class_id, tutor_user_id, fee_option_version_id, status, version,
        mutation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'submitted', 1, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          cls.id,
          tutor.userId,
          fee.id,
          crypto.randomUUID(),
          new Date().toISOString(),
          new Date().toISOString(),
        )
        .run(),
    ).rejects.toThrow(/APPLICATION_NOT_ELIGIBLE/);
  });

  it('applies idempotently, rejects duplicate/race and withdraws with ownership/version CAS', async () => {
    const { admin, cls } = await setupOpenClass();
    const tutor = await createPublicTutor();
    const other = await createPublicTutor();
    const fee = await createPublishedFee(admin);
    await createPublishedFee(admin, {
      optionKey: 'lesson_multiplier_with_deposit',
      rateBasisPoints: 30_000,
      depositBasisPoints: 5000,
    });
    await createPublishedFee(admin, { optionKey: 'monthly_percent', rateBasisPoints: 4000 });
    const body = { feeOptionVersionId: fee.id, classVersion: cls.version };
    const path = `/classes/${cls.id}/applications`;
    const key = `apply-${crypto.randomUUID()}`;
    expect(
      (await api(path, jsonInit('POST', body, tutor, { 'Idempotency-Key': crypto.randomUUID() })))
        .status,
    ).toBe(409);
    await publishTutorTermsQuiz(admin);
    expect(
      (await api(path, jsonInit('POST', body, tutor, { 'Idempotency-Key': crypto.randomUUID() })))
        .status,
    ).toBe(409);
    await passAndAcknowledgeTutorTerms(tutor);
    await passAndAcknowledgeTutorTerms(other);
    const first = await api(path, jsonInit('POST', body, tutor, { 'Idempotency-Key': key }));
    expect(first.status).toBe(201);
    const application = (await first.json<ApiSuccess<TutorApplication>>()).data;
    expect(application).toMatchObject({
      status: 'submitted',
      version: 1,
      classId: cls.id,
      feeOptionVersionId: fee.id,
    });
    const replay = await api(path, jsonInit('POST', body, tutor, { 'Idempotency-Key': key }));
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    expect((await replay.json<ApiSuccess<TutorApplication>>()).data.id).toBe(application.id);
    expect(
      (
        await api(
          path,
          jsonInit('POST', body, tutor, { 'Idempotency-Key': `apply-${crypto.randomUUID()}` }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await api(
          path,
          jsonInit('POST', { ...body, classVersion: 1 }, other, {
            'Idempotency-Key': `apply-${crypto.randomUUID()}`,
          }),
        )
      ).status,
    ).toBe(409);
    const concurrent = await Promise.all(
      [0, 1].map(() =>
        api(
          path,
          jsonInit('POST', body, other, { 'Idempotency-Key': `race-${crypto.randomUUID()}` }),
        ),
      ),
    );
    expect(concurrent.map((res) => res.status).sort()).toEqual([201, 409]);
    const before = await api('/tutor/applications', { headers: { Cookie: tutor.cookie } });
    expect((await before.json<ApiSuccess<Page<TutorApplication>>>()).data.items).toEqual(
      expect.arrayContaining([application]),
    );
    expect(
      (await api(`/tutor/applications/${application.id}`, { headers: { Cookie: other.cookie } }))
        .status,
    ).toBe(404);
    expect(
      (
        await api(
          `/tutor/applications/${application.id}/withdraw`,
          jsonInit('POST', { version: 1 }, other),
        )
      ).status,
    ).toBe(404);
    const withdrawn = await api(
      `/tutor/applications/${application.id}/withdraw`,
      jsonInit('POST', { version: 1 }, tutor),
    );
    expect(withdrawn.status).toBe(200);
    expect((await withdrawn.json<ApiSuccess<TutorApplication>>()).data).toMatchObject({
      status: 'withdrawn',
      version: 2,
    });
    expect(
      (
        await api(
          `/tutor/applications/${application.id}/withdraw`,
          jsonInit('POST', { version: 1 }, tutor),
        )
      ).status,
    ).toBe(409);
    const audits = await env.DB.prepare(
      "SELECT action FROM audit_logs WHERE target_type = 'tutor_application' AND target_id = ?",
    )
      .bind(application.id)
      .all<{ action: string }>();
    expect(audits.results.map((row) => row.action).sort()).toEqual([
      'application.submitted',
      'application.withdrawn',
    ]);
  });

  it('ranks all eligible classes before pagination and requires explicit per-class adjustments', async () => {
    const admin = await moderator();
    const firstParent = await register('parent');
    const firstRequest = await createSubmittedRequest(firstParent, { subjectId: 'subj_geography' });
    const firstDraft = (
      await (await createClass(admin, firstRequest)).json<ApiSuccess<AdminClass>>()
    ).data;
    const high = await publishClass(admin, firstDraft);
    const secondParent = await register('parent');
    const secondRequest = await createSubmittedRequest(secondParent, {
      subjectId: 'subj_geography',
      grade: 'Lớp 11',
    });
    const secondDraft = (
      await (await createClass(admin, secondRequest)).json<ApiSuccess<AdminClass>>()
    ).data;
    const lower = await publishClass(admin, secondDraft);
    const tutor = await createPublicTutor({
      subjectIds: ['subj_geography'],
      preferredGrades: ['Lớp 10'],
    });
    const list = await api('/tutor/classes/recommendations?subjectId=subj_geography&pageSize=1', {
      headers: { Cookie: tutor.cookie },
    });
    expect(list.status).toBe(200);
    const firstPage = (await list.json<ApiSuccess<Page<ClassRecommendation>>>()).data;
    expect(firstPage.items[0]?.class.id).toBe(high.id);
    expect(firstPage.total).toBe(2);
    expect(firstPage.items[0]?.match).toMatchObject({
      score: 92,
      coverage: 85,
      level: 'strong',
      adjustments: [],
    });
    expect(
      (
        await api('/tutor/classes/recommendations?sort=oldest', {
          headers: { Cookie: tutor.cookie },
        })
      ).status,
    ).toBe(422);
    const secondPage = await api(
      '/tutor/classes/recommendations?subjectId=subj_geography&pageSize=1&page=2',
      {
        headers: { Cookie: tutor.cookie },
      },
    );
    const near = (await secondPage.json<ApiSuccess<Page<ClassRecommendation>>>()).data.items[0]!;
    expect(near.class.id).toBe(lower.id);
    expect(near.match).toMatchObject({
      algorithmVersion: '2026-10-12-v1',
      score: 72,
      coverage: 85,
      level: 'near',
      adjustments: ['grade'],
      profileChangesPreview: {
        preferredGrade: 'Lớp 11',
        preferredArea: null,
        negotiableTime: false,
      },
    });
    expect(near.match.criteria.find((item) => item.key === 'budget')).toMatchObject({
      score: 0,
      maxScore: 0,
      status: 'unknown',
    });
    expect(JSON.stringify(near)).not.toContain(REQUEST.contactPhone);
    expect(JSON.stringify(near)).not.toContain(REQUEST.contactAddress);
    expect((await api('/tutor/classes/recommendations')).status).toBe(401);
    expect(
      (await api('/tutor/classes/recommendations', { headers: { Cookie: secondParent.cookie } }))
        .status,
    ).toBe(403);
    expect(
      (
        await api(`/tutor/classes/${lower.id}/recommendation`, {
          headers: { Cookie: tutor.cookie },
        })
      ).status,
    ).toBe(200);

    const fee = await createPublishedFee(admin);
    await createPublishedFee(admin, {
      optionKey: 'lesson_multiplier_with_deposit',
      rateBasisPoints: 30_000,
      depositBasisPoints: 5000,
    });
    await createPublishedFee(admin, { optionKey: 'monthly_percent', rateBasisPoints: 4000 });
    await publishTutorTermsQuiz(admin);
    await passAndAcknowledgeTutorTerms(tutor);
    const updated = await api(
      '/tutor/profile',
      jsonInit('PATCH', { preferredGrades: ['Lớp 10', 'Lớp 11'] }, tutor),
    );
    expect(updated.status).toBe(200);
    const staleId = crypto.randomUUID();
    await expect(
      insertApplication(
        createDb(env.DB),
        tutor.userId,
        lower.id,
        fee.id,
        staleId,
        lower.version,
        new Date().toISOString(),
        {
          algorithmVersion: '2026-10-12-v1',
          classVersion: lower.version,
          score: near.match.score,
          acceptedAdjustments: ['grade'],
        },
        { grade: 0, area: 15, schedule: 7, negotiableTime: false },
      ),
    ).rejects.toThrow();
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM tutor_applications WHERE id = ?')
        .bind(staleId)
        .first<{ n: number }>(),
    ).toMatchObject({ n: 0 });
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM audit_logs WHERE target_id = ?')
        .bind(staleId)
        .first<{ n: number }>(),
    ).toMatchObject({ n: 0 });
    expect(
      (await api('/tutor/profile', jsonInit('PATCH', { preferredGrades: ['Lớp 10'] }, tutor)))
        .status,
    ).toBe(200);
    const apply = (acceptedAdjustments?: string[]) =>
      api(
        `/classes/${lower.id}/applications`,
        jsonInit(
          'POST',
          { feeOptionVersionId: fee.id, classVersion: lower.version, acceptedAdjustments },
          tutor,
          { 'Idempotency-Key': `match-apply-${crypto.randomUUID()}` },
        ),
      );
    expect((await apply()).status).toBe(422);
    expect((await apply(['area'])).status).toBe(422);
    const accepted = await apply(['grade']);
    expect(accepted.status).toBe(201);
    const application = (await accepted.json<ApiSuccess<TutorApplication>>()).data;
    expect(application.matchSnapshot).toEqual({
      algorithmVersion: '2026-10-12-v1',
      classVersion: lower.version,
      score: 72,
      acceptedAdjustments: ['grade'],
      profileChanges: {
        preferredGrade: 'Lớp 11',
        preferredArea: null,
        negotiableTime: false,
      },
    });
    const afterProfile = await api('/tutor/profile', { headers: { Cookie: tutor.cookie } });
    expect(
      (await afterProfile.json<ApiSuccess<{ preferredGrades: string[]; approvalStatus: string }>>())
        .data,
    ).toMatchObject({ preferredGrades: ['Lớp 10', 'Lớp 11'], approvalStatus: 'approved' });
    const adminDetail = await api(`/admin/applications/${application.id}`, {
      headers: { Cookie: admin.cookie },
    });
    expect(adminDetail.status).toBe(200);
    expect(
      (await adminDetail.json<ApiSuccess<{ matchSnapshot: unknown }>>()).data.matchSnapshot,
    ).toEqual(application.matchSnapshot);
    const submittedAudit = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE action = 'application.submitted' AND target_id = ?",
    )
      .bind(application.id)
      .first<{ metadata: string }>();
    expect(JSON.parse(submittedAudit!.metadata).matchSnapshot).toEqual(application.matchSnapshot);
  });

  it('matches a broad area as a complete segment, not a prefix of another district', async () => {
    const admin = await moderator();
    const tutor = await createPublicTutor({
      subjectIds: ['subj_history'],
      teachesOffline: true,
      preferredAreas: ['Quận 1'],
    });
    const createOffline = async (publicArea: string) => {
      const parent = await register('parent');
      const request = await createSubmittedRequest(parent, {
        subjectId: 'subj_history',
        mode: 'offline',
        area: 'TP.HCM',
      });
      const draft = (
        await (await createClass(admin, request, publicArea)).json<ApiSuccess<AdminClass>>()
      ).data;
      return publishClass(admin, draft);
    };
    const otherDistrict = await createOffline('Quận 10, TP.HCM');
    const ownDistrict = await createOffline('Quận 1, TP.HCM');
    const prefixedDistrict = await createOffline('Quận Cầu Giấy, Hà Nội');
    const get = async (id: string) =>
      (
        await (
          await api(`/tutor/classes/${id}/recommendation`, { headers: { Cookie: tutor.cookie } })
        ).json<ApiSuccess<ClassRecommendation>>()
      ).data;
    expect(
      (await get(otherDistrict.id)).match.criteria.find((item) => item.key === 'area'),
    ).toMatchObject({ score: 0, status: 'adjustable' });
    expect((await get(otherDistrict.id)).match).toMatchObject({
      score: 67,
      coverage: 65,
      level: 'uncertain',
      adjustments: ['area'],
      profileChangesPreview: { preferredArea: 'Quận 10' },
    });
    const longDistrict = await createOffline(`${'A'.repeat(81)}, TP.HCM`);
    expect((await get(longDistrict.id)).match).toMatchObject({
      profileChangesPreview: { preferredArea: null },
    });
    expect(
      (await get(longDistrict.id)).match.criteria.find((item) => item.key === 'area'),
    ).toMatchObject({ score: 7, status: 'unknown' });
    expect(
      (await get(ownDistrict.id)).match.criteria.find((item) => item.key === 'area'),
    ).toMatchObject({ score: 15, status: 'match' });
    const updated = await api(
      '/tutor/profile',
      jsonInit('PATCH', { preferredAreas: ['Cầu Giấy'] }, tutor),
    );
    expect(updated.status).toBe(200);
    expect(
      (await get(prefixedDistrict.id)).match.criteria.find((item) => item.key === 'area'),
    ).toMatchObject({ score: 15, status: 'match' });
    const unicodeDistrict = await createOffline('Đống Đa, Hà Nội');
    expect(
      (await api('/tutor/profile', jsonInit('PATCH', { preferredAreas: ['đống đa'] }, tutor)))
        .status,
    ).toBe(200);
    expect(
      (await get(unicodeDistrict.id)).match.criteria.find((item) => item.key === 'area'),
    ).toMatchObject({ score: 15, status: 'match' });
  });

  it('persists accepted grade, area and flexible time atomically with the application', async () => {
    const admin = await moderator();
    const parent = await register('parent');
    const request = await createSubmittedRequest(parent, {
      subjectId: 'subj_history',
      mode: 'offline',
      area: 'TP.HCM',
    });
    const draft = (
      await (await createClass(admin, request, 'Quận 10, TP.HCM')).json<ApiSuccess<AdminClass>>()
    ).data;
    const cls = await publishClass(admin, draft);
    const tutor = await createPublicTutor({
      subjectIds: ['subj_history'],
      teachesOffline: true,
      preferredGrades: ['Lớp 9'],
      preferredAreas: ['Quận 1'],
    });
    await env.DB.prepare(
      `INSERT INTO availability_rules
       (id, tutor_id, weekday, start_local, end_local, timezone, created_at)
       VALUES (?, ?, 2, '20:00', '21:00', 'Asia/Ho_Chi_Minh', ?)`,
    )
      .bind(crypto.randomUUID(), tutor.userId, new Date().toISOString())
      .run();
    const recommendation = await api(`/tutor/classes/${cls.id}/recommendation`, {
      headers: { Cookie: tutor.cookie },
    });
    expect(recommendation.status).toBe(200);
    const before = (await recommendation.json<ApiSuccess<ClassRecommendation>>()).data;
    expect(before.match).toMatchObject({
      score: 50,
      coverage: 100,
      level: 'low',
      adjustments: ['grade', 'area', 'schedule'],
      profileChangesPreview: {
        preferredGrade: 'Lớp 10',
        preferredArea: 'Quận 10',
        negotiableTime: true,
      },
    });
    const fee = await createPublishedFee(admin);
    await createPublishedFee(admin, {
      optionKey: 'lesson_multiplier_with_deposit',
      rateBasisPoints: 30_000,
      depositBasisPoints: 5000,
    });
    await createPublishedFee(admin, { optionKey: 'monthly_percent', rateBasisPoints: 4000 });
    await publishTutorTermsQuiz(admin);
    await passAndAcknowledgeTutorTerms(tutor);
    // The three scored preferences are unchanged, but a concurrent profile edit
    // invalidates the proposed negotiable-time delta before the insert batch.
    await env.DB.prepare('UPDATE tutor_profiles SET negotiable_time = 1 WHERE user_id = ?')
      .bind(tutor.userId)
      .run();
    const staleFlagId = crypto.randomUUID();
    await expect(
      insertApplication(
        createDb(env.DB),
        tutor.userId,
        cls.id,
        fee.id,
        staleFlagId,
        cls.version,
        new Date().toISOString(),
        {
          algorithmVersion: before.match.algorithmVersion,
          classVersion: cls.version,
          score: before.match.score,
          acceptedAdjustments: ['grade', 'area', 'schedule'],
          profileChanges: before.match.profileChangesPreview,
        },
        { grade: 0, area: 0, schedule: 0, negotiableTime: false },
      ),
    ).rejects.toThrow();
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM tutor_applications WHERE id = ?')
        .bind(staleFlagId)
        .first<{ n: number }>(),
    ).toMatchObject({ n: 0 });
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM audit_logs WHERE target_id = ?')
        .bind(staleFlagId)
        .first<{ n: number }>(),
    ).toMatchObject({ n: 0 });
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM tutor_preference_areas WHERE tutor_id = ?')
        .bind(tutor.userId)
        .first<{ n: number }>(),
    ).toMatchObject({ n: 1 });
    await env.DB.prepare('UPDATE tutor_profiles SET negotiable_time = 0 WHERE user_id = ?')
      .bind(tutor.userId)
      .run();
    const apply = (session: Session, acceptedAdjustments: string[]) =>
      api(
        `/classes/${cls.id}/applications`,
        jsonInit(
          'POST',
          { feeOptionVersionId: fee.id, classVersion: cls.version, acceptedAdjustments },
          session,
          { 'Idempotency-Key': `profile-match-${crypto.randomUUID()}` },
        ),
      );
    expect((await apply(tutor, ['grade', 'area'])).status).toBe(422);
    const accepted = await apply(tutor, ['grade', 'area', 'schedule']);
    expect(accepted.status).toBe(201);
    const application = (await accepted.json<ApiSuccess<TutorApplication>>()).data;
    expect(application.matchSnapshot).toMatchObject({
      score: 50,
      profileChanges: before.match.profileChangesPreview,
    });
    const profileResponse = await api('/tutor/profile', { headers: { Cookie: tutor.cookie } });
    const profile = (
      await profileResponse.json<
        ApiSuccess<{
          preferredGrades: string[];
          preferredAreas: string[];
          negotiableTime: boolean;
          approvalStatus: string;
        }>
      >()
    ).data;
    expect(profile.preferredGrades).toEqual(expect.arrayContaining(['Lớp 9', 'Lớp 10']));
    expect(profile.preferredAreas).toEqual(expect.arrayContaining(['Quận 1', 'Quận 10']));
    expect(profile).toMatchObject({ negotiableTime: true, approvalStatus: 'approved' });
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM availability_rules WHERE tutor_id = ?')
        .bind(tutor.userId)
        .first<{ n: number }>(),
    ).toMatchObject({ n: 1 });
    const after = await api(`/tutor/classes/${cls.id}/recommendation`, {
      headers: { Cookie: tutor.cookie },
    });
    expect((await after.json<ApiSuccess<ClassRecommendation>>()).data.match).toMatchObject({
      score: 85,
      coverage: 100,
      level: 'near',
      adjustments: ['schedule'],
      profileChangesPreview: {
        preferredGrade: null,
        preferredArea: null,
        negotiableTime: false,
      },
    });

    const fullTutor = await createPublicTutor({
      subjectIds: ['subj_history'],
      teachesOffline: true,
      preferredGrades: ['Lớp 10'],
      preferredAreas: Array.from({ length: 12 }, (_, index) => `Khu ${index + 1}`),
    });
    await passAndAcknowledgeTutorTerms(fullTutor);
    const rejected = await apply(fullTutor, ['area']);
    expect(rejected.status).toBe(409);
    expect((await rejected.json<{ error: { code: string } }>()).error.code).toBe(
      'PROFILE_PREFERENCE_LIMIT',
    );
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS n FROM tutor_applications WHERE tutor_user_id = ? AND class_id = ?',
      )
        .bind(fullTutor.userId, cls.id)
        .first<{ n: number }>(),
    ).toMatchObject({ n: 0 });
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM tutor_preference_areas WHERE tutor_id = ?')
        .bind(fullTutor.userId)
        .first<{ n: number }>(),
    ).toMatchObject({ n: 12 });
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM audit_logs WHERE actor_id = ? AND action = 'application.submitted'",
      )
        .bind(fullTutor.userId)
        .first<{ n: number }>(),
    ).toMatchObject({ n: 0 });
  });

  it('treats missing or different-timezone schedules as unknown and scores only a same-timezone overlap', async () => {
    const { cls } = await setupOpenClass();
    const tutor = await createPublicTutor({ preferredGrades: ['Lớp 10'] });
    const path = `/tutor/classes/${cls.id}/recommendation`;
    const get = async () =>
      (
        await (
          await api(path, { headers: { Cookie: tutor.cookie } })
        ).json<ApiSuccess<ClassRecommendation>>()
      ).data.match;
    expect(await get()).toMatchObject({ score: 92, coverage: 85, level: 'strong' });
    const addRule = async (timezone: string, start: string, end: string) => {
      await env.DB.prepare(
        `INSERT INTO availability_rules
         (id, tutor_id, weekday, start_local, end_local, timezone, created_at)
         VALUES (?, ?, 2, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), tutor.userId, start, end, timezone, new Date().toISOString())
        .run();
    };
    await addRule('Asia/Bangkok', '18:00', '20:00');
    expect((await get()).criteria.find((item) => item.key === 'schedule')).toMatchObject({
      score: 7,
      status: 'unknown',
    });
    await addRule('Asia/Ho_Chi_Minh', '20:00', '21:00');
    expect((await get()).criteria.find((item) => item.key === 'schedule')).toMatchObject({
      score: 0,
      status: 'adjustable',
    });
    await addRule('Asia/Ho_Chi_Minh', '18:00', '20:00');
    expect(await get()).toMatchObject({ score: 100, coverage: 100, level: 'strong' });
  });
});

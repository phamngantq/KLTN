import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type {
  AdminClass,
  FeeOptionVersion,
  PublicClass,
  TutorApplication,
} from '../../src/shared/schemas/classes';
import type { Page } from '../../src/shared/schemas/discovery';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import { api, createPublicTutor, jsonInit, register, type Session } from './helpers';
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

async function createSubmittedRequest(parent: Session): Promise<OwnParentRequest> {
  const created = await api(
    '/parent/requests',
    jsonInit('POST', REQUEST, parent, {
      'Idempotency-Key': `class-request-${crypto.randomUUID()}`,
    }),
  );
  expect(created.status).toBe(201);
  const draft = (await created.json<ApiSuccess<OwnParentRequest>>()).data;
  const submitted = await api(
    `/parent/requests/${draft.id}/submit`,
    jsonInit('POST', { version: draft.version, consentToShareContact: true }, parent),
  );
  expect(submitted.status).toBe(200);
  return (await submitted.json<ApiSuccess<OwnParentRequest>>()).data;
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
  it('enforces moderator sourcing, consent, unique source and atomic publication', async () => {
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
    const submittedResponse = await api(
      `/parent/requests/${draftRequest.id}/submit`,
      jsonInit('POST', { version: draftRequest.version, consentToShareContact: true }, parent),
    );
    const submitted = (await submittedResponse.json<ApiSuccess<OwnParentRequest>>()).data;
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
});

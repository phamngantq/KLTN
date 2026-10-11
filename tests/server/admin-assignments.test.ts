import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { AdminApplication } from '../../src/shared/schemas/admin-applications';
import type {
  AdminAssignment,
  AssignedParentContact,
  ClassLifecycle,
  TutorAssignment,
  TutorAssignmentHistory,
} from '../../src/shared/schemas/admin-assignments';
import type { AdminClass, TutorApplication } from '../../src/shared/schemas/classes';
import type { Page } from '../../src/shared/schemas/discovery';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import type {
  AdminReportOverview,
  ConversionReport,
  ParentDashboard,
} from '../../src/shared/schemas/reports';
import { todayIn } from '../../src/shared/time';
import type {
  AdminContractCandidate,
  ClassContractRecord,
} from '../../src/shared/schemas/terms-contracts';
import { api, createPublicTutor, errorCode, jsonInit, register, type Session } from './helpers';
import {
  passAndAcknowledgeTutorTerms,
  publishTutorContract,
  publishTutorTermsQuiz,
} from './terms-fixture';

const PHONE = '0912345678';
const ADDRESS = 'Số 10, đường thử nghiệm';
const AGREED_TUITION = 220_000;

async function makeModerator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

async function createSubmittedRequest(parent: Session): Promise<OwnParentRequest> {
  const input = {
    subjectId: 'subj_math',
    grade: 'Lớp 10',
    mode: 'offline',
    area: 'Cầu Giấy, Hà Nội',
    expectedBudgetMinor: 250_000,
    description: 'Cần gia sư buổi tối.',
    schedule: {
      timezone: 'Asia/Ho_Chi_Minh',
      discussLater: false,
      windows: [{ weekday: 1, startLocal: '18:00', endLocal: '19:30' }],
    },
    contactPhone: PHONE,
    contactAddress: ADDRESS,
  };
  const create = await api(
    '/parent/requests',
    jsonInit('POST', input, parent, { 'Idempotency-Key': crypto.randomUUID() }),
  );
  expect(create.status).toBe(201);
  const draft = (await create.json<ApiSuccess<OwnParentRequest>>()).data;
  const submit = await api(
    `/parent/requests/${draft.id}/submit`,
    jsonInit('POST', { version: draft.version, consentToShareContact: true }, parent),
  );
  expect(submit.status).toBe(200);
  return (await submit.json<ApiSuccess<OwnParentRequest>>()).data;
}

async function createOpenClass(moderator: Session, request: OwnParentRequest): Promise<AdminClass> {
  const create = await api(
    '/admin/classes',
    jsonInit(
      'POST',
      { sourceRequestId: request.id, requestVersion: request.version, publicArea: 'Cầu Giấy' },
      moderator,
    ),
  );
  expect(create.status).toBe(201);
  const draft = (await create.json<ApiSuccess<AdminClass>>()).data;
  const publish = await api(
    `/admin/classes/${draft.id}/publish`,
    jsonInit('POST', { version: draft.version }, moderator),
  );
  expect(publish.status).toBe(200);
  return (await publish.json<ApiSuccess<AdminClass>>()).data;
}

/** Synthetic test-only policy; no fee option is seeded by production migrations. */
async function seedPublishedFee(moderator: Session): Promise<string> {
  // The fixture policy must already be effective when the Worker evaluates it.
  const now = new Date(Date.now() - 60_000).toISOString();
  let selectedId = '';
  for (const [key, rate, deposit] of [
    ['first_lesson_percent', 100, null],
    ['lesson_multiplier_with_deposit', 30_000, 5000],
    ['monthly_percent', 100, null],
  ] as const) {
    const id = crypto.randomUUID();
    const latest = await env.DB.prepare(
      'SELECT coalesce(max(version), 0) AS version FROM fee_option_versions WHERE option_key = ?',
    )
      .bind(key)
      .first<{ version: number }>();
    const version = (latest?.version ?? 0) + 1;
    if (!selectedId) selectedId = id;
    await env.DB.prepare(
      `INSERT INTO fee_option_versions
      (id, option_key, version, title, policy_text, rate_basis_points,
       deposit_basis_points, scope_subject_id, scope_mode, status,
       effective_from, effective_to, approved_by, published_at, mutation_id, created_at)
     VALUES (?, ?, ?, 'Test policy', 'Synthetic test-only fee policy.',
             ?, ?, 'subj_math', 'offline', 'published', NULL, NULL, ?, ?, ?, ?)`,
    )
      .bind(id, key, version, rate, deposit, moderator.userId, now, crypto.randomUUID(), now)
      .run();
  }
  return selectedId;
}

async function apply(tutor: Session, cls: AdminClass, feeOptionVersionId: string) {
  const response = await api(
    `/classes/${cls.id}/applications`,
    jsonInit('POST', { feeOptionVersionId, classVersion: cls.version }, tutor, {
      'Idempotency-Key': crypto.randomUUID(),
    }),
  );
  if (response.status !== 201) {
    throw new Error(`Synthetic application failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json<ApiSuccess<TutorApplication>>()).data;
}

async function fixture() {
  const moderator = await makeModerator();
  const parent = await register('parent');
  const request = await createSubmittedRequest(parent);
  const cls = await createOpenClass(moderator, request);
  const feeOptionVersionId = await seedPublishedFee(moderator);
  const tutorA = await createPublicTutor({ teachesOffline: true });
  const tutorB = await createPublicTutor({ teachesOffline: true });
  await publishTutorTermsQuiz(moderator);
  await passAndAcknowledgeTutorTerms(tutorA);
  await passAndAcknowledgeTutorTerms(tutorB);
  const applicationA = await apply(tutorA, cls, feeOptionVersionId);
  const applicationB = await apply(tutorB, cls, feeOptionVersionId);
  return { moderator, parent, request, cls, tutorA, tutorB, applicationA, applicationB };
}

const assignmentBody = (
  cls: AdminClass,
  request: OwnParentRequest,
  application: TutorApplication,
) => ({
  applicationId: application.id,
  classVersion: cls.version,
  requestVersion: request.version + 1,
  applicationVersion: application.version,
  agreedTuitionPerSessionMinor: AGREED_TUITION,
  partiesAgreed: true,
});

describe('moderator applications and assignment', () => {
  it('issues a versioned contract to the selected tutor and records explicit acknowledgement', async () => {
    const state = await fixture();
    const assigned = await api(
      `/admin/classes/${state.cls.id}/assign`,
      jsonInit(
        'POST',
        assignmentBody(state.cls, state.request, state.applicationA),
        state.moderator,
      ),
    );
    expect(assigned.status).toBe(200);
    const assignment = (await assigned.json<ApiSuccess<AdminAssignment>>()).data;
    const candidateResponse = await api('/admin/contracts/candidates', {
      headers: { Cookie: state.moderator.cookie },
    });
    expect(candidateResponse.status).toBe(200);
    expect(
      (await candidateResponse.json<ApiSuccess<Page<AdminContractCandidate>>>()).data.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assignmentId: assignment.id,
          contractId: null,
          assignmentVersion: assignment.version,
        }),
      ]),
    );
    const content = await publishTutorContract(state.moderator);
    const body = { assignmentVersion: assignment.version, contentRevisionId: content.id };
    expect(
      (
        await api(
          `/admin/assignments/${assignment.id}/contracts`,
          jsonInit('POST', body, state.parent),
        )
      ).status,
    ).toBe(403);
    const issuedResponse = await api(
      `/admin/assignments/${assignment.id}/contracts`,
      jsonInit('POST', body, state.moderator),
    );
    expect(issuedResponse.status).toBe(201);
    const contract = (await issuedResponse.json<ApiSuccess<ClassContractRecord>>()).data;
    const contractList = await api('/admin/contracts', {
      headers: { Cookie: state.moderator.cookie },
    });
    expect((await contractList.json<ApiSuccess<Page<ClassContractRecord>>>()).data.items).toEqual(
      expect.arrayContaining([contract]),
    );
    expect(contract).toMatchObject({
      assignmentId: assignment.id,
      status: 'issued',
      tutorUserId: state.tutorA.userId,
      contractContentRevisionId: content.id,
      feeOptionVersionId: state.applicationA.feeOptionVersionId,
      agreedTuitionPerSessionMinor: AGREED_TUITION,
    });
    const snapshot = await env.DB.prepare(
      'SELECT agreed_tuition_per_session_minor AS amount FROM class_contract_records WHERE id = ?',
    )
      .bind(contract.id)
      .first<{ amount: number | null }>();
    expect(snapshot?.amount).toBe(AGREED_TUITION);
    await expect(
      env.DB.prepare(
        'UPDATE class_contract_records SET agreed_tuition_per_session_minor = ? WHERE id = ?',
      )
        .bind(310_000, contract.id)
        .run(),
    ).rejects.toThrow(/CONTRACT_TUITION_IMMUTABLE/);
    await expect(
      env.DB.prepare(
        'UPDATE class_assignments SET agreed_tuition_per_session_minor = ? WHERE id = ?',
      )
        .bind(310_000, assignment.id)
        .run(),
    ).rejects.toThrow(/ASSIGNMENT_TUITION_IMMUTABLE/);
    expect(JSON.stringify(contract)).not.toContain(PHONE);
    expect(JSON.stringify(contract)).not.toContain(ADDRESS);
    expect(
      (
        await api(
          `/admin/assignments/${assignment.id}/contracts`,
          jsonInit('POST', body, state.moderator),
        )
      ).status,
    ).toBe(409);
    expect(
      (await api(`/tutor/contracts/${contract.id}`, { headers: { Cookie: state.tutorB.cookie } }))
        .status,
    ).toBe(404);
    const own = await api('/tutor/contracts', { headers: { Cookie: state.tutorA.cookie } });
    expect(own.status).toBe(200);
    expect((await own.json<ApiSuccess<Page<ClassContractRecord>>>()).data.items).toEqual(
      expect.arrayContaining([contract]),
    );
    expect(
      (
        await api(
          `/tutor/contracts/${contract.id}/acknowledge`,
          jsonInit('POST', { version: 1, acknowledged: true }, state.tutorB),
        )
      ).status,
    ).toBe(404);
    const acknowledged = await api(
      `/tutor/contracts/${contract.id}/acknowledge`,
      jsonInit('POST', { version: 1, acknowledged: true }, state.tutorA),
    );
    expect(acknowledged.status).toBe(200);
    expect((await acknowledged.json<ApiSuccess<ClassContractRecord>>()).data).toMatchObject({
      status: 'acknowledged',
      version: 2,
    });
    expect(
      (
        await api(
          `/tutor/contracts/${contract.id}/acknowledge`,
          jsonInit('POST', { version: 1, acknowledged: true }, state.tutorA),
        )
      ).status,
    ).toBe(409);
    const audit = await env.DB.prepare(
      "SELECT action FROM audit_logs WHERE target_type = 'class_contract' AND target_id = ? ORDER BY created_at",
    )
      .bind(contract.id)
      .all<{ action: string }>();
    expect(audit.results.map((row) => row.action)).toEqual([
      'class_contract.issued',
      'class_contract.acknowledged',
    ]);
  });

  it('requires a legacy assignment to record agreed tuition before issuing a contract', async () => {
    const state = await fixture();
    const assignedResponse = await api(
      `/admin/classes/${state.cls.id}/assign`,
      jsonInit(
        'POST',
        assignmentBody(state.cls, state.request, state.applicationA),
        state.moderator,
      ),
    );
    expect(assignedResponse.status).toBe(200);
    const assignment = (await assignedResponse.json<ApiSuccess<AdminAssignment>>()).data;
    const content = await publishTutorContract(state.moderator);

    // Recreate the shape of an assignment inserted before migration 0017. Test D1
    // storage is isolated per test; production rows are never downgraded this way.
    await env.DB.prepare('DROP TRIGGER class_assignments_tuition_immutable').run();
    await env.DB.prepare(
      `UPDATE class_assignments SET agreed_tuition_per_session_minor = NULL,
         tuition_recorded_by = NULL, tuition_recorded_at = NULL WHERE id = ?`,
    )
      .bind(assignment.id)
      .run();
    await env.DB.prepare(
      `CREATE TRIGGER class_assignments_tuition_immutable BEFORE UPDATE OF
         agreed_tuition_per_session_minor, tuition_recorded_by, tuition_recorded_at
       ON class_assignments WHEN OLD.agreed_tuition_per_session_minor IS NOT NULL
       BEGIN SELECT RAISE(ABORT, 'ASSIGNMENT_TUITION_IMMUTABLE'); END`,
    ).run();

    const contractPath = `/admin/assignments/${assignment.id}/contracts`;
    const issueBody = { assignmentVersion: assignment.version, contentRevisionId: content.id };
    const blocked = await api(contractPath, jsonInit('POST', issueBody, state.moderator));
    expect(blocked.status).toBe(409);
    expect(await errorCode(blocked)).toBe('CONTRACT_TUITION_UNRECORDED');
    const before = await env.DB.prepare(
      'SELECT count(*) AS n FROM class_contract_records WHERE assignment_id = ?',
    )
      .bind(assignment.id)
      .first<{ n: number }>();
    expect(before?.n).toBe(0);

    const tuitionPath = `/admin/assignments/${assignment.id}/tuition`;
    const tuitionBody = {
      assignmentVersion: assignment.version,
      agreedTuitionPerSessionMinor: 240_000,
      partiesAgreed: true,
    };
    expect((await api(tuitionPath, jsonInit('POST', tuitionBody, state.parent))).status).toBe(403);
    expect((await api(tuitionPath, jsonInit('POST', tuitionBody, state.tutorA))).status).toBe(403);
    expect(
      (
        await api(
          tuitionPath,
          jsonInit('POST', { ...tuitionBody, partiesAgreed: false }, state.moderator),
        )
      ).status,
    ).toBe(422);
    const recordedResponse = await api(tuitionPath, jsonInit('POST', tuitionBody, state.moderator));
    expect(recordedResponse.status).toBe(200);
    const recorded = (await recordedResponse.json<ApiSuccess<AdminAssignment>>()).data;
    expect(recorded).toMatchObject({
      agreedTuitionPerSessionMinor: 240_000,
      tuitionRecordedBy: state.moderator.userId,
      version: assignment.version + 1,
    });
    expect((await api(tuitionPath, jsonInit('POST', tuitionBody, state.moderator))).status).toBe(
      409,
    );
    const issued = await api(
      contractPath,
      jsonInit('POST', { ...issueBody, assignmentVersion: recorded.version }, state.moderator),
    );
    expect(issued.status).toBe(201);
    expect(
      (await issued.json<ApiSuccess<ClassContractRecord>>()).data.agreedTuitionPerSessionMinor,
    ).toBe(240_000);
  });
  it('lists applications without parent contact and rejects with versioned audit reason', async () => {
    const state = await fixture();
    const queue = await api(`/admin/applications?classId=${state.cls.id}`, {
      headers: { Cookie: state.moderator.cookie },
    });
    expect(queue.status).toBe(200);
    const page = (await queue.json<ApiSuccess<Page<AdminApplication>>>()).data;
    expect(page.items).toHaveLength(2);
    expect(page.items.every(({ status }) => status === 'submitted')).toBe(true);
    expect(JSON.stringify(page)).not.toContain(PHONE);
    expect(JSON.stringify(page)).not.toContain(ADDRESS);
    expect(page.items[0]?.requestVersion).toBe(state.request.version + 1);

    expect((await api('/admin/applications')).status).toBe(401);
    expect(
      (
        await api('/admin/applications', {
          headers: { Cookie: state.parent.cookie },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('/admin/applications', {
          headers: { Cookie: state.tutorA.cookie },
        })
      ).status,
    ).toBe(403);

    const rejected = await api(
      `/admin/applications/${state.applicationA.id}/reject`,
      jsonInit(
        'POST',
        { version: state.applicationA.version, reason: 'Không đáp ứng lịch học' },
        state.moderator,
      ),
    );
    expect(rejected.status).toBe(200);
    expect((await rejected.json<ApiSuccess<AdminApplication>>()).data).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Không đáp ứng lịch học',
      version: state.applicationA.version + 1,
    });
    expect(
      (
        await api(
          `/admin/applications/${state.applicationA.id}/reject`,
          jsonInit(
            'POST',
            { version: state.applicationA.version, reason: 'Thử lại' },
            state.moderator,
          ),
        )
      ).status,
    ).toBe(409);
    const own = await api(`/tutor/applications/${state.applicationA.id}`, {
      headers: { Cookie: state.tutorA.cookie },
    });
    expect((await own.json<ApiSuccess<TutorApplication>>()).data).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Không đáp ứng lịch học',
    });
    const audit = await env.DB.prepare(
      "SELECT actor_id, metadata FROM audit_logs WHERE target_id = ? AND action = 'application.rejected'",
    )
      .bind(state.applicationA.id)
      .first<{ actor_id: string; metadata: string }>();
    expect(audit?.actor_id).toBe(state.moderator.userId);
    expect(JSON.parse(audit!.metadata).reason).toBe('Không đáp ứng lịch học');
  });

  it('assigns atomically, rejects competitors and opens contact only for the selected tutor', async () => {
    const state = await fixture();
    const path = `/admin/classes/${state.cls.id}/assign`;
    const body = assignmentBody(state.cls, state.request, state.applicationA);

    for (const invalid of [
      { ...body, agreedTuitionPerSessionMinor: 0 },
      { ...body, agreedTuitionPerSessionMinor: 100_000_001 },
      { ...body, agreedTuitionPerSessionMinor: 220_000.5 },
      { ...body, agreedTuitionPerSessionMinor: undefined },
      { ...body, partiesAgreed: false },
    ]) {
      expect((await api(path, jsonInit('POST', invalid, state.moderator))).status).toBe(422);
    }
    expect((await api(path, jsonInit('POST', body, state.parent))).status).toBe(403);
    expect((await api(path, jsonInit('POST', body, state.tutorA))).status).toBe(403);

    const stale = await api(
      path,
      jsonInit('POST', { ...body, requestVersion: 1 }, state.moderator),
    );
    expect(stale.status).toBe(409);
    const before = await env.DB.prepare(
      'SELECT count(*) AS n FROM class_assignments WHERE class_id = ?',
    )
      .bind(state.cls.id)
      .first<{ n: number }>();
    expect(before?.n).toBe(0);

    const assignedResponse = await api(path, jsonInit('POST', body, state.moderator));
    expect(assignedResponse.status).toBe(200);
    const assignment = (await assignedResponse.json<ApiSuccess<AdminAssignment>>()).data;
    expect(assignment).toMatchObject({
      classId: state.cls.id,
      applicationId: state.applicationA.id,
      tutorUserId: state.tutorA.userId,
      status: 'active',
      assignedBy: state.moderator.userId,
      agreedTuitionPerSessionMinor: AGREED_TUITION,
      tuitionRecordedBy: state.moderator.userId,
    });
    const storedTuition = await env.DB.prepare(
      `SELECT agreed_tuition_per_session_minor AS amount, tuition_recorded_by AS actor
       FROM class_assignments WHERE id = ?`,
    )
      .bind(assignment.id)
      .first<{ amount: number | null; actor: string | null }>();
    expect(storedTuition).toMatchObject({ amount: AGREED_TUITION, actor: state.moderator.userId });
    const parentDetail = await api(`/parent/requests/${state.request.id}`, {
      headers: { Cookie: state.parent.cookie },
    });
    expect((await parentDetail.json<ApiSuccess<OwnParentRequest>>()).data).toMatchObject({
      expectedBudgetMinor: 250_000,
      agreedTuitionPerSessionMinor: AGREED_TUITION,
    });
    const publicClass = await api(`/classes/${state.cls.id}`);
    expect(publicClass.status).toBe(404);
    expect(JSON.stringify(await publicClass.json())).not.toContain('agreedTuitionPerSessionMinor');
    const otherParent = await register('parent');
    expect(
      (
        await api(`/parent/requests/${state.request.id}`, {
          headers: { Cookie: otherParent.cookie },
        })
      ).status,
    ).toBe(404);
    const stored = await env.DB.prepare('SELECT status FROM class_listings WHERE id = ?')
      .bind(state.cls.id)
      .first<{ status: string }>();
    expect(stored?.status).toBe('active');
    const source = await env.DB.prepare('SELECT status FROM parent_requests WHERE id = ?')
      .bind(state.request.id)
      .first<{ status: string }>();
    expect(source?.status).toBe('assigned');

    const queue = await api(`/admin/applications?classId=${state.cls.id}`, {
      headers: { Cookie: state.moderator.cookie },
    });
    const applications = (await queue.json<ApiSuccess<Page<AdminApplication>>>()).data.items;
    expect(applications.find(({ id }) => id === state.applicationA.id)?.status).toBe('selected');
    expect(applications.find(({ id }) => id === state.applicationB.id)).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Lớp đã được gán cho gia sư khác',
    });
    const loserAudit = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE target_id = ? AND action = 'application.rejected'",
    )
      .bind(state.applicationB.id)
      .first<{ metadata: string }>();
    expect(JSON.parse(loserAudit!.metadata).reason).toBe('Lớp đã được gán cho gia sư khác');

    const ownAssignments = await api('/tutor/assignments?pageSize=1', {
      headers: { Cookie: state.tutorA.cookie },
    });
    expect(ownAssignments.status).toBe(200);
    const ownPage = (await ownAssignments.json<ApiSuccess<Page<TutorAssignment>>>()).data;
    expect(ownPage.items[0]).toMatchObject({
      id: assignment.id,
      classId: state.cls.id,
      applicationId: state.applicationA.id,
      status: 'active',
      agreedTuitionPerSessionMinor: AGREED_TUITION,
    });
    expect(JSON.stringify(ownPage)).not.toContain(PHONE);
    expect(JSON.stringify(ownPage)).not.toContain(ADDRESS);
    const otherAssignments = await api('/tutor/assignments', {
      headers: { Cookie: state.tutorB.cookie },
    });
    expect((await otherAssignments.json<ApiSuccess<Page<TutorAssignment>>>()).data.items).toEqual(
      [],
    );
    expect((await api('/tutor/assignments')).status).toBe(401);
    expect(
      (await api('/tutor/assignments', { headers: { Cookie: state.parent.cookie } })).status,
    ).toBe(403);

    const selectedContact = await api(`/tutor/assignments/${assignment.id}/contact`, {
      headers: { Cookie: state.tutorA.cookie },
    });
    expect(selectedContact.status).toBe(200);
    expect((await selectedContact.json<ApiSuccess<AssignedParentContact>>()).data).toMatchObject({
      phone: PHONE,
      address: ADDRESS,
    });
    const contactAudit = await env.DB.prepare(
      "SELECT actor_id, metadata FROM audit_logs WHERE target_id = ? AND action = 'assignment.contact_viewed'",
    )
      .bind(assignment.id)
      .first<{ actor_id: string; metadata: string }>();
    expect(contactAudit?.actor_id).toBe(state.tutorA.userId);
    expect(contactAudit?.metadata).not.toContain(PHONE);
    for (const session of [state.tutorB, state.parent, state.moderator]) {
      const response = await api(`/tutor/assignments/${assignment.id}/contact`, {
        headers: { Cookie: session.cookie },
      });
      expect(response.status).toBe(session === state.tutorB ? 404 : 403);
      expect(await response.text()).not.toContain(PHONE);
    }
    expect((await api(`/classes/${state.cls.id}`)).status).toBe(404);
    expect((await api(path, jsonInit('POST', body, state.moderator))).status).toBe(409);
  });

  it('permits only one of two concurrent moderator assignments', async () => {
    const state = await fixture();
    const path = `/admin/classes/${state.cls.id}/assign`;
    const [a, b] = await Promise.all([
      api(
        path,
        jsonInit(
          'POST',
          assignmentBody(state.cls, state.request, state.applicationA),
          state.moderator,
        ),
      ),
      api(
        path,
        jsonInit(
          'POST',
          assignmentBody(state.cls, state.request, state.applicationB),
          state.moderator,
        ),
      ),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const count = await env.DB.prepare(
      "SELECT count(*) AS n FROM class_assignments WHERE class_id = ? AND status = 'active'",
    )
      .bind(state.cls.id)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('revokes an assignment atomically, removes contact access, and preserves fee/contract history', async () => {
    const state = await fixture();
    const assignmentResponse = await api(
      `/admin/classes/${state.cls.id}/assign`,
      jsonInit(
        'POST',
        assignmentBody(state.cls, state.request, state.applicationA),
        state.moderator,
      ),
    );
    const assignment = (await assignmentResponse.json<ApiSuccess<AdminAssignment>>()).data;
    const contractContent = await publishTutorContract(state.moderator);
    const contractResponse = await api(
      `/admin/assignments/${assignment.id}/contracts`,
      jsonInit(
        'POST',
        { assignmentVersion: 1, contentRevisionId: contractContent.id },
        state.moderator,
      ),
    );
    expect(contractResponse.status).toBe(201);
    const contract = (await contractResponse.json<ApiSuccess<ClassContractRecord>>()).data;
    const currentResponse = await api(`/admin/classes/${state.cls.id}/lifecycle`, {
      headers: { Cookie: state.moderator.cookie },
    });
    const current = (await currentResponse.json<ApiSuccess<ClassLifecycle>>()).data;
    const body = {
      classVersion: current.classVersion,
      requestVersion: current.requestVersion,
      assignmentId: assignment.id,
      assignmentVersion: assignment.version,
      reason: 'Gia sư không còn phù hợp lịch dạy.',
    };
    expect(
      (await api(`/admin/classes/${state.cls.id}/revoke`, jsonInit('POST', body, state.parent)))
        .status,
    ).toBe(403);
    expect(
      (
        await api(
          `/admin/classes/${state.cls.id}/revoke`,
          jsonInit('POST', { ...body, reason: '' }, state.moderator),
        )
      ).status,
    ).toBe(422);
    const revokedResponse = await api(
      `/admin/classes/${state.cls.id}/revoke`,
      jsonInit('POST', body, state.moderator),
    );
    expect(revokedResponse.status).toBe(200);
    const revoked = (await revokedResponse.json<ApiSuccess<ClassLifecycle>>()).data;
    expect(revoked).toMatchObject({
      classStatus: 'open',
      requestStatus: 'sourcing',
      assignmentId: null,
      agreedTuitionPerSessionMinor: null,
      events: [expect.objectContaining({ eventType: 'revoked', reason: body.reason })],
    });
    const reopenedParentDetail = await api(`/parent/requests/${state.request.id}`, {
      headers: { Cookie: state.parent.cookie },
    });
    expect((await reopenedParentDetail.json<ApiSuccess<OwnParentRequest>>()).data).toMatchObject({
      expectedBudgetMinor: 250_000,
      agreedTuitionPerSessionMinor: null,
    });
    expect(
      (
        await api(`/tutor/assignments/${assignment.id}/contact`, {
          headers: { Cookie: state.tutorA.cookie },
        })
      ).status,
    ).toBe(404);
    const activeResponse = await api('/tutor/assignments', {
      headers: { Cookie: state.tutorA.cookie },
    });
    expect((await activeResponse.json<ApiSuccess<Page<TutorAssignment>>>()).data.items).toEqual([]);
    const historyResponse = await api('/tutor/assignments/history', {
      headers: { Cookie: state.tutorA.cookie },
    });
    expect(
      (await historyResponse.json<ApiSuccess<Page<TutorAssignmentHistory>>>()).data.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assignmentId: assignment.id,
          outcome: 'revoked',
          reason: body.reason,
          agreedTuitionPerSessionMinor: AGREED_TUITION,
        }),
      ]),
    );
    expect(
      (await api(`/tutor/contracts/${contract.id}`, { headers: { Cookie: state.tutorA.cookie } }))
        .status,
    ).toBe(200);
    expect(
      (
        await api(
          `/tutor/contracts/${contract.id}/acknowledge`,
          jsonInit('POST', { version: 1, acknowledged: true }, state.tutorA),
        )
      ).status,
    ).toBe(409);
    const application = await api(`/tutor/applications/${state.applicationA.id}`, {
      headers: { Cookie: state.tutorA.cookie },
    });
    expect((await application.json<ApiSuccess<TutorApplication>>()).data).toMatchObject({
      status: 'selected',
      feeOptionVersionId: state.applicationA.feeOptionVersionId,
    });
    expect((await api(`/classes/${state.cls.id}`)).status).toBe(200);
    expect(
      (await api(`/admin/classes/${state.cls.id}/revoke`, jsonInit('POST', body, state.moderator)))
        .status,
    ).toBe(409);
    const reopenedClass: AdminClass = { ...state.cls, version: revoked.classVersion };
    const repeatApplication = await apply(
      state.tutorA,
      reopenedClass,
      state.applicationA.feeOptionVersionId,
    );
    expect(repeatApplication.id).not.toBe(state.applicationA.id);
    expect(repeatApplication.status).toBe('submitted');
    const reassignedResponse = await api(
      `/admin/classes/${state.cls.id}/assign`,
      jsonInit(
        'POST',
        {
          applicationId: repeatApplication.id,
          classVersion: revoked.classVersion,
          requestVersion: revoked.requestVersion,
          applicationVersion: repeatApplication.version,
          agreedTuitionPerSessionMinor: 310_000,
          partiesAgreed: true,
        },
        state.moderator,
      ),
    );
    expect(reassignedResponse.status).toBe(200);
    const reassigned = (await reassignedResponse.json<ApiSuccess<AdminAssignment>>()).data;
    expect(reassigned.agreedTuitionPerSessionMinor).toBe(310_000);
    const amounts = await env.DB.prepare(
      `SELECT id, agreed_tuition_per_session_minor AS amount
       FROM class_assignments WHERE class_id = ? ORDER BY assigned_at, id`,
    )
      .bind(state.cls.id)
      .all<{ id: string; amount: number | null }>();
    expect(amounts.results).toEqual(
      expect.arrayContaining([
        { id: assignment.id, amount: AGREED_TUITION },
        { id: reassigned.id, amount: 310_000 },
      ]),
    );
    const reassignedParentDetail = await api(`/parent/requests/${state.request.id}`, {
      headers: { Cookie: state.parent.cookie },
    });
    expect(
      (await reassignedParentDetail.json<ApiSuccess<OwnParentRequest>>()).data
        .agreedTuitionPerSessionMinor,
    ).toBe(310_000);
  });

  it('completes a class with reason, closes contact and releases completed obligations', async () => {
    const state = await fixture();
    const assignmentResponse = await api(
      `/admin/classes/${state.cls.id}/assign`,
      jsonInit(
        'POST',
        assignmentBody(state.cls, state.request, state.applicationA),
        state.moderator,
      ),
    );
    const assignment = (await assignmentResponse.json<ApiSuccess<AdminAssignment>>()).data;
    const currentResponse = await api(`/admin/classes/${state.cls.id}/lifecycle`, {
      headers: { Cookie: state.moderator.cookie },
    });
    const current = (await currentResponse.json<ApiSuccess<ClassLifecycle>>()).data;
    const body = {
      classVersion: current.classVersion,
      requestVersion: current.requestVersion,
      assignmentId: assignment.id,
      assignmentVersion: assignment.version,
      reason: 'Hai bên xác nhận lớp học đã hoàn tất.',
    };
    const day = todayIn('Asia/Ho_Chi_Minh');
    const conversionPath = `/admin/reports/conversion?from=${day}&to=${day}&timeZone=Asia%2FHo_Chi_Minh`;
    const beforeConversionResponse = await api(conversionPath, {
      headers: { Cookie: state.moderator.cookie },
    });
    const beforeConversion = (await beforeConversionResponse.json<ApiSuccess<ConversionReport>>())
      .data;
    expect(
      (
        await api(
          `/admin/classes/${state.cls.id}/cancel`,
          jsonInit(
            'POST',
            {
              classVersion: current.classVersion,
              requestVersion: current.requestVersion,
              reason: body.reason,
            },
            state.moderator,
          ),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await api(
          `/admin/classes/${state.cls.id}/complete`,
          jsonInit('POST', { ...body, requestVersion: 1 }, state.moderator),
        )
      ).status,
    ).toBe(409);
    const completedResponse = await api(
      `/admin/classes/${state.cls.id}/complete`,
      jsonInit('POST', body, state.moderator),
    );
    expect(completedResponse.status).toBe(200);
    const completed = (await completedResponse.json<ApiSuccess<ClassLifecycle>>()).data;
    expect(completed).toMatchObject({
      classStatus: 'completed',
      requestStatus: 'fulfilled',
      agreedTuitionPerSessionMinor: AGREED_TUITION,
      events: [expect.objectContaining({ eventType: 'completed', reason: body.reason })],
    });
    const completedParentDetail = await api(`/parent/requests/${state.request.id}`, {
      headers: { Cookie: state.parent.cookie },
    });
    expect(
      (await completedParentDetail.json<ApiSuccess<OwnParentRequest>>()).data
        .agreedTuitionPerSessionMinor,
    ).toBe(AGREED_TUITION);
    expect(
      (
        await api(`/tutor/assignments/${assignment.id}/contact`, {
          headers: { Cookie: state.tutorA.cookie },
        })
      ).status,
    ).toBe(404);
    const historyResponse = await api('/tutor/assignments/history', {
      headers: { Cookie: state.tutorA.cookie },
    });
    expect(
      (await historyResponse.json<ApiSuccess<Page<TutorAssignmentHistory>>>()).data.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assignmentId: assignment.id, outcome: 'completed' }),
      ]),
    );
    const dashboardResponse = await api('/tutor/dashboard', {
      headers: { Cookie: state.tutorA.cookie },
    });
    expect(
      (await dashboardResponse.json<ApiSuccess<{ activeAssignments: number }>>()).data
        .activeAssignments,
    ).toBe(0);
    const parentDashboard = await api('/parent/dashboard', {
      headers: { Cookie: state.parent.cookie },
    });
    expect((await parentDashboard.json<ApiSuccess<ParentDashboard>>()).data).toMatchObject({
      assignedRequests: 0,
      fulfilledRequests: 1,
    });
    const conversionResponse = await api(conversionPath, {
      headers: { Cookie: state.moderator.cookie },
    });
    const conversion = (await conversionResponse.json<ApiSuccess<ConversionReport>>()).data;
    expect(conversion.submittedRequests).toBe(beforeConversion.submittedRequests);
    expect(conversion.publishedClasses).toBe(beforeConversion.publishedClasses);
    expect(conversion.completedClasses).toBe(beforeConversion.completedClasses + 1);
    const deletion = await api(
      '/account/deletion',
      jsonInit('POST', { confirmation: 'DELETE' }, state.tutorA),
    );
    expect(deletion.status).toBe(200);
    expect(
      (
        await api(
          `/admin/classes/${state.cls.id}/complete`,
          jsonInit('POST', body, state.moderator),
        )
      ).status,
    ).toBe(409);
  });

  it('cancels an open class and source request, rejects pending applications, and keeps the reason for its parent', async () => {
    const state = await fixture();
    const day = todayIn('Asia/Ho_Chi_Minh');
    const range = `?from=${day}&to=${day}&timeZone=Asia%2FHo_Chi_Minh`;
    const beforeResponse = await api(`/admin/reports/overview${range}`, {
      headers: { Cookie: state.moderator.cookie },
    });
    const beforeOverview = (await beforeResponse.json<ApiSuccess<AdminReportOverview>>()).data;
    const contextResponse = await api(`/admin/classes/${state.cls.id}/lifecycle`, {
      headers: { Cookie: state.moderator.cookie },
    });
    const context = (await contextResponse.json<ApiSuccess<ClassLifecycle>>()).data;
    const body = {
      classVersion: context.classVersion,
      requestVersion: context.requestVersion,
      reason: 'Gia đình không còn nhu cầu tìm gia sư.',
    };
    expect(
      (
        await api(
          `/admin/classes/${state.cls.id}/cancel`,
          jsonInit('POST', { ...body, reason: '' }, state.moderator),
        )
      ).status,
    ).toBe(422);
    expect(
      (await api(`/admin/classes/${state.cls.id}/cancel`, jsonInit('POST', body, state.parent)))
        .status,
    ).toBe(403);
    const cancelledResponse = await api(
      `/admin/classes/${state.cls.id}/cancel`,
      jsonInit('POST', body, state.moderator),
    );
    expect(cancelledResponse.status).toBe(200);
    const cancelled = (await cancelledResponse.json<ApiSuccess<ClassLifecycle>>()).data;
    expect(cancelled).toMatchObject({
      classStatus: 'cancelled',
      requestStatus: 'cancelled',
      events: [expect.objectContaining({ eventType: 'cancelled', reason: body.reason })],
    });
    expect((await api(`/classes/${state.cls.id}`)).status).toBe(404);
    for (const [tutor, application] of [
      [state.tutorA, state.applicationA],
      [state.tutorB, state.applicationB],
    ] as const) {
      const own = await api(`/tutor/applications/${application.id}`, {
        headers: { Cookie: tutor.cookie },
      });
      expect((await own.json<ApiSuccess<TutorApplication>>()).data).toMatchObject({
        status: 'rejected',
        rejectionReason: `Lớp đã hủy: ${body.reason}`,
        feeOptionVersionId: application.feeOptionVersionId,
      });
    }
    const parentDetail = await api(`/parent/requests/${state.request.id}`, {
      headers: { Cookie: state.parent.cookie },
    });
    expect((await parentDetail.json<ApiSuccess<OwnParentRequest>>()).data).toMatchObject({
      status: 'cancelled',
      cancellationReason: body.reason,
    });
    const parentDashboardResponse = await api('/parent/dashboard', {
      headers: { Cookie: state.parent.cookie },
    });
    expect((await parentDashboardResponse.json<ApiSuccess<ParentDashboard>>()).data).toMatchObject({
      sourcingRequests: 0,
      cancelledRequests: 1,
    });
    expect(
      (
        await api(`/parent/requests/${state.request.id}`, {
          headers: { Cookie: state.tutorA.cookie },
        })
      ).status,
    ).toBe(403);
    expect(
      (await api(`/admin/classes/${state.cls.id}/cancel`, jsonInit('POST', body, state.moderator)))
        .status,
    ).toBe(409);
    const afterResponse = await api(`/admin/reports/overview${range}`, {
      headers: { Cookie: state.moderator.cookie },
    });
    const afterOverview = (await afterResponse.json<ApiSuccess<AdminReportOverview>>()).data;
    expect(afterOverview.openClasses).toBe(beforeOverview.openClasses - 1);
    expect(afterOverview.openWithoutApplications).toBe(beforeOverview.openWithoutApplications);
    expect(afterOverview.conversion.submittedRequests).toBe(
      beforeOverview.conversion.submittedRequests,
    );
    expect(afterOverview.conversion.publishedClasses).toBe(
      beforeOverview.conversion.publishedClasses,
    );
    expect(afterOverview.conversion.completedClasses).toBe(
      beforeOverview.conversion.completedClasses,
    );
    const noTutorResponse = await api(`/admin/reports/no-tutor${range}`, {
      headers: { Cookie: state.moderator.cookie },
    });
    expect(
      (await noTutorResponse.json<ApiSuccess<Page<{ id: string }>>>()).data.items.some(
        (entry) => entry.id === state.cls.id,
      ),
    ).toBe(false);
    const anotherRequest = await createSubmittedRequest(state.parent);
    const draftResponse = await api(
      '/admin/classes',
      jsonInit(
        'POST',
        {
          sourceRequestId: anotherRequest.id,
          requestVersion: anotherRequest.version,
          publicArea: 'Cầu Giấy',
        },
        state.moderator,
      ),
    );
    const draft = (await draftResponse.json<ApiSuccess<AdminClass>>()).data;
    expect(
      (
        await api(
          `/admin/classes/${draft.id}/cancel`,
          jsonInit(
            'POST',
            {
              classVersion: draft.version,
              requestVersion: anotherRequest.version,
              reason: 'Bản nháp chưa được công bố.',
            },
            state.moderator,
          ),
        )
      ).status,
    ).toBe(409);
  });

  it('commits only one of concurrent revoke and complete transitions', async () => {
    const state = await fixture();
    const assignedResponse = await api(
      `/admin/classes/${state.cls.id}/assign`,
      jsonInit(
        'POST',
        assignmentBody(state.cls, state.request, state.applicationA),
        state.moderator,
      ),
    );
    const assignment = (await assignedResponse.json<ApiSuccess<AdminAssignment>>()).data;
    const contextResponse = await api(`/admin/classes/${state.cls.id}/lifecycle`, {
      headers: { Cookie: state.moderator.cookie },
    });
    const context = (await contextResponse.json<ApiSuccess<ClassLifecycle>>()).data;
    const body = {
      classVersion: context.classVersion,
      requestVersion: context.requestVersion,
      assignmentId: assignment.id,
      assignmentVersion: assignment.version,
      reason: 'Trạng thái lớp được kiểm duyệt viên xác nhận.',
    };
    const [revoke, complete] = await Promise.all([
      api(`/admin/classes/${state.cls.id}/revoke`, jsonInit('POST', body, state.moderator)),
      api(`/admin/classes/${state.cls.id}/complete`, jsonInit('POST', body, state.moderator)),
    ]);
    expect([revoke.status, complete.status].sort()).toEqual([200, 409]);
    const finalResponse = await api(`/admin/classes/${state.cls.id}/lifecycle`, {
      headers: { Cookie: state.moderator.cookie },
    });
    const final = (await finalResponse.json<ApiSuccess<ClassLifecycle>>()).data;
    expect(final.events).toHaveLength(1);
    expect([
      { classStatus: 'open', requestStatus: 'sourcing', eventType: 'revoked' },
      { classStatus: 'completed', requestStatus: 'fulfilled', eventType: 'completed' },
    ]).toContainEqual({
      classStatus: final.classStatus,
      requestStatus: final.requestStatus,
      eventType: final.events[0]?.eventType,
    });
  });
});

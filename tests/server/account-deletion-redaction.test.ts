import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { AdminAssignment, ClassLifecycle } from '../../src/shared/schemas/admin-assignments';
import type { AdminClass, TutorApplication } from '../../src/shared/schemas/classes';
import type { ComplaintDetail } from '../../src/shared/schemas/complaints';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import { api, createPublicTutor, jsonInit, register, type Session } from './helpers';
import { passAndAcknowledgeTutorTerms, publishTutorTermsQuiz } from './terms-fixture';

const PRIVATE_MARKER = '0912345678';
const REDACTED = 'Đã ẩn thông tin';

async function moderator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

async function openClass(parent: Session, admin: Session) {
  const created = await api(
    '/parent/requests',
    jsonInit(
      'POST',
      {
        subjectId: 'subj_math',
        grade: 'Lớp 10',
        mode: 'offline',
        area: 'Cầu Giấy',
        expectedBudgetMinor: 250_000,
        description: `Yêu cầu học tại nhà; liên hệ ${PRIVATE_MARKER}.`,
        schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
        contactPhone: PRIVATE_MARKER,
        contactAddress: 'Số 12 đường riêng',
      },
      parent,
      { 'Idempotency-Key': crypto.randomUUID() },
    ),
  );
  expect(created.status).toBe(201);
  const draft = (await created.json<ApiSuccess<OwnParentRequest>>()).data;
  const submittedResponse = await api(
    `/parent/requests/${draft.id}/submit`,
    jsonInit('POST', { version: draft.version, consentToShareContact: true }, parent),
  );
  expect(submittedResponse.status).toBe(200);
  const submitted = (await submittedResponse.json<ApiSuccess<OwnParentRequest>>()).data;
  const classResponse = await api(
    '/admin/classes',
    jsonInit(
      'POST',
      { sourceRequestId: submitted.id, requestVersion: submitted.version, publicArea: 'Cầu Giấy' },
      admin,
    ),
  );
  expect(classResponse.status).toBe(201);
  const classDraft = (await classResponse.json<ApiSuccess<AdminClass>>()).data;
  const publishedResponse = await api(
    `/admin/classes/${classDraft.id}/publish`,
    jsonInit('POST', { version: classDraft.version }, admin),
  );
  expect(publishedResponse.status).toBe(200);
  return {
    request: submitted,
    cls: (await publishedResponse.json<ApiSuccess<AdminClass>>()).data,
  };
}

async function lifecycle(admin: Session, classId: string): Promise<ClassLifecycle> {
  const response = await api(`/admin/classes/${classId}/lifecycle`, {
    headers: { Cookie: admin.cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json<ApiSuccess<ClassLifecycle>>()).data;
}

async function publishedFee(admin: Session): Promise<string> {
  let selectedId = '';
  const now = new Date(Date.now() - 60_000).toISOString();
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
    if (!selectedId) selectedId = id;
    await env.DB.prepare(
      `INSERT INTO fee_option_versions
        (id, option_key, version, title, policy_text, rate_basis_points,
         deposit_basis_points, scope_subject_id, scope_mode, status,
         effective_from, effective_to, approved_by, published_at, mutation_id, created_at)
       VALUES (?, ?, ?, 'Test policy', 'Synthetic test-only fee policy.',
               ?, ?, 'subj_math', 'offline', 'published', NULL, NULL, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        key,
        (latest?.version ?? 0) + 1,
        rate,
        deposit,
        admin.userId,
        now,
        crypto.randomUUID(),
        now,
      )
      .run();
  }
  return selectedId;
}

async function applyTutor(admin: Session, cls: AdminClass) {
  const feeId = await publishedFee(admin);
  const tutor = await createPublicTutor({ teachesOffline: true });
  await publishTutorTermsQuiz(admin);
  await passAndAcknowledgeTutorTerms(tutor);
  const response = await api(
    `/classes/${cls.id}/applications`,
    jsonInit('POST', { feeOptionVersionId: feeId, classVersion: cls.version }, tutor, {
      'Idempotency-Key': crypto.randomUUID(),
    }),
  );
  expect(response.status).toBe(201);
  return { tutor, application: (await response.json<ApiSuccess<TutorApplication>>()).data };
}

async function deleteAccount(session: Session) {
  return api('/account/deletion', jsonInit('POST', { confirmation: 'DELETE' }, session));
}

describe('historical free-text redaction on account deletion', () => {
  it('redacts a cancelled class and its audit while preserving its outcome', async () => {
    const admin = await moderator();
    const parent = await register('parent');
    const { cls } = await openClass(parent, admin);
    const before = await lifecycle(admin, cls.id);
    const cancelledResponse = await api(
      `/admin/classes/${cls.id}/cancel`,
      jsonInit(
        'POST',
        {
          classVersion: before.classVersion,
          requestVersion: before.requestVersion,
          reason: `Gia đình đã đổi nhu cầu, liên hệ ${PRIVATE_MARKER}.`,
        },
        admin,
      ),
    );
    expect(cancelledResponse.status).toBe(200);
    await expect(
      env.DB.prepare('UPDATE class_cancellations SET reason = ? WHERE class_id = ?')
        .bind(REDACTED, cls.id)
        .run(),
    ).rejects.toThrow();

    expect((await deleteAccount(parent)).status).toBe(200);
    const event = await env.DB.prepare(
      'SELECT id, reason FROM class_cancellations WHERE class_id = ?',
    )
      .bind(cls.id)
      .first<{ id: string; reason: string }>();
    expect(event?.reason).toBe(REDACTED);
    const after = await lifecycle(admin, cls.id);
    expect(after).toMatchObject({
      classStatus: 'cancelled',
      requestStatus: 'cancelled',
      events: [expect.objectContaining({ id: event?.id, reason: REDACTED })],
    });
    const audit = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE action = 'class.cancelled' AND target_id = ?",
    )
      .bind(cls.id)
      .first<{ metadata: string }>();
    expect(audit?.metadata).not.toContain(PRIVATE_MARKER);
    await expect(
      env.DB.prepare('UPDATE class_cancellations SET reason = ? WHERE class_id = ?')
        .bind('Một lý do mới', cls.id)
        .run(),
    ).rejects.toThrow();
  });

  it('redacts a completed tutor assignment reason and preserves assignment history', async () => {
    const admin = await moderator();
    const parent = await register('parent');
    const { cls } = await openClass(parent, admin);
    const { tutor, application } = await applyTutor(admin, cls);
    const beforeAssign = await lifecycle(admin, cls.id);
    const assignmentResponse = await api(
      `/admin/classes/${cls.id}/assign`,
      jsonInit(
        'POST',
        {
          applicationId: application.id,
          applicationVersion: application.version,
          classVersion: beforeAssign.classVersion,
          requestVersion: beforeAssign.requestVersion,
          note: `Đã trao đổi qua ${PRIVATE_MARKER}.`,
        },
        admin,
      ),
    );
    expect(assignmentResponse.status).toBe(200);
    const assignment = (await assignmentResponse.json<ApiSuccess<AdminAssignment>>()).data;
    const beforeComplete = await lifecycle(admin, cls.id);
    const completeResponse = await api(
      `/admin/classes/${cls.id}/complete`,
      jsonInit(
        'POST',
        {
          assignmentId: assignment.id,
          assignmentVersion: beforeComplete.assignmentVersion,
          classVersion: beforeComplete.classVersion,
          requestVersion: beforeComplete.requestVersion,
          reason: `Gia sư đã hoàn tất, liên hệ ${PRIVATE_MARKER}.`,
        },
        admin,
      ),
    );
    expect(completeResponse.status).toBe(200);
    expect((await deleteAccount(tutor)).status).toBe(200);

    const event = await env.DB.prepare(
      'SELECT id, assignment_id, event_type, reason FROM class_lifecycle_events WHERE class_id = ?',
    )
      .bind(cls.id)
      .first<{ id: string; assignment_id: string; event_type: string; reason: string }>();
    expect(event).toMatchObject({
      assignment_id: assignment.id,
      event_type: 'completed',
      reason: REDACTED,
    });
    const after = await lifecycle(admin, cls.id);
    expect(after).toMatchObject({
      classStatus: 'completed',
      requestStatus: 'fulfilled',
      events: [expect.objectContaining({ id: event?.id, reason: REDACTED })],
    });
    const audits = await env.DB.prepare(
      `SELECT metadata FROM audit_logs WHERE target_type = 'class_assignment' AND target_id = ?`,
    )
      .bind(assignment.id)
      .all<{ metadata: string }>();
    expect(JSON.stringify(audits.results)).not.toContain(PRIVATE_MARKER);
    await expect(
      env.DB.prepare('UPDATE class_lifecycle_events SET event_type = ? WHERE id = ?')
        .bind('revoked', event?.id)
        .run(),
    ).rejects.toThrow();
  });

  it('redacts a rejected tutor application and a related parent complaint', async () => {
    const admin = await moderator();
    const parent = await register('parent');
    const { cls } = await openClass(parent, admin);
    const { tutor, application } = await applyTutor(admin, cls);
    const complaintResponse = await api(
      '/complaints',
      jsonInit(
        'POST',
        {
          classId: cls.id,
          title: 'Cần kiểm tra ứng tuyển',
          body: `Thông tin ứng viên cần đối chiếu qua ${PRIVATE_MARKER}.`,
        },
        parent,
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    );
    expect(complaintResponse.status).toBe(201);
    const complaint = (await complaintResponse.json<ApiSuccess<ComplaintDetail>>()).data;
    const rejected = await api(
      `/admin/applications/${application.id}/reject`,
      jsonInit(
        'POST',
        { version: application.version, reason: `Ứng viên liên hệ ${PRIVATE_MARKER}.` },
        admin,
      ),
    );
    expect(rejected.status).toBe(200);
    expect((await deleteAccount(tutor)).status).toBe(200);

    const app = await env.DB.prepare(
      'SELECT id, status, rejection_reason FROM tutor_applications WHERE id = ?',
    )
      .bind(application.id)
      .first<{ id: string; status: string; rejection_reason: string }>();
    expect(app).toMatchObject({
      id: application.id,
      status: 'rejected',
      rejection_reason: REDACTED,
    });
    const complaintAfter = await env.DB.prepare(
      'SELECT id, status, title, body FROM complaints WHERE id = ?',
    )
      .bind(complaint.id)
      .first<{ id: string; status: string; title: string; body: string }>();
    expect(complaintAfter).toMatchObject({ id: complaint.id, status: 'submitted' });
    expect(JSON.stringify(complaintAfter)).not.toContain(PRIVATE_MARKER);
    const audit = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE action = 'application.rejected' AND target_id = ?",
    )
      .bind(application.id)
      .first<{ metadata: string }>();
    expect(audit?.metadata).not.toContain(PRIVATE_MARKER);
    const stillOpen = await lifecycle(admin, cls.id);
    expect(stillOpen.classStatus).toBe('open');
    expect(stillOpen.requestStatus).toBe('sourcing');
  });
});

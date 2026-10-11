import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { AdminClass } from '../../src/shared/schemas/classes';
import type { Page } from '../../src/shared/schemas/discovery';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import type {
  AdminReportOverview,
  ConversionReport,
  NoTutorClass,
  ParentDashboard,
  RevenueReport,
  TutorDashboard,
} from '../../src/shared/schemas/reports';
import { todayIn } from '../../src/shared/time';
import { api, jsonInit, register, type Session } from './helpers';

async function moderator(): Promise<Session> {
  const user = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.userId).run();
  return user;
}

async function submittedRequest(parent: Session): Promise<OwnParentRequest> {
  const created = await api(
    '/parent/requests',
    jsonInit(
      'POST',
      {
        subjectId: 'subj_math',
        grade: 'Lớp 10',
        mode: 'online',
        area: 'Hà Nội',
        expectedBudgetMinor: 250_000,
        description: 'Cần gia sư Toán lớp 10.',
        schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
        contactPhone: '0912345678',
        contactAddress: 'Thông tin riêng của phụ huynh',
      },
      parent,
      { 'Idempotency-Key': crypto.randomUUID() },
    ),
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

async function openClass(admin: Session, request: OwnParentRequest): Promise<AdminClass> {
  expect(request.publishedClassId).toBeTruthy();
  const response = await api(`/admin/classes/${request.publishedClassId}`, {
    headers: { Cookie: admin.cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json<ApiSuccess<AdminClass>>()).data;
}

function period(day: string) {
  return `?from=${day}&to=${day}&timeZone=Asia%2FHo_Chi_Minh`;
}

describe('verified reports and role dashboards', () => {
  it('reports D1 request cohort and open class without leaking parent contact', async () => {
    const admin = await moderator();
    const parent = await register('parent');
    const request = await submittedRequest(parent);
    const cls = await openClass(admin, request);
    const day = todayIn('Asia/Ho_Chi_Minh');

    const overviewResponse = await api(`/admin/reports/overview${period(day)}`, {
      headers: { Cookie: admin.cookie },
    });
    expect(overviewResponse.status).toBe(200);
    const overview = (await overviewResponse.json<ApiSuccess<AdminReportOverview>>()).data;
    expect(overview).toMatchObject({
      openClasses: 1,
      openWithoutApplications: 1,
      conversion: {
        submittedRequests: 1,
        publishedClasses: 1,
        assignedClasses: 0,
        publishRatePercent: 100,
        assignRatePercent: 0,
      },
      revenue: { available: false, reason: 'NO_VERIFIED_PAYMENT_SOURCE' },
    });
    const noTutorResponse = await api(`/admin/reports/no-tutor${period(day)}&pageSize=1`, {
      headers: { Cookie: admin.cookie },
    });
    expect(noTutorResponse.status).toBe(200);
    const noTutor = (await noTutorResponse.json<ApiSuccess<Page<NoTutorClass>>>()).data;
    expect(noTutor).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(noTutor.items[0]).toMatchObject({ id: cls.id, submittedApplicationCount: 0 });
    expect(JSON.stringify({ overview, noTutor })).not.toContain('0912345678');
    expect(JSON.stringify({ overview, noTutor })).not.toContain('Thông tin riêng');

    expect((await api(`/admin/reports/overview${period(day)}`)).status).toBe(401);
    expect(
      (
        await api(`/admin/reports/overview${period(day)}`, {
          headers: { Cookie: parent.cookie },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('/admin/reports/overview?from=2026-05-03&to=2026-05-01', {
          headers: { Cookie: admin.cookie },
        })
      ).status,
    ).toBe(422);
  });

  it('uses Vietnam local day boundaries for the submitted-request cohort', async () => {
    const admin = await moderator();
    const parent = await register('parent');
    const request = await submittedRequest(parent);
    await env.DB.prepare(
      "UPDATE audit_logs SET created_at = '2026-05-01T17:00:00.000Z' WHERE action = 'parent_request.submitted' AND target_id = ?",
    )
      .bind(request.id)
      .run();

    const before = await api(`/admin/reports/conversion${period('2026-05-01')}`, {
      headers: { Cookie: admin.cookie },
    });
    const after = await api(`/admin/reports/conversion${period('2026-05-02')}`, {
      headers: { Cookie: admin.cookie },
    });
    expect(before.status).toBe(200);
    expect(after.status).toBe(200);
    expect((await before.json<ApiSuccess<ConversionReport>>()).data.submittedRequests).toBe(0);
    expect((await after.json<ApiSuccess<ConversionReport>>()).data.submittedRequests).toBe(1);
  });

  it('scopes parent and tutor dashboards and leaves revenue unavailable', async () => {
    const admin = await moderator();
    const parent = await register('parent');
    const otherParent = await register('parent');
    const tutor = await register('tutor');
    await submittedRequest(parent);
    const own = await api('/parent/dashboard', { headers: { Cookie: parent.cookie } });
    const other = await api('/parent/dashboard', { headers: { Cookie: otherParent.cookie } });
    const ownTutor = await api('/tutor/dashboard', { headers: { Cookie: tutor.cookie } });
    expect((await own.json<ApiSuccess<ParentDashboard>>()).data).toMatchObject({
      submittedRequests: 0,
      sourcingRequests: 1,
      cancelledRequests: 0,
    });
    expect((await other.json<ApiSuccess<ParentDashboard>>()).data).toMatchObject({
      submittedRequests: 0,
      cancelledRequests: 0,
    });
    expect((await ownTutor.json<ApiSuccess<TutorDashboard>>()).data).toMatchObject({
      submittedApplications: 0,
      selectedApplications: 0,
      activeAssignments: 0,
    });
    expect((await api('/parent/dashboard', { headers: { Cookie: tutor.cookie } })).status).toBe(
      403,
    );
    expect((await api('/tutor/dashboard', { headers: { Cookie: parent.cookie } })).status).toBe(
      403,
    );
    const day = todayIn('Asia/Ho_Chi_Minh');
    const revenue = await api(`/admin/reports/revenue${period(day)}`, {
      headers: { Cookie: admin.cookie },
    });
    expect((await revenue.json<ApiSuccess<RevenueReport>>()).data).toMatchObject({
      available: false,
      reason: 'NO_VERIFIED_PAYMENT_SOURCE',
    });
  });
});

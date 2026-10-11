import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type {
  AdminComplaintDetail,
  AdminComplaintSummary,
  ComplaintDetail,
  ComplaintSummary,
} from '../../src/shared/schemas/complaints';
import type { Page } from '../../src/shared/schemas/discovery';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

const COMPLAINT_BODY = 'Tôi cần kiểm duyệt viên xem xét vấn đề của lớp.';
const PRIVATE_PHONE = '0912345678';
const PRIVATE_ADDRESS = 'Số 12, đường Thử Nghiệm';

async function moderator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

async function createComplaint(session: Session, classId: string | null = null) {
  return api(
    '/complaints',
    jsonInit('POST', { classId, title: 'Cần hỗ trợ về lớp', body: COMPLAINT_BODY }, session, {
      'Idempotency-Key': crypto.randomUUID(),
    }),
  );
}

describe('complaints and account privacy', () => {
  it('scopes complaint detail to author, gives moderator a private queue and rejects stale transitions', async () => {
    const parent = await register('parent');
    const other = await register('parent');
    const tutor = await register('tutor');
    const admin = await moderator();

    expect((await createComplaint(parent)).status).toBe(201);
    const created = (await (await createComplaint(tutor)).json<ApiSuccess<ComplaintDetail>>()).data;
    expect(created.status).toBe('submitted');
    expect((await api('/complaints')).status).toBe(401);
    expect((await api('/complaints', jsonInit('POST', {}, admin))).status).toBe(403);
    expect(
      (await api(`/complaints/${created.id}`, { headers: { Cookie: other.cookie } })).status,
    ).toBe(404);
    expect(
      (await api(`/complaints/${created.id}`, { headers: { Cookie: parent.cookie } })).status,
    ).toBe(404);
    expect(
      (await api(`/complaints/${created.id}`, { headers: { Cookie: tutor.cookie } })).status,
    ).toBe(200);

    const ownPage = await api('/complaints?page=1&pageSize=1', {
      headers: { Cookie: tutor.cookie },
    });
    expect(ownPage.status).toBe(200);
    const own = (await ownPage.json<ApiSuccess<Page<ComplaintSummary>>>()).data;
    expect(own.items).toHaveLength(1);
    expect(own.items[0]?.id).toBe(created.id);
    expect(JSON.stringify(own)).not.toContain('creatorUserId');
    expect(
      (await api('/complaints?pageSize=49', { headers: { Cookie: tutor.cookie } })).status,
    ).toBe(422);

    const adminPage = await api('/admin/complaints?status=submitted', {
      headers: { Cookie: admin.cookie },
    });
    expect(adminPage.status).toBe(200);
    const queue = (await adminPage.json<ApiSuccess<Page<AdminComplaintSummary>>>()).data;
    expect(queue.items.find(({ id }) => id === created.id)).toMatchObject({
      creatorUserId: tutor.userId,
      creatorRole: 'tutor',
    });
    expect(JSON.stringify(queue)).not.toContain(COMPLAINT_BODY);
    expect((await api('/admin/complaints', { headers: { Cookie: tutor.cookie } })).status).toBe(
      403,
    );
    expect((await createComplaint(other, crypto.randomUUID())).status).toBe(404);

    const detailResponse = await api(`/admin/complaints/${created.id}`, {
      headers: { Cookie: admin.cookie },
    });
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json<ApiSuccess<AdminComplaintDetail>>()).data;
    expect(detail.body).toBe(COMPLAINT_BODY);

    const triage = await api(
      `/admin/complaints/${created.id}/triage`,
      jsonInit('POST', { version: detail.version, reason: 'Cần đối chiếu thông tin lớp.' }, admin),
    );
    expect(triage.status).toBe(200);
    const triaged = (await triage.json<ApiSuccess<AdminComplaintDetail>>()).data;
    expect(triaged.status).toBe('in_review');
    expect(triaged.triageReason).toBe('Cần đối chiếu thông tin lớp.');
    expect(
      await errorCode(
        await api(
          `/admin/complaints/${created.id}/triage`,
          jsonInit('POST', { version: detail.version, reason: 'Lặp thao tác' }, admin),
        ),
      ),
    ).toBe('STALE_COMPLAINT');

    const resolve = await api(
      `/admin/complaints/${created.id}/resolve`,
      jsonInit('POST', { version: triaged.version, resolution: 'Đã kiểm tra và phản hồi.' }, admin),
    );
    expect(resolve.status).toBe(200);
    const resolved = (await resolve.json<ApiSuccess<AdminComplaintDetail>>()).data;
    expect(resolved.status).toBe('resolved');
    expect(
      await errorCode(
        await api(
          `/admin/complaints/${created.id}/resolve`,
          jsonInit('POST', { version: triaged.version, resolution: 'Lặp thao tác' }, admin),
        ),
      ),
    ).toBe('STALE_COMPLAINT');
    const ownerDetail = await api(`/complaints/${created.id}`, {
      headers: { Cookie: tutor.cookie },
    });
    expect((await ownerDetail.json<ApiSuccess<ComplaintDetail>>()).data.resolution).toBe(
      'Đã kiểm tra và phản hồi.',
    );
    const audits = await env.DB.prepare(
      "SELECT action, actor_id, metadata FROM audit_logs WHERE target_type = 'complaint' AND target_id = ? ORDER BY created_at",
    )
      .bind(created.id)
      .all<{ action: string; actor_id: string; metadata: string }>();
    expect(audits.results.map(({ action }) => action)).toContain('complaint.in_review');
    expect(audits.results.map(({ action }) => action)).toContain('complaint.resolved');
    expect(audits.results.map(({ action }) => action)).toContain('complaint.detail_viewed');
    expect(audits.results.find(({ action }) => action === 'complaint.resolved')?.actor_id).toBe(
      admin.userId,
    );
    expect(JSON.stringify(audits.results)).not.toContain(COMPLAINT_BODY);
  });

  it('deidentifies a parent account atomically and revokes all sessions while retaining request history', async () => {
    const parent = await register('parent');
    const requestResponse = await api(
      '/parent/requests',
      jsonInit(
        'POST',
        {
          subjectId: 'subj_math',
          grade: 'Lớp 10',
          mode: 'offline',
          area: 'Hà Nội',
          expectedBudgetMinor: 250_000,
          description: 'Thông tin riêng về học sinh trong yêu cầu.',
          schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
          contactPhone: PRIVATE_PHONE,
          contactAddress: PRIVATE_ADDRESS,
        },
        parent,
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    );
    expect(requestResponse.status).toBe(201);
    const request = (await requestResponse.json<ApiSuccess<OwnParentRequest>>()).data;
    const complaintResponse = await createComplaint(parent);
    expect(complaintResponse.status).toBe(201);
    const complaint = (await complaintResponse.json<ApiSuccess<ComplaintDetail>>()).data;

    expect(
      (await api('/account/deletion', jsonInit('POST', { confirmation: 'NO' }, parent))).status,
    ).toBe(422);
    const deleted = await api(
      '/account/deletion',
      jsonInit('POST', { confirmation: 'DELETE' }, parent),
    );
    expect(deleted.status).toBe(200);
    expect(deleted.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await api('/me', { headers: { Cookie: parent.cookie } })).status).toBe(401);

    const user = await env.DB.prepare('SELECT email, display_name, status FROM users WHERE id = ?')
      .bind(parent.userId)
      .first<{ email: string; display_name: string; status: string }>();
    expect(user).toMatchObject({ display_name: 'Tài khoản đã xóa', status: 'suspended' });
    expect(user?.email).not.toBe(parent.email);
    const keptRequest = await env.DB.prepare(
      'SELECT id, area, description FROM parent_requests WHERE id = ?',
    )
      .bind(request.id)
      .first<{ id: string; area: string; description: string }>();
    expect(keptRequest?.id).toBe(request.id);
    expect(keptRequest?.area).not.toBe('Hà Nội');
    expect(keptRequest?.description).not.toContain('học sinh');
    const contact = await env.DB.prepare(
      'SELECT * FROM parent_request_private WHERE request_id = ?',
    )
      .bind(request.id)
      .first();
    expect(contact).toBeNull();
    const ownComplaint = await env.DB.prepare('SELECT title, body FROM complaints WHERE id = ?')
      .bind(complaint.id)
      .first<{ title: string; body: string }>();
    expect(ownComplaint?.body).not.toBe(COMPLAINT_BODY);
    for (const table of [
      'auth_sessions',
      'auth_credentials',
      'parent_profiles',
      'idempotency_keys',
    ]) {
      const row = await env.DB.prepare(
        `SELECT count(*) AS total FROM ${table} WHERE ${table === 'idempotency_keys' ? 'actor_id' : 'user_id'} = ?`,
      )
        .bind(parent.userId)
        .first<{ total: number }>();
      expect(row?.total).toBe(0);
    }
    const audit = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE action = 'account.deleted' AND target_id = ?",
    )
      .bind(parent.userId)
      .first<{ metadata: string }>();
    expect(audit?.metadata).toContain('deidentified');
    expect(audit?.metadata).not.toContain(PRIVATE_PHONE);
    expect(audit?.metadata).not.toContain(PRIVATE_ADDRESS);
    await expect(
      env.DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(parent.userId).run(),
    ).rejects.toThrow();
  });

  it('returns 409 and keeps contact and session when a submitted request is still active', async () => {
    const parent = await register('parent');
    const created = await api(
      '/parent/requests',
      jsonInit(
        'POST',
        {
          subjectId: 'subj_math',
          grade: 'Lớp 10',
          mode: 'online',
          area: null,
          expectedBudgetMinor: 250_000,
          description: 'Yêu cầu đang được tìm gia sư.',
          schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
          contactPhone: PRIVATE_PHONE,
          contactAddress: null,
        },
        parent,
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    );
    const request = (await created.json<ApiSuccess<OwnParentRequest>>()).data;
    const submit = await api(
      `/parent/requests/${request.id}/submit`,
      jsonInit('POST', { version: request.version, consentToShareContact: true }, parent),
    );
    expect(submit.status).toBe(200);
    const attempt = await api(
      '/account/deletion',
      jsonInit('POST', { confirmation: 'DELETE' }, parent),
    );
    expect(attempt.status).toBe(409);
    expect(await errorCode(attempt)).toBe('ACCOUNT_HAS_ACTIVE_OBLIGATIONS');
    expect((await api('/me', { headers: { Cookie: parent.cookie } })).status).toBe(200);
    const contact = await env.DB.prepare(
      'SELECT contact_phone FROM parent_request_private WHERE request_id = ?',
    )
      .bind(request.id)
      .first<{ contact_phone: string }>();
    expect(contact?.contact_phone).toBe(PRIVATE_PHONE);
    const audit = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE action = 'account.deletion_blocked' AND target_id = ?",
    )
      .bind(parent.userId)
      .first<{ metadata: string }>();
    expect(audit?.metadata).toContain('active_obligations');
    expect(audit?.metadata).not.toContain(PRIVATE_PHONE);
  });

  it('blocks deletion while a legacy booking is pending and bounds open complaints', async () => {
    const parent = await register('parent');
    const tutor = await register('tutor');
    const bookingId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO bookings
        (id, tutor_id, student_id, starts_at_utc, ends_at_utc, duration_minutes,
         status, hourly_rate_minor, price_minor, currency, created_at, updated_at, version)
       VALUES (?, ?, ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z',
         60, 'PENDING', 100000, 100000, 'VND', ?, ?, 1)`,
    )
      .bind(
        bookingId,
        tutor.userId,
        parent.userId,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
    const deletion = await api(
      '/account/deletion',
      jsonInit('POST', { confirmation: 'DELETE' }, parent),
    );
    expect(deletion.status).toBe(409);
    expect(await errorCode(deletion)).toBe('ACCOUNT_HAS_ACTIVE_OBLIGATIONS');
    expect((await api('/me', { headers: { Cookie: parent.cookie } })).status).toBe(200);

    for (let index = 0; index < 10; index++) {
      expect((await createComplaint(tutor)).status).toBe(201);
    }
    const overQuota = await createComplaint(tutor);
    expect(overQuota.status).toBe(409);
    expect(await errorCode(overQuota)).toBe('COMPLAINT_QUOTA_EXCEEDED');
  });
});

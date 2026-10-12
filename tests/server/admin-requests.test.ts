import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type {
  AdminRequestDetail,
  AdminRequestSummary,
} from '../../src/shared/schemas/admin-requests';
import type { Page } from '../../src/shared/schemas/discovery';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import { api, jsonInit, register, type Session } from './helpers';

const CONTACT_PHONE = '0912345678';
const CONTACT_ADDRESS = 'Số 10, đường thử nghiệm';
const INPUT = {
  subjectId: 'subj_math',
  grade: 'Lớp 10',
  mode: 'offline',
  area: 'Cầu Giấy, Hà Nội',
  expectedBudgetMinor: 250_000,
  description: 'Cần gia sư Toán buổi tối.',
  schedule: {
    timezone: 'Asia/Ho_Chi_Minh',
    discussLater: false,
    windows: [{ weekday: 1, startLocal: '18:00', endLocal: '19:30' }],
  },
  contactPhone: CONTACT_PHONE,
  studentName: 'Học sinh mẫu',
  contactAddress: CONTACT_ADDRESS,
} as const;

async function makeModerator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

async function createRequest(parent: Session): Promise<OwnParentRequest> {
  const response = await api(
    '/parent/requests',
    jsonInit('POST', INPUT, parent, { 'Idempotency-Key': crypto.randomUUID() }),
  );
  expect(response.status).toBe(201);
  return (await response.json<ApiSuccess<OwnParentRequest>>()).data;
}

async function submitRequest(parent: Session, request: OwnParentRequest) {
  const response = await api(
    `/parent/requests/${request.id}/submit`,
    jsonInit('POST', { version: request.version, consentToShareContact: true }, parent),
  );
  expect(response.status).toBe(200);
  return (await response.json<ApiSuccess<OwnParentRequest>>()).data;
}

const adminGet = (path: string, moderator: Session) =>
  api(`/admin/requests${path}`, { headers: { Cookie: moderator.cookie } });

describe('moderator find-tutor requests', () => {
  it('is moderator-only and keeps unsubmitted parent drafts outside the queue', async () => {
    const moderator = await makeModerator();
    const parent = await register('parent');
    const tutor = await register('tutor');
    const draft = await createRequest(parent);

    for (const path of ['', `/${draft.id}`]) {
      expect((await api(`/admin/requests${path}`)).status).toBe(401);
      expect(
        (await api(`/admin/requests${path}`, { headers: { Cookie: parent.cookie } })).status,
      ).toBe(403);
      expect(
        (await api(`/admin/requests${path}`, { headers: { Cookie: tutor.cookie } })).status,
      ).toBe(403);
    }

    const queue = await adminGet('', moderator);
    expect(queue.status).toBe(200);
    const page = (await queue.json<ApiSuccess<Page<AdminRequestSummary>>>()).data;
    expect(page.items.some(({ id }) => id === draft.id)).toBe(false);
    expect((await adminGet(`/${draft.id}`, moderator)).status).toBe(404);
    expect((await adminGet('?status=draft', moderator)).status).toBe(422);
  });

  it('lists confirmed sourcing requests without contact and gives only the moderator a private detail', async () => {
    const moderator = await makeModerator();
    const parent = await register('parent');
    const otherParent = await register('parent');
    const submitted = await submitRequest(parent, await createRequest(parent));

    const response = await adminGet('?status=sourcing&pageSize=48', moderator);
    expect(response.status).toBe(200);
    const page = (await response.json<ApiSuccess<Page<AdminRequestSummary>>>()).data;
    const item = page.items.find(({ id }) => id === submitted.id);
    expect(item).toMatchObject({
      status: 'sourcing',
      schedule: INPUT.schedule,
      expectedBudgetMinor: INPUT.expectedBudgetMinor,
    });
    expect(JSON.stringify(page)).not.toContain(CONTACT_PHONE);
    expect(JSON.stringify(page)).not.toContain(CONTACT_ADDRESS);
    expect(JSON.stringify(page)).not.toContain('contactConsent');

    const detailResponse = await adminGet(`/${submitted.id}`, moderator);
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json<ApiSuccess<AdminRequestDetail>>()).data;
    expect(detail).toMatchObject({
      id: submitted.id,
      parentUserId: parent.userId,
      status: 'sourcing',
      contactPhone: CONTACT_PHONE,
      studentName: 'Học sinh mẫu',
      contactAddress: CONTACT_ADDRESS,
      contactConsentVersion: submitted.contactConsentVersion,
      contactConsentAt: submitted.contactConsentAt,
    });
    expect(detail.parentDisplayName).toBeTruthy();
    expect(
      (await api(`/parent/requests/${submitted.id}`, { headers: { Cookie: otherParent.cookie } }))
        .status,
    ).toBe(404);
    expect((await api(`/parent/requests/${submitted.id}`)).status).toBe(401);
  });

  it('validates filters, paginates deterministically and returns 404 for an unknown request', async () => {
    const moderator = await makeModerator();
    const parent = await register('parent');
    await submitRequest(parent, await createRequest(parent));
    await submitRequest(parent, await createRequest(parent));

    const first = await adminGet('?status=sourcing&page=1&pageSize=1', moderator);
    const second = await adminGet('?status=sourcing&page=2&pageSize=1', moderator);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = (await first.json<ApiSuccess<Page<AdminRequestSummary>>>()).data;
    const b = (await second.json<ApiSuccess<Page<AdminRequestSummary>>>()).data;
    expect(a.page).toBe(1);
    expect(b.page).toBe(2);
    expect(a.pageSize).toBe(1);
    expect(a.total).toBeGreaterThanOrEqual(2);
    expect(a.items).toHaveLength(1);
    expect(b.items).toHaveLength(1);
    expect(a.items[0]?.id).not.toBe(b.items[0]?.id);

    for (const query of ['?status=unknown', '?page=0', '?pageSize=49', '?pageSize=0']) {
      expect((await adminGet(query, moderator)).status).toBe(422);
    }
    expect((await adminGet(`/${crypto.randomUUID()}`, moderator)).status).toBe(404);
  });
});

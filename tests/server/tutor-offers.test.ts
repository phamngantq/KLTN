import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { AdminContent } from '../../src/shared/schemas/content';
import type { Page } from '../../src/shared/schemas/discovery';
import type {
  PublicTutorOffer,
  TutorOffer,
  TutorOfferContract,
} from '../../src/shared/schemas/tutor-offers';
import { api, createPublicTutor, errorCode, jsonInit, register, type Session } from './helpers';

const fields = {
  subjectId: 'subj_math',
  grade: 'Lớp 10',
  mode: 'online',
  area: null,
  proposedTuitionPerSessionMinor: 200_000,
  contactPhone: '0912345678',
} as const;

async function moderator(): Promise<Session> {
  const user = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.userId).run();
  return user;
}

async function publishOfferContract(admin: Session): Promise<TutorOfferContract> {
  const current = await api('/tutor/offers/contract', { headers: { Cookie: admin.cookie } });
  // This route is tutor-only. Find or publish through moderator content APIs.
  expect(current.status).toBe(403);
  const list = await api('/admin/content?kind=contract&audience=tutor&status=published', {
    headers: { Cookie: admin.cookie },
  });
  const content = (await list.json<ApiSuccess<Page<AdminContent>>>()).data.items.find(
    (item) => item.slug === 'tutor-student-offer-contract',
  );
  if (content) {
    return {
      id: content.id,
      revision: content.revision,
      title: content.title,
      bodyText: content.bodyText,
    };
  }
  const create = await api(
    '/admin/content',
    jsonInit(
      'POST',
      {
        kind: 'contract',
        slug: 'tutor-student-offer-contract',
        audience: 'tutor',
        title: 'Synthetic tutor offer contract',
        summary: '',
        bodyText: 'Synthetic test-only contract for tutor-origin listing.',
      },
      admin,
    ),
  );
  expect(create.status).toBe(201);
  const draft = (await create.json<ApiSuccess<AdminContent>>()).data;
  const publish = await api(
    `/admin/content/${draft.id}/publish`,
    jsonInit('POST', { editVersion: draft.editVersion }, admin),
  );
  expect(publish.status).toBe(200);
  const item = (await publish.json<ApiSuccess<AdminContent>>()).data;
  return { id: item.id, revision: item.revision, title: item.title, bodyText: item.bodyText };
}

async function draft(tutor: Session, overrides: Record<string, unknown> = {}): Promise<TutorOffer> {
  const response = await api('/tutor/offers', jsonInit('POST', { ...fields, ...overrides }, tutor));
  expect(response.status).toBe(201);
  return (await response.json<ApiSuccess<TutorOffer>>()).data;
}

describe('tutor-origin student offers', () => {
  it('requires approved matching tutor profile and validates ownership, pricing and public privacy', async () => {
    const parent = await register('parent');
    const unapproved = await register('tutor');
    const tutor = await createPublicTutor();
    const otherTutor = await createPublicTutor();
    expect((await api('/tutor/offers', jsonInit('POST', fields, parent))).status).toBe(403);
    const unapprovedCreate = await api('/tutor/offers', jsonInit('POST', fields, unapproved));
    expect(unapprovedCreate.status).toBe(409);
    expect(await errorCode(unapprovedCreate)).toBe('TUTOR_OFFER_CREATE_NOT_ALLOWED');
    expect(
      (
        await api(
          '/tutor/offers',
          jsonInit('POST', { ...fields, proposedTuitionPerSessionMinor: 0 }, tutor),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await api(
          '/tutor/offers',
          jsonInit('POST', { ...fields, subjectId: 'subj_english' }, tutor),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await api(
          '/tutor/offers',
          jsonInit('POST', { ...fields, mode: 'offline', area: null }, tutor),
        )
      ).status,
    ).toBe(422);
    expect(
      (await api('/tutor/offers', jsonInit('POST', { ...fields, area: 'Số 42 phố X' }, tutor)))
        .status,
    ).toBe(422);
    expect(
      (await api('/tutor/offers', jsonInit('POST', { ...fields, contactPhone: 'abc' }, tutor)))
        .status,
    ).toBe(422);
    const item = await draft(tutor);
    expect(item).toMatchObject({
      status: 'draft',
      version: 1,
      tutorUserId: tutor.userId,
      contactPhone: fields.contactPhone,
    });
    expect((await api(`/tutor-offers/${item.id}`)).status).toBe(404);
    expect(
      (await api(`/tutor/offers/${item.id}`, { headers: { Cookie: otherTutor.cookie } })).status,
    ).toBe(404);
    expect(
      (await api(`/tutor/offers/${item.id}`, { headers: { Cookie: parent.cookie } })).status,
    ).toBe(403);
    const own = await api('/tutor/offers', { headers: { Cookie: tutor.cookie } });
    expect((await own.json<ApiSuccess<Page<TutorOffer>>>()).data.items).toContainEqual(
      expect.objectContaining({ id: item.id }),
    );
  });

  it('snapshots a published contract before moderator approval and hides contact/private fields publicly', async () => {
    const admin = await moderator();
    const tutor = await createPublicTutor({ teachesOffline: true });
    const item = await draft(tutor, { mode: 'offline', area: 'Thanh Xuân, Hà Nội' });
    const noPolicy = await api('/tutor/offers/contract', { headers: { Cookie: tutor.cookie } });
    if (noPolicy.status === 409)
      expect(await errorCode(noPolicy)).toBe('TUTOR_OFFER_CONTRACT_UNAVAILABLE');
    const contract = await publishOfferContract(admin);
    const visiblePolicy = await api('/tutor/offers/contract', {
      headers: { Cookie: tutor.cookie },
    });
    expect(visiblePolicy.status).toBe(200);
    expect((await visiblePolicy.json<ApiSuccess<TutorOfferContract>>()).data.id).toBe(contract.id);
    const noContactConsent = await api(
      `/tutor/offers/${item.id}/submit`,
      jsonInit(
        'POST',
        {
          version: item.version,
          contractRevisionId: contract.id,
          acknowledged: true,
        },
        tutor,
      ),
    );
    expect(noContactConsent.status).toBe(422);
    const stalePolicy = await api(
      `/tutor/offers/${item.id}/submit`,
      jsonInit(
        'POST',
        {
          version: item.version,
          contractRevisionId: crypto.randomUUID(),
          acknowledged: true,
          shareContactAfterApproval: true,
        },
        tutor,
      ),
    );
    expect(stalePolicy.status).toBe(409);
    const submittedResponse = await api(
      `/tutor/offers/${item.id}/submit`,
      jsonInit(
        'POST',
        {
          version: item.version,
          contractRevisionId: contract.id,
          acknowledged: true,
          shareContactAfterApproval: true,
        },
        tutor,
      ),
    );
    expect(submittedResponse.status).toBe(200);
    const submitted = (await submittedResponse.json<ApiSuccess<TutorOffer>>()).data;
    expect(submitted).toMatchObject({
      status: 'pending',
      version: 2,
      contractRevisionId: contract.id,
      contractRevision: contract.revision,
      contractBodyText: contract.bodyText,
      contactPhone: fields.contactPhone,
      contactShareConsentVersion: '2026-10-12-v1',
    });
    expect(submitted.acknowledgedAt).toBeTruthy();
    expect(submitted.contactShareConsentAt).toBeTruthy();
    const ack = await env.DB.prepare(
      'SELECT count(*) AS count, max(contact_share_consent_version) AS consent_version FROM tutor_offer_contract_acks WHERE offer_id = ?',
    )
      .bind(item.id)
      .first<{ count: number; consent_version: string | null }>();
    expect(ack?.count).toBe(1);
    expect(ack?.consent_version).toBe('2026-10-12-v1');
    expect((await api(`/tutor-offers/${item.id}`)).status).toBe(404);
    const parent = await register('parent');
    expect(
      (
        await api(
          `/admin/tutor-offers/${item.id}/approve`,
          jsonInit('POST', { version: 2 }, parent),
        )
      ).status,
    ).toBe(403);
    const staleReview = await api(
      `/admin/tutor-offers/${item.id}/approve`,
      jsonInit('POST', { version: 1 }, admin),
    );
    expect(staleReview.status).toBe(409);
    const approve = await api(
      `/admin/tutor-offers/${item.id}/approve`,
      jsonInit('POST', { version: 2 }, admin),
    );
    expect(approve.status).toBe(200);
    const published = (await approve.json<ApiSuccess<TutorOffer>>()).data;
    expect(published).toMatchObject({ status: 'published', version: 3, reviewedBy: admin.userId });
    expect(
      (await api(`/admin/tutor-offers/${item.id}/approve`, jsonInit('POST', { version: 2 }, admin)))
        .status,
    ).toBe(409);
    const publicResponse = await api(`/tutor-offers/${item.id}`);
    expect(publicResponse.status).toBe(200);
    const publicItem = (await publicResponse.json<ApiSuccess<PublicTutorOffer>>()).data;
    expect(publicItem).toMatchObject({
      id: item.id,
      area: null,
      subjectName: 'Toán',
      proposedTuitionPerSessionMinor: 200_000,
    });
    expect(publicItem).not.toHaveProperty('tutorUserId');
    expect(publicItem).not.toHaveProperty('contactPhone');
    expect(publicItem).not.toHaveProperty('contactShareConsentVersion');
    expect(JSON.stringify(publicItem)).not.toContain(fields.contactPhone);
    expect(publicItem).not.toHaveProperty('contractBodyText');
    expect(publicItem).not.toHaveProperty('reviewedBy');
    const publicList = await api('/tutor-offers?subjectId=subj_math&mode=offline');
    expect((await publicList.json<ApiSuccess<Page<PublicTutorOffer>>>()).data.items).toContainEqual(
      expect.objectContaining({ id: item.id }),
    );
    await env.DB.prepare("UPDATE tutor_profiles SET approval_status = 'rejected' WHERE user_id = ?")
      .bind(tutor.userId)
      .run();
    expect((await api(`/tutor-offers/${item.id}`)).status).toBe(404);
    await env.DB.prepare("UPDATE tutor_profiles SET approval_status = 'approved' WHERE user_id = ?")
      .bind(tutor.userId)
      .run();
    const blockedDelete = await api(
      '/account/deletion',
      jsonInit('POST', { confirmation: 'DELETE' }, tutor),
    );
    expect(blockedDelete.status).toBe(409);
    expect(await errorCode(blockedDelete)).toBe('ACCOUNT_HAS_ACTIVE_OBLIGATIONS');
    const close = await api(
      `/tutor/offers/${item.id}/close`,
      jsonInit('POST', { version: published.version }, tutor),
    );
    expect(close.status).toBe(200);
    expect((await api(`/tutor-offers/${item.id}`)).status).toBe(404);
    const deleted = await api(
      '/account/deletion',
      jsonInit('POST', { confirmation: 'DELETE' }, tutor),
    );
    expect(deleted.status).toBe(200);
  });

  it('supports rejection, versioned correction and resubmission without losing prior acknowledgement', async () => {
    const admin = await moderator();
    const tutor = await createPublicTutor();
    const contract = await publishOfferContract(admin);
    const item = await draft(tutor);
    const submit = await api(
      `/tutor/offers/${item.id}/submit`,
      jsonInit(
        'POST',
        {
          version: item.version,
          contractRevisionId: contract.id,
          acknowledged: true,
          shareContactAfterApproval: true,
        },
        tutor,
      ),
    );
    const pending = (await submit.json<ApiSuccess<TutorOffer>>()).data;
    const reject = await api(
      `/admin/tutor-offers/${item.id}/reject`,
      jsonInit('POST', { version: pending.version, reason: 'Cần chỉnh mức học phí.' }, admin),
    );
    expect(reject.status).toBe(200);
    const rejected = (await reject.json<ApiSuccess<TutorOffer>>()).data;
    expect(rejected.status).toBe('rejected');
    const corrected = await api(
      `/tutor/offers/${item.id}`,
      jsonInit(
        'PATCH',
        {
          ...fields,
          proposedTuitionPerSessionMinor: 220_000,
          version: rejected.version,
        },
        tutor,
      ),
    );
    expect(corrected.status).toBe(200);
    const edited = (await corrected.json<ApiSuccess<TutorOffer>>()).data;
    expect(edited).toMatchObject({ status: 'draft', version: 4, contractRevisionId: null });
    const resubmit = await api(
      `/tutor/offers/${item.id}/submit`,
      jsonInit(
        'POST',
        {
          version: edited.version,
          contractRevisionId: contract.id,
          acknowledged: true,
          shareContactAfterApproval: true,
        },
        tutor,
      ),
    );
    expect(resubmit.status).toBe(200);
    const acks = await env.DB.prepare(
      'SELECT count(*) AS count FROM tutor_offer_contract_acks WHERE offer_id = ?',
    )
      .bind(item.id)
      .first<{ count: number }>();
    expect(acks?.count).toBe(2);
  });

  it('rejects stale submit and competing moderator decisions without orphan contract acknowledgements', async () => {
    const admin = await moderator();
    const tutor = await createPublicTutor();
    const contract = await publishOfferContract(admin);
    const original = await draft(tutor);
    const edit = await api(
      `/tutor/offers/${original.id}`,
      jsonInit(
        'PATCH',
        {
          ...fields,
          proposedTuitionPerSessionMinor: 240_000,
          version: original.version,
        },
        tutor,
      ),
    );
    expect(edit.status).toBe(200);
    const staleSubmit = await api(
      `/tutor/offers/${original.id}/submit`,
      jsonInit(
        'POST',
        {
          version: original.version,
          contractRevisionId: contract.id,
          acknowledged: true,
          shareContactAfterApproval: true,
        },
        tutor,
      ),
    );
    expect(staleSubmit.status).toBe(409);
    const before = await env.DB.prepare(
      'SELECT count(*) AS count FROM tutor_offer_contract_acks WHERE offer_id = ?',
    )
      .bind(original.id)
      .first<{ count: number }>();
    expect(before?.count).toBe(0);
    const edited = (await edit.json<ApiSuccess<TutorOffer>>()).data;
    const submit = await api(
      `/tutor/offers/${original.id}/submit`,
      jsonInit(
        'POST',
        {
          version: edited.version,
          contractRevisionId: contract.id,
          acknowledged: true,
          shareContactAfterApproval: true,
        },
        tutor,
      ),
    );
    expect(submit.status).toBe(200);
    const pending = (await submit.json<ApiSuccess<TutorOffer>>()).data;
    const decisions = await Promise.all([
      api(
        `/admin/tutor-offers/${original.id}/approve`,
        jsonInit('POST', { version: pending.version }, admin),
      ),
      api(
        `/admin/tutor-offers/${original.id}/reject`,
        jsonInit('POST', { version: pending.version, reason: 'Cần bổ sung thông tin.' }, admin),
      ),
    ]);
    expect(decisions.map((r) => r.status).sort()).toEqual([200, 409]);
    const audits = await env.DB.prepare(
      "SELECT count(*) AS count FROM audit_logs WHERE target_type = 'tutor_student_offer' AND target_id = ? AND action IN ('tutor_offer.approved', 'tutor_offer.rejected')",
    )
      .bind(original.id)
      .first<{ count: number }>();
    expect(audits?.count).toBe(1);
  });
});

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { AdminContent } from '../../src/shared/schemas/content';
import type { Page } from '../../src/shared/schemas/discovery';
import type {
  AdminTutorOfferJoin,
  AdminTutorOfferJoinDetail,
  ParentTutorOfferJoin,
  TutorOfferJoinContact,
  TutorOfferJoinForTutor,
} from '../../src/shared/schemas/tutor-offer-joins';
import type { TutorOffer, TutorOfferContract } from '../../src/shared/schemas/tutor-offers';
import { api, createPublicTutor, errorCode, jsonInit, register, type Session } from './helpers';

const TUTOR_PHONE = '+84901234567';
const PARENT_PHONE = '+84987654321';
const details = {
  studentGrade: 'Lớp 10',
  learningNeeds: 'Cần ôn tập kiến thức đại số để chuẩn bị kiểm tra học kỳ.',
  teachingArea: 'Quận Cầu Giấy, Hà Nội',
  contactPhone: PARENT_PHONE,
  shareApplicationDetailsConsent: true,
  shareContactAfterApprovalConsent: true,
} as const;

async function moderator(): Promise<Session> {
  const user = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.userId).run();
  return user;
}

async function contract(admin: Session): Promise<TutorOfferContract> {
  const list = await api('/admin/content?kind=contract&audience=tutor&status=published', {
    headers: { Cookie: admin.cookie },
  });
  const current = (await list.json<ApiSuccess<Page<AdminContent>>>()).data.items.find(
    (item) => item.slug === 'tutor-student-offer-contract',
  );
  if (current) {
    return {
      id: current.id,
      revision: current.revision,
      title: current.title,
      bodyText: current.bodyText,
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
        title: 'Tutor offer contract',
        summary: '',
        bodyText: 'Contract for testing the tutor offer join flow.',
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

async function publishedOffer(admin: Session, tutor: Session): Promise<TutorOffer> {
  const policy = await contract(admin);
  const create = await api(
    '/tutor/offers',
    jsonInit(
      'POST',
      {
        subjectId: 'subj_math',
        grade: 'Lớp 10',
        mode: 'offline',
        area: 'Quận Cầu Giấy, Hà Nội',
        proposedTuitionPerSessionMinor: 200_000,
        contactPhone: TUTOR_PHONE,
      },
      tutor,
    ),
  );
  expect(create.status).toBe(201);
  const draft = (await create.json<ApiSuccess<TutorOffer>>()).data;
  const submit = await api(
    `/tutor/offers/${draft.id}/submit`,
    jsonInit(
      'POST',
      {
        version: draft.version,
        contractRevisionId: policy.id,
        acknowledged: true,
        shareContactAfterApproval: true,
      },
      tutor,
    ),
  );
  expect(submit.status).toBe(200);
  const pending = (await submit.json<ApiSuccess<TutorOffer>>()).data;
  const approve = await api(
    `/admin/tutor-offers/${draft.id}/approve`,
    jsonInit('POST', { version: pending.version }, admin),
  );
  expect(approve.status).toBe(200);
  return (await approve.json<ApiSuccess<TutorOffer>>()).data;
}

function joinInit(offer: TutorOffer, parent: Session, overrides: Record<string, unknown> = {}) {
  return jsonInit('POST', { offerVersion: offer.version, ...details, ...overrides }, parent);
}

describe('parent joins tutor-origin offers', () => {
  it('requires separate consent and limits tutor visibility before moderator approval', async () => {
    const admin = await moderator();
    const tutor = await createPublicTutor({ teachesOffline: true });
    const otherTutor = await createPublicTutor({ teachesOffline: true });
    const parent = await register('parent');
    const stranger = await register('parent');
    const offer = await publishedOffer(admin, tutor);
    const publicOffer = await api(`/tutor-offers/${offer.id}`);
    expect(publicOffer.status).toBe(200);
    expect(JSON.stringify((await publicOffer.json<ApiSuccess<unknown>>()).data)).not.toContain(
      TUTOR_PHONE,
    );

    const invalidInputs = [
      { shareApplicationDetailsConsent: false },
      { shareContactAfterApprovalConsent: false },
      { contactPhone: 'not-a-phone' },
      { teachingArea: 'ngõ Trúc Bạch' },
      { teachingArea: '12 Nguyễn Trãi, Thanh Xuân' },
      { learningNeeds: 'Liên hệ tôi qua 0901234567 để trao đổi việc học.' },
      { learningNeeds: 'Gửi thông tin đến parent@example.com để tư vấn.' },
      { learningNeeds: 'Cần học tại 12 Nguyễn Trãi, Thanh Xuân vào buổi tối.' },
      { learningNeeds: 'Cần học tại đường Nguyễn Trãi, Thanh Xuân vào buổi tối.' },
    ];
    for (const input of invalidInputs) {
      const response = await api(
        `/tutor-offers/${offer.id}/join-requests`,
        joinInit(offer, parent, input),
      );
      expect(response.status).toBe(422);
    }
    const tutorListBeforeValidJoin = await api(`/tutor/offers/${offer.id}/join-requests`, {
      headers: { Cookie: tutor.cookie },
    });
    expect(tutorListBeforeValidJoin.status).toBe(200);
    expect(
      (await tutorListBeforeValidJoin.json<ApiSuccess<Page<TutorOfferJoinForTutor>>>()).data.items,
    ).toEqual([]);
    const mismatch = await api(
      `/tutor-offers/${offer.id}/join-requests`,
      joinInit(offer, parent, { studentGrade: 'Lớp 9' }),
    );
    expect(mismatch.status).toBe(422);
    const stale = await api(
      `/tutor-offers/${offer.id}/join-requests`,
      joinInit(offer, parent, { offerVersion: offer.version - 1 }),
    );
    expect(stale.status).toBe(409);
    const create = await api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent));
    expect(create.status).toBe(201);
    const join = (await create.json<ApiSuccess<ParentTutorOfferJoin>>()).data;
    expect(join).toMatchObject({ status: 'submitted', version: 1, offerId: offer.id });
    expect(join).not.toHaveProperty('parentContactPhone');
    expect(join).not.toHaveProperty('tutorContactPhone');
    const duplicate = await api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent));
    expect(duplicate.status).toBe(409);
    expect(await errorCode(duplicate)).toBe('TUTOR_OFFER_JOIN_EXISTS');
    expect(
      (await api(`/parent/tutor-offer-joins/${join.id}`, { headers: { Cookie: stranger.cookie } }))
        .status,
    ).toBe(404);
    expect(
      (
        await api(`/tutor/offers/${offer.id}/join-requests`, {
          headers: { Cookie: otherTutor.cookie },
        })
      ).status,
    ).toBe(404);

    const tutorList = await api(`/tutor/offers/${offer.id}/join-requests`, {
      headers: { Cookie: tutor.cookie },
    });
    expect(tutorList.status).toBe(200);
    const item = (await tutorList.json<ApiSuccess<Page<TutorOfferJoinForTutor>>>()).data.items[0];
    expect(item).toMatchObject({
      id: join.id,
      status: 'submitted',
      studentGrade: details.studentGrade,
      learningNeeds: details.learningNeeds,
      teachingArea: details.teachingArea,
      agreedTuitionPerSessionMinor: null,
    });
    expect(JSON.stringify(item)).not.toContain(PARENT_PHONE);
    expect(item).not.toHaveProperty('parentUserId');
    expect(item).not.toHaveProperty('parentDisplayName');
    const adminList = await api('/admin/tutor-offer-joins', { headers: { Cookie: admin.cookie } });
    const adminItem = (await adminList.json<ApiSuccess<Page<AdminTutorOfferJoin>>>()).data.items[0];
    expect(adminItem).not.toHaveProperty('parentContactPhone');
    expect(adminItem).not.toHaveProperty('tutorContactPhone');
    const parentList = await api('/parent/tutor-offer-joins', {
      headers: { Cookie: parent.cookie },
    });
    expect(
      JSON.stringify((await parentList.json<ApiSuccess<Page<ParentTutorOfferJoin>>>()).data),
    ).not.toContain(TUTOR_PHONE);
    expect(JSON.stringify(adminItem)).not.toContain(PARENT_PHONE);
    const adminDetail = await api(`/admin/tutor-offer-joins/${join.id}`, {
      headers: { Cookie: admin.cookie },
    });
    expect((await adminDetail.json<ApiSuccess<AdminTutorOfferJoinDetail>>()).data).toMatchObject({
      parentContactPhone: PARENT_PHONE,
      tutorContactPhone: TUTOR_PHONE,
    });
    const readAudit = await env.DB.prepare(
      "SELECT count(*) AS count FROM audit_logs WHERE action = 'tutor_offer_join.admin_contact_viewed' AND target_id = ?",
    )
      .bind(join.id)
      .first<{ count: number }>();
    expect(readAudit?.count).toBe(1);
    expect(
      (
        await api(`/parent/tutor-offer-joins/${join.id}/contact`, {
          headers: { Cookie: parent.cookie },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await api(`/tutor/offers/${offer.id}/join-requests/${join.id}/contact`, {
          headers: { Cookie: tutor.cookie },
        })
      ).status,
    ).toBe(404);
  });

  it('captures agreed tuition, unlocks only the two phones, and revokes contact on completion', async () => {
    const admin = await moderator();
    const tutor = await createPublicTutor({ teachesOffline: true });
    const otherTutor = await createPublicTutor({ teachesOffline: true });
    const parent = await register('parent');
    const stranger = await register('parent');
    const offer = await publishedOffer(admin, tutor);
    const create = await api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent));
    const join = (await create.json<ApiSuccess<ParentTutorOfferJoin>>()).data;

    const missingAgreement = await api(
      `/admin/tutor-offer-joins/${join.id}/approve`,
      jsonInit('POST', { version: 1, agreedTuitionPerSessionMinor: 220_000 }, admin),
    );
    expect(missingAgreement.status).toBe(422);
    const unauthorized = await api(
      `/admin/tutor-offer-joins/${join.id}/approve`,
      jsonInit(
        'POST',
        { version: 1, agreedTuitionPerSessionMinor: 220_000, partiesAgreed: true },
        parent,
      ),
    );
    expect(unauthorized.status).toBe(403);
    const approve = await api(
      `/admin/tutor-offer-joins/${join.id}/approve`,
      jsonInit(
        'POST',
        { version: 1, agreedTuitionPerSessionMinor: 220_000, partiesAgreed: true },
        admin,
      ),
    );
    expect(approve.status).toBe(200);
    const approved = (await approve.json<ApiSuccess<AdminTutorOfferJoin>>()).data;
    expect(approved).toMatchObject({
      status: 'approved',
      version: 2,
      agreedTuitionPerSessionMinor: 220_000,
    });
    expect(approved).not.toHaveProperty('parentContactPhone');
    const duplicate = await api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent));
    expect(duplicate.status).toBe(409);
    const stale = await api(
      `/admin/tutor-offer-joins/${join.id}/approve`,
      jsonInit(
        'POST',
        { version: 1, agreedTuitionPerSessionMinor: 230_000, partiesAgreed: true },
        admin,
      ),
    );
    expect(stale.status).toBe(409);
    const parentContact = await api(`/parent/tutor-offer-joins/${join.id}/contact`, {
      headers: { Cookie: parent.cookie },
    });
    expect((await parentContact.json<ApiSuccess<TutorOfferJoinContact>>()).data.phone).toBe(
      TUTOR_PHONE,
    );
    const tutorContact = await api(`/tutor/offers/${offer.id}/join-requests/${join.id}/contact`, {
      headers: { Cookie: tutor.cookie },
    });
    expect((await tutorContact.json<ApiSuccess<TutorOfferJoinContact>>()).data.phone).toBe(
      PARENT_PHONE,
    );
    expect(
      (
        await api(`/parent/tutor-offer-joins/${join.id}/contact`, {
          headers: { Cookie: stranger.cookie },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api(`/tutor/offers/${offer.id}/join-requests/${join.id}/contact`, {
          headers: { Cookie: otherTutor.cookie },
        })
      ).status,
    ).toBe(404);
    const contactAudits = await env.DB.prepare(
      "SELECT count(*) AS count FROM audit_logs WHERE target_id = ? AND action IN ('tutor_offer_join.tutor_contact_viewed', 'tutor_offer_join.parent_contact_viewed')",
    )
      .bind(join.id)
      .first<{ count: number }>();
    expect(contactAudits?.count).toBe(2);
    const auditMetadata = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE target_type = 'tutor_offer_join_request' AND target_id = ?",
    )
      .bind(join.id)
      .all<{ metadata: string }>();
    expect(JSON.stringify(auditMetadata.results)).not.toContain(PARENT_PHONE);
    expect(JSON.stringify(auditMetadata.results)).not.toContain(TUTOR_PHONE);
    const blockedDelete = await api(
      '/account/deletion',
      jsonInit('POST', { confirmation: 'DELETE' }, parent),
    );
    expect(blockedDelete.status).toBe(409);
    const complete = await api(
      `/admin/tutor-offer-joins/${join.id}/complete`,
      jsonInit(
        'POST',
        { version: approved.version, reason: 'Hai bên đã hoàn tất khóa học.' },
        admin,
      ),
    );
    expect(complete.status).toBe(200);
    const finished = (await complete.json<ApiSuccess<AdminTutorOfferJoin>>()).data;
    expect(finished).toMatchObject({
      status: 'completed',
      version: 3,
      agreedTuitionPerSessionMinor: 220_000,
    });
    await expect(
      env.DB.prepare(
        'UPDATE tutor_offer_join_requests SET agreed_tuition_per_session_minor = 230000 WHERE id = ?',
      )
        .bind(join.id)
        .run(),
    ).rejects.toThrow();
    expect(
      (
        await api(`/parent/tutor-offer-joins/${join.id}/contact`, {
          headers: { Cookie: parent.cookie },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await api(`/tutor/offers/${offer.id}/join-requests/${join.id}/contact`, {
          headers: { Cookie: tutor.cookie },
        })
      ).status,
    ).toBe(404);
    const deleted = await api(
      '/account/deletion',
      jsonInit('POST', { confirmation: 'DELETE' }, parent),
    );
    expect(deleted.status).toBe(200);
    const stored = await env.DB.prepare(
      'SELECT student_grade, learning_needs, teaching_area, contact_phone FROM tutor_offer_join_requests WHERE id = ?',
    )
      .bind(join.id)
      .first<{
        student_grade: string;
        learning_needs: string;
        teaching_area: string | null;
        contact_phone: string | null;
      }>();
    expect(stored).toMatchObject({
      student_grade: 'Đã ẩn',
      learning_needs: 'Nhu cầu học tập đã được xóa',
      teaching_area: null,
      contact_phone: null,
    });
    const redactedAudits = await env.DB.prepare(
      "SELECT metadata FROM audit_logs WHERE target_type = 'tutor_offer_join_request' AND target_id = ?",
    )
      .bind(join.id)
      .all<{ metadata: string }>();
    expect(
      redactedAudits.results.every((row) => row.metadata.includes('redactedOnAccountDeletion')),
    ).toBe(true);
  });

  it('withdraws and rejects with versioned audit, permits resubmission after terminal status', async () => {
    const admin = await moderator();
    const tutor = await createPublicTutor({ teachesOffline: true });
    const parent = await register('parent');
    const offer = await publishedOffer(admin, tutor);
    const created = await api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent));
    const join = (await created.json<ApiSuccess<ParentTutorOfferJoin>>()).data;
    const withdraw = await api(
      `/parent/tutor-offer-joins/${join.id}/withdraw`,
      jsonInit('POST', { version: 1 }, parent),
    );
    expect(withdraw.status).toBe(200);
    expect((await withdraw.json<ApiSuccess<ParentTutorOfferJoin>>()).data.status).toBe('withdrawn');
    expect(
      (
        await api(
          `/parent/tutor-offer-joins/${join.id}/withdraw`,
          jsonInit('POST', { version: 1 }, parent),
        )
      ).status,
    ).toBe(409);
    const second = await api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent));
    expect(second.status).toBe(201);
    const secondJoin = (await second.json<ApiSuccess<ParentTutorOfferJoin>>()).data;
    const reject = await api(
      `/admin/tutor-offer-joins/${secondJoin.id}/reject`,
      jsonInit('POST', { version: 1, reason: 'Hai bên chưa thống nhất lịch học.' }, admin),
    );
    expect(reject.status).toBe(200);
    const rejected = (await reject.json<ApiSuccess<AdminTutorOfferJoin>>()).data;
    expect(rejected).toMatchObject({ status: 'rejected', version: 2 });
    const own = await api(`/parent/tutor-offer-joins?status=rejected&offerId=${offer.id}`, {
      headers: { Cookie: parent.cookie },
    });
    expect((await own.json<ApiSuccess<Page<ParentTutorOfferJoin>>>()).data.total).toBe(1);
    const audits = await env.DB.prepare(
      "SELECT count(*) AS count FROM audit_logs WHERE target_type = 'tutor_offer_join_request' AND target_id IN (?, ?) AND action IN ('tutor_offer_join.submitted', 'tutor_offer_join.withdrawn', 'tutor_offer_join.rejected')",
    )
      .bind(join.id, secondJoin.id)
      .first<{ count: number }>();
    expect(audits?.count).toBe(4);
    const competing = await Promise.all([
      api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent)),
      api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent)),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([201, 409]);
    const live = await env.DB.prepare(
      "SELECT count(*) AS count FROM tutor_offer_join_requests WHERE offer_id = ? AND parent_user_id = ? AND status IN ('submitted', 'approved')",
    )
      .bind(offer.id, parent.userId)
      .first<{ count: number }>();
    expect(live?.count).toBe(1);
  });

  it('lets a moderator revoke an approved match and stops both contact reads', async () => {
    const admin = await moderator();
    const tutor = await createPublicTutor({ teachesOffline: true });
    const parent = await register('parent');
    const offer = await publishedOffer(admin, tutor);
    const created = await api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent));
    const join = (await created.json<ApiSuccess<ParentTutorOfferJoin>>()).data;
    const approve = await api(
      `/admin/tutor-offer-joins/${join.id}/approve`,
      jsonInit(
        'POST',
        { version: join.version, agreedTuitionPerSessionMinor: 230_000, partiesAgreed: true },
        admin,
      ),
    );
    expect(approve.status).toBe(200);
    const approved = (await approve.json<ApiSuccess<AdminTutorOfferJoin>>()).data;
    const revoke = await api(
      `/admin/tutor-offer-joins/${join.id}/revoke`,
      jsonInit(
        'POST',
        { version: approved.version, reason: 'Hai bên thống nhất hủy ghép lớp.' },
        admin,
      ),
    );
    expect(revoke.status).toBe(200);
    expect((await revoke.json<ApiSuccess<AdminTutorOfferJoin>>()).data).toMatchObject({
      status: 'revoked',
      agreedTuitionPerSessionMinor: 230_000,
    });
    expect(
      (
        await api(`/parent/tutor-offer-joins/${join.id}/contact`, {
          headers: { Cookie: parent.cookie },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await api(`/tutor/offers/${offer.id}/join-requests/${join.id}/contact`, {
          headers: { Cookie: tutor.cookie },
        })
      ).status,
    ).toBe(404);
    const next = await api(`/tutor-offers/${offer.id}/join-requests`, joinInit(offer, parent));
    expect(next.status).toBe(201);
  });
});

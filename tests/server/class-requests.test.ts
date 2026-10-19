import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { AdminAssignment } from '../../src/shared/schemas/admin-assignments';
import type {
  CompletedAcceptance,
  CompletedClassDetail,
  IntroductionLetter,
  PaymentInstructions,
  TutorProposalItem,
} from '../../src/shared/schemas/class-requests';
import type { AdminClass, TutorApplication } from '../../src/shared/schemas/classes';
import type { Page } from '../../src/shared/schemas/discovery';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import type { ClassContractRecord } from '../../src/shared/schemas/terms-contracts';
import {
  AVAILABILITY,
  api,
  createPublicTutor,
  errorCode,
  jsonInit,
  register,
  type Session,
} from './helpers';
import { markLegacySubmittedRequest } from './legacy-request-fixture';
import {
  passAndAcknowledgeTutorTerms,
  publishTutorContract,
  publishTutorTermsQuiz,
} from './terms-fixture';

const PHONE = '0912345678';
const ADDRESS = 'Số 10, đường thử nghiệm';

async function data<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return (await response.json<ApiSuccess<T>>()).data;
}

const get = <T>(path: string, session: Session) =>
  api(path, { headers: { Cookie: session.cookie } }).then((response) => data<T>(response));

async function makeModerator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

async function submittedRequest(parent: Session, grade: string): Promise<OwnParentRequest> {
  const draft = await data<OwnParentRequest>(
    await api(
      '/parent/requests',
      jsonInit(
        'POST',
        {
          subjectId: 'subj_math',
          grade,
          mode: 'offline',
          area: 'Phường Cầu Giấy, Hà Nội',
          expectedBudgetMinor: 250_000,
          description: 'Mô tả riêng tư của người học.',
          schedule: {
            timezone: 'Asia/Ho_Chi_Minh',
            discussLater: false,
            windows: [{ weekday: 1, startLocal: '18:00', endLocal: '19:30' }],
          },
          contactPhone: PHONE,
          contactAddress: ADDRESS,
        },
        parent,
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    ),
  );
  return markLegacySubmittedRequest(parent, draft);
}

/** Synthetic test-only monthly-percent policy (40%). */
async function seedFee(moderator: Session): Promise<string> {
  const now = new Date(Date.now() - 60_000).toISOString();
  const latest = await env.DB.prepare(
    "SELECT coalesce(max(version), 0) AS version FROM fee_option_versions WHERE option_key = 'monthly_percent'",
  ).first<{ version: number }>();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO fee_option_versions
      (id, option_key, version, title, policy_text, rate_basis_points, deposit_basis_points,
       scope_subject_id, scope_mode, status, effective_from, effective_to, approved_by,
       published_at, mutation_id, created_at)
     VALUES (?, 'monthly_percent', ?, 'Test policy', 'Synthetic test-only fee policy.', 4000,
       NULL, 'subj_math', 'offline', 'published', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(id, (latest?.version ?? 0) + 1, moderator.userId, now, crypto.randomUUID(), now)
    .run();
  return id;
}

/** Request → published class → application → moderator selection (assignment). */
async function selectedClass(moderator: Session, tutor: Session, grade: string) {
  const parent = await register('parent');
  const request = await submittedRequest(parent, grade);
  const draft = await data<AdminClass>(
    await api(
      '/admin/classes',
      jsonInit(
        'POST',
        { sourceRequestId: request.id, requestVersion: request.version, publicArea: 'Cầu Giấy' },
        moderator,
      ),
    ),
  );
  const cls = await data<AdminClass>(
    await api(
      `/admin/classes/${draft.id}/publish`,
      jsonInit('POST', { version: draft.version }, moderator),
    ),
  );
  const feeOptionVersionId = await seedFee(moderator);
  const application = await data<TutorApplication>(
    await api(
      `/classes/${cls.id}/applications`,
      jsonInit(
        'POST',
        {
          feeOptionVersionId,
          classVersion: cls.version,
          availability: AVAILABILITY,
          termsAgreed: true,
        },
        tutor,
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    ),
  );
  const assignment = await data<AdminAssignment>(
    await api(
      `/admin/classes/${cls.id}/assign`,
      jsonInit(
        'POST',
        {
          applicationId: application.id,
          classVersion: cls.version,
          requestVersion: request.version + 1,
          applicationVersion: application.version,
          agreedTuitionPerSessionMinor: 220_000,
          partiesAgreed: true,
        },
        moderator,
      ),
    ),
  );
  return { parent, request, cls, application, assignment };
}

async function learnerConfirms(parent: Session, requestId: string, assignmentId: string) {
  const request = await get<OwnParentRequest>(`/parent/requests/${requestId}`, parent);
  await data(
    await api(
      `/parent/requests/${requestId}/confirm-tutor`,
      jsonInit('POST', { version: request.version, assignmentId }, parent),
    ),
  );
}

async function issueContract(moderator: Session, assignment: AdminAssignment) {
  const content = await publishTutorContract(moderator);
  return data<ClassContractRecord>(
    await api(
      `/admin/assignments/${assignment.id}/contracts`,
      jsonInit(
        'POST',
        { assignmentVersion: assignment.version, contentRevisionId: content.id },
        moderator,
      ),
    ),
  );
}

const ownApplication = (tutor: Session, id: string) =>
  get<TutorApplication>(`/tutor/applications/${id}`, tutor);

describe('tutor class requests', () => {
  it('guides a first-time tutor to the centre, then lets a returning tutor finish online', async () => {
    const moderator = await makeModerator();
    const tutor = await createPublicTutor({ teachesOffline: true });
    await publishTutorTermsQuiz(moderator);
    await passAndAcknowledgeTutorTerms(tutor);

    // First class: never completed an acceptance before → first-time, even with many applications.
    const first = await selectedClass(moderator, tutor, 'Lớp 10');
    let view = await ownApplication(tutor, first.application.id);
    expect(view.status).toBe('selected');
    expect(view.acceptance).toMatchObject({
      assignmentId: first.assignment.id,
      firstAcceptance: true,
      learnerConfirmed: false,
      contract: null,
      placementFeeMinor: 400_000, // 40% × 250.000 × 1 buổi × 4 tuần
      completed: false,
      paymentReportedAt: null,
    });
    const payFirst = await api(
      `/tutor/class-requests/acceptances/${first.assignment.id}/payment/report`,
      jsonInit('POST', { contractAgreed: true }, tutor),
    );
    expect(payFirst.status).toBe(409);
    expect(await errorCode(payFirst)).toBe('FIRST_ACCEPTANCE_AT_CENTRE');

    // Signed at the centre and fee transferred: the moderator records both.
    await learnerConfirms(first.parent, first.request.id, first.assignment.id);
    const contract = await issueContract(moderator, first.assignment);
    const signedPath = `/admin/contracts/${contract.id}/signed-at-centre`;
    expect((await api(signedPath, jsonInit('POST', { version: 1 }, tutor))).status).toBe(403);
    await data(await api(signedPath, jsonInit('POST', { version: 1 }, moderator)));
    expect((await api(signedPath, jsonInit('POST', { version: 1 }, moderator))).status).toBe(409);

    // Contact and letter stay closed until the fee is recorded.
    const letterPath = `/tutor/class-requests/acceptances/${first.assignment.id}/letter`;
    expect((await api(letterPath, { headers: { Cookie: tutor.cookie } })).status).toBe(404);
    expect(
      (await get<Page<CompletedAcceptance>>('/tutor/class-requests/completed', tutor)).total,
    ).toBe(0);
    await data(
      await api(
        `/admin/contracts/${contract.id}/placement-fee`,
        jsonInit('POST', { amountMinor: 400_000 }, moderator),
      ),
    );
    view = await ownApplication(tutor, first.application.id);
    expect(view.acceptance).toMatchObject({ completed: true, firstAcceptance: true });
    // Completed classes leave "Lớp đã đăng ký" and appear only under "Lớp đã hoàn tất".
    const registered = await get<Page<TutorApplication>>(
      '/tutor/applications?stage=registered',
      tutor,
    );
    expect(registered.items.map((item) => item.id)).not.toContain(first.application.id);
    expect(registered.total).toBe(0);
    const completed = await get<Page<CompletedAcceptance>>(
      '/tutor/class-requests/completed',
      tutor,
    );
    expect(completed.items).toEqual([
      expect.objectContaining({
        assignmentId: first.assignment.id,
        classCode: first.cls.code,
        placementFeeAmountMinor: 400_000,
      }),
    ]);
    const letter = await get<IntroductionLetter>(letterPath, tutor);
    expect(letter).toMatchObject({
      letterNumber: `TGT-${first.cls.code}`,
      classCode: first.cls.code,
      learnerPhone: PHONE,
      learnerAddress: ADDRESS,
    });
    const other = await createPublicTutor({ teachesOffline: true });
    expect((await api(letterPath, { headers: { Cookie: other.cookie } })).status).toBe(404);
    // "Xem chi tiết" of the completed class: facts, schedule, contact, address and the letter.
    const detailPath = `/tutor/class-requests/acceptances/${first.assignment.id}/detail`;
    const detail = await get<CompletedClassDetail>(detailPath, tutor);
    expect(detail).toMatchObject({
      classCode: first.cls.code,
      subjectName: 'Toán',
      schedule: [{ weekday: 1, startLocal: '18:00', endLocal: '19:30' }],
      placementFeeAmountMinor: 400_000,
      contact: { phone: PHONE, address: ADDRESS },
      letter: { letterNumber: `TGT-${first.cls.code}`, learnerPhone: PHONE },
    });
    expect((await api(detailPath, { headers: { Cookie: other.cookie } })).status).toBe(404);

    // Second class: a completed acceptance exists → returning tutor; contract on the system.
    const second = await selectedClass(moderator, tutor, 'Lớp 11');
    view = await ownApplication(tutor, second.application.id);
    expect(view.acceptance).toMatchObject({ firstAcceptance: false, completed: false });
    expect(
      (await get<Page<TutorApplication>>('/tutor/applications?stage=registered', tutor)).items.map(
        (item) => item.id,
      ),
    ).toEqual([second.application.id]);
    const payPath = `/tutor/class-requests/acceptances/${second.assignment.id}/payment`;
    const reportPath = `${payPath}/report`;
    const instructions = await get<PaymentInstructions>(payPath, tutor);
    expect(instructions).toMatchObject({
      classCode: second.cls.code,
      firstAcceptance: false,
      amountMinor: 400_000,
      transferContent: expect.stringMatching(
        new RegExp(`^PNL${second.cls.code.replace(/-/g, '')} .+ thanh toan phi moi gioi$`),
      ),
      // No receiving account configured in tests: no QR is ever made up.
      account: null,
      qrImageUrl: null,
      reportedAt: null,
    });
    const stranger = await createPublicTutor({ teachesOffline: true });
    expect((await api(payPath, { headers: { Cookie: stranger.cookie } })).status).toBe(404);
    const early = await api(reportPath, jsonInit('POST', { contractAgreed: true }, tutor));
    expect(early.status).toBe(409);
    expect(await errorCode(early)).toBe('PLACEMENT_FEE_NOT_READY');
    await learnerConfirms(second.parent, second.request.id, second.assignment.id);
    const noContract = await api(reportPath, jsonInit('POST', { contractAgreed: true }, tutor));
    expect(await errorCode(noContract)).toBe('CONTRACT_NOT_ISSUED');
    await issueContract(moderator, second.assignment);
    // The contract agreement is required.
    expect((await api(reportPath, jsonInit('POST', {}, tutor))).status).toBe(422);
    const reported = await data<PaymentInstructions>(
      await api(reportPath, jsonInit('POST', { contractAgreed: true }, tutor)),
    );
    expect(reported).toMatchObject({
      contract: { status: 'acknowledged' },
      reportedAt: expect.any(String),
      paidAt: null,
      completed: false,
    });
    expect((await api(reportPath, jsonInit('POST', { contractAgreed: true }, tutor))).status).toBe(
      409,
    );
    // A transfer report alone never opens the contact or the letter.
    view = await ownApplication(tutor, second.application.id);
    expect(view.acceptance).toMatchObject({
      completed: false,
      placementFeePaidAt: null,
      paymentReportedAt: expect.any(String),
    });
    const secondLetter = `/tutor/class-requests/acceptances/${second.assignment.id}/letter`;
    expect((await api(secondLetter, { headers: { Cookie: tutor.cookie } })).status).toBe(404);
    const secondDetail = `/tutor/class-requests/acceptances/${second.assignment.id}/detail`;
    expect((await api(secondDetail, { headers: { Cookie: tutor.cookie } })).status).toBe(404);
    // The centre confirms receipt → complete.
    await data(
      await api(
        `/admin/contracts/${reported.contract!.id}/placement-fee`,
        jsonInit('POST', { amountMinor: 400_000 }, moderator),
      ),
    );
    expect((await get<PaymentInstructions>(payPath, tutor)).completed).toBe(true);
    expect((await api(secondLetter, { headers: { Cookie: tutor.cookie } })).status).toBe(200);
    expect((await api(secondDetail, { headers: { Cookie: tutor.cookie } })).status).toBe(200);
    // The earlier class is still the tutor's first acceptance.
    expect((await ownApplication(tutor, first.application.id)).acceptance?.firstAcceptance).toBe(
      true,
    );
  });

  it('filters own applications by keyword and status', async () => {
    const moderator = await makeModerator();
    const tutor = await createPublicTutor({ teachesOffline: true });
    await publishTutorTermsQuiz(moderator);
    await passAndAcknowledgeTutorTerms(tutor);
    const selected = await selectedClass(moderator, tutor, 'Lớp 12');
    const list = (query: string) =>
      get<Page<TutorApplication>>(`/tutor/applications${query}`, tutor);
    expect(
      (await list(`?q=${encodeURIComponent(selected.cls.code)}`)).items.map((i) => i.id),
    ).toEqual([selected.application.id]);
    expect((await list('?q=khong-co-lop-nay')).total).toBe(0);
    expect((await list('?status=selected')).items[0]?.acceptance?.assignmentId).toBe(
      selected.assignment.id,
    );
    expect((await list('?status=rejected')).total).toBe(0);
  });

  it('lets a proposed tutor confirm or decline once, hiding declined proposals from the learner', async () => {
    const moderator = await makeModerator();
    const learner = await register('parent');
    const [accepting, declining, silent] = await Promise.all([
      createPublicTutor(),
      createPublicTutor(),
      createPublicTutor(),
    ]);
    const request = await submittedRequest(learner, 'Lớp 9');
    const propose = async (tutorId: string, score: number) => {
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO request_tutor_proposals (id, request_id, tutor_user_id, fit_score, proposed_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, request.id, tutorId, score, moderator.userId, new Date().toISOString())
        .run();
      return id;
    };
    await seedFee(moderator);
    const acceptId = await propose(accepting.userId, 95);
    const declineId = await propose(declining.userId, 90);
    const silentId = await propose(silent.userId, 88);

    const mine = await get<Page<TutorProposalItem>>('/tutor/class-requests/proposals', accepting);
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({
      id: acceptId,
      requestCode: request.code,
      subjectName: 'Toán',
      area: 'Phường Cầu Giấy, Hà Nội',
      schedule: [{ weekday: 1, startLocal: '18:00', endLocal: '19:30' }],
      tutorResponse: null,
      // 40% × 250.000 × 1 buổi/tuần (one weekly slot) × 4 tuần.
      placementRateBasisPoints: 4000,
      placementFeeMinor: 400_000,
    });
    // Public request facts only.
    expect(JSON.stringify(mine.items[0])).not.toMatch(/0912345678|Mô tả riêng tư|đường thử/);

    expect(
      (await get<TutorProposalItem>(`/tutor/class-requests/proposals/${acceptId}`, accepting)).id,
    ).toBe(acceptId);
    expect(
      (
        await api(`/tutor/class-requests/proposals/${acceptId}`, {
          headers: { Cookie: declining.cookie },
        })
      ).status,
    ).toBe(404);
    const list = (session: Session, query: string) =>
      get<Page<TutorProposalItem>>(`/tutor/class-requests/proposals${query}`, session);
    expect((await list(accepting, '?status=pending')).total).toBe(1);
    expect((await list(accepting, `?q=${encodeURIComponent(request.code)}`)).total).toBe(1);
    expect((await list(accepting, '?q=khong-co')).total).toBe(0);

    const path = (id: string, action: string) => `/tutor/class-requests/proposals/${id}/${action}`;
    const agree = { termsAgreed: true };
    expect((await api(path(acceptId, 'accept'), jsonInit('POST', agree, declining))).status).toBe(
      404,
    );
    // Confirming needs the "Điều khoản trách nhiệm" agreement.
    expect((await api(path(acceptId, 'accept'), jsonInit('POST', {}, accepting))).status).toBe(422);
    const accepted = await data<TutorProposalItem>(
      await api(path(acceptId, 'accept'), jsonInit('POST', agree, accepting)),
    );
    expect((await list(accepting, '?status=pending')).total).toBe(0);
    expect((await list(accepting, '?status=accepted')).items.map((item) => item.id)).toEqual([
      acceptId,
    ]);
    expect(accepted).toMatchObject({ tutorResponse: 'accepted', tutorDeclineReason: null });
    expect(
      (await api(path(acceptId, 'decline'), jsonInit('POST', { reason: 'x' }, accepting))).status,
    ).toBe(409);

    expect(
      (await api(path(declineId, 'decline'), jsonInit('POST', { reason: '  ' }, declining))).status,
    ).toBe(422);
    const declined = await data<TutorProposalItem>(
      await api(
        path(declineId, 'decline'),
        jsonInit('POST', { reason: 'Trùng lịch dạy' }, declining),
      ),
    );
    expect(declined).toMatchObject({
      tutorResponse: 'declined',
      tutorDeclineReason: 'Trùng lịch dạy',
    });
    expect((await list(declining, '?status=declined')).total).toBe(1);
    expect((await list(declining, '?status=accepted')).total).toBe(0);

    const own = await get<OwnParentRequest>(`/parent/requests/${request.id}`, learner);
    expect(own.proposals.map((item) => item.id)).toEqual([acceptId, silentId]);
    const select = await api(
      `/parent/requests/${request.id}/proposals/${declineId}/select`,
      jsonInit('POST', { version: own.version }, learner),
    );
    expect(select.ok).toBe(false);
    await expect(
      env.DB.prepare(
        "UPDATE request_tutor_proposals SET status = 'selected', selected_at = ? WHERE id = ?",
      )
        .bind(new Date().toISOString(), declineId)
        .run(),
    ).rejects.toThrow(/PROPOSAL_DECLINED_BY_TUTOR/);

    // The learner chooses the confirmed tutor: the unanswered proposal closes ("Đã đóng")
    // and disappears for its tutor; the chosen tutor keeps it as confirmed and selected.
    const chooser = await get<OwnParentRequest>(`/parent/requests/${request.id}`, learner);
    await data(
      await api(
        `/parent/requests/${request.id}/proposals/${acceptId}/select`,
        jsonInit('POST', { version: chooser.version }, learner),
      ),
    );
    expect((await list(silent, '')).total).toBe(0);
    expect(
      (
        await api(`/tutor/class-requests/proposals/${silentId}`, {
          headers: { Cookie: silent.cookie },
        })
      ).status,
    ).toBe(404);
    const chosen = await get<TutorProposalItem>(
      `/tutor/class-requests/proposals/${acceptId}`,
      accepting,
    );
    expect(chosen).toMatchObject({
      tutorResponse: 'accepted',
      status: 'selected',
      applicationId: null,
    });
    // "Hoàn tất nhận lớp" from the chosen proposal: same payment screen data, no report yet.
    const proposalPay = await get<PaymentInstructions>(
      `/tutor/class-requests/proposals/${acceptId}/payment`,
      accepting,
    );
    expect(proposalPay).toMatchObject({
      assignmentId: null,
      classCode: request.code,
      firstAcceptance: true,
      amountMinor: 400_000,
      transferContent: expect.stringMatching(
        new RegExp(`^PNL${request.code.replace(/-/g, '')} .+ thanh toan phi moi gioi$`),
      ),
      contract: null,
    });
    expect(
      (
        await api(`/tutor/class-requests/proposals/${declineId}/payment`, {
          headers: { Cookie: declining.cookie },
        })
      ).status,
    ).toBe(409);
    // A declined proposal stays visible to the tutor who declined it.
    expect((await list(declining, '')).total).toBe(1);
  });
});

describe('vietqr.app QR and transfer content', () => {
  it('builds the vietqr.app image URL and "[mã] [tên gia sư] thanh toan phi moi gioi"', async () => {
    const { qrImageUrl, transferContentFor } =
      await import('../../src/server/modules/class-requests/service');
    const content = transferContentFor('PNLLHD0000000000B', 'Nguyễn Thị Gia Sư');
    expect(content).toBe('PNLLHD0000000000B Nguyen Thi Gia Su thanh toan phi moi gioi');
    const url = new URL(
      qrImageUrl(
        { bankCode: 'ACB', bankName: 'ACB', accountNumber: '9527241', accountName: null },
        640_000,
        content,
      ),
    );
    expect(url.origin + url.pathname).toBe('https://vietqr.app/img');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      acc: '9527241',
      bank: 'ACB',
      amount: '640000',
      des: content,
    });
    // A long name is shortened after the code, never the code itself.
    expect(
      transferContentFor('PNLLHD0000000000B', 'A'.repeat(120)).startsWith('PNLLHD0000000000B '),
    ).toBe(true);
  });
});

describe('SePay webhook', () => {
  const KEY = 'test-sepay-webhook-key';
  const hook = (body: Record<string, unknown>, key: string | null = KEY) =>
    api('/payments/sepay/webhook', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(key === null ? {} : { Authorization: `Apikey ${key}` }),
      },
    });
  const statusOf = async (id: number) =>
    (
      await env.DB.prepare(
        "SELECT status FROM payment_transactions WHERE provider = 'sepay' AND provider_transaction_id = ?",
      )
        .bind(String(id))
        .first<{ status: string }>()
    )?.status;
  const transfer = (id: number, content: string, amount: number) => ({
    id,
    gateway: 'Vietcombank',
    transactionDate: '2026-10-19 10:00:00',
    accountNumber: '0123456789',
    code: null,
    content,
    transferType: 'in',
    transferAmount: amount,
    accumulated: 0,
    subAccount: null,
    referenceCode: `FT${id}`,
    description: content,
  });

  it('records the fee automatically for a matching full transfer and keeps every transaction', async () => {
    const moderator = await makeModerator();
    const tutor = await createPublicTutor({ teachesOffline: true });
    await publishTutorTermsQuiz(moderator);
    await passAndAcknowledgeTutorTerms(tutor);
    const selected = await selectedClass(moderator, tutor, 'Lớp 10');
    const code = `PNL${selected.cls.code.replace(/-/g, '').toUpperCase()}`;
    const payment = await get<PaymentInstructions>(
      `/tutor/class-requests/acceptances/${selected.assignment.id}/payment`,
      tutor,
    );
    expect(payment).toMatchObject({ autoConfirm: true });
    expect(payment.transferContent.startsWith(`${code} `)).toBe(true);
    const base = Math.floor(Date.now() % 1_000_000_000) * 10;

    // Only SePay's key is accepted.
    expect((await hook(transfer(base + 1, code, 400_000), null)).status).toBe(401);
    expect((await hook(transfer(base + 1, code, 400_000), 'sai-khoa')).status).toBe(401);

    // Not ready yet (no hire confirmation, no contract): kept for review, nothing recorded.
    const early = await hook(transfer(base + 1, `CT DEN ${code} chuyen tien`, 400_000));
    expect(early.status).toBe(200);
    expect(await early.json()).toEqual({ success: true });
    expect(await statusOf(base + 1)).toBe('not_ready');

    await learnerConfirms(selected.parent, selected.request.id, selected.assignment.id);
    const contract = await issueContract(moderator, selected.assignment);
    await data(
      await api(
        `/admin/contracts/${contract.id}/signed-at-centre`,
        jsonInit('POST', { version: 1 }, moderator),
      ),
    );
    const under = await hook(transfer(base + 2, code, 100_000));
    expect(await under.json()).toEqual({ success: true });
    expect(await statusOf(base + 2)).toBe('underpaid');
    expect((await ownApplication(tutor, selected.application.id)).acceptance?.completed).toBe(
      false,
    );

    // The bank glued text to the code and dropped the spaces: still this class.
    const paid = await hook(transfer(base + 3, `MBVCB.123.${code}CHUYENTIEN`, 400_000));
    expect(await paid.json()).toEqual({ success: true });
    expect(await statusOf(base + 3)).toBe('matched');
    const view = await ownApplication(tutor, selected.application.id);
    expect(view.acceptance).toMatchObject({ completed: true, placementFeeMinor: 400_000 });
    expect(
      (await get<Page<CompletedAcceptance>>('/tutor/class-requests/completed', tutor)).items.map(
        (item) => item.assignmentId,
      ),
    ).toContain(selected.assignment.id);

    // SePay retries: the same transaction id is stored once.
    const again = await hook(transfer(base + 3, `MBVCB.123.${code}CHUYENTIEN`, 400_000));
    expect(await again.json()).toEqual({ success: true });
    expect(
      (
        await env.DB.prepare(
          'SELECT count(*) AS n FROM payment_transactions WHERE provider_transaction_id = ?',
        )
          .bind(String(base + 3))
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
    const second = await hook(transfer(base + 4, code, 400_000));
    expect(await second.json()).toEqual({ success: true });
    expect(await statusOf(base + 4)).toBe('already_paid');
    const stranger = await hook(transfer(base + 5, 'ung ho quy lop', 50_000));
    expect(await stranger.json()).toEqual({ success: true });
    expect(await statusOf(base + 5)).toBe('unmatched');

    const history = await get<Page<{ status: string; providerTransactionId: string }>>(
      '/admin/payments?pageSize=50',
      moderator,
    );
    const mine = history.items.filter((item) =>
      [1, 2, 3, 4, 5].map((n) => String(base + n)).includes(item.providerTransactionId),
    );
    expect(mine.map((item) => item.status).sort()).toEqual([
      'already_paid',
      'matched',
      'not_ready',
      'underpaid',
      'unmatched',
    ]);
    expect((await api('/admin/payments', { headers: { Cookie: tutor.cookie } })).status).toBe(403);
    // The history is append-only.
    await expect(
      env.DB.prepare("UPDATE payment_transactions SET status = 'matched'").run(),
    ).rejects.toThrow(/immutable/);
  });
});

describe('SePay request verification', () => {
  const body = JSON.stringify({ id: 1, transferType: 'in', transferAmount: 1 });
  const headers = (values: Record<string, string>) => new Headers(values);
  async function sign(secret: string, timestamp: string, raw: string) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const bytes = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${raw}`),
    );
    return `sha256=${[...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  it('accepts a valid HMAC-SHA256 signature within 5 minutes and rejects anything else', async () => {
    const { assertSepayRequest } = await import('../../src/server/modules/payments/sepay');
    const env = { SEPAY_WEBHOOK_SECRET: 'bi-mat-thu-nghiem', SEPAY_WEBHOOK_API_KEY: 'khoa' };
    const now = Date.UTC(2026, 9, 19, 3, 0, 0);
    const ts = String(now / 1000);
    const good = await sign(env.SEPAY_WEBHOOK_SECRET, ts, body);
    await expect(
      assertSepayRequest(
        env,
        headers({ 'X-SePay-Timestamp': ts, 'X-SePay-Signature': good }),
        body,
        now,
      ),
    ).resolves.toBeUndefined();
    // Tampered body, wrong secret, stale timestamp, or only the API key: refused.
    await expect(
      assertSepayRequest(
        env,
        headers({ 'X-SePay-Timestamp': ts, 'X-SePay-Signature': good }),
        `${body} `,
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
    const wrong = await sign('khac', ts, body);
    await expect(
      assertSepayRequest(
        env,
        headers({ 'X-SePay-Timestamp': ts, 'X-SePay-Signature': wrong }),
        body,
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      assertSepayRequest(
        env,
        headers({ 'X-SePay-Timestamp': ts, 'X-SePay-Signature': good }),
        body,
        now + 301_000,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      assertSepayRequest(env, headers({ Authorization: 'Apikey khoa' }), body, now),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('checks the API key, the optional IP allowlist and missing configuration', async () => {
    const { assertSepayRequest, SEPAY_IPS } =
      await import('../../src/server/modules/payments/sepay');
    await expect(assertSepayRequest({}, headers({}), body)).rejects.toMatchObject({ status: 503 });
    // A key pasted with its "Apikey " prefix or quotes still matches.
    for (const configured of ['Apikey khoa-bi-mat', '"khoa-bi-mat"', '  khoa-bi-mat  '])
      await expect(
        assertSepayRequest(
          { SEPAY_WEBHOOK_API_KEY: configured },
          headers({ Authorization: 'Apikey khoa-bi-mat' }),
          body,
        ),
      ).resolves.toBeUndefined();
    await expect(
      assertSepayRequest(
        { SEPAY_WEBHOOK_API_KEY: 'khoa-bi-mat' },
        headers({ Authorization: 'Apikey khoa-khac' }),
        body,
      ),
    ).rejects.toMatchObject({ status: 401 });
    const env = { SEPAY_WEBHOOK_API_KEY: 'khoa-bi-mat', SEPAY_ENFORCE_IP: 'true' };
    await expect(
      assertSepayRequest(
        env,
        headers({ Authorization: 'Apikey khoa-bi-mat', 'CF-Connecting-IP': SEPAY_IPS[0]! }),
        body,
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertSepayRequest(
        env,
        headers({ Authorization: 'Apikey khoa-bi-mat', 'CF-Connecting-IP': '203.0.113.9' }),
        body,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('reads JSON, form-urlencoded and multipart bodies', async () => {
    const { parseSepayBody } = await import('../../src/server/modules/payments/sepay');
    const fields = {
      id: '93',
      gateway: 'Vietcombank',
      transactionDate: '2026-10-19 10:00:00',
      accountNumber: '0123456789',
      code: '',
      content: 'PNLLH1234 chuyen tien',
      transferType: 'in',
      transferAmount: '400000',
      referenceCode: 'FT1',
      description: '',
    };
    const fromForm = await parseSepayBody(
      new URLSearchParams(fields).toString(),
      'application/x-www-form-urlencoded',
    );
    expect(fromForm).toMatchObject({ id: '93', transferAmount: 400_000, code: null });
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    const request = new Request('https://x.invalid/', { method: 'POST', body: form });
    const multipart = await parseSepayBody(
      await request.text(),
      request.headers.get('Content-Type') ?? '',
    );
    expect(multipart).toMatchObject({ transferAmount: 400_000, content: 'PNLLH1234 chuyen tien' });
    const json = await parseSepayBody(
      JSON.stringify({ ...fields, id: 93, transferAmount: 400_000, code: null }),
      'application/json',
    );
    expect(json).toMatchObject({ id: 93, code: null });
    await expect(parseSepayBody('{', 'application/json')).rejects.toMatchObject({ status: 400 });
  });
});

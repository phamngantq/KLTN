import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminContractCandidate,
  AdminTermsQuiz,
  ClassContractRecord,
  TutorTermsQuiz,
} from '../../src/shared/schemas/terms-contracts';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const quizId = '00000000-0000-4000-8000-000000000001';
const contentId = '00000000-0000-4000-8000-000000000002';
const attemptId = '00000000-0000-4000-8000-000000000003';

describe('tutor terms and contracts', () => {
  it('takes the terms test, then asks for the agreement tick and returns to the class', async () => {
    let quiz: TutorTermsQuiz = {
      quizId,
      termsContentRevisionId: contentId,
      termsRevision: 2,
      termsTitle: 'Điều khoản trách nhiệm gia sư',
      termsBodyText: 'Gia sư báo trước khi nghỉ và giữ bí mật thông tin người học.',
      questions: [
        {
          id: 'q1',
          prompt: 'Khi cần nghỉ một buổi dạy, gia sư phải làm gì?',
          choices: [
            { id: 'a', text: 'Báo trước cho người học và trung tâm' },
            { id: 'b', text: 'Tự nghỉ, không cần báo' },
          ],
        },
      ],
      minimumCorrect: 1,
      passed: false,
      passedAttemptId: null,
      acknowledgedAt: null,
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/terms/quiz') return { data: quiz };
      if (req.path === '/tutor/terms/attempts') {
        const right =
          (req.body as { answers: { choiceId: string }[] }).answers[0]?.choiceId === 'a';
        if (right) quiz = { ...quiz, passed: true, passedAttemptId: attemptId };
        return {
          status: 201,
          data: {
            id: attemptId,
            quizId,
            termsContentRevisionId: contentId,
            correctCount: right ? 1 : 0,
            questionCount: 1,
            minimumCorrect: 1,
            passed: right,
            createdAt: '2026-10-16T02:00:00.000Z',
          },
        };
      }
      if (req.path === '/tutor/terms/acknowledgements') {
        quiz = { ...quiz, acknowledgedAt: '2026-10-16T02:01:00.000Z' };
        return {
          status: 201,
          data: { quizId, termsContentRevisionId: contentId, acknowledgedAt: quiz.acknowledgedAt },
        };
      }
      return undefined;
    });
    const next = '/tutor/new-classes/c-1/nhan-lop';
    const { router } = renderRoute(`/tutor/terms?next=${encodeURIComponent(next)}`);
    const user = userEvent.setup();

    expect(await screen.findByText(quiz.termsBodyText)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Nộp bài test' }));
    expect(screen.getByRole('alert').textContent).toBe('Vui lòng trả lời tất cả câu hỏi.');
    await user.click(screen.getByRole('radio', { name: 'Tự nghỉ, không cần báo' }));
    await user.click(screen.getByRole('button', { name: 'Nộp bài test' }));
    expect(await screen.findByText(/Bạn trả lời đúng 0\/1 câu/)).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Báo trước cho người học và trung tâm' }));
    await user.click(screen.getByRole('button', { name: 'Nộp bài test' }));

    expect(
      await screen.findByText('Bạn đã hoàn thành bài test điều khoản trách nhiệm.'),
    ).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Xác nhận' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Tôi xác nhận đã đọc và đồng ý với Điều khoản trách nhiệm của trung tâm',
      }),
    );
    await user.click(confirm);
    await waitFor(() => expect(router.state.location.pathname).toBe(next));
    expect(calls.find((call) => call.path === '/tutor/terms/acknowledgements')?.body).toEqual({
      quizId,
      attemptId,
      acknowledged: true,
    });
  });

  it('remembers a passed test and ignores a return target outside the tutor area', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/terms/quiz')
        return {
          data: {
            quizId,
            termsContentRevisionId: contentId,
            termsRevision: 1,
            termsTitle: 'Điều khoản',
            termsBodyText: 'Nội dung.',
            questions: [],
            minimumCorrect: 1,
            passed: true,
            passedAttemptId: attemptId,
            acknowledgedAt: '2026-10-16T02:00:00.000Z',
          },
        };
      return undefined;
    });
    renderRoute(`/tutor/terms?next=${encodeURIComponent('https://example.com/x')}`);
    expect(
      await screen.findByText('Bạn đã hoàn thành bài test điều khoản trách nhiệm.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nộp bài test' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Tiếp tục nhận lớp' })).toBeNull();
  });

  it('shows the issued contract, then records tutor acknowledgement without a payment claim', async () => {
    let record: ClassContractRecord = {
      id: quizId,
      assignmentId: contentId,
      classId: attemptId,
      classCode: 'LH-ABC',
      tutorUserId: 'u1',
      status: 'issued',
      version: 1,
      contractContentRevisionId: '00000000-0000-4000-8000-000000000004',
      contractRevision: 1,
      contractTitle: 'Hợp đồng lớp',
      contractBodyText: 'Nội dung hợp đồng đã công bố.',
      feeOptionVersionId: '00000000-0000-4000-8000-000000000005',
      feeOptionKey: 'monthly_percent',
      feeOptionTitle: 'Theo tháng',
      feePolicyText: 'Phương án phí do kiểm duyệt viên công bố.',
      rateBasisPoints: 2500,
      depositBasisPoints: null,
      agreedTuitionPerSessionMinor: 180_000,
      issuedAt: '2026-10-11T00:00:00.000Z',
      acknowledgedAt: null,
      learnerConfirmedAt: null,
      placementFeePaidAt: null,
      placementFeeAmountMinor: null,
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/contracts?page=1' && req.method === 'GET')
        return { data: { items: [record], page: 1, pageSize: 12, total: 1 } };
      if (req.path === `/tutor/contracts/${record.id}/acknowledge` && req.method === 'POST') {
        record = {
          ...record,
          status: 'acknowledged',
          version: 2,
          acknowledgedAt: '2026-10-11T00:02:00.000Z',
          learnerConfirmedAt: null,
          placementFeePaidAt: null,
          placementFeeAmountMinor: null,
        };
        return { data: record };
      }
      return undefined;
    });
    renderRoute('/tutor/contracts');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Xem hợp đồng' }));
    expect(screen.getByText('Nội dung hợp đồng đã công bố.')).toBeTruthy();
    expect(screen.getByText(/25% học phí tháng/)).toBeTruthy();
    expect(screen.getByText('Học phí đã chốt khi phát hành: 180.000 ₫/buổi')).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: /Tôi đã đọc nội dung hợp đồng/ }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận nội dung hợp đồng' }));
    await waitFor(() =>
      expect(screen.getByText(/Đã ghi nhận xác nhận nội dung hợp đồng/)).toBeTruthy(),
    );
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      version: 1,
      acknowledged: true,
    });
    expect(screen.queryByText(/thanh toán thành công|đã ký điện tử/i)).toBeNull();
  });
});

describe('moderator terms and contracts', () => {
  it('authors a quiz draft for the published terms version and publishes it', async () => {
    let stored: AdminTermsQuiz | null = null;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path === '/content/terms/tutor-responsibility?audience=tutor')
        return {
          data: {
            id: contentId,
            kind: 'terms',
            slug: 'tutor-responsibility',
            audience: 'tutor',
            revision: 2,
            title: 'Điều khoản gia sư',
            summary: '',
            bodyText: 'Nội dung đã công bố.',
            publishedAt: '2026-10-11T00:00:00.000Z',
          },
        };
      if (req.path === '/admin/terms/quizzes' && req.method === 'GET')
        return { data: stored ? [stored] : [] };
      if (req.path === '/admin/terms/quizzes' && req.method === 'POST') {
        const input = req.body as {
          questions: AdminTermsQuiz['questions'];
          minimumCorrect: number;
        };
        stored = {
          id: quizId,
          termsContentRevisionId: contentId,
          status: 'draft',
          editVersion: 1,
          questions: input.questions,
          minimumCorrect: input.minimumCorrect,
          publishedAt: null,
          createdAt: '2026-10-11T00:00:00.000Z',
          updatedAt: '2026-10-11T00:00:00.000Z',
        };
        return { status: 201, data: stored };
      }
      if (req.path === `/admin/terms/quizzes/${quizId}/publish` && req.method === 'POST') {
        stored = {
          ...stored!,
          status: 'published',
          editVersion: 2,
          publishedAt: '2026-10-11T00:01:00.000Z',
        };
        return { data: stored };
      }
      return undefined;
    });
    renderRoute('/admin/terms/quiz');
    const user = userEvent.setup();
    expect(await screen.findByText(/Cần công bố bài kiểm tra cho phiên bản này/)).toBeTruthy();
    await user.type(
      screen.getByRole('textbox', { name: 'Nội dung câu 1' }),
      'Điều khoản hiện hành nói gì?',
    );
    await user.type(screen.getByRole('textbox', { name: 'Lựa chọn 1' }), 'Nội dung A');
    await user.type(screen.getByRole('textbox', { name: 'Lựa chọn 2' }), 'Nội dung B');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    expect(await screen.findByText('Đã tạo bản nháp bài kiểm tra.')).toBeTruthy();
    const create = calls.find(
      (call) => call.path === '/admin/terms/quizzes' && call.method === 'POST',
    );
    expect(create?.body).toMatchObject({
      termsContentRevisionId: contentId,
      minimumCorrect: 1,
      questions: [expect.objectContaining({ prompt: 'Điều khoản hiện hành nói gì?' })],
    });
    await user.click(screen.getByRole('button', { name: 'Công bố bài kiểm tra' }));
    await user.click(screen.getByRole('button', { name: 'Công bố' }));
    expect(await screen.findByText('Đã công bố bài kiểm tra.')).toBeTruthy();
    expect(
      calls.find((call) => call.path === `/admin/terms/quizzes/${quizId}/publish`)?.body,
    ).toEqual({ editVersion: 1 });
  });

  it('issues the current contract version only to an active assignment', async () => {
    let candidate: AdminContractCandidate = {
      assignmentId: quizId,
      assignmentVersion: 1,
      classId: contentId,
      classCode: 'LH-ABC',
      tutorUserId: 'u-tutor',
      tutorDisplayName: 'Gia sư A',
      assignedAt: '2026-10-11T00:00:00.000Z',
      contractId: null,
    };
    let record: ClassContractRecord | null = null;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path === '/content/contract/tutor-class-contract?audience=tutor')
        return {
          data: {
            id: contentId,
            kind: 'contract',
            slug: 'tutor-class-contract',
            audience: 'tutor',
            revision: 3,
            title: 'Mẫu hợp đồng',
            summary: '',
            bodyText: 'Nội dung mẫu hiện hành.',
            publishedAt: '2026-10-11T00:00:00.000Z',
          },
        };
      if (req.path === '/admin/contracts/candidates?page=1' && req.method === 'GET')
        return { data: { items: [candidate], page: 1, pageSize: 12, total: 1 } };
      if (req.path === '/admin/contracts?page=1' && req.method === 'GET')
        return {
          data: { items: record ? [record] : [], page: 1, pageSize: 12, total: record ? 1 : 0 },
        };
      if (req.path === `/admin/assignments/${quizId}/contracts` && req.method === 'POST') {
        candidate = { ...candidate, contractId: attemptId };
        record = {
          id: attemptId,
          assignmentId: quizId,
          classId: contentId,
          classCode: 'LH-ABC',
          tutorUserId: 'u-tutor',
          status: 'issued',
          version: 1,
          contractContentRevisionId: contentId,
          contractRevision: 3,
          contractTitle: 'Mẫu hợp đồng',
          contractBodyText: 'Nội dung mẫu hiện hành.',
          feeOptionVersionId: '00000000-0000-4000-8000-000000000004',
          feeOptionKey: 'monthly_percent',
          feeOptionTitle: 'Theo tháng',
          feePolicyText: 'Chính sách phí đã công bố.',
          rateBasisPoints: 2500,
          depositBasisPoints: null,
          agreedTuitionPerSessionMinor: 180_000,
          issuedAt: '2026-10-11T00:01:00.000Z',
          acknowledgedAt: null,
          learnerConfirmedAt: null,
          placementFeePaidAt: null,
          placementFeeAmountMinor: null,
        };
        return { status: 201, data: record };
      }
      return undefined;
    });
    renderRoute('/admin/contracts');
    const user = userEvent.setup();
    expect(await screen.findByText('Nội dung mẫu hiện hành.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Phát hành hợp đồng' }));
    await user.click(screen.getByRole('button', { name: 'Phát hành' }));
    expect(await screen.findByText(/Đã phát hành hồ sơ hợp đồng cho lớp LH-ABC/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Xem' }));
    expect(screen.getByText('Học phí đã chốt khi phát hành: 180.000 ₫/buổi')).toBeTruthy();
    expect(
      calls.find((call) => call.path === `/admin/assignments/${quizId}/contracts`)?.body,
    ).toEqual({ assignmentVersion: 1, contentRevisionId: contentId });
  });
});

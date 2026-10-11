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
  it('submits answers to the server and acknowledges only after a passed attempt', async () => {
    let quiz: TutorTermsQuiz = {
      quizId,
      termsContentRevisionId: contentId,
      termsRevision: 2,
      termsTitle: 'Điều khoản gia sư',
      termsBodyText: 'Nội dung do kiểm duyệt viên công bố.',
      questions: [
        {
          id: 'q1',
          prompt: 'Câu hỏi về điều khoản?',
          choices: [
            { id: 'yes', text: 'Đồng ý' },
            { id: 'no', text: 'Không' },
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
      if (req.path === '/tutor/terms/quiz' && req.method === 'GET') return { data: quiz };
      if (req.path === '/tutor/terms/attempts' && req.method === 'POST') {
        quiz = { ...quiz, passed: true, passedAttemptId: attemptId };
        return {
          status: 201,
          data: {
            id: attemptId,
            quizId,
            termsContentRevisionId: contentId,
            correctCount: 1,
            questionCount: 1,
            minimumCorrect: 1,
            passed: true,
            createdAt: '2026-10-11T00:00:00.000Z',
          },
        };
      }
      if (req.path === '/tutor/terms/acknowledgements' && req.method === 'POST') {
        quiz = { ...quiz, acknowledgedAt: '2026-10-11T00:01:00.000Z' };
        return {
          status: 201,
          data: { quizId, termsContentRevisionId: contentId, acknowledgedAt: quiz.acknowledgedAt },
        };
      }
      return undefined;
    });
    renderRoute('/tutor/terms');
    const user = userEvent.setup();
    expect(await screen.findByText('Nội dung do kiểm duyệt viên công bố.')).toBeTruthy();
    expect(screen.queryByText(/correctChoiceId/)).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Đồng ý' }));
    await user.click(screen.getByRole('button', { name: 'Nộp bài kiểm tra' }));
    expect(await screen.findByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ })).toBeTruthy();
    expect(calls.find((call) => call.path === '/tutor/terms/attempts')?.body).toEqual({
      quizId,
      answers: [{ questionId: 'q1', choiceId: 'yes' }],
    });
    await user.click(screen.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận điều khoản' }));
    expect(await screen.findByText(/Đã xác nhận điều khoản hiện hành/)).toBeTruthy();
    expect(calls.find((call) => call.path === '/tutor/terms/acknowledgements')?.body).toEqual({
      quizId,
      attemptId,
      acknowledged: true,
    });
    expect(
      calls
        .find((call) => call.path === '/tutor/terms/acknowledgements')
        ?.headers.get('X-CSRF-Token'),
    ).toBe('csrf-test-token');
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
      issuedAt: '2026-10-11T00:00:00.000Z',
      acknowledgedAt: null,
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
          issuedAt: '2026-10-11T00:01:00.000Z',
          acknowledgedAt: null,
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
    expect(
      calls.find((call) => call.path === `/admin/assignments/${quizId}/contracts`)?.body,
    ).toEqual({ assignmentVersion: 1, contentRevisionId: contentId });
  });
});

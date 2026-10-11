import { useState, type FormEvent } from 'react';
import { ClipboardCheck, FileText } from 'lucide-react';
import { Link } from 'react-router';
import type { TutorQuizAttempt } from '../../../shared/schemas/terms-contracts';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useTutorTermsActions, useTutorTermsQuiz } from '../../features/terms-contracts/api';
import { isApiError } from '../../lib/api-client';

export function TutorTermsPage() {
  const quiz = useTutorTermsQuiz();
  const { attempt, acknowledge } = useTutorTermsActions();
  const [answerState, setAnswerState] = useState<{
    quizId: string;
    values: Record<string, string>;
  }>({ quizId: '', values: {} });
  const [lastAttempt, setLastAttempt] = useState<TutorQuizAttempt | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [localError, setLocalError] = useState('');
  const readOnly = isReadOnlyPreview();
  const answers = answerState.quizId === quiz.data?.quizId ? answerState.values : {};
  const lastAttemptForQuiz = lastAttempt?.quizId === quiz.data?.quizId ? lastAttempt : null;

  function submitAnswers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quiz.data || readOnly) return;
    const selected = quiz.data.questions.map((question) => ({
      questionId: question.id,
      choiceId: answers[question.id] ?? '',
    }));
    if (selected.some((item) => !item.choiceId)) {
      setLocalError('Vui lòng trả lời tất cả câu hỏi.');
      return;
    }
    setLocalError('');
    attempt.mutate(
      { quizId: quiz.data.quizId, answers: selected },
      {
        onSuccess: (result) => {
          setLastAttempt(result);
          setAgreed(false);
        },
      },
    );
  }

  function confirmAcknowledgement() {
    const attemptId = lastAttemptForQuiz?.passed
      ? lastAttemptForQuiz.id
      : quiz.data?.passedAttemptId;
    if (!quiz.data || !attemptId || !agreed || readOnly) return;
    acknowledge.mutate(
      { quizId: quiz.data.quizId, attemptId },
      {
        onSuccess: () => {
          setAgreed(false);
          setLastAttempt(null);
        },
      },
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-[#0e2f5f]">Điều khoản trách nhiệm</h1>
        <p className="mt-2 text-sm text-muted">
          Các điều khoản và trách nhiệm của gia sư khi tham gia hệ thống. Đọc phiên bản hiện hành,
          hoàn thành bài kiểm tra và xác nhận trước khi ứng tuyển lớp.
        </p>
      </div>
      {quiz.isPending ? (
        <PageLoading label="Đang tải điều khoản…" />
      ) : quiz.isError ? (
        <Alert
          tone={isApiError(quiz.error, 'TERMS_QUIZ_UNAVAILABLE') ? 'warning' : 'danger'}
          title="Chưa thể hoàn thành điều khoản"
          action={
            <Button variant="secondary" onClick={() => void quiz.refetch()}>
              Thử lại
            </Button>
          }
        >
          {quiz.error.message}
        </Alert>
      ) : (
        <>
          {readOnly && <Alert tone="info">Bản xem trước chỉ cho phép đọc điều khoản.</Alert>}
          {quiz.data.acknowledgedAt ? (
            <Alert tone="success" title="Đã xác nhận điều khoản hiện hành">
              Bạn đã hoàn thành bài kiểm tra và xác nhận phiên bản {quiz.data.termsRevision}.{' '}
              <Link className="underline" to="/tutor/new-classes">
                Xem lớp đang tuyển
              </Link>
            </Alert>
          ) : quiz.data.passed || lastAttemptForQuiz?.passed ? (
            <Alert tone="warning" title="Cần xác nhận điều khoản">
              Bạn đã vượt qua bài kiểm tra. Hãy đánh dấu xác nhận bên dưới để mở quyền ứng tuyển.
            </Alert>
          ) : (
            <Alert tone="info">
              Bài kiểm tra được chấm trên hệ thống. Cần đạt ít nhất {quiz.data.minimumCorrect}/
              {quiz.data.questions.length} câu.
            </Alert>
          )}
          <article className="overflow-hidden rounded-xl border border-border bg-white shadow-card">
            <div className="border-b border-border px-5 py-5 sm:px-6">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-[#0e2f5f]">
                <FileText aria-hidden="true" className="size-5 shrink-0" />
                {quiz.data.termsTitle}
              </h2>
              <p className="mt-1 text-sm text-muted">Phiên bản {quiz.data.termsRevision}</p>
            </div>
            <div className="whitespace-pre-wrap break-words px-5 py-6 text-sm leading-7 text-fg sm:px-6">
              {quiz.data.termsBodyText}
            </div>
          </article>
          {!quiz.data.acknowledgedAt && !quiz.data.passed && !lastAttemptForQuiz?.passed && (
            <form
              onSubmit={submitAnswers}
              className="overflow-hidden rounded-xl border-4 border-[#ffda68] bg-white shadow-card"
              aria-label="Bài kiểm tra điều khoản"
            >
              <div className="bg-[#0e2f5f] px-5 py-5 text-white sm:px-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <ClipboardCheck aria-hidden="true" className="size-5" />
                  Bài kiểm tra điều khoản trách nhiệm
                </h2>
                <p className="mt-2 text-sm text-white/90">
                  Trả lời tất cả câu hỏi. Cần đạt ít nhất {quiz.data.minimumCorrect}/
                  {quiz.data.questions.length} câu.
                </p>
              </div>
              <div className="space-y-5 p-5 sm:p-6">
                {quiz.data.questions.map((question, index) => (
                  <fieldset
                    key={question.id}
                    className="rounded-lg border border-border bg-white p-4"
                  >
                    <legend className="px-1 font-semibold text-[#0e2f5f]">
                      Câu {index + 1}. {question.prompt}
                    </legend>
                    <div className="mt-3 grid gap-2">
                      {question.choices.map((choice) => (
                        <label
                          key={choice.id}
                          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 focus-within:outline-2 focus-within:outline-focus ${answers[question.id] === choice.id ? 'border-[#0e2f5f] bg-blue-50' : 'border-border bg-white'}`}
                        >
                          <input
                            type="radio"
                            name={`question-${question.id}`}
                            value={choice.id}
                            checked={answers[question.id] === choice.id}
                            onChange={() => {
                              setAnswerState({
                                quizId: quiz.data.quizId,
                                values: { ...answers, [question.id]: choice.id },
                              });
                              setLocalError('');
                            }}
                          />
                          <span>{choice.text}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                {localError && <Alert tone="danger">{localError}</Alert>}
                {attempt.isError && <Alert tone="danger">{attempt.error.message}</Alert>}
                {lastAttemptForQuiz && !lastAttemptForQuiz.passed && (
                  <Alert tone="warning">
                    Bạn trả lời đúng {lastAttemptForQuiz.correctCount}/
                    {lastAttemptForQuiz.questionCount} câu; cần {lastAttemptForQuiz.minimumCorrect}{' '}
                    câu. Hãy đọc lại điều khoản và thử lại.
                  </Alert>
                )}
                <Button
                  type="submit"
                  variant="accent"
                  loading={attempt.isPending}
                  disabled={readOnly}
                >
                  Nộp bài kiểm tra
                </Button>
              </div>
            </form>
          )}
          {!quiz.data.acknowledgedAt && (quiz.data.passed || lastAttemptForQuiz?.passed) && (
            <section
              className="rounded-xl border border-[#ffda68] bg-white p-5 shadow-card sm:p-6"
              aria-label="Xác nhận điều khoản"
            >
              <h2 className="text-xl font-semibold text-[#0e2f5f]">Xác nhận điều khoản</h2>
              <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <span>
                  Tôi đã đọc và đồng ý với phiên bản {quiz.data.termsRevision} của điều khoản trên.
                </span>
              </label>
              {acknowledge.isError && <Alert tone="danger">{acknowledge.error.message}</Alert>}
              <Button
                onClick={confirmAcknowledgement}
                disabled={!agreed || readOnly}
                loading={acknowledge.isPending}
              >
                Xác nhận điều khoản
              </Button>
            </section>
          )}
          <ButtonLink variant="secondary" to="/tutor/new-classes">
            Xem các lớp đang tuyển
          </ButtonLink>
        </>
      )}
    </section>
  );
}

import { useState, type FormEvent } from 'react';
import { ClipboardCheck, FileText } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import type { TutorQuizAttempt } from '../../../shared/schemas/terms-contracts';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useTutorTermsActions, useTutorTermsQuiz } from '../../features/terms-contracts/api';
import { formatDate } from '../../lib/format';

/** Only in-app tutor pages may be the return target after the test. */
function safeNext(value: string | null): string | null {
  return value && /^\/tutor\/[^/]/.test(value) && !value.startsWith('//') ? value : null;
}

const PASSED = 'Bạn đã hoàn thành bài test điều khoản trách nhiệm.';
const AGREE = 'Tôi xác nhận đã đọc và đồng ý với Điều khoản trách nhiệm của trung tâm';

/**
 * "Điều khoản trách nhiệm": read the terms, pass the test once, then confirm with a checkbox.
 * The passed result is stored, so later classes do not ask again.
 */
export function TutorTermsPage() {
  const quiz = useTutorTermsQuiz();
  const { attempt, acknowledge } = useTutorTermsActions();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lastAttempt, setLastAttempt] = useState<TutorQuizAttempt | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [localError, setLocalError] = useState('');
  const readOnly = isReadOnlyPreview();

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
      { onSuccess: (result) => setLastAttempt(result) },
    );
  }

  function confirm() {
    const attemptId = quiz.data?.passedAttemptId ?? (lastAttempt?.passed ? lastAttempt.id : null);
    if (!quiz.data || !attemptId || !agreed || readOnly) return;
    acknowledge.mutate(
      { quizId: quiz.data.quizId, attemptId },
      {
        onSuccess: () => {
          if (next) navigate(next);
        },
      },
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold text-primary">Bài test điều khoản trách nhiệm</h1>
        <p className="mt-2 text-muted">
          Để nhận lớp, bạn cần hoàn thành bài test về điều khoản trách nhiệm. Bài test chỉ cần làm
          một lần duy nhất — các lần nhận lớp sau sẽ không cần làm lại.
        </p>
      </header>
      {quiz.isPending ? (
        <PageLoading label="Đang tải điều khoản…" />
      ) : quiz.isError ? (
        <Alert
          tone="warning"
          title="Chưa có bài test điều khoản được công bố"
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
          <article className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
            <h2 className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-6 py-4 text-lg font-semibold text-primary">
              <FileText aria-hidden="true" className="size-5" />
              {quiz.data.termsTitle}
              <span className="text-sm font-normal text-muted">
                · Phiên bản {quiz.data.termsRevision}
              </span>
            </h2>
            <p className="max-h-[40vh] overflow-y-auto whitespace-pre-line px-6 py-5 text-sm leading-relaxed">
              {quiz.data.termsBodyText}
            </p>
          </article>

          {quiz.data.acknowledgedAt ? (
            <Alert tone="success" title={PASSED}>
              Kết quả đã được lưu ngày {formatDate(quiz.data.acknowledgedAt, 'Asia/Ho_Chi_Minh')};
              các lần nhận lớp sau không cần làm lại.
              {next && (
                <ButtonLink to={next} className="mt-3 block w-fit">
                  Tiếp tục nhận lớp
                </ButtonLink>
              )}
            </Alert>
          ) : quiz.data.passed || lastAttempt?.passed ? (
            <section
              aria-label="Xác nhận điều khoản"
              className="flex flex-col gap-4 rounded-2xl border border-border bg-bg p-6 shadow-card"
            >
              <Alert tone="success" title={PASSED}>
                Hãy xác nhận đồng ý với điều khoản để tiếp tục nhận lớp.
              </Alert>
              <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-4 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-primary)]"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                {AGREE}
              </label>
              {acknowledge.isError && (
                <Alert tone="danger" title="Chưa ghi nhận được xác nhận">
                  {acknowledge.error.message}
                </Alert>
              )}
              <Button
                onClick={confirm}
                disabled={!agreed || readOnly}
                loading={acknowledge.isPending}
                className="gap-2 self-start"
              >
                <ClipboardCheck aria-hidden="true" className="size-4" />
                Xác nhận
              </Button>
            </section>
          ) : (
            <form
              onSubmit={submitAnswers}
              aria-label="Bài test điều khoản trách nhiệm"
              className="flex flex-col gap-5 rounded-2xl border border-border bg-bg p-6 shadow-card"
            >
              {quiz.data.questions.map((question, index) => (
                <fieldset key={question.id} className="flex flex-col gap-2">
                  <legend className="mb-1 font-medium">
                    Câu {index + 1}. {question.prompt}
                  </legend>
                  {question.choices.map((choice) => (
                    <label key={choice.id} className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name={question.id}
                        value={choice.id}
                        className="size-4 accent-[var(--color-primary)]"
                        checked={answers[question.id] === choice.id}
                        onChange={() => setAnswers({ ...answers, [question.id]: choice.id })}
                      />
                      {choice.text}
                    </label>
                  ))}
                </fieldset>
              ))}
              {localError && (
                <p role="alert" className="text-sm text-danger">
                  {localError}
                </p>
              )}
              {lastAttempt && !lastAttempt.passed && (
                <Alert tone="warning" title="Chưa đạt bài test">
                  Bạn trả lời đúng {lastAttempt.correctCount}/{lastAttempt.questionCount} câu, cần
                  tối thiểu {lastAttempt.minimumCorrect} câu. Hãy đọc lại điều khoản và làm lại.
                </Alert>
              )}
              {attempt.isError && (
                <Alert tone="danger" title="Chưa nộp được bài test">
                  {attempt.error.message}
                </Alert>
              )}
              <Button type="submit" loading={attempt.isPending} className="self-start">
                Nộp bài test
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}

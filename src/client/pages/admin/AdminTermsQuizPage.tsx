import { useState, type FormEvent } from 'react';
import { FileText, Plus, Save } from 'lucide-react';
import { Link } from 'react-router';
import {
  createQuizSchema,
  editQuizSchema,
  type QuizQuestion,
} from '../../../shared/schemas/terms-contracts';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { usePublishedContent } from '../../features/content/api';
import { useAdminTermsQuizActions, useAdminTermsQuizzes } from '../../features/terms-contracts/api';

function newQuestion(): QuizQuestion {
  const id = crypto.randomUUID().slice(0, 12);
  const first = crypto.randomUUID().slice(0, 12);
  return {
    id,
    prompt: '',
    correctChoiceId: first,
    choices: [
      { id: first, text: '' },
      { id: crypto.randomUUID().slice(0, 12), text: '' },
    ],
  };
}

export function AdminTermsQuizPage() {
  const terms = usePublishedContent('terms', 'tutor-responsibility', 'tutor');
  const quizzes = useAdminTermsQuizzes();
  const actions = useAdminTermsQuizActions();
  const current = quizzes.data?.find((item) => item.termsContentRevisionId === terms.data?.id);
  const [initialQuestions] = useState<QuizQuestion[]>(() => [newQuestion()]);
  const formKey = `${terms.data?.id ?? ''}:${current?.id ?? ''}:${current?.editVersion ?? ''}`;
  const baseForm = {
    questions: current?.questions ?? initialQuestions,
    minimumCorrect: current?.minimumCorrect ?? 1,
  };
  const [formState, setFormState] = useState<{
    key: string;
    questions: QuizQuestion[];
    minimumCorrect: number;
  }>({ key: '', ...baseForm });
  const questions = formState.key === formKey ? formState.questions : baseForm.questions;
  const minimumCorrect =
    formState.key === formKey ? formState.minimumCorrect : baseForm.minimumCorrect;
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [confirmPublish, setConfirmPublish] = useState(false);
  const readOnly = isReadOnlyPreview();
  const busy = actions.create.isPending || actions.edit.isPending || actions.publish.isPending;

  function updateForm(
    change: (form: { questions: QuizQuestion[]; minimumCorrect: number }) => {
      questions: QuizQuestion[];
      minimumCorrect: number;
    },
  ) {
    setFormState((previous) => ({
      key: formKey,
      ...change(previous.key === formKey ? previous : baseForm),
    }));
  }

  function patchQuestion(id: string, patch: Partial<QuizQuestion>) {
    updateForm((form) => ({
      ...form,
      questions: form.questions.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function patchChoice(questionId: string, choiceId: string, text: string) {
    updateForm((form) => ({
      ...form,
      questions: form.questions.map((item) =>
        item.id === questionId
          ? {
              ...item,
              choices: item.choices.map((choice) =>
                choice.id === choiceId ? { ...choice, text } : choice,
              ),
            }
          : item,
      ),
    }));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!terms.data || current?.status === 'published' || readOnly || busy) return;
    setNotice('');
    const input = { termsContentRevisionId: terms.data.id, questions, minimumCorrect };
    const parsed = current
      ? editQuizSchema.safeParse({
          editVersion: current.editVersion,
          questions,
          minimumCorrect,
        })
      : createQuizSchema.safeParse(input);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Bài kiểm tra chưa hợp lệ.');
      return;
    }
    setLocalError('');
    if (current) {
      actions.edit.mutate(
        { id: current.id, editVersion: current.editVersion, questions, minimumCorrect },
        { onSuccess: () => setNotice('Đã lưu bản nháp bài kiểm tra.') },
      );
    } else {
      actions.create.mutate(input, { onSuccess: () => setNotice('Đã tạo bản nháp bài kiểm tra.') });
    }
  }

  const actionError = actions.create.error || actions.edit.error || actions.publish.error;
  const canEdit = !readOnly && !busy && current?.status !== 'published';
  return (
    <section className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#0e2f5f]">Bài kiểm tra điều khoản gia sư</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Biên soạn câu hỏi theo đúng phiên bản điều khoản đã công bố. Gia sư phải đạt điểm và xác
            nhận trước khi ứng tuyển.
          </p>
        </div>
        <ButtonLink variant="accent" to="/admin/content/terms">
          Biên tập điều khoản
        </ButtonLink>
      </div>
      <nav aria-label="Quản lý điều khoản" className="grid gap-2 sm:grid-cols-2">
        <Link
          to="/admin/content/terms"
          className="flex min-h-11 items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-[#0e2f5f] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Nội dung điều khoản
        </Link>
        <Link
          to="/admin/terms/quiz"
          aria-current="page"
          className="flex min-h-11 items-center justify-center rounded-lg border border-[#0e2f5f] bg-[#0e2f5f] px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Bài kiểm tra điều khoản
        </Link>
      </nav>
      {readOnly && <Alert tone="info">Bản xem trước chỉ cho phép đọc.</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {actionError && <Alert tone="danger">{actionError.message}</Alert>}
      {terms.isPending || quizzes.isPending ? (
        <PageLoading label="Đang tải điều khoản và bài kiểm tra…" />
      ) : terms.isError ? (
        <Alert tone="warning" title="Chưa có điều khoản hiện hành">
          Kiểm duyệt viên cần{' '}
          <Link to="/admin/content/terms" className="underline">
            công bố điều khoản gia sư
          </Link>{' '}
          trước khi tạo bài kiểm tra.
        </Alert>
      ) : quizzes.isError ? (
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" onClick={() => void quizzes.refetch()}>
              Thử lại
            </Button>
          }
        >
          {quizzes.error.message}
        </Alert>
      ) : (
        <>
          <Alert tone={current?.status === 'published' ? 'success' : 'warning'}>
            Điều khoản “{terms.data.title}” · phiên bản {terms.data.revision}.{' '}
            {current?.status === 'published'
              ? 'Bài kiểm tra đã công bố và không thể chỉnh sửa.'
              : 'Cần công bố bài kiểm tra cho phiên bản này trước khi gia sư có thể ứng tuyển.'}
          </Alert>
          {quizzes.data.length > 0 && (
            <div className="rounded-xl border border-border bg-white p-5 shadow-card">
              <h2 className="flex items-center gap-2 font-semibold text-[#0e2f5f]">
                <FileText aria-hidden="true" className="size-5" />
                Lịch sử bài kiểm tra
              </h2>
              <ul className="mt-4 grid gap-2 text-sm">
                {quizzes.data.map((quiz) => (
                  <li
                    key={quiz.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <span>
                      Phiên bản nội dung{' '}
                      {quiz.termsContentRevisionId === terms.data.id
                        ? terms.data.revision
                        : quiz.termsContentRevisionId.slice(0, 8)}
                    </span>
                    <Badge tone={quiz.status === 'published' ? 'success' : 'neutral'}>
                      {quiz.status === 'published' ? 'Đã công bố' : 'Bản nháp'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form
            className="space-y-5 rounded-xl border border-border bg-white p-4 shadow-card sm:p-6"
            onSubmit={save}
            aria-label="Biên soạn bài kiểm tra"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-[#0e2f5f]">
                <FileText aria-hidden="true" className="size-5" />
                Câu hỏi bài kiểm tra điều khoản
              </h2>
              <Badge tone={current?.status === 'published' ? 'success' : 'warning'}>
                {current?.status === 'published' ? 'Đã công bố' : 'Bản nháp'}
              </Badge>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="max-w-60">
                <TextField
                  label="Số câu đúng tối thiểu"
                  type="number"
                  min={1}
                  max={questions.length}
                  value={minimumCorrect}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateForm((form) => ({ ...form, minimumCorrect: Number(event.target.value) }))
                  }
                  required
                />
              </div>
            </div>
            {questions.map((question, index) => (
              <fieldset key={question.id} className="rounded-xl border border-border bg-white p-5">
                <legend className="px-1 font-semibold text-[#0e2f5f]">Câu hỏi {index + 1}</legend>
                <div className="mt-3 space-y-3">
                  <TextField
                    label={`Nội dung câu ${index + 1}`}
                    value={question.prompt}
                    disabled={!canEdit}
                    onChange={(event) => patchQuestion(question.id, { prompt: event.target.value })}
                    required
                  />
                  {question.choices.map((choice, choiceIndex) => (
                    <div
                      key={choice.id}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
                    >
                      <TextField
                        label={`Lựa chọn ${choiceIndex + 1}`}
                        value={choice.text}
                        disabled={!canEdit}
                        onChange={(event) =>
                          patchChoice(question.id, choice.id, event.target.value)
                        }
                        required
                      />
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`correct-${question.id}`}
                          value={choice.id}
                          checked={question.correctChoiceId === choice.id}
                          disabled={!canEdit}
                          onChange={() =>
                            patchQuestion(question.id, { correctChoiceId: choice.id })
                          }
                        />
                        Đáp án đúng
                      </label>
                      <Button
                        variant="secondary"
                        disabled={!canEdit || question.choices.length <= 2}
                        onClick={() =>
                          updateForm((form) => ({
                            ...form,
                            questions: form.questions.map((item) =>
                              item.id === question.id
                                ? {
                                    ...item,
                                    choices: item.choices.filter((entry) => entry.id !== choice.id),
                                    correctChoiceId:
                                      item.correctChoiceId === choice.id
                                        ? item.choices.find((entry) => entry.id !== choice.id)!.id
                                        : item.correctChoiceId,
                                  }
                                : item,
                            ),
                          }))
                        }
                      >
                        Xóa lựa chọn
                      </Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={!canEdit || question.choices.length >= 5}
                      onClick={() =>
                        patchQuestion(question.id, {
                          choices: [
                            ...question.choices,
                            { id: crypto.randomUUID().slice(0, 12), text: '' },
                          ],
                        })
                      }
                    >
                      Thêm lựa chọn
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!canEdit || questions.length <= 1}
                      onClick={() => {
                        updateForm((form) => ({
                          questions: form.questions.filter((item) => item.id !== question.id),
                          minimumCorrect: Math.min(form.minimumCorrect, form.questions.length - 1),
                        }));
                      }}
                    >
                      Xóa câu hỏi
                    </Button>
                  </div>
                </div>
              </fieldset>
            ))}
            <Button
              variant="secondary"
              disabled={!canEdit || questions.length >= 20}
              onClick={() =>
                updateForm((form) => ({ ...form, questions: [...form.questions, newQuestion()] }))
              }
            >
              <Plus aria-hidden="true" className="size-4" />
              Thêm câu hỏi
            </Button>
            {localError && <Alert tone="danger">{localError}</Alert>}
            {current?.status !== 'published' && (
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  loading={actions.create.isPending || actions.edit.isPending}
                  disabled={!canEdit}
                >
                  <Save aria-hidden="true" className="size-4" />
                  Lưu bản nháp
                </Button>
                <Button
                  variant="secondary"
                  disabled={!current || !canEdit}
                  onClick={() => setConfirmPublish(true)}
                >
                  Công bố bài kiểm tra
                </Button>
              </div>
            )}
          </form>
        </>
      )}
      <ConfirmDialog
        open={confirmPublish}
        title="Công bố bài kiểm tra"
        description="Sau khi công bố, câu hỏi và đáp án của phiên bản này được giữ nguyên. Gia sư sẽ làm bài trên hệ thống trước khi ứng tuyển."
        confirmLabel="Công bố"
        loading={actions.publish.isPending}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={() => {
          if (!current || current.status !== 'draft') return;
          actions.publish.mutate(
            { id: current.id, editVersion: current.editVersion },
            {
              onSuccess: () => {
                setConfirmPublish(false);
                setNotice('Đã công bố bài kiểm tra.');
              },
            },
          );
        }}
      />
    </section>
  );
}

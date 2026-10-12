import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Clock, Phone } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Subject } from '../../../shared/schemas/tutors';
import {
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  REQUEST_GRADE_OPTIONS,
  createParentRequestSchema,
  educationLevelForGrade,
  type CreateParentRequestInput,
  type EducationLevel,
  type OwnParentRequest,
} from '../../../shared/schemas/requests';
import { DEFAULT_TIMEZONE } from '../../../shared/schemas/availability';
import {
  HANOI_CITY,
  HANOI_WARDS,
  hanoiArea,
  wardOfArea,
  type HanoiWard,
} from '../../../shared/schemas/hanoi-wards';
import {
  isRequestGridWindow,
  RequestScheduleGrid,
} from '../../components/domain/RequestScheduleGrid';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useCreateParentRequest,
  useOwnParentRequest,
  useSubmitParentRequest,
  useUpdateParentRequest,
} from '../../features/parent-requests/api';
import { WEEKDAY_LABELS } from '../../features/parent-requests/format';
import { useSubjects } from '../../features/tutor-profile/api';
import { api, fieldErrors, isApiError } from '../../lib/api-client';

type Window = CreateParentRequestInput['schedule']['windows'][number];
type FormState = {
  studentName: string;
  subjectId: string;
  grade: string;
  educationLevel: EducationLevel | '';
  mode: 'online' | 'offline';
  area: string;
  expectedBudget: string;
  sessionsPerWeek: string;
  tutorRequirements: string;
  studentTraits: string;
  /** Kept for requests saved before the Figma form; not shown as a separate field. */
  description: string;
  discussLater: boolean;
  windows: Window[];
  contactPhone: string;
  /** Kept unchanged on edit; the Figma form has no exact-address field. */
  contactAddress: string;
};

/** Select value for a stored area that predates the current phường/xã catalogue. */
const LEGACY_AREA = '__legacy__';

const optionalNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

function toForm(request?: OwnParentRequest): FormState {
  return {
    studentName: request?.studentName ?? '',
    subjectId: request?.subjectId ?? '',
    grade: request?.grade ?? '',
    educationLevel: request?.educationLevel ?? '',
    mode: request?.mode ?? 'offline',
    area: request?.area ?? '',
    expectedBudget: optionalNumber(request?.expectedBudgetMinor),
    sessionsPerWeek: optionalNumber(request?.sessionsPerWeek),
    tutorRequirements: request?.tutorRequirements ?? '',
    studentTraits: request?.studentTraits ?? '',
    description: request?.description ?? '',
    discussLater: request?.schedule.discussLater ?? false,
    windows: request?.schedule.windows ?? [],
    contactPhone: request?.contactPhone ?? '',
    contactAddress: request?.contactAddress ?? '',
  };
}

function toInput(form: FormState): CreateParentRequestInput {
  return {
    studentName: form.studentName.trim() || null,
    subjectId: form.subjectId,
    grade: form.grade,
    educationLevel: form.educationLevel || null,
    mode: form.mode,
    area: form.area.trim() || null,
    expectedBudgetMinor: form.expectedBudget.trim() ? Number(form.expectedBudget) : null,
    sessionsPerWeek: form.sessionsPerWeek.trim() ? Number(form.sessionsPerWeek) : null,
    tutorRequirements: form.tutorRequirements,
    studentTraits: form.studentTraits,
    description: form.description,
    schedule: {
      timezone: DEFAULT_TIMEZONE,
      discussLater: form.discussLater,
      windows: form.discussLater ? [] : form.windows,
    },
    contactPhone: form.contactPhone.trim() || null,
    contactAddress: form.contactAddress.trim() || null,
  };
}

export function ParentRequestFormPage() {
  const { id } = useParams();
  const detail = useOwnParentRequest(id);
  const subjects = useSubjects();

  if (subjects.isPending || (id && detail.isPending))
    return <PageLoading label="Đang tải biểu mẫu yêu cầu…" />;
  if (subjects.isError || (id && detail.isError)) {
    const error = subjects.error ?? detail.error;
    if (id && isApiError(error, 'REQUEST_NOT_FOUND')) {
      return (
        <EmptyState
          title="Không tìm thấy yêu cầu"
          description="Yêu cầu này không tồn tại hoặc bạn không có quyền chỉnh sửa."
          action={<ButtonLink to="/parent">Về danh sách yêu cầu</ButtonLink>}
        />
      );
    }
    return (
      <Alert
        tone="danger"
        title="Không tải được biểu mẫu yêu cầu"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void subjects.refetch();
              if (id) void detail.refetch();
            }}
          >
            Thử lại
          </Button>
        }
      >
        {error?.message}
      </Alert>
    );
  }
  if (!subjects.data.length) {
    return (
      <EmptyState
        title="Chưa có môn học"
        description="Chưa thể tạo yêu cầu khi danh mục môn học chưa được công bố."
        action={<ButtonLink to="/parent">Về danh sách yêu cầu</ButtonLink>}
      />
    );
  }
  if (id && detail.data?.status !== 'draft' && detail.data?.status !== 'submitted') {
    return (
      <EmptyState
        title="Không thể chỉnh sửa yêu cầu"
        description="Trạng thái hiện tại không cho phép chỉnh sửa yêu cầu này."
        action={
          <ButtonLink to={`/parent/requests/${encodeURIComponent(id)}`}>Xem chi tiết</ButtonLink>
        }
      />
    );
  }

  return (
    <RequestEditor
      key={id ?? 'new'}
      request={id ? detail.data : undefined}
      subjects={subjects.data}
    />
  );
}

function RequestEditor({ request, subjects }: { request?: OwnParentRequest; subjects: Subject[] }) {
  const navigate = useNavigate();
  const create = useCreateParentRequest();
  const update = useUpdateParentRequest();
  const submit = useSubmitParentRequest();
  const [form, setForm] = useState<FormState>(() => toForm(request));
  const [openedVersion] = useState(request?.version);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [createdDraft, setCreatedDraft] = useState<OwnParentRequest | null>(null);
  const createKey = useRef(crypto.randomUUID());
  const busy = create.isPending || update.isPending || submit.isPending;
  const backTo = request ? `/parent/requests/${encodeURIComponent(request.id)}` : '/parent';
  const customWindows = form.windows
    .map((window, index) => ({ window, index }))
    .filter(({ window }) => !isRequestGridWindow(window));
  const errors = {
    ...fieldErrors(create.error ?? update.error ?? submit.error),
    ...localErrors,
  };

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }));
    setLocalErrors({});
    create.reset();
    update.reset();
    createKey.current = crypto.randomUUID();
  }

  function edit<K extends keyof FormState>(key: K, value: FormState[K]) {
    patch({ [key]: value } as Partial<FormState>);
  }

  function changeWindow(index: number, change: Partial<Window>) {
    edit(
      'windows',
      form.windows.map((window, i) => (i === index ? { ...window, ...change } : window)),
    );
  }

  function removeWindow(index: number) {
    edit(
      'windows',
      form.windows.filter((_, i) => i !== index),
    );
  }

  function localValidation(intent: 'save' | 'send') {
    const result = createParentRequestSchema.safeParse(toInput(form));
    const nextErrors: Record<string, string> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        if (!(path in nextErrors)) nextErrors[path] = issue.message;
      }
    }
    if (intent === 'send' || request?.status === 'submitted') {
      if (!form.studentName.trim()) nextErrors.studentName = 'Cần họ và tên trước khi gửi yêu cầu.';
      if (!form.contactPhone.trim())
        nextErrors.contactPhone = 'Cần số điện thoại trước khi gửi yêu cầu.';
      if (form.mode === 'offline' && !form.area.trim())
        nextErrors.area = 'Cần chọn phường/xã cho hình thức học offline.';
      if (!form.educationLevel) nextErrors.educationLevel = 'Cần chọn cấp học.';
    }
    setLocalErrors(nextErrors);
    return result.success && Object.keys(nextErrors).length === 0 ? result.data : null;
  }

  async function persist(intent: 'save' | 'send') {
    if (busy) return;
    const input = localValidation(intent);
    if (!input) return;
    let savedDraft: OwnParentRequest | null = null;
    try {
      if (request) {
        const confirmed = await update.mutateAsync({
          id: request.id,
          input: { ...input, version: openedVersion! },
        });
        navigate(`/parent/requests/${encodeURIComponent(confirmed.id)}`);
        return;
      }
      const created = await create.mutateAsync({ input, idempotencyKey: createKey.current });
      savedDraft = created;
      setCreatedDraft(created);
      const confirmed = await submit.mutateAsync({ id: created.id, version: created.version });
      if (confirmed.status === 'sourcing' || confirmed.status === 'submitted')
        navigate(`/parent/requests/${encodeURIComponent(confirmed.id)}`);
    } catch {
      // A lost submit response may mean the server accepted the request. Recheck before offering retry.
      if (savedDraft) await reconcileCreatedDraft(savedDraft);
    }
  }

  async function reconcileCreatedDraft(draft: OwnParentRequest) {
    try {
      const current = await api.get<OwnParentRequest>(
        `/parent/requests/${encodeURIComponent(draft.id)}`,
      );
      setCreatedDraft(current);
      if (current.status === 'sourcing' || current.status === 'submitted')
        navigate(`/parent/requests/${encodeURIComponent(current.id)}`);
    } catch {
      // The detail link remains available if the status check cannot be completed.
    }
  }

  async function retrySubmission() {
    if (!createdDraft || busy) return;
    try {
      const confirmed = await submit.mutateAsync({
        id: createdDraft.id,
        version: createdDraft.version,
      });
      if (confirmed.status === 'sourcing' || confirmed.status === 'submitted')
        navigate(`/parent/requests/${encodeURIComponent(confirmed.id)}`);
    } catch {
      await reconcileCreatedDraft(createdDraft);
    }
  }

  if (createdDraft) {
    return (
      <section className="flex max-w-2xl flex-col gap-5">
        <PageHeader
          title="Yêu cầu đã được tạo"
          description={`Yêu cầu ${createdDraft.code} đã được lưu nháp nhưng chưa gửi. Hãy kiểm tra trạng thái hiện tại trước khi gửi lại.`}
        />
        {submit.isError && (
          <Alert tone="danger" title="Chưa gửi được yêu cầu">
            {submit.error.message}
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void retrySubmission()} loading={submit.isPending}>
            Thử gửi lại
          </Button>
          <ButtonLink
            to={`/parent/requests/${encodeURIComponent(createdDraft.id)}`}
            variant="secondary"
          >
            Xem trạng thái yêu cầu
          </ButtonLink>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-primary">Tìm kiếm gia sư</h1>
          <p className="mt-1 text-sm text-muted">
            Gửi yêu cầu để chúng tôi tìm gia sư phù hợp cho bạn
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="tel:0394618480"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Phone aria-hidden="true" className="size-4 text-accent" />
            <span className="text-white/80">Hotline:</span>
            <span className="font-semibold text-accent">0394 618 480</span>
          </a>
          <Link
            to={backTo}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Quay lại
          </Link>
        </div>
      </header>
      {(create.isError || update.isError) && !Object.keys(errors).length && (
        <Alert tone="danger" title="Chưa lưu được yêu cầu">
          {(create.error ?? update.error)?.message}
        </Alert>
      )}
      {Object.values(errors).some(Boolean) && (
        <Alert tone="danger" title="Cần kiểm tra thông tin">
          Sửa các trường có thông báo lỗi bên dưới rồi thử lại.
        </Alert>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-bg shadow-card">
        <div className="border-b border-border bg-surface px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-primary">
            {request ? `Chỉnh sửa yêu cầu ${request.code}` : 'Tạo yêu cầu tìm gia sư'}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Điền thông tin để chúng tôi tìm gia sư phù hợp
          </p>
        </div>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void persist(request ? 'save' : 'send');
          }}
          noValidate
          className="min-w-0"
        >
          <div className="flex min-w-0 flex-col gap-5 px-4 py-6 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Họ và tên"
                required
                placeholder="Nhập họ và tên"
                autoComplete="off"
                maxLength={100}
                value={form.studentName}
                onChange={(event) => edit('studentName', event.target.value)}
                error={errors.studentName}
              />
              <TextField
                label="Số điện thoại"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={16}
                placeholder="Nhập số điện thoại"
                value={form.contactPhone}
                onChange={(event) => edit('contactPhone', event.target.value)}
                error={errors.contactPhone}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                label="Môn học"
                required
                value={form.subjectId}
                onChange={(event) => edit('subjectId', event.target.value)}
                error={errors.subjectId}
              >
                <option value="">Chọn môn</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Lớp"
                required
                value={form.grade}
                onChange={(event) =>
                  patch({
                    grade: event.target.value,
                    educationLevel: educationLevelForGrade(event.target.value) ?? '',
                  })
                }
                error={errors.grade}
              >
                <option value="">Chọn lớp</option>
                {REQUEST_GRADE_OPTIONS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Cấp học"
                required
                value={form.educationLevel}
                onChange={(event) =>
                  edit('educationLevel', event.target.value as FormState['educationLevel'])
                }
                error={errors.educationLevel}
              >
                <option value="">Chọn cấp</option>
                {EDUCATION_LEVELS.map((level) => (
                  <option
                    key={level}
                    value={level}
                    disabled={!!form.grade && educationLevelForGrade(form.grade) !== level}
                  >
                    {EDUCATION_LEVEL_LABELS[level]}
                  </option>
                ))}
              </SelectField>
            </div>

            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium">
                Hình thức dạy{' '}
                <span aria-hidden="true" className="text-danger">
                  *
                </span>
              </legend>
              <div className="flex flex-wrap gap-x-8">
                {(['offline', 'online'] as const).map((mode) => (
                  <label key={mode} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="request-mode"
                      checked={form.mode === mode}
                      onChange={() => edit('mode', mode)}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                    {mode === 'online' ? 'Online' : 'Offline (Tại nhà)'}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex min-w-0 flex-col gap-4">
              <legend className="mb-2 text-sm font-semibold text-primary">Địa chỉ học</legend>
              {form.mode === 'online' && (
                <p className="-mt-2 text-xs text-muted">Học online có thể để trống địa chỉ học.</p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Khu vực"
                  value={HANOI_CITY}
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  className="cursor-not-allowed bg-surface text-muted"
                />
                <SelectField
                  label="Phường/Xã"
                  required={form.mode === 'offline'}
                  value={wardOfArea(form.area) ?? (form.area ? LEGACY_AREA : '')}
                  onChange={(event) =>
                    edit(
                      'area',
                      event.target.value === LEGACY_AREA
                        ? form.area
                        : event.target.value
                          ? hanoiArea(event.target.value as HanoiWard)
                          : '',
                    )
                  }
                  error={errors.area}
                >
                  <option value="">Chọn phường/xã</option>
                  {form.area && !wardOfArea(form.area) && (
                    <option value={LEGACY_AREA}>{form.area} (khu vực đã lưu trước đây)</option>
                  )}
                  {HANOI_WARDS.map((ward) => (
                    <option key={ward} value={ward}>
                      {ward}
                    </option>
                  ))}
                </SelectField>
              </div>
              <TextField
                label="Địa chỉ cụ thể"
                placeholder="Số nhà, tên đường, ngõ/ngách (không bắt buộc)"
                hint="Không công khai; chỉ gia sư được kiểm duyệt viên gán mới xem được."
                maxLength={200}
                value={form.contactAddress}
                onChange={(event) => edit('contactAddress', event.target.value)}
                error={errors.contactAddress}
              />
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Học phí (VNĐ/buổi)"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000000}
                step={1000}
                placeholder="200000"
                value={form.expectedBudget}
                onChange={(event) => edit('expectedBudget', event.target.value)}
                error={errors.expectedBudgetMinor}
              />
              <TextField
                label="Số buổi/tuần"
                type="number"
                inputMode="numeric"
                min={1}
                max={14}
                placeholder="3"
                value={form.sessionsPerWeek}
                onChange={(event) => edit('sessionsPerWeek', event.target.value)}
                error={errors.sessionsPerWeek}
              />
            </div>

            <fieldset className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface/50 p-4">
              <legend className="px-2 font-semibold text-primary">
                <span className="inline-flex items-center gap-2">
                  <Clock aria-hidden="true" className="size-4" />
                  Thời gian có thể học
                </span>
              </legend>
              <RequestScheduleGrid
                value={form.windows}
                onChange={(windows) => edit('windows', windows)}
                disabled={form.discussLater}
              />
              {!form.discussLater &&
                customWindows.map(({ window, index }) => (
                  <div
                    key={index}
                    className="grid min-w-0 gap-3 rounded-lg border border-border bg-bg p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                  >
                    <SelectField
                      label={`Ngày khung giờ ${index + 1}`}
                      value={window.weekday}
                      onChange={(event) =>
                        changeWindow(index, { weekday: Number(event.target.value) })
                      }
                      error={errors[`schedule.windows.${index}.weekday`]}
                    >
                      {WEEKDAY_LABELS.map((day, dayIndex) => (
                        <option key={day} value={dayIndex + 1}>
                          {day}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      label={`Bắt đầu khung giờ ${index + 1}`}
                      type="time"
                      value={window.startLocal}
                      onChange={(event) => changeWindow(index, { startLocal: event.target.value })}
                      error={errors[`schedule.windows.${index}.startLocal`]}
                    />
                    <TextField
                      label={`Kết thúc khung giờ ${index + 1}`}
                      type="time"
                      value={window.endLocal}
                      onChange={(event) => changeWindow(index, { endLocal: event.target.value })}
                      error={errors[`schedule.windows.${index}.endLocal`]}
                    />
                    <Button type="button" variant="secondary" onClick={() => removeWindow(index)}>
                      Xóa
                    </Button>
                  </div>
                ))}
              {errors['schedule.windows'] && (
                <p role="alert" className="text-sm text-danger">
                  {errors['schedule.windows']}
                </p>
              )}
              <label className="flex min-h-11 items-center gap-2 border-t border-border pt-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.discussLater}
                  onChange={(event) =>
                    patch({
                      discussLater: event.target.checked,
                      windows: event.target.checked ? [] : form.windows,
                    })
                  }
                  className="size-4 accent-[var(--color-primary)]"
                />
                Trao đổi thời gian sau
              </label>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextareaField
                label="Yêu cầu đối với gia sư"
                placeholder="Ví dụ: Gia sư nữ, có kinh nghiệm luyện thi..."
                maxLength={500}
                value={form.tutorRequirements}
                onChange={(event) => edit('tutorRequirements', event.target.value)}
                error={errors.tutorRequirements}
              />
              <TextareaField
                label="Đặc điểm học sinh"
                placeholder="Ví dụ: Cần phương pháp giảng dạy sáng tạo..."
                maxLength={500}
                value={form.studentTraits}
                onChange={(event) => edit('studentTraits', event.target.value)}
                error={errors.studentTraits}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t border-border bg-surface px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => navigate(backTo)}
            >
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              {request ? 'Lưu thay đổi' : 'Gửi yêu cầu'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Clock, Phone, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Subject } from '../../../shared/schemas/tutors';
import {
  CONTACT_SHARING_CONSENT_TEXT,
  REQUEST_GRADE_OPTIONS,
  createParentRequestSchema,
  type CreateParentRequestInput,
  type OwnParentRequest,
} from '../../../shared/schemas/requests';
import { DEFAULT_TIMEZONE } from '../../../shared/schemas/availability';
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
  subjectId: string;
  grade: string;
  mode: 'online' | 'offline';
  area: string;
  expectedBudget: string;
  description: string;
  discussLater: boolean;
  windows: Window[];
  contactPhone: string;
  contactAddress: string;
};

function toForm(request?: OwnParentRequest): FormState {
  return {
    subjectId: request?.subjectId ?? '',
    grade: request?.grade ?? '',
    mode: request?.mode ?? 'online',
    area: request?.area ?? '',
    expectedBudget:
      request?.expectedBudgetMinor === null || request?.expectedBudgetMinor === undefined
        ? ''
        : String(request.expectedBudgetMinor),
    description: request?.description ?? '',
    discussLater: request?.schedule.discussLater ?? false,
    windows: request?.schedule.windows ?? [],
    contactPhone: request?.contactPhone ?? '',
    contactAddress: request?.contactAddress ?? '',
  };
}

function toInput(form: FormState): CreateParentRequestInput {
  return {
    subjectId: form.subjectId,
    grade: form.grade,
    mode: form.mode,
    area: form.area.trim() || null,
    expectedBudgetMinor: form.expectedBudget.trim() ? Number(form.expectedBudget) : null,
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
  const [consent, setConsent] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [createdDraft, setCreatedDraft] = useState<OwnParentRequest | null>(null);
  const createKey = useRef(crypto.randomUUID());
  const busy = create.isPending || update.isPending || submit.isPending;
  const customWindows = form.windows
    .map((window, index) => ({ window, index }))
    .filter(({ window }) => !isRequestGridWindow(window));
  const errors = {
    ...fieldErrors(create.error ?? update.error),
    ...localErrors,
  };

  function edit<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setLocalErrors({});
    create.reset();
    update.reset();
    createKey.current = crypto.randomUUID();
  }

  function changeWindow(index: number, patch: Partial<Window>) {
    edit(
      'windows',
      form.windows.map((window, i) => (i === index ? { ...window, ...patch } : window)),
    );
  }

  function addWindow() {
    if (form.windows.length >= 14) return;
    edit('windows', [
      ...form.windows,
      { weekday: Math.min(form.windows.length + 1, 7), startLocal: '18:00', endLocal: '19:00' },
    ]);
  }

  function removeWindow(index: number) {
    edit(
      'windows',
      form.windows.filter((_, i) => i !== index),
    );
  }

  function localValidation(intent: 'draft' | 'send') {
    const result = createParentRequestSchema.safeParse(toInput(form));
    const nextErrors: Record<string, string> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        if (!(path in nextErrors)) nextErrors[path] = issue.message;
      }
    }
    if (intent === 'send') {
      if (!form.contactPhone.trim())
        nextErrors.contactPhone = 'Cần số điện thoại trước khi gửi yêu cầu.';
      if (!form.description.trim())
        nextErrors.description = 'Cần mô tả nhu cầu trước khi gửi yêu cầu.';
      if (!consent) nextErrors.consent = 'Cần đồng ý chia sẻ liên hệ trước khi gửi yêu cầu.';
    }
    setLocalErrors(nextErrors);
    return result.success && Object.keys(nextErrors).length === 0 ? result.data : null;
  }

  async function persist(intent: 'draft' | 'send') {
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
      if (intent === 'draft') {
        navigate(`/parent/requests/${encodeURIComponent(created.id)}`);
        return;
      }
      setCreatedDraft(created);
      const confirmed = await submit.mutateAsync({ id: created.id, version: created.version });
      if (confirmed.status === 'sourcing' || confirmed.status === 'submitted')
        navigate(`/parent/requests/${encodeURIComponent(confirmed.id)}`);
    } catch {
      // A lost submit response may mean the server accepted the request. Recheck before offering retry.
      if (savedDraft && intent === 'send') await reconcileCreatedDraft(savedDraft);
    }
  }

  async function reconcileCreatedDraft(draft: OwnParentRequest) {
    try {
      const current = await api.get<OwnParentRequest>(
        `/parent/requests/${encodeURIComponent(draft.id)}`,
      );
      setCreatedDraft(current);
      if (current.version !== draft.version) setConsent(false);
      if (current.status === 'sourcing' || current.status === 'submitted')
        navigate(`/parent/requests/${encodeURIComponent(current.id)}`);
    } catch {
      // The detail link remains available if the status check cannot be completed.
    }
  }

  async function retrySubmission() {
    if (!createdDraft || !consent || busy) return;
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
          description={`Yêu cầu ${createdDraft.code} đã được tạo. Hãy kiểm tra trạng thái hiện tại trước khi gửi lại.`}
        />
        {submit.isError && (
          <Alert tone="danger" title="Chưa gửi được yêu cầu">
            {submit.error.message}
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => void retrySubmission()}
            loading={submit.isPending}
            disabled={!consent}
          >
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
          <h1 className="text-3xl font-semibold text-primary">Thuê Gia Sư</h1>
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
            to={request ? `/parent/requests/${encodeURIComponent(request.id)}` : '/parent'}
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
            Điền thông tin cần thiết để chúng tôi tìm gia sư phù hợp
          </p>
        </div>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void persist('draft');
          }}
          noValidate
          className="min-w-0"
        >
          <div className="flex min-w-0 flex-col gap-5 px-4 py-6 sm:px-6">
            <TextField
              label="Khu vực chung"
              placeholder="Ví dụ: Thanh Xuân, Hà Nội"
              hint="Ví dụ quận/huyện; bắt buộc khi học trực tiếp. Địa chỉ cụ thể nhập ở phần liên hệ riêng tư."
              required={form.mode === 'offline'}
              maxLength={120}
              value={form.area}
              onChange={(event) => edit('area', event.target.value)}
              error={errors.area}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Môn học"
                required
                value={form.subjectId}
                onChange={(event) => edit('subjectId', event.target.value)}
                error={errors.subjectId}
              >
                <option value="">Chọn môn học</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Lớp học"
                required
                value={form.grade}
                onChange={(event) => edit('grade', event.target.value)}
                error={errors.grade}
              >
                <option value="">Chọn lớp học</option>
                {REQUEST_GRADE_OPTIONS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </SelectField>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Hình thức dạy</legend>
              <div className="flex flex-wrap gap-4">
                {(['online', 'offline'] as const).map((mode) => (
                  <label key={mode} className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="request-mode"
                      checked={form.mode === mode}
                      onChange={() => edit('mode', mode)}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                    {mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="max-w-sm">
              <TextField
                label="Mức chi dự kiến (₫)"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000000}
                step={1000}
                hint="Tùy chọn; số tiền dự kiến, chưa phải giá hay phí được duyệt."
                value={form.expectedBudget}
                onChange={(event) => edit('expectedBudget', event.target.value)}
                error={errors.expectedBudgetMinor}
              />
            </div>
            <TextareaField
              label="Mô tả nhu cầu"
              hint="Cần mô tả trước khi gửi; có thể để trống khi lưu bản nháp. Tối đa 1.000 ký tự."
              maxLength={1000}
              value={form.description}
              onChange={(event) => edit('description', event.target.value)}
              error={errors.description}
            />

            <fieldset className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface/50 p-4">
              <legend className="px-2 font-semibold text-primary">
                <span className="inline-flex items-center gap-2">
                  <Clock aria-hidden="true" className="size-4" />
                  Thời gian học
                </span>
              </legend>
              <p className="text-sm text-muted">
                Chọn các khung bạn có thể học theo {DEFAULT_TIMEZONE}. Chỉ cần một khung trùng lịch
                rảnh để hệ thống gợi ý gia sư; đây chưa phải lịch học đã chốt.
              </p>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.discussLater}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      discussLater: event.target.checked,
                      windows: event.target.checked ? [] : current.windows,
                    }));
                    setLocalErrors({});
                    create.reset();
                    update.reset();
                    createKey.current = crypto.randomUUID();
                  }}
                  className="size-4 accent-[var(--color-primary)]"
                />
                Trao đổi thời gian sau
              </label>
              <RequestScheduleGrid
                value={form.windows}
                onChange={(windows) => edit('windows', windows)}
                disabled={form.discussLater}
              />
              {!form.discussLater && (
                <>
                  {customWindows.length > 0 && (
                    <p className="text-sm font-medium text-primary">Khung giờ khác đã lưu</p>
                  )}
                  {customWindows.map(({ window, index }) => (
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
                        onChange={(event) =>
                          changeWindow(index, { startLocal: event.target.value })
                        }
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
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={form.windows.length >= 14}
                    onClick={addWindow}
                  >
                    Thêm giờ khác
                  </Button>
                </>
              )}
            </fieldset>

            <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface/50 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-primary">
                <ShieldCheck aria-hidden="true" className="size-4" />
                Liên hệ riêng tư
              </h3>
              <p className="text-sm text-muted">
                Bạn và kiểm duyệt viên có thể xem liên hệ này. Gia sư chỉ xem được sau khi bạn đồng
                ý, gửi yêu cầu và kiểm duyệt viên gán gia sư đó. Dữ liệu được giữ đến khi xóa tài
                khoản.
              </p>
              <TextField
                label="Số điện thoại liên hệ"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={16}
                hint="Cần trước khi gửi; có thể để trống khi lưu bản nháp."
                value={form.contactPhone}
                onChange={(event) => edit('contactPhone', event.target.value)}
                error={errors.contactPhone}
              />
              <TextareaField
                label="Địa chỉ liên hệ cụ thể"
                hint="Tùy chọn. Chỉ nhập khi cần dạy trực tiếp; tối đa 200 ký tự."
                maxLength={200}
                value={form.contactAddress}
                onChange={(event) => edit('contactAddress', event.target.value)}
                error={errors.contactAddress}
              />
            </div>

            {!request && (
              <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-info-surface/40 p-4">
                <h3 className="flex items-center gap-2 font-semibold text-primary">
                  <ShieldCheck aria-hidden="true" className="size-4" />
                  Đồng ý trước khi gửi
                </h3>
                <p className="text-sm text-muted">
                  Khi bạn gửi yêu cầu, môn học, lớp học, hình thức, khu vực chung, mức chi dự kiến,
                  mô tả và lịch mong muốn sẽ hiển thị trong danh sách lớp tìm gia sư. Số điện thoại
                  và địa chỉ cụ thể không được công khai.
                </p>
                <label className="flex min-h-11 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => {
                      setConsent(event.target.checked);
                      setLocalErrors((current) => ({ ...current, consent: '' }));
                    }}
                    className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
                    aria-invalid={Boolean(errors.consent)}
                  />
                  <span className="text-sm">{CONTACT_SHARING_CONSENT_TEXT}</span>
                </label>
                {errors.consent && (
                  <p role="alert" className="text-sm text-danger">
                    {errors.consent}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t border-border bg-surface px-4 py-4 sm:px-6">
            <Button type="submit" variant={request ? 'primary' : 'secondary'} loading={busy}>
              {request ? 'Lưu thay đổi' : 'Lưu bản nháp'}
            </Button>
            {!request && (
              <Button
                type="button"
                loading={busy}
                disabled={!consent}
                onClick={() => void persist('send')}
              >
                Gửi yêu cầu
              </Button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

import { useId, useState, type FormEvent } from 'react';
import {
  APPROVAL_STATUS_LABELS,
  GRADE_OPTIONS,
  MAX_PREFERRED_AREAS,
  PROFILE_REQUIREMENT_LABELS,
  RATE_STEP,
  type ApprovalStatus,
  type Subject,
  type TutorProfile,
} from '../../../shared/schemas/tutors';
import { useSession } from '../../app/auth';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import { TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useOwnProfile,
  useSubjects,
  useSubmitProfile,
  useUpdateProfile,
} from '../../features/tutor-profile/api';
import { fieldErrors } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

interface FormState {
  displayName: string;
  bio: string;
  subjectIds: string[];
  hourlyRate: string; // raw input; validated by the server
  teachesOnline: boolean;
  teachesOffline: boolean;
  preferredGrades: string[];
  preferredAreas: string[];
  negotiableTime: boolean;
}

function toForm(profile: TutorProfile | null, fallbackName: string): FormState {
  return {
    displayName: profile?.displayName ?? fallbackName,
    bio: profile?.bio ?? '',
    subjectIds: profile?.subjects.map((s) => s.id) ?? [],
    hourlyRate: profile?.hourlyRateMinor != null ? String(profile.hourlyRateMinor) : '',
    teachesOnline: profile?.teachesOnline ?? false,
    teachesOffline: profile?.teachesOffline ?? false,
    preferredGrades: profile?.preferredGrades ?? [],
    preferredAreas: profile?.preferredAreas ?? [],
    negotiableTime: profile?.negotiableTime ?? false,
  };
}

const STATUS_TONE: Record<ApprovalStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  draft: 'neutral',
  pending: 'info',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_HELP: Record<ApprovalStatus, string> = {
  draft: 'Hồ sơ chưa công khai. Hoàn thiện thông tin rồi gửi duyệt.',
  pending: 'Quản trị viên đang xem xét hồ sơ. Hồ sơ chưa xuất hiện trong tìm kiếm.',
  approved: 'Hồ sơ đã được duyệt.',
  rejected: 'Hồ sơ bị từ chối. Hãy chỉnh sửa và gửi duyệt lại.',
};

export function TutorProfilePage() {
  const profileQuery = useOwnProfile();
  const subjectsQuery = useSubjects();

  if (profileQuery.isPending || subjectsQuery.isPending) return <PageLoading />;
  if (profileQuery.isError || subjectsQuery.isError) {
    return (
      <Alert
        tone="danger"
        title="Không tải được hồ sơ"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void profileQuery.refetch();
              void subjectsQuery.refetch();
            }}
          >
            Thử lại
          </Button>
        }
      >
        {(profileQuery.error ?? subjectsQuery.error)?.message}
      </Alert>
    );
  }
  return <ProfileForm profile={profileQuery.data} subjects={subjectsQuery.data} />;
}

function ProfileForm({ profile, subjects }: { profile: TutorProfile | null; subjects: Subject[] }) {
  const { user } = useSession();
  const initial = toForm(profile, user?.displayName ?? '');
  const [form, setForm] = useState<FormState>(initial);
  const [areaDraft, setAreaDraft] = useState('');
  const [areaError, setAreaError] = useState<string | null>(null);
  const gradeErrorId = useId();
  const update = useUpdateProfile();
  const submit = useSubmitProfile();
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const hasUnsavedChanges = dirty || areaDraft.trim().length > 0;
  const errors = fieldErrors(update.error);
  const gradeError =
    errors.preferredGrades ??
    Object.entries(errors).find(([field]) => field.startsWith('preferredGrades.'))?.[1];
  const preferredAreaError =
    areaError ??
    errors.preferredAreas ??
    Object.entries(errors).find(([field]) => field.startsWith('preferredAreas.'))?.[1];
  const rate = Number(form.hourlyRate);
  const status = profile?.approvalStatus ?? 'draft';

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleSubject(id: string, checked: boolean) {
    set('subjectIds', checked ? [...form.subjectIds, id] : form.subjectIds.filter((s) => s !== id));
  }

  function toggleGrade(grade: string, checked: boolean) {
    set(
      'preferredGrades',
      checked
        ? [...form.preferredGrades, grade]
        : form.preferredGrades.filter((selected) => selected !== grade),
    );
  }

  function areaWithDraft(): string[] | null {
    const area = areaDraft.trim();
    if (!area) {
      if (areaDraft.length > 0) setAreaDraft('');
      return form.preferredAreas;
    }
    if (area.length > 80) {
      setAreaError('Khu vực tối đa 80 ký tự.');
      return null;
    }
    if (form.preferredAreas.length >= MAX_PREFERRED_AREAS) {
      setAreaError(`Chỉ được chọn tối đa ${MAX_PREFERRED_AREAS} khu vực.`);
      return null;
    }
    if (
      form.preferredAreas.some(
        (selected) => selected.toLocaleLowerCase('vi') === area.toLocaleLowerCase('vi'),
      )
    ) {
      setAreaError('Khu vực này đã được chọn.');
      return null;
    }
    setAreaError(null);
    return [...form.preferredAreas, area];
  }

  function addArea() {
    const areas = areaWithDraft();
    if (!areas || areas === form.preferredAreas) return;
    set('preferredAreas', areas);
    setAreaDraft('');
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const areas = areaWithDraft();
    if (!areas) return;
    update.mutate(
      {
        displayName: form.displayName,
        bio: form.bio,
        subjectIds: form.subjectIds,
        teachesOnline: form.teachesOnline,
        teachesOffline: form.teachesOffline,
        preferredGrades: form.preferredGrades,
        preferredAreas: areas,
        negotiableTime: form.negotiableTime,
        ...(form.hourlyRate.trim() !== '' && { hourlyRateMinor: rate }),
      },
      {
        // Re-initialise from the server-confirmed profile.
        onSuccess: (confirmed) => {
          setForm(toForm(confirmed, confirmed.displayName));
          setAreaDraft('');
          setAreaError(null);
          setSaved(true);
        },
      },
    );
  }

  const submitBlocker = !profile
    ? 'Hãy lưu hồ sơ trước.'
    : hasUnsavedChanges
      ? 'Bạn có thay đổi chưa lưu.'
      : profile.missing.length > 0
        ? `Còn thiếu: ${profile.missing.map((m) => PROFILE_REQUIREMENT_LABELS[m]).join(', ')}.`
        : status === 'pending' || status === 'approved'
          ? null
          : '';

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Hồ sơ gia sư"
        description="Thông tin hiển thị với học viên sau khi hồ sơ được duyệt."
      />

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Trạng thái:</span>
          <Badge tone={STATUS_TONE[status]}>{APPROVAL_STATUS_LABELS[status]}</Badge>
          {profile?.visibility === 'public' && <Badge tone="success">Đang công khai</Badge>}
        </div>
        <p className="text-sm text-muted">
          {status === 'approved' && profile?.visibility === 'private'
            ? 'Hồ sơ đã được duyệt nhưng đang bị ẩn khỏi tìm kiếm.'
            : STATUS_HELP[status]}
        </p>
        {profile?.moderationNote && (status === 'rejected' || profile.visibility === 'private') && (
          <Alert tone="warning" title="Phản hồi từ quản trị viên">
            {profile.moderationNote}
          </Alert>
        )}
        {submitBlocker !== null && (
          <div className="flex flex-col items-start gap-2">
            <Button
              variant="secondary"
              disabled={submitBlocker !== ''}
              loading={submit.isPending}
              onClick={() => submit.mutate()}
              aria-describedby={submitBlocker ? 'submit-blocker' : undefined}
            >
              Gửi duyệt
            </Button>
            {submitBlocker && (
              <p id="submit-blocker" className="text-sm text-muted">
                {submitBlocker}
              </p>
            )}
          </div>
        )}
        {submit.isError && <Alert tone="danger">{submit.error.message}</Alert>}
        {submit.isSuccess && <Alert tone="success">Đã gửi hồ sơ để duyệt.</Alert>}
      </div>

      <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-5">
        {update.isError && !Object.keys(errors).length && (
          <Alert tone="danger" title="Không lưu được hồ sơ">
            {update.error.message}
          </Alert>
        )}
        <TextField
          label="Tên hiển thị"
          required
          maxLength={100}
          value={form.displayName}
          onChange={(e) => set('displayName', e.target.value)}
          error={errors.displayName}
        />
        <TextareaField
          label="Giới thiệu"
          hint="Kinh nghiệm, phương pháp dạy, thành tích. Tối đa 2.000 ký tự."
          maxLength={2000}
          value={form.bio}
          onChange={(e) => set('bio', e.target.value)}
          error={errors.bio}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Môn dạy</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {subjects.map((subject) => (
              <label
                key={subject.id}
                className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-primary)]"
                  checked={form.subjectIds.includes(subject.id)}
                  onChange={(e) => toggleSubject(subject.id, e.target.checked)}
                />
                <span className="text-sm">{subject.name}</span>
              </label>
            ))}
          </div>
          {(errors.subjectIds || errors['subjectIds.0']) && (
            <p className="text-sm text-danger">{errors.subjectIds ?? errors['subjectIds.0']}</p>
          )}
        </fieldset>
        <TextField
          label="Học phí (₫/giờ)"
          inputMode="numeric"
          type="number"
          min={10000}
          step={RATE_STEP}
          value={form.hourlyRate}
          onChange={(e) => set('hourlyRate', e.target.value)}
          hint={
            form.hourlyRate && Number.isFinite(rate)
              ? `${formatVnd(rate)} mỗi giờ. Bội số của 1.000 ₫.`
              : 'Bội số của 1.000 ₫, tối thiểu 10.000 ₫.'
          }
          error={errors.hourlyRateMinor}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Hình thức dạy</legend>
          {(
            [
              ['teachesOnline', 'Trực tuyến'],
              ['teachesOffline', 'Trực tiếp'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={form[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </fieldset>
        <section aria-labelledby="class-preferences-title" className="flex flex-col gap-5">
          <div>
            <h2 id="class-preferences-title" className="text-lg font-semibold">
              Sở thích nhận lớp
            </h2>
            <p className="text-sm text-muted">
              Chọn lớp học, khu vực và khả năng thương lượng lịch.
            </p>
          </div>
          <fieldset
            className="flex flex-col gap-2"
            aria-invalid={Boolean(gradeError)}
            aria-describedby={gradeError ? gradeErrorId : undefined}
          >
            <legend className="mb-1 text-sm font-medium">Lớp học mong muốn</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {GRADE_OPTIONS.map((grade) => (
                <label
                  key={grade}
                  className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={form.preferredGrades.includes(grade)}
                    onChange={(event) => toggleGrade(grade, event.target.checked)}
                  />
                  <span className="text-sm">{grade}</span>
                </label>
              ))}
            </div>
            {gradeError && (
              <p id={gradeErrorId} className="text-sm text-danger">
                {gradeError}
              </p>
            )}
          </fieldset>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <TextField
                  label="Khu vực muốn nhận lớp"
                  hint={`Tối đa ${MAX_PREFERRED_AREAS} khu vực, mỗi khu vực tối đa 80 ký tự.`}
                  maxLength={80}
                  value={areaDraft}
                  onChange={(event) => {
                    setAreaDraft(event.target.value);
                    setAreaError(null);
                    setSaved(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addArea();
                    }
                  }}
                  error={preferredAreaError}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={addArea}
                disabled={!areaDraft.trim()}
              >
                Thêm khu vực
              </Button>
            </div>
            {form.preferredAreas.length > 0 && (
              <ul aria-label="Khu vực đã chọn" className="flex flex-wrap gap-2">
                {form.preferredAreas.map((area) => (
                  <li
                    key={area}
                    className="flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border px-2"
                  >
                    <span className="min-w-0 break-all text-sm">{area}</span>
                    <button
                      type="button"
                      aria-label={`Xóa khu vực ${area}`}
                      className="min-h-11 shrink-0 rounded-md px-2 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      onClick={() =>
                        set(
                          'preferredAreas',
                          form.preferredAreas.filter((item) => item !== area),
                        )
                      }
                    >
                      Xóa
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={form.negotiableTime}
              onChange={(event) => set('negotiableTime', event.target.checked)}
            />
            <span className="text-sm">Có thể thương lượng lịch học</span>
          </label>
          {errors.negotiableTime && <p className="text-sm text-danger">{errors.negotiableTime}</p>}
        </section>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={update.isPending} disabled={!hasUnsavedChanges}>
            Lưu hồ sơ
          </Button>
          {hasUnsavedChanges && <span className="text-sm text-warning">Có thay đổi chưa lưu</span>}
          {saved && !hasUnsavedChanges && (
            <span role="status" className="text-sm text-success">
              Đã lưu.
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

import { useState, type FormEvent } from 'react';
import {
  APPROVAL_STATUS_LABELS,
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
}

function toForm(profile: TutorProfile | null, fallbackName: string): FormState {
  return {
    displayName: profile?.displayName ?? fallbackName,
    bio: profile?.bio ?? '',
    subjectIds: profile?.subjects.map((s) => s.id) ?? [],
    hourlyRate: profile?.hourlyRateMinor != null ? String(profile.hourlyRateMinor) : '',
    teachesOnline: profile?.teachesOnline ?? false,
    teachesOffline: profile?.teachesOffline ?? false,
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
  const update = useUpdateProfile();
  const submit = useSubmitProfile();
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const errors = fieldErrors(update.error);
  const rate = Number(form.hourlyRate);
  const status = profile?.approvalStatus ?? 'draft';

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleSubject(id: string, checked: boolean) {
    set('subjectIds', checked ? [...form.subjectIds, id] : form.subjectIds.filter((s) => s !== id));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      {
        displayName: form.displayName,
        bio: form.bio,
        subjectIds: form.subjectIds,
        teachesOnline: form.teachesOnline,
        teachesOffline: form.teachesOffline,
        ...(form.hourlyRate.trim() !== '' && { hourlyRateMinor: rate }),
      },
      {
        // Re-initialise from the server-confirmed profile.
        onSuccess: (confirmed) => {
          setForm(toForm(confirmed, confirmed.displayName));
          setSaved(true);
        },
      },
    );
  }

  const submitBlocker = !profile
    ? 'Hãy lưu hồ sơ trước.'
    : dirty
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
        <p className="text-sm text-muted">{STATUS_HELP[status]}</p>
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
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={update.isPending} disabled={!dirty}>
            Lưu hồ sơ
          </Button>
          {dirty && <span className="text-sm text-warning">Có thay đổi chưa lưu</span>}
          {saved && !dirty && (
            <span role="status" className="text-sm text-success">
              Đã lưu.
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

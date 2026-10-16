import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { BookOpen, CircleCheck, UserRound, X } from 'lucide-react';
import { useSearchParams } from 'react-router';
import {
  DEFAULT_TIMEZONE,
  timeToMinutes,
  type WeeklyAvailability,
  type WeeklyRule,
} from '../../../shared/schemas/availability';
import {
  HANOI_DISTRICTS,
  HANOI_SUBURBAN_DISTRICTS,
  HANOI_URBAN_DISTRICTS,
  hanoiDistrictOf,
} from '../../../shared/schemas/hanoi-wards';
import {
  DEFAULT_GRADE_OPTIONS,
  DEFAULT_MODE_OPTIONS,
  GRADE_OPTIONS,
  MAX_CUSTOM_OPTIONS,
  MAX_SUBJECTS_PER_TUTOR,
  optionKey,
  PROFILE_REQUIREMENT_LABELS,
  type EditableOptionKind,
  type Subject,
  type TutorCustomOption,
  type TutorProfile,
} from '../../../shared/schemas/tutors';
import { useSession } from '../../app/auth';
import { OptionTiles } from '../../components/domain/OptionTiles';
import {
  isRequestGridWindow,
  RequestScheduleGrid,
} from '../../components/domain/RequestScheduleGrid';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useSaveWeekly, useWeeklyAvailability } from '../../features/availability/api';
import {
  useOwnProfile,
  useSubjects,
  useSubmitProfile,
  useUpdateProfile,
} from '../../features/tutor-profile/api';
import { fieldErrors } from '../../lib/api-client';
import { WEEKDAY_LABELS } from '../../lib/format';
import { BasicInfoFields, basicFieldsOf, issuedOn, type BasicFields } from './TutorBasicInfo';

type GridWindow = { weekday: number; startLocal: string; endLocal: string };

interface FormState extends BasicFields {
  subjectIds: string[];
  teachesOnline: boolean;
  teachesOffline: boolean;
  preferredGrades: string[];
  preferredAreas: string[];
  negotiableTime: boolean;
  /** Tutor-added options, selected flags included for every kind. */
  customOptions: TutorCustomOption[];
  /** "Thời gian có thể dạy" cells of the weekly grid. */
  windows: GridWindow[];
  /** Saved weekly rules outside the grid, kept unless the tutor removes them. */
  otherRules: WeeklyRule[];
}

/** Catalogue order of "Môn học có thể dạy"; unknown subjects follow. */
const SUBJECT_ORDER = [
  'toan',
  'ngu-van',
  'tieng-anh',
  'vat-ly',
  'hoa-hoc',
  'sinh-hoc',
  'lich-su',
  'dia-ly',
  'tin-hoc',
];
const INLINE_ERROR_FIELDS = new Set([
  'phone',
  'dateOfBirth',
  'major',
  'graduationYear',
  'idNumber',
  'idIssuedOn',
  'idResidence',
  'displayName',
  'bio',
  'tutorType',
  'school',
  'specialization',
  'experienceYears',
  'experienceSummary',
  'subjectIds',
]);

const isGridRule = (rule: WeeklyRule) =>
  !rule.effectiveFrom &&
  !rule.effectiveTo &&
  isRequestGridWindow({ weekday: rule.weekday, startLocal: rule.start, endLocal: rule.end });

/** Saved areas as catalogue districts; anything outside Hà Nội is reported, not kept. */
function splitAreas(areas: string[]): { districts: string[]; outside: string[] } {
  const districts: string[] = [];
  const outside: string[] = [];
  for (const area of areas) {
    const district = hanoiDistrictOf(area);
    if (!district) outside.push(area);
    else if (!districts.includes(district)) districts.push(district);
  }
  return { districts, outside };
}

function toForm(
  profile: TutorProfile | null,
  availability: WeeklyAvailability,
  fallbackName: string,
): FormState {
  // Teaching modes and areas are fixed lists now; only subject/grade options stay editable.
  const customOptions = (profile?.customOptions ?? []).filter(
    (option) => option.kind === 'subject' || option.kind === 'grade',
  );
  const chosenGrades = new Set((profile?.preferredGrades ?? []).map(optionKey));
  const { districts: preferredAreas } = splitAreas(profile?.preferredAreas ?? []);
  return {
    ...basicFieldsOf(profile, fallbackName),
    subjectIds: profile?.subjects.map((s) => s.id) ?? [],
    teachesOnline: profile?.teachesOnline ?? false,
    teachesOffline: profile?.teachesOffline ?? false,
    preferredGrades: profile?.preferredGrades ?? [],
    preferredAreas,
    negotiableTime: profile?.negotiableTime ?? false,
    customOptions: customOptions.map((option) =>
      option.kind === 'grade'
        ? { ...option, selected: chosenGrades.has(optionKey(option.label)) }
        : option,
    ),
    windows: availability.rules
      .filter(isGridRule)
      .map((rule) => ({ weekday: rule.weekday, startLocal: rule.start, endLocal: rule.end })),
    otherRules: availability.rules.filter((rule) => !isGridRule(rule)),
  };
}

type Tab = 'basic' | 'preferences';
const TABS: { key: Tab; label: string; icon: typeof UserRound }[] = [
  { key: 'basic', label: 'Thông tin cơ bản', icon: UserRound },
  { key: 'preferences', label: 'Đăng ký lớp học phù hợp', icon: BookOpen },
];

export function TutorProfilePage() {
  const profileQuery = useOwnProfile();
  const subjectsQuery = useSubjects();
  const availabilityQuery = useWeeklyAvailability();

  if (profileQuery.isPending || subjectsQuery.isPending || availabilityQuery.isPending)
    return <PageLoading />;
  if (profileQuery.isError || subjectsQuery.isError || availabilityQuery.isError) {
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
              void availabilityQuery.refetch();
            }}
          >
            Thử lại
          </Button>
        }
      >
        {(profileQuery.error ?? subjectsQuery.error ?? availabilityQuery.error)?.message}
      </Alert>
    );
  }
  return (
    <ProfileForm
      profile={profileQuery.data}
      subjects={subjectsQuery.data}
      availability={availabilityQuery.data}
    />
  );
}

/** Two weekly windows on the same day overlap when neither ends before the other starts. */
function overlapping(window: GridWindow, rule: WeeklyRule): boolean {
  return (
    window.weekday === rule.weekday &&
    timeToMinutes(window.startLocal) < timeToMinutes(rule.end) &&
    timeToMinutes(rule.start) < timeToMinutes(window.endLocal)
  );
}

function ProfileForm({
  profile,
  subjects,
  availability,
}: {
  profile: TutorProfile | null;
  subjects: Subject[];
  availability: WeeklyAvailability;
}) {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'dang-ky' ? 'preferences' : 'basic';
  const [initial, setInitial] = useState(() =>
    toForm(profile, availability, user?.displayName ?? ''),
  );
  const [form, setForm] = useState<FormState>(initial);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [basicErrors, setBasicErrors] = useState<
    Partial<Record<'idIssuedOn' | 'idNumber', string>>
  >({});
  const outsideAreas = splitAreas(profile?.preferredAreas ?? []).outside;
  const [saved, setSaved] = useState(false);
  const update = useUpdateProfile();
  const saveWeekly = useSaveWeekly();
  const submit = useSubmitProfile();
  const tabIds = { basic: useId(), preferences: useId() };

  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(initial);
  const errors = fieldErrors(update.error);
  const status = profile?.approvalStatus ?? 'draft';
  const saving = update.isPending || saveWeekly.isPending;
  const custom = (kind: EditableOptionKind) =>
    form.customOptions.filter((option) => option.kind === kind);

  function selectTab(next: Tab) {
    const search = new URLSearchParams(params);
    if (next === 'preferences') search.set('tab', 'dang-ky');
    else search.delete('tab');
    setParams(search, { replace: true, preventScrollReset: true });
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next: Tab = tab === 'basic' ? 'preferences' : 'basic';
    selectTab(next);
    document.getElementById(`${tabIds[next]}-tab`)?.focus();
  }

  function patch(next: Partial<FormState>) {
    setSaved(false);
    setLocalError(null);
    setSaveError(null);
    setForm((current) => ({ ...current, ...next }));
  }

  function toggleIn(list: string[], value: string, checked: boolean) {
    return checked ? [...list, value] : list.filter((item) => item !== value);
  }

  function toggleCustom(kind: EditableOptionKind, label: string, checked: boolean) {
    const next: Partial<FormState> = {
      customOptions: form.customOptions.map((option) =>
        option.kind === kind && option.label === label ? { ...option, selected: checked } : option,
      ),
    };
    if (kind === 'grade') next.preferredGrades = toggleIn(form.preferredGrades, label, checked);
    patch(next);
  }

  function removeCustom(kind: EditableOptionKind, label: string) {
    patch({
      customOptions: form.customOptions.filter(
        (option) => !(option.kind === kind && option.label === label),
      ),
      ...(kind === 'grade' && {
        preferredGrades: form.preferredGrades.filter((item) => item !== label),
      }),
    });
  }

  /** Adds a tutor option, selected; returns an error message when it is rejected. */
  function addCustom(kind: EditableOptionKind, raw: string, builtIn: string[]): string | null {
    const label = raw.trim().replace(/\s+/g, ' ');
    if (!label) return 'Vui lòng nhập lựa chọn.';
    if (label.length > (kind === 'grade' ? 40 : 80))
      return `Lựa chọn tối đa ${kind === 'grade' ? 40 : 80} ký tự.`;
    const key = optionKey(label);
    if (
      builtIn.some((item) => optionKey(item) === key) ||
      custom(kind).some((o) => optionKey(o.label) === key)
    )
      return 'Lựa chọn này đã có trong danh sách.';
    if (custom(kind).length >= MAX_CUSTOM_OPTIONS)
      return `Mỗi nhóm chỉ thêm tối đa ${MAX_CUSTOM_OPTIONS} lựa chọn.`;
    patch({
      customOptions: [...form.customOptions, { kind, label, selected: true }],
      ...(kind === 'grade' && { preferredGrades: [...form.preferredGrades, label] }),
    });
    return null;
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (saving) return;
    const clash = form.windows.find((window) =>
      form.otherRules.some((rule) => overlapping(window, rule)),
    );
    if (clash) {
      setLocalError(
        `Khung ${WEEKDAY_LABELS[clash.weekday] ?? ''} ${clash.startLocal}–${clash.endLocal} trùng với một khung giờ khác đã lưu. Hãy xóa khung giờ cũ hoặc bỏ chọn ô này.`,
      );
      selectTab('preferences');
      return;
    }
    if (form.preferredAreas.some((area) => !hanoiDistrictOf(area))) {
      setLocalError('Khu vực dạy chỉ gồm các quận/huyện thuộc Hà Nội.');
      selectTab('preferences');
      return;
    }
    const issued = issuedOn(form);
    const idNumber = form.idNumber.trim();
    const idNumberError =
      idNumber && !/^[0-9]{12}$/.test(idNumber) ? 'Số thẻ CCCD gồm đúng 12 chữ số.' : null;
    if (issued.error || idNumberError) {
      setBasicErrors({
        ...(issued.error && { idIssuedOn: issued.error }),
        ...(idNumberError && { idNumber: idNumberError }),
      });
      selectTab('basic');
      return;
    }
    setSaveError(null);
    try {
      const confirmed = await update.mutateAsync({
        displayName: form.displayName,
        bio: form.bio,
        subjectIds: form.subjectIds,
        teachesOnline: form.teachesOnline,
        teachesOffline: form.teachesOffline,
        preferredGrades: form.preferredGrades,
        preferredAreas: form.preferredAreas,
        negotiableTime: form.negotiableTime,
        customOptions: form.customOptions.filter(
          (option): option is TutorCustomOption & { kind: EditableOptionKind } =>
            option.kind === 'subject' || option.kind === 'grade',
        ),
        tutorType: form.tutorType || null,
        school: form.school.trim() || null,
        specialization: form.specialization.trim() || null,
        experienceYears: form.experienceYears.trim() ? Number(form.experienceYears) : null,
        experienceSummary: form.experienceSummary.trim() || null,
        major: form.major.trim() || null,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : null,
        phone: form.phone.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        idNumber: form.idNumber.trim() || null,
        idIssuedOn: issued.value,
        idResidence: form.idResidence.trim() || null,
        idVerification: form.idVerification,
      });
      let weekly = availability;
      const scheduleChanged =
        JSON.stringify([form.windows, form.otherRules]) !==
        JSON.stringify([initial.windows, initial.otherRules]);
      if (scheduleChanged) {
        weekly = await saveWeekly.mutateAsync({
          timezone: availability.timezone || DEFAULT_TIMEZONE,
          rules: [
            ...form.otherRules.map(({ weekday, start, end, effectiveFrom, effectiveTo }) => ({
              weekday,
              start,
              end,
              effectiveFrom,
              effectiveTo,
            })),
            ...form.windows.map((window) => ({
              weekday: window.weekday,
              start: window.startLocal,
              end: window.endLocal,
            })),
          ],
        });
      }
      // A complete draft (or a rejected profile after edits) goes to review on save.
      if (
        confirmed.missing.length === 0 &&
        (confirmed.approvalStatus === 'draft' || confirmed.approvalStatus === 'rejected')
      ) {
        await submit.mutateAsync();
      }
      // Re-initialise from what the server confirmed.
      const next = toForm(confirmed, weekly, confirmed.displayName);
      setInitial(next);
      setForm(next);
      setSaved(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Chưa lưu được thay đổi.');
    }
  }

  // Shown under the save button until the profile can be sent for review.
  const reviewHint =
    profile && profile.missing.length > 0 && status !== 'approved' && status !== 'pending'
      ? `Bổ sung ${profile.missing.map((m) => PROFILE_REQUIREMENT_LABELS[m].toLowerCase()).join(', ')} để hồ sơ được gửi duyệt.`
      : null;

  const orderedSubjects = [...subjects].sort((a, b) => {
    const rank = (subject: Subject) =>
      SUBJECT_ORDER.includes(subject.slug) ? SUBJECT_ORDER.indexOf(subject.slug) : 99;
    return rank(a) - rank(b);
  });
  const legacyGrades = GRADE_OPTIONS.filter(
    (grade) => !DEFAULT_GRADE_OPTIONS.includes(grade) && form.preferredGrades.includes(grade),
  );

  // Fields with their own inline error are not repeated in the summary.
  const otherErrors = Object.entries(errors)
    .filter(([path]) => !INLINE_ERROR_FIELDS.has(path.split('.')[0]!))
    .map(([, message]) => message);
  const feedback = (
    <>
      {(saveError || (update.isError && !Object.keys(errors).length)) && (
        <Alert tone="danger" title="Không lưu được thay đổi">
          {saveError ?? update.error?.message}
        </Alert>
      )}
      {otherErrors.length > 0 && (
        <Alert tone="danger" title="Thông tin chưa hợp lệ">
          {otherErrors.join(' ')}
        </Alert>
      )}
      {localError && (
        <Alert tone="danger" title="Chưa thể lưu">
          {localError}
        </Alert>
      )}
    </>
  );

  // Each tab has its own save button; the confirmation shows only in the open tab.
  const saveBar = (panel: Tab) => (
    <div className="flex flex-col gap-2">
      <Button
        type="submit"
        loading={saving || submit.isPending}
        disabled={!hasUnsavedChanges}
        className="w-full"
      >
        Lưu thay đổi
      </Button>
      {tab === panel && reviewHint && <p className="text-sm text-muted">{reviewHint}</p>}
      {tab === panel && hasUnsavedChanges && (
        <span className="text-sm text-warning">Có thay đổi chưa lưu</span>
      )}
      {tab === panel && saved && !hasUnsavedChanges && (
        <span role="status" className="inline-flex items-center gap-1 text-sm text-success">
          <CircleCheck aria-hidden="true" className="size-4" />
          Đã lưu thay đổi.
        </span>
      )}
    </div>
  );

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold text-primary">Hồ sơ gia sư</h1>
        <p className="mt-2 text-muted">Quản lý thông tin và đăng ký nhận lớp phù hợp</p>
      </header>

      {profile?.moderationNote && (status === 'rejected' || profile.visibility === 'private') && (
        <Alert tone="warning" title="Phản hồi từ kiểm duyệt viên">
          {profile.moderationNote}
        </Alert>
      )}

      <div
        role="tablist"
        aria-label="Các phần hồ sơ"
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`${tabIds[key]}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${tabIds[key]}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => selectTab(key)}
            onKeyDown={onTabKey}
            className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-primary'
            }`}
          >
            <Icon aria-hidden="true" size={18} />
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => void save(event)}
        noValidate
        className="flex w-full max-w-5xl flex-col gap-6"
      >
        {feedback}
        <div
          id={`${tabIds.basic}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabIds.basic}-tab`}
          hidden={tab !== 'basic'}
          className="flex flex-col gap-6"
        >
          <BasicInfoFields
            profile={profile}
            fields={form}
            onChange={(next) => {
              setBasicErrors({});
              patch(next);
            }}
            errors={errors}
            localErrors={basicErrors}
          />
          {saveBar('basic')}
        </div>

        <div
          id={`${tabIds.preferences}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabIds.preferences}-tab`}
          hidden={tab !== 'preferences'}
          className="flex flex-col gap-6"
        >
          <section
            aria-labelledby="profile-preferences-title"
            className="flex flex-col gap-8 rounded-xl border border-primary/20 bg-bg p-5 shadow-card md:p-6"
          >
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <span
                aria-hidden="true"
                className="flex size-11 items-center justify-center rounded-lg bg-accent text-on-accent"
              >
                <BookOpen size={22} />
              </span>
              <div>
                <h2 id="profile-preferences-title" className="text-xl font-semibold text-primary">
                  Đăng ký lớp học phù hợp
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Chọn môn, lớp, hình thức, khu vực và thời gian có thể dạy. Có thể chọn nhiều
                  phương án.
                </p>
              </div>
            </div>

            <OptionTiles
              legend="Môn học có thể dạy"
              options={[
                ...orderedSubjects.map((subject) => ({
                  key: `s:${subject.id}`,
                  label: subject.name,
                  checked: form.subjectIds.includes(subject.id),
                })),
                ...custom('subject').map((option) => ({
                  key: `c:${option.label}`,
                  label: option.label,
                  checked: option.selected,
                  removable: true,
                })),
              ]}
              onToggle={(key, checked) => {
                if (key.startsWith('s:')) {
                  const id = key.slice(2);
                  if (checked && form.subjectIds.length >= MAX_SUBJECTS_PER_TUTOR) {
                    setLocalError(`Chỉ chọn tối đa ${MAX_SUBJECTS_PER_TUTOR} môn trong danh mục.`);
                    return;
                  }
                  patch({ subjectIds: toggleIn(form.subjectIds, id, checked) });
                } else toggleCustom('subject', key.slice(2), checked);
              }}
              onRemove={(key) => removeCustom('subject', key.slice(2))}
              onAdd={(label) =>
                addCustom(
                  'subject',
                  label,
                  subjects.map((subject) => subject.name),
                )
              }
              error={errors.subjectIds ?? errors['subjectIds.0']}
            />

            <OptionTiles
              legend="Lớp học có thể dạy"
              columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              options={[
                ...[...DEFAULT_GRADE_OPTIONS, ...legacyGrades].map((grade) => ({
                  key: `s:${grade}`,
                  label: grade,
                  checked: form.preferredGrades.includes(grade),
                })),
                ...custom('grade').map((option) => ({
                  key: `c:${option.label}`,
                  label: option.label,
                  checked: option.selected,
                  removable: true,
                })),
              ]}
              onToggle={(key, checked) =>
                key.startsWith('s:')
                  ? patch({
                      preferredGrades: toggleIn(form.preferredGrades, key.slice(2), checked),
                    })
                  : toggleCustom('grade', key.slice(2), checked)
              }
              onRemove={(key) => removeCustom('grade', key.slice(2))}
              onAdd={(label) => addCustom('grade', label, GRADE_OPTIONS)}
            />

            <OptionTiles
              legend="Hình thức có thể dạy"
              columns="sm:grid-cols-2 lg:grid-cols-3"
              options={[
                { key: 'offline', label: DEFAULT_MODE_OPTIONS[0], checked: form.teachesOffline },
                { key: 'online', label: DEFAULT_MODE_OPTIONS[1], checked: form.teachesOnline },
              ]}
              onToggle={(key, checked) =>
                patch(key === 'offline' ? { teachesOffline: checked } : { teachesOnline: checked })
              }
            />

            {(
              [
                ['Khu vực có thể dạy — Nội thành Hà Nội', HANOI_URBAN_DISTRICTS],
                ['Khu vực có thể dạy — Ngoại thành Hà Nội', HANOI_SUBURBAN_DISTRICTS],
              ] as const
            ).map(([legend, districts], index) => (
              <OptionTiles
                key={legend}
                legend={legend}
                description={
                  index === 0
                    ? 'Chỉ nhận lớp trong phạm vi Hà Nội. Chọn một hoặc nhiều quận/huyện.'
                    : undefined
                }
                columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
                options={districts.map((district) => ({
                  key: district,
                  label: district,
                  checked: form.preferredAreas.includes(district),
                }))}
                onToggle={(district, checked) =>
                  patch({ preferredAreas: toggleIn(form.preferredAreas, district, checked) })
                }
              />
            ))}
            <div className="-mt-4 flex flex-col gap-2 rounded-lg bg-surface p-3 text-sm">
              <p className="font-medium text-primary">
                Khu vực đã chọn ({form.preferredAreas.length}/{HANOI_DISTRICTS.length})
              </p>
              {form.preferredAreas.length === 0 ? (
                <p className="text-muted">Chưa chọn khu vực nào.</p>
              ) : (
                <ul aria-label="Khu vực đã chọn" className="flex flex-wrap gap-2">
                  {form.preferredAreas.map((area) => (
                    <li
                      key={area}
                      className="flex items-center gap-1 rounded-full bg-info-surface pl-3 text-primary"
                    >
                      {area}
                      <button
                        type="button"
                        aria-label={`Bỏ chọn ${area}`}
                        onClick={() =>
                          patch({
                            preferredAreas: form.preferredAreas.filter((item) => item !== area),
                          })
                        }
                        className="flex size-9 items-center justify-center rounded-full hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <X aria-hidden="true" className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {outsideAreas.length > 0 && (
                <p role="note" className="text-xs text-warning">
                  Khu vực đã lưu trước đây không thuộc danh mục Hà Nội và sẽ được bỏ khi lưu:{' '}
                  {outsideAreas.join(', ')}.
                </p>
              )}
            </div>

            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="mb-1 text-base font-semibold text-primary">
                Thời gian có thể dạy
              </legend>
              <RequestScheduleGrid
                value={form.windows}
                onChange={(windows) => patch({ windows })}
                caption="Chọn thời gian có thể dạy theo tuần"
              />
              {form.otherRules.length > 0 && (
                <div className="rounded-lg bg-surface p-3 text-sm">
                  <p className="font-medium text-primary">Khung giờ khác đã lưu</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {form.otherRules.map((rule) => (
                      <li
                        key={rule.id}
                        className="flex items-center gap-1 rounded-full bg-info-surface pl-3 text-primary"
                      >
                        {WEEKDAY_LABELS[rule.weekday]} {rule.start}–{rule.end}
                        <button
                          type="button"
                          aria-label={`Xóa khung giờ ${WEEKDAY_LABELS[rule.weekday]} ${rule.start}–${rule.end}`}
                          onClick={() =>
                            patch({
                              otherRules: form.otherRules.filter((item) => item.id !== rule.id),
                            })
                          }
                          className="min-h-11 rounded-full px-3 text-xs font-medium hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
                        >
                          Xóa
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-primary)]"
                  checked={form.negotiableTime}
                  onChange={(event) => patch({ negotiableTime: event.target.checked })}
                />
                <span className="text-sm">Linh hoạt — trao đổi thời gian với phụ huynh</span>
              </label>
            </fieldset>
          </section>
          {saveBar('preferences')}
        </div>
      </form>
    </section>
  );
}

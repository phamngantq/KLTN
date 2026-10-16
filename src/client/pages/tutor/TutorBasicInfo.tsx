import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, ImagePlus, Trash2, Upload } from 'lucide-react';
import { TUTOR_TYPE_LABELS, TUTOR_TYPES } from '../../../shared/schemas/pricing';
import {
  MAX_TUTOR_CREDENTIALS,
  RATE_STEP,
  TUTOR_DOCUMENT_MAX_BYTES,
  TUTOR_DOCUMENT_TYPES,
  type IdVerificationMethod,
  type TutorDocument,
  type TutorDocumentKind,
  type TutorProfile,
} from '../../../shared/schemas/tutors';
import { Button } from '../../components/ui/Button';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
import { OWN_PROFILE_KEY } from '../../features/tutor-profile/api';
import { api } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';
import { ProfilePhotoField } from './ProfilePhotoField';

/** "Thông tin cơ bản" fields, kept as raw input strings until saved. */
export interface BasicFields {
  displayName: string;
  phone: string;
  dateOfBirth: string;
  tutorType: '' | 'university_student' | 'pedagogy_student' | 'teacher';
  school: string;
  major: string;
  graduationYear: string;
  experienceYears: string;
  specialization: string;
  experienceSummary: string;
  bio: string;
  hourlyRate: string;
  idNumber: string;
  idIssuedDay: string;
  idIssuedMonth: string;
  idIssuedYear: string;
  idResidence: string;
  idVerification: IdVerificationMethod;
}

export function basicFieldsOf(profile: TutorProfile | null, fallbackName: string): BasicFields {
  const [year = '', month = '', day = ''] = profile?.idIssuedOn?.split('-') ?? [];
  return {
    displayName: profile?.displayName ?? fallbackName,
    phone: profile?.phone ?? '',
    dateOfBirth: profile?.dateOfBirth ?? '',
    tutorType: profile?.tutorType ?? '',
    school: profile?.school ?? '',
    major: profile?.major ?? '',
    graduationYear: profile?.graduationYear != null ? String(profile.graduationYear) : '',
    experienceYears: profile?.experienceYears != null ? String(profile.experienceYears) : '',
    specialization: profile?.specialization ?? '',
    experienceSummary: profile?.experienceSummary ?? '',
    bio: profile?.bio ?? '',
    hourlyRate: profile?.hourlyRateMinor != null ? String(profile.hourlyRateMinor) : '',
    idNumber: profile?.idNumber ?? '',
    idIssuedDay: day,
    idIssuedMonth: month,
    idIssuedYear: year,
    idResidence: profile?.idResidence ?? '',
    idVerification: profile?.idVerification ?? 'center',
  };
}

/** "Ngày cấp" from its three boxes: null when empty, an error message when incomplete. */
export function issuedOn(fields: BasicFields): { value: string | null; error?: string } {
  const parts = [fields.idIssuedDay, fields.idIssuedMonth, fields.idIssuedYear].map((part) =>
    part.trim(),
  );
  if (parts.every((part) => !part)) return { value: null };
  const [day, month, year] = parts.map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    parts.some((part) => !/^\d+$/.test(part)) ||
    year < 1990 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { value: null, error: 'Ngày cấp CCCD không hợp lệ.' };
  }
  const value = date.toISOString().slice(0, 10);
  if (value > new Date().toISOString().slice(0, 10))
    return { value: null, error: 'Ngày cấp không được ở tương lai.' };
  return { value };
}

const CURRENT_YEAR = new Date().getFullYear();
const GRADUATION_YEARS = Array.from({ length: CURRENT_YEAR + 6 - 1970 + 1 }, (_, i) =>
  String(CURRENT_YEAR + 6 - i),
);

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-border bg-bg p-5 shadow-card md:p-6"
    >
      <h2 id={id} className="text-lg font-semibold text-primary">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function BasicInfoFields({
  profile,
  fields,
  onChange,
  errors,
  localErrors,
}: {
  profile: TutorProfile | null;
  fields: BasicFields;
  onChange: (next: Partial<BasicFields>) => void;
  errors: Record<string, string>;
  localErrors: Partial<Record<'idIssuedOn', string>>;
}) {
  const rate = Number(fields.hourlyRate);
  const documents = profile?.documents ?? [];
  return (
    <>
      <Card title="Thông tin cá nhân">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Ảnh đại diện</span>
          {profile ? (
            <ProfilePhotoField hasPhoto={profile.hasPhoto} displayName={fields.displayName} />
          ) : (
            <p className="text-sm text-muted">Lưu hồ sơ lần đầu để tải ảnh đại diện.</p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Họ và tên"
            required
            maxLength={100}
            value={fields.displayName}
            onChange={(e) => onChange({ displayName: e.target.value })}
            error={errors.displayName}
          />
          <TextField
            label="Số điện thoại"
            type="tel"
            inputMode="tel"
            maxLength={16}
            value={fields.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            error={errors.phone}
          />
          <TextField
            label="Email"
            type="email"
            readOnly
            value={profile?.email ?? ''}
            hint="Đổi email tại trang Tài khoản."
          />
          <TextField
            label="Ngày sinh"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={fields.dateOfBirth}
            onChange={(e) => onChange({ dateOfBirth: e.target.value })}
            error={errors.dateOfBirth}
          />
          <SelectField
            label="Loại gia sư"
            value={fields.tutorType}
            onChange={(e) => onChange({ tutorType: e.target.value as BasicFields['tutorType'] })}
            error={errors.tutorType}
          >
            <option value="">Chọn loại gia sư</option>
            {TUTOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {TUTOR_TYPE_LABELS[type]}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      <Card title="Trình độ học vấn">
        <TextField
          label="Trường"
          placeholder="Ví dụ: Trường Đại học Sư phạm Hà Nội"
          maxLength={120}
          value={fields.school}
          onChange={(e) => onChange({ school: e.target.value })}
          error={errors.school}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Chuyên ngành"
            placeholder="Ví dụ: Toán học"
            maxLength={120}
            value={fields.major}
            onChange={(e) => onChange({ major: e.target.value })}
            error={errors.major}
          />
          <SelectField
            label="Năm tốt nghiệp"
            value={fields.graduationYear}
            onChange={(e) => onChange({ graduationYear: e.target.value })}
            error={errors.graduationYear}
          >
            <option value="">Chọn năm</option>
            {GRADUATION_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      <Card title="Kinh nghiệm giảng dạy">
        <SelectField
          label="Số năm kinh nghiệm"
          value={fields.experienceYears}
          onChange={(e) => onChange({ experienceYears: e.target.value })}
          error={errors.experienceYears}
        >
          <option value="">Chọn số năm</option>
          <option value="0">Chưa có kinh nghiệm</option>
          {Array.from({ length: 30 }, (_, i) => String(i + 1)).map((years) => (
            <option key={years} value={years}>
              {years} năm
            </option>
          ))}
        </SelectField>
        <TextField
          label="Môn dạy"
          placeholder="Ví dụ: Toán, Vật lý"
          maxLength={160}
          value={fields.specialization}
          onChange={(e) => onChange({ specialization: e.target.value })}
          error={errors.specialization}
        />
        <TextareaField
          label="Thành tích"
          hint="Giải thưởng, kết quả học tập, thành tích của học sinh. Tối đa 500 ký tự."
          maxLength={500}
          value={fields.experienceSummary}
          onChange={(e) => onChange({ experienceSummary: e.target.value })}
          error={errors.experienceSummary}
        />
        <TextareaField
          label="Giới thiệu bản thân"
          hint="Kinh nghiệm, phương pháp dạy. Tối đa 2.000 ký tự."
          maxLength={2000}
          value={fields.bio}
          onChange={(e) => onChange({ bio: e.target.value })}
          error={errors.bio}
        />
        <TextField
          label="Học phí mong muốn (₫/giờ)"
          inputMode="numeric"
          type="number"
          min={10000}
          step={RATE_STEP}
          value={fields.hourlyRate}
          onChange={(e) => onChange({ hourlyRate: e.target.value })}
          hint={
            fields.hourlyRate && Number.isFinite(rate)
              ? `${formatVnd(rate)} mỗi giờ. Bội số của 1.000 ₫.`
              : 'Bội số của 1.000 ₫, tối thiểu 10.000 ₫.'
          }
          error={errors.hourlyRateMinor}
        />
      </Card>

      <Card title="Thẻ căn cước">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
          <TextField
            label="Số thẻ CCCD"
            hint="Căn cước công dân, 12 chữ số"
            inputMode="numeric"
            maxLength={12}
            value={fields.idNumber}
            onChange={(e) => onChange({ idNumber: e.target.value.replace(/\D/g, '') })}
            error={errors.idNumber}
          />
          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Ngày cấp</legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['idIssuedDay', 'Ngày', 2],
                  ['idIssuedMonth', 'Tháng', 2],
                  ['idIssuedYear', 'Năm', 4],
                ] as const
              ).map(([key, label, length]) => (
                <TextField
                  key={key}
                  label={label}
                  inputMode="numeric"
                  maxLength={length}
                  value={fields[key]}
                  onChange={(e) => onChange({ [key]: e.target.value.replace(/\D/g, '') })}
                />
              ))}
            </div>
            {(localErrors.idIssuedOn ?? errors.idIssuedOn) && (
              <p className="text-sm text-danger">{localErrors.idIssuedOn ?? errors.idIssuedOn}</p>
            )}
          </fieldset>
          <TextField
            label="Nơi thường trú"
            hint="Theo thẻ CCCD"
            maxLength={200}
            value={fields.idResidence}
            onChange={(e) => onChange({ idResidence: e.target.value })}
            error={errors.idResidence}
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Xác minh thẻ căn cước</legend>
          {(
            [
              ['center', 'Xác minh khi nhận lớp tại Trung Tâm'],
              ['upload', 'Xác minh bằng cách upload ảnh'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="id-verification"
                className="size-4 accent-[var(--color-primary)]"
                checked={fields.idVerification === value}
                onChange={() => onChange({ idVerification: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {fields.idVerification === 'upload' &&
          (profile ? (
            <div className="grid gap-4 md:grid-cols-2">
              <IdPhotoBox
                kind="id_front"
                label="Ảnh CCCD mặt trước"
                document={documents.find((doc) => doc.kind === 'id_front')}
              />
              <IdPhotoBox
                kind="id_back"
                label="Ảnh CCCD mặt sau"
                document={documents.find((doc) => doc.kind === 'id_back')}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">Lưu hồ sơ lần đầu để tải ảnh CCCD.</p>
          ))}
        <p className="text-xs text-muted">
          Số CCCD, ngày sinh, số điện thoại và ảnh giấy tờ chỉ bạn và kiểm duyệt viên của trung tâm
          xem được; người học không thấy các thông tin này.
        </p>
      </Card>

      <Card title="Minh chứng & Bằng cấp">
        {profile ? (
          <CredentialUploads documents={documents.filter((doc) => doc.kind === 'credential')} />
        ) : (
          <p className="text-sm text-muted">Lưu hồ sơ lần đầu để tải minh chứng.</p>
        )}
      </Card>
    </>
  );
}

const documentUrl = (id: string) => `/api/v1/tutor/profile/documents/${encodeURIComponent(id)}`;

/** Phone photos are shrunk to fit the 1.5 MB limit; PDFs and small files pass through. */
async function prepareDocument(file: File): Promise<File> {
  if (!(TUTOR_DOCUMENT_TYPES as readonly string[]).includes(file.type))
    throw new Error('Chỉ nhận ảnh JPG, PNG, WebP hoặc tệp PDF.');
  if (file.size <= TUTOR_DOCUMENT_MAX_BYTES) return file;
  if (file.type === 'application/pdf' || typeof createImageBitmap !== 'function')
    throw new Error('Mỗi tệp tối đa 1,5 MB.');
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob || blob.size > TUTOR_DOCUMENT_MAX_BYTES) throw new Error('Mỗi tệp tối đa 1,5 MB.');
  return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
}

function useDocumentMutations() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: OWN_PROFILE_KEY });
  const upload = useMutation({
    mutationFn: async ({ kind, file }: { kind: TutorDocumentKind; file: File }) => {
      const form = new FormData();
      form.set('kind', kind);
      form.set('file', await prepareDocument(file));
      return api.upload<TutorDocument>('/tutor/profile/documents', form);
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/tutor/profile/documents/${encodeURIComponent(id)}`),
    onSuccess: refresh,
  });
  return { upload, remove };
}

/** Click-to-upload box for one side of the citizen ID; replaces the earlier photo. */
function IdPhotoBox({
  kind,
  label,
  document,
}: {
  kind: TutorDocumentKind;
  label: string;
  document: TutorDocument | undefined;
}) {
  const { upload, remove } = useDocumentMutations();
  const inputId = useId();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted">(Bấm vào khung ảnh để tải lên)</p>
      </div>
      <label
        htmlFor={inputId}
        className="relative flex aspect-[16/10] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-surface text-muted transition-colors focus-within:outline-2 focus-within:outline-focus hover:border-primary"
      >
        {document ? (
          <img src={documentUrl(document.id)} alt={label} className="size-full object-contain" />
        ) : (
          <ImagePlus aria-hidden="true" className="size-12" strokeWidth={1.5} />
        )}
        <input
          id={inputId}
          type="file"
          aria-label={`Tải ${label.toLowerCase()}`}
          accept="image/jpeg,image/png,image/webp"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          disabled={upload.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) upload.mutate({ kind, file });
          }}
        />
      </label>
      {document && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2 self-start"
          loading={remove.isPending}
          onClick={() => remove.mutate(document.id)}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Xóa ảnh
        </Button>
      )}
      {(upload.isPending || upload.error || remove.error) && (
        <p
          role={upload.error || remove.error ? 'alert' : 'status'}
          className={`text-sm ${upload.error || remove.error ? 'text-danger' : 'text-muted'}`}
        >
          {upload.isPending ? 'Đang tải ảnh…' : (upload.error ?? remove.error)?.message}
        </p>
      )}
    </div>
  );
}

function CredentialUploads({ documents }: { documents: TutorDocument[] }) {
  const { upload, remove } = useDocumentMutations();
  const [error, setError] = useState('');
  const inputId = useId();
  const full = documents.length >= MAX_TUTOR_CREDENTIALS;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-surface px-4 py-8 text-center">
        <Upload aria-hidden="true" className="size-8 text-muted" />
        <p className="text-sm text-muted">
          Tải lên bằng cấp, chứng chỉ, giấy khen (JPG, PNG, PDF; tối đa 1,5 MB mỗi tệp,{' '}
          {MAX_TUTOR_CREDENTIALS} tệp)
        </p>
        <label
          htmlFor={inputId}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-bg px-4 text-sm font-medium text-primary focus-within:outline-2 focus-within:outline-focus ${full ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-info-surface'}`}
        >
          <FileText aria-hidden="true" className="size-4" />
          Chọn file
          <input
            id={inputId}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            disabled={full || upload.isPending}
            onChange={async (event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = '';
              setError('');
              for (const file of files.slice(0, MAX_TUTOR_CREDENTIALS - documents.length)) {
                try {
                  await upload.mutateAsync({ kind: 'credential', file });
                } catch (cause) {
                  setError(
                    `${file.name}: ${cause instanceof Error ? cause.message : 'chưa tải được.'}`,
                  );
                  break;
                }
              }
            }}
          />
        </label>
        {upload.isPending && (
          <p role="status" className="text-sm text-muted">
            Đang tải tệp…
          </p>
        )}
        {(error || remove.error) && (
          <p role="alert" className="text-sm text-danger">
            {error || remove.error?.message}
          </p>
        )}
      </div>
      {documents.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Đã tải lên:</p>
          <ul className="flex flex-col gap-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 text-sm"
              >
                <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <a
                  href={documentUrl(doc.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-primary underline-offset-4 hover:underline"
                >
                  {doc.fileName}
                </a>
                <button
                  type="button"
                  aria-label={`Xóa tệp ${doc.fileName}`}
                  onClick={() => remove.mutate(doc.id)}
                  className="flex size-10 items-center justify-center rounded-lg text-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

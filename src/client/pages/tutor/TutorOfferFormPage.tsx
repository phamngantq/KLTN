import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { REQUEST_GRADE_OPTIONS } from '../../../shared/schemas/requests';
import type { CreateTutorOfferInput, TutorOffer } from '../../../shared/schemas/tutor-offers';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { useTutorOffer, useTutorOfferActions } from '../../features/tutor-offers/api';
import { useSubjects } from '../../features/tutor-profile/api';
import { fieldErrors } from '../../lib/api-client';

type FormState = {
  subjectId: string;
  grade: string;
  mode: 'online' | 'offline';
  area: string;
  tuition: string;
  contactPhone: string;
};

function initialState(offer?: TutorOffer): FormState {
  return {
    subjectId: offer?.subjectId ?? '',
    grade: offer?.grade ?? '',
    mode: offer?.mode ?? 'online',
    area: offer?.area ?? '',
    tuition: offer ? String(offer.proposedTuitionPerSessionMinor) : '',
    contactPhone: offer?.contactPhone ?? '',
  };
}

function OfferEditor({ offer }: { offer?: TutorOffer }) {
  const navigate = useNavigate();
  const subjects = useSubjects();
  const { create, update } = useTutorOfferActions();
  const [form, setForm] = useState<FormState>(() => initialState(offer));
  const [localError, setLocalError] = useState('');
  const mutation = offer ? update : create;
  const errors = fieldErrors(mutation.error);
  const busy = create.isPending || update.isPending;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || isReadOnlyPreview()) return;
    const amount = Number(form.tuition.trim());
    if (!form.subjectId || !form.grade) {
      setLocalError('Chọn môn học và lớp học.');
      return;
    }
    if (form.mode === 'offline' && !form.area.trim()) {
      setLocalError('Nhập khu vực chung cho lớp học trực tiếp.');
      return;
    }
    if (
      !/^\d+$/.test(form.tuition.trim()) ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > 100_000_000
    ) {
      setLocalError('Nhập học phí đề xuất từ 1 đến 100.000.000 VNĐ mỗi buổi.');
      return;
    }
    if (!/^\+?[0-9]{8,15}$/.test(form.contactPhone.trim())) {
      setLocalError('Nhập số điện thoại gồm 8 đến 15 chữ số.');
      return;
    }
    setLocalError('');
    const input: CreateTutorOfferInput = {
      subjectId: form.subjectId,
      grade: form.grade,
      mode: form.mode,
      area: form.mode === 'offline' ? form.area.trim() : null,
      proposedTuitionPerSessionMinor: amount,
      contactPhone: form.contactPhone.trim(),
    };
    if (offer) {
      update.mutate(
        { id: offer.id, input: { ...input, version: offer.version } },
        { onSuccess: (saved) => navigate(`/tutor/offers/${encodeURIComponent(saved.id)}`) },
      );
    } else {
      create.mutate(input, {
        onSuccess: (saved) => navigate(`/tutor/offers/${encodeURIComponent(saved.id)}`),
      });
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl min-w-0">
      <PageHeader
        title={offer ? 'Chỉnh sửa lớp tìm học viên' : 'Đăng lớp tìm học viên'}
        description="Tạo bản nháp, xem hợp đồng và gửi kiểm duyệt trước khi lớp được công bố."
        actions={
          <ButtonLink to="/tutor/offers" variant="secondary">
            Lớp đã đăng
          </ButtonLink>
        }
      />
      {isReadOnlyPreview() && (
        <Alert tone="info">
          Bản xem trước chỉ đọc. Vui lòng dùng môi trường có quyền ghi để đăng lớp.
        </Alert>
      )}
      <form
        onSubmit={save}
        noValidate
        className="space-y-6 rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Môn học"
            required
            value={form.subjectId}
            onChange={(event) =>
              setForm((current) => ({ ...current, subjectId: event.target.value }))
            }
            error={errors.subjectId}
          >
            <option value="">Chọn môn học</option>
            {subjects.data?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Lớp học"
            required
            value={form.grade}
            onChange={(event) => setForm((current) => ({ ...current, grade: event.target.value }))}
            error={errors.grade}
          >
            <option value="">Chọn lớp học</option>
            {REQUEST_GRADE_OPTIONS.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Hình thức dạy"
            required
            value={form.mode}
            onChange={(event) =>
              setForm((current) => ({ ...current, mode: event.target.value as FormState['mode'] }))
            }
            error={errors.mode}
          >
            <option value="online">Trực tuyến</option>
            <option value="offline">Trực tiếp</option>
          </SelectField>
          {form.mode === 'offline' && (
            <TextField
              label="Khu vực chung"
              required
              maxLength={120}
              placeholder="Ví dụ: Thanh Xuân, Hà Nội"
              hint="Chỉ nhập quận/huyện hoặc khu vực có thể dạy, không nhập địa chỉ riêng. Thông tin này chỉ để kiểm duyệt."
              value={form.area}
              onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
              error={errors.area}
            />
          )}
          <TextField
            label="Học phí đề xuất (VNĐ/buổi)"
            type="number"
            inputMode="numeric"
            min={1}
            max={100_000_000}
            step={1}
            required
            value={form.tuition}
            onChange={(event) =>
              setForm((current) => ({ ...current, tuition: event.target.value }))
            }
            error={errors.proposedTuitionPerSessionMinor}
          />
          <TextField
            label="Số điện thoại liên hệ"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={16}
            required
            hint="Chỉ phụ huynh có yêu cầu được kiểm duyệt viên duyệt mới xem được số này."
            value={form.contactPhone}
            onChange={(event) =>
              setForm((current) => ({ ...current, contactPhone: event.target.value }))
            }
            error={errors.contactPhone}
          />
        </div>
        <p className="text-sm text-muted">
          Thông tin công khai gồm môn, lớp, hình thức và học phí đề xuất. Khu vực nhập ở đây chỉ
          được kiểm duyệt viên xem. Hợp đồng được xác nhận ở bước tiếp theo.
        </p>
        {localError && <Alert tone="danger">{localError}</Alert>}
        {mutation.isError && (
          <Alert tone="danger" title="Chưa lưu được lớp">
            {mutation.error.message}
          </Alert>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
          <Link
            to="/tutor/offers"
            className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-primary underline"
          >
            Hủy
          </Link>
          <Button
            type="submit"
            loading={busy}
            disabled={subjects.isPending || subjects.isError || isReadOnlyPreview()}
          >
            {offer ? 'Lưu thay đổi' : 'Lưu bản nháp'}
          </Button>
        </div>
      </form>
      {subjects.isError && (
        <Alert tone="danger">Không tải được danh mục môn học: {subjects.error.message}</Alert>
      )}
    </section>
  );
}

export function TutorOfferFormPage() {
  const { id } = useParams();
  const offer = useTutorOffer(id);
  if (id && offer.isPending) return <PageLoading label="Đang tải lớp đã đăng…" />;
  if (id && offer.isError) return <Alert tone="danger">{offer.error.message}</Alert>;
  if (id && offer.data?.status !== 'draft' && offer.data?.status !== 'rejected') {
    return (
      <EmptyState
        title="Không thể chỉnh sửa lớp"
        description="Chỉ bản nháp hoặc lớp bị từ chối mới có thể chỉnh sửa."
        action={<ButtonLink to={`/tutor/offers/${encodeURIComponent(id)}`}>Xem lớp</ButtonLink>}
      />
    );
  }
  return <OfferEditor key={id ?? 'new'} offer={offer.data} />;
}

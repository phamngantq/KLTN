import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  FEE_OPTION_KEYS,
  createFeeOptionSchema,
  type CreateFeeOptionInput,
  type FeeOptionKey,
  type FeeOptionVersion,
} from '../../../shared/schemas/classes';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { useSubjects } from '../../features/tutor-profile/api';
import { api, fieldErrors } from '../../lib/api-client';

const OPTION_LABELS: Record<FeeOptionKey, string> = {
  first_lesson_percent: 'Tỷ lệ của buổi học đầu tiên',
  lesson_multiplier_with_deposit: 'Số buổi học và tỷ lệ đặt cọc',
  monthly_percent: 'Tỷ lệ học phí tháng',
};

const INITIAL_FORM = {
  optionKey: 'first_lesson_percent' as FeeOptionKey,
  title: '',
  policyText: '',
  rate: '',
  deposit: '',
  scopeSubjectId: '',
  scopeMode: '',
  effectiveFrom: '',
  effectiveTo: '',
};

function dateToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function displayRate(option: FeeOptionVersion): string {
  const rate = option.rateBasisPoints / 10000;
  if (option.optionKey === 'lesson_multiplier_with_deposit') {
    return `${rate.toLocaleString('vi-VN')} buổi học · đặt cọc ${((option.depositBasisPoints ?? 0) / 100).toLocaleString('vi-VN')}%`;
  }
  return `${(rate * 100).toLocaleString('vi-VN')}% ${option.optionKey === 'first_lesson_percent' ? 'buổi đầu' : 'học phí tháng'}`;
}

export function AdminPricingPage() {
  const queryClient = useQueryClient();
  const subjects = useSubjects();
  const options = useQuery({
    queryKey: ['admin-fee-options'],
    queryFn: ({ signal }) => api.get<FeeOptionVersion[]>('/admin/fee-options', { signal }),
  });
  const create = useMutation({
    mutationFn: (input: CreateFeeOptionInput) =>
      api.post<FeeOptionVersion>('/admin/fee-options', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-fee-options'] }),
  });
  const publish = useMutation({
    mutationFn: (option: FeeOptionVersion) =>
      api.post<FeeOptionVersion>(`/admin/fee-options/${encodeURIComponent(option.id)}/publish`, {
        version: option.version,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-fee-options'] }),
  });
  const [form, setForm] = useState(INITIAL_FORM);
  const [selected, setSelected] = useState<FeeOptionVersion | null>(null);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const errors = fieldErrors(create.error);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.reset();
    setNotice('');
    setLocalError('');
    const numericRate = Number(form.rate);
    const numericDeposit = Number(form.deposit);
    if (
      !form.rate ||
      !Number.isFinite(numericRate) ||
      (form.optionKey === 'lesson_multiplier_with_deposit' && !form.deposit)
    ) {
      setLocalError('Nhập mức phí và tỷ lệ đặt cọc (nếu có) trước khi lưu.');
      return;
    }
    const input: CreateFeeOptionInput = {
      optionKey: form.optionKey,
      title: form.title.trim(),
      policyText: form.policyText.trim(),
      rateBasisPoints: Math.round(
        numericRate * (form.optionKey === 'lesson_multiplier_with_deposit' ? 10000 : 100),
      ),
      depositBasisPoints:
        form.optionKey === 'lesson_multiplier_with_deposit'
          ? Math.round(numericDeposit * 100)
          : null,
      scopeSubjectId: form.scopeSubjectId || null,
      scopeMode:
        form.scopeMode === 'online' || form.scopeMode === 'offline' ? form.scopeMode : null,
      effectiveFrom: dateToIso(form.effectiveFrom),
      effectiveTo: dateToIso(form.effectiveTo),
    };
    const parsed = createFeeOptionSchema.safeParse(input);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Phương án phí chưa hợp lệ.');
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: (option) => {
        setForm(INITIAL_FORM);
        setNotice(`Đã lưu bản nháp ${option.title}. Cần xuất bản trước khi gia sư có thể chọn.`);
      },
    });
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold text-primary">Bảng giá &amp; Phí nhận lớp</h1>
        <p className="mt-2 text-muted">
          Quản lý ba lựa chọn phí nhận lớp cho gia sư. Phụ huynh không trả phí dịch vụ.
        </p>
      </header>
      <Alert tone="info">
        Để gia sư ứng tuyển một lớp, cả ba công thức cần có phiên bản đã công bố và còn hiệu lực cho
        môn học, hình thức của lớp đó.
      </Alert>
      {isReadOnlyPreview() && (
        <Alert tone="info">
          Bản xem trước chỉ cho phép xem phương án đã lưu; chức năng ghi cần môi trường có quyền
          ghi.
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <section
        className="overflow-hidden rounded-xl border border-border bg-bg shadow-card"
        aria-labelledby="fee-form-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
          <h2
            id="fee-form-title"
            className="flex items-center gap-2 text-lg font-semibold text-primary"
          >
            <DollarSign aria-hidden="true" className="size-5" />
            Phí nhận lớp cho gia sư
          </h2>
          <Badge tone="info">Ba công thức lựa chọn</Badge>
        </div>
        <form className="grid gap-4 p-4 sm:p-6 md:grid-cols-2" onSubmit={submit}>
          <SelectField
            label="Công thức"
            value={form.optionKey}
            onChange={(event) =>
              setForm({
                ...form,
                optionKey: event.target.value as FeeOptionKey,
                rate: '',
                deposit: '',
              })
            }
            required
          >
            {FEE_OPTION_KEYS.map((key) => (
              <option key={key} value={key}>
                {OPTION_LABELS[key]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Tên hiển thị"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            maxLength={120}
            error={errors.title}
            required
          />
          <TextField
            label={
              form.optionKey === 'lesson_multiplier_with_deposit'
                ? 'Số buổi học tính phí'
                : 'Tỷ lệ phí (%)'
            }
            type="number"
            min="0.01"
            max={form.optionKey === 'lesson_multiplier_with_deposit' ? '10' : '100'}
            step="0.01"
            value={form.rate}
            onChange={(event) => setForm({ ...form, rate: event.target.value })}
            error={errors.rateBasisPoints}
            required
          />
          {form.optionKey === 'lesson_multiplier_with_deposit' && (
            <TextField
              label="Tỷ lệ đặt cọc (%)"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={form.deposit}
              onChange={(event) => setForm({ ...form, deposit: event.target.value })}
              error={errors.depositBasisPoints}
              required
            />
          )}
          <div className="md:col-span-2">
            <TextareaField
              label="Nội dung chính sách công bố"
              value={form.policyText}
              onChange={(event) => setForm({ ...form, policyText: event.target.value })}
              maxLength={2000}
              error={errors.policyText}
              hint="Nêu rõ căn cứ tính phí và điều kiện áp dụng. Việc lưu bản nháp chưa công bố cho gia sư."
              required
            />
          </div>
          <SelectField
            label="Môn học áp dụng"
            value={form.scopeSubjectId}
            onChange={(event) => setForm({ ...form, scopeSubjectId: event.target.value })}
            error={errors.scopeSubjectId}
          >
            <option value="">Tất cả môn</option>
            {subjects.data?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Hình thức áp dụng"
            value={form.scopeMode}
            onChange={(event) => setForm({ ...form, scopeMode: event.target.value })}
          >
            <option value="">Cả trực tuyến và trực tiếp</option>
            <option value="online">Trực tuyến</option>
            <option value="offline">Trực tiếp</option>
          </SelectField>
          <TextField
            label="Có hiệu lực từ"
            type="datetime-local"
            value={form.effectiveFrom}
            onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })}
            error={errors.effectiveFrom}
          />
          <TextField
            label="Có hiệu lực đến"
            type="datetime-local"
            value={form.effectiveTo}
            onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })}
            error={errors.effectiveTo}
          />
          <div className="md:col-span-2">
            {localError && <Alert tone="danger">{localError}</Alert>}
            {create.isError && <Alert tone="danger">{create.error.message}</Alert>}
            <Button
              type="submit"
              variant="accent"
              loading={create.isPending}
              disabled={isReadOnlyPreview()}
              className="mt-3 rounded-xl"
            >
              <Plus aria-hidden="true" className="size-4" />
              Lưu bản nháp
            </Button>
          </div>
        </form>
      </section>
      <section
        aria-labelledby="fee-list-title"
        className="overflow-hidden rounded-xl border border-border bg-bg shadow-card"
      >
        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-4 sm:px-6">
          <DollarSign aria-hidden="true" className="size-5 text-primary" />
          <h2 id="fee-list-title" className="text-lg font-semibold text-primary">
            Các phiên bản phí nhận lớp
          </h2>
        </div>
        <div className="p-4 sm:p-6">
          {options.isPending ? (
            <PageLoading label="Đang tải phương án phí…" />
          ) : options.isError ? (
            <Alert
              tone="danger"
              action={
                <Button variant="secondary" onClick={() => void options.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {options.error.message}
            </Alert>
          ) : options.data.length === 0 ? (
            <EmptyState
              title="Chưa có phương án phí"
              description="Kiểm duyệt viên cần lưu và xuất bản mức phí cho từng công thức trước khi gia sư ứng tuyển lớp."
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {options.data.map((option) => (
                <li
                  key={option.id}
                  className="flex min-w-0 flex-col rounded-xl border border-border bg-bg p-4 transition-shadow hover:shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold text-primary">
                      {option.title} · v{option.version}
                    </h3>
                    <Badge tone={option.status === 'published' ? 'success' : 'neutral'}>
                      {option.status === 'published' ? 'Đã công bố' : 'Bản nháp'}
                    </Badge>
                  </div>
                  <p className="mt-3 text-2xl font-bold text-primary">{displayRate(option)}</p>
                  <p className="mt-2 whitespace-pre-line text-sm text-muted">{option.policyText}</p>
                  <p className="mt-2 text-xs text-muted">
                    {option.scopeSubjectId
                      ? `Môn ${subjects.data?.find((subject) => subject.id === option.scopeSubjectId)?.name ?? option.scopeSubjectId}`
                      : 'Tất cả môn'}{' '}
                    ·{' '}
                    {option.scopeMode === 'online'
                      ? 'Trực tuyến'
                      : option.scopeMode === 'offline'
                        ? 'Trực tiếp'
                        : 'Mọi hình thức'}
                  </p>
                  {option.status === 'draft' && (
                    <Button
                      className="mt-4 self-start rounded-xl"
                      variant="accent"
                      disabled={isReadOnlyPreview()}
                      onClick={() => {
                        publish.reset();
                        setNotice('');
                        setSelected(option);
                      }}
                    >
                      Công bố phương án
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <ConfirmDialog
        open={selected !== null}
        title="Công bố phương án phí"
        description={
          <>
            Gia sư có thể chọn phương án “{selected?.title}” khi ứng tuyển lớp phù hợp. Mức phí và
            nội dung đã công bố sẽ được lưu theo phiên bản.
          </>
        }
        confirmLabel="Công bố"
        loading={publish.isPending}
        onCancel={() => setSelected(null)}
        onConfirm={() => {
          if (!selected) return;
          publish.mutate(selected, {
            onSuccess: (option) => {
              setSelected(null);
              setNotice(`Đã công bố ${option.title}.`);
            },
          });
        }}
      >
        {publish.isError && <Alert tone="danger">{publish.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}

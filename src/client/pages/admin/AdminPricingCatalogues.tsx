import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Send, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createClassFeeGuidanceSchema,
  createTuitionPriceSchema,
  updateClassFeeGuidanceSchema,
  updateTuitionPriceSchema,
  type ClassFeeGuidanceVersion,
  type TuitionPriceVersion,
} from '../../../shared/schemas/pricing';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { useSubjects } from '../../features/tutor-profile/api';
import { api, fieldErrors } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

type CatalogStatus = 'draft' | 'published' | 'retired';
type ConfirmAction<T> = { kind: 'publish' | 'retire' | 'discard'; item: T };

const STATUS_LABELS: Record<CatalogStatus, string> = {
  draft: 'Bản nháp',
  published: 'Đã công bố',
  retired: 'Ngừng công bố',
};
const LEVEL_LABELS = {
  basic: 'Cơ bản',
  advanced: 'Nâng cao',
  intensive: 'Luyện thi chuyên sâu',
} as const;

function modeText(mode: 'online' | 'offline'): string {
  return mode === 'online' ? 'Trực tuyến' : 'Trực tiếp';
}

function statusBadge(status: CatalogStatus) {
  return (
    <Badge tone={status === 'published' ? 'success' : status === 'draft' ? 'info' : 'neutral'}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const EMPTY_TUITION_FORM = {
  subjectId: '',
  gradeLabel: '',
  level: 'basic' as TuitionPriceVersion['level'],
  mode: 'online' as TuitionPriceVersion['mode'],
  price: '',
};

export function AdminTuitionCatalogue() {
  const queryClient = useQueryClient();
  const subjects = useSubjects();
  const rows = useQuery({
    queryKey: ['admin-tuition-prices'],
    queryFn: ({ signal }) => api.get<TuitionPriceVersion[]>('/admin/pricing/tuition', { signal }),
  });
  const save = useMutation({
    mutationFn: ({
      form,
      editing,
    }: {
      form: typeof EMPTY_TUITION_FORM;
      editing: TuitionPriceVersion | null;
    }) => {
      const pricePerSessionMinor = Number(form.price);
      if (editing) {
        const input = updateTuitionPriceSchema.parse({
          editVersion: editing.editVersion,
          pricePerSessionMinor,
        });
        return api.patch<TuitionPriceVersion>(`/admin/pricing/tuition/${editing.id}`, input);
      }
      const input = createTuitionPriceSchema.parse({
        subjectId: form.subjectId,
        gradeLabel: form.gradeLabel.trim(),
        level: form.level,
        mode: form.mode,
        pricePerSessionMinor,
      });
      return api.post<TuitionPriceVersion>('/admin/pricing/tuition', input);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-tuition-prices'] }),
  });
  const transition = useMutation({
    mutationFn: ({ kind, item }: ConfirmAction<TuitionPriceVersion>) =>
      api.post<TuitionPriceVersion>(
        `/admin/pricing/tuition/${item.id}/${kind}`,
        kind === 'retire' ? { version: item.version } : { editVersion: item.editVersion },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-tuition-prices'] });
      void queryClient.invalidateQueries({ queryKey: ['published-tuition-prices'] });
    },
  });
  const [form, setForm] = useState(EMPTY_TUITION_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TuitionPriceVersion | null>(null);
  const [keyLocked, setKeyLocked] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction<TuitionPriceVersion> | null>(null);
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const errors = fieldErrors(save.error);

  function openForm(item?: TuitionPriceVersion) {
    save.reset();
    setLocalError('');
    setNotice('');
    setEditing(item?.status === 'draft' ? item : null);
    setKeyLocked(Boolean(item));
    setForm(
      item
        ? {
            subjectId: item.subjectId,
            gradeLabel: item.gradeLabel,
            level: item.level,
            mode: item.mode,
            price: String(item.pricePerSessionMinor),
          }
        : EMPTY_TUITION_FORM,
    );
    setFormOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.reset();
    setLocalError('');
    const price = Number(form.price);
    const input = editing
      ? updateTuitionPriceSchema.safeParse({
          editVersion: editing.editVersion,
          pricePerSessionMinor: price,
        })
      : createTuitionPriceSchema.safeParse({
          subjectId: form.subjectId,
          gradeLabel: form.gradeLabel.trim(),
          level: form.level,
          mode: form.mode,
          pricePerSessionMinor: price,
        });
    if (!form.price.trim() || !input.success) {
      setLocalError(
        input.success
          ? 'Nhập học phí mỗi buổi.'
          : (input.error.issues[0]?.message ?? 'Bảng giá chưa hợp lệ.'),
      );
      return;
    }
    save.mutate(
      { form, editing },
      {
        onSuccess: (result) => {
          setFormOpen(false);
          setNotice(`Đã lưu bản nháp học phí ${result.subjectName} – ${result.gradeLabel}.`);
        },
      },
    );
  }

  return (
    <section aria-labelledby="admin-tuition-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="admin-tuition-heading" className="text-xl font-semibold text-primary">
            Bảng giá học phí theo môn và lớp
          </h2>
          <p className="mt-1 text-sm text-muted">
            Mức tham khảo theo buổi, do kiểm duyệt viên công bố.
          </p>
        </div>
        <Button variant="accent" onClick={() => openForm()} disabled={isReadOnlyPreview()}>
          <Plus aria-hidden="true" className="size-4" /> Thêm mục giá
        </Button>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {formOpen && (
        <form
          onSubmit={submit}
          className="grid gap-4 rounded-xl border border-border bg-bg p-5 shadow-card sm:grid-cols-2"
        >
          <div className="sm:col-span-2 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-primary">
              {editing ? 'Sửa bản nháp học phí' : 'Thêm mục học phí'}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFormOpen(false)}
              aria-label="Đóng biểu mẫu học phí"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <SelectField
            label="Môn học"
            required
            value={form.subjectId}
            disabled={keyLocked}
            onChange={(event) => setForm({ ...form, subjectId: event.target.value })}
            error={errors.subjectId}
          >
            <option value="">Chọn môn học</option>
            {subjects.data?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Lớp / nhóm lớp"
            required
            maxLength={40}
            value={form.gradeLabel}
            disabled={keyLocked}
            onChange={(event) => setForm({ ...form, gradeLabel: event.target.value })}
            error={errors.gradeLabel}
          />
          <SelectField
            label="Trình độ"
            required
            value={form.level}
            disabled={keyLocked}
            onChange={(event) =>
              setForm({ ...form, level: event.target.value as TuitionPriceVersion['level'] })
            }
            error={errors.level}
          >
            {Object.entries(LEVEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Hình thức"
            required
            value={form.mode}
            disabled={keyLocked}
            onChange={(event) =>
              setForm({ ...form, mode: event.target.value as TuitionPriceVersion['mode'] })
            }
            error={errors.mode}
          >
            <option value="online">Trực tuyến</option>
            <option value="offline">Trực tiếp</option>
          </SelectField>
          <TextField
            label="Học phí (₫/buổi)"
            required
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={form.price}
            onChange={(event) => setForm({ ...form, price: event.target.value })}
            error={errors.pricePerSessionMinor}
          />
          <div className="flex items-end gap-2">
            <Button type="submit" loading={save.isPending} disabled={isReadOnlyPreview()}>
              Lưu bản nháp
            </Button>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
          </div>
          {localError && (
            <div className="sm:col-span-2">
              <Alert tone="danger">{localError}</Alert>
            </div>
          )}
          {save.isError && (
            <div className="sm:col-span-2">
              <Alert tone="danger">{save.error.message}</Alert>
            </div>
          )}
        </form>
      )}
      {rows.isPending ? (
        <PageLoading label="Đang tải bảng giá học phí…" />
      ) : rows.isError ? (
        <Alert
          tone="danger"
          title="Không tải được bảng giá học phí"
          action={
            <Button variant="secondary" onClick={() => void rows.refetch()}>
              Thử lại
            </Button>
          }
        >
          {rows.error.message}
        </Alert>
      ) : rows.data.length === 0 ? (
        <EmptyState title="Chưa có mục học phí" />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {rows.data.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-bg p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold text-primary">
                  {item.subjectName} – {item.gradeLabel}
                </h3>
                {statusBadge(item.status)}
              </div>
              <p className="mt-2 text-sm text-muted">
                {LEVEL_LABELS[item.level]} · {modeText(item.mode)} · phiên bản {item.version}
              </p>
              {item.status === 'draft' && item.version > 1 && (
                <p className="mt-2 text-sm text-muted">
                  Bản đã công bố trước đó vẫn hiển thị cho đến khi phiên bản này được công bố.
                </p>
              )}
              <p className="mt-3 text-2xl font-bold text-primary">
                {formatVnd(item.pricePerSessionMinor)}/buổi
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.status !== 'retired' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isReadOnlyPreview()}
                    onClick={() => openForm(item)}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    {item.status === 'draft' ? 'Sửa' : 'Tạo phiên bản mới'}
                  </Button>
                )}
                {item.status === 'draft' && (
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={isReadOnlyPreview()}
                    onClick={() => {
                      transition.reset();
                      setConfirm({ kind: 'publish', item });
                    }}
                  >
                    <Send aria-hidden="true" className="size-4" /> Công bố
                  </Button>
                )}
                {item.status === 'draft' && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isReadOnlyPreview()}
                    onClick={() => {
                      transition.reset();
                      setConfirm({ kind: 'discard', item });
                    }}
                  >
                    Xóa bản nháp
                  </Button>
                )}
                {item.status === 'published' && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isReadOnlyPreview()}
                    onClick={() => {
                      transition.reset();
                      setConfirm({ kind: 'retire', item });
                    }}
                  >
                    Ngừng công bố
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === 'publish'
            ? 'Công bố mức học phí'
            : confirm?.kind === 'discard'
              ? 'Xóa bản nháp học phí'
              : 'Ngừng công bố mức học phí'
        }
        description={
          confirm?.kind === 'publish'
            ? 'Mức học phí này sẽ xuất hiện trên bảng giá công khai.'
            : confirm?.kind === 'discard'
              ? 'Bản nháp chưa công bố sẽ bị xóa.'
              : 'Mức này sẽ không còn hiển thị trên bảng giá công khai. Lịch sử phiên bản vẫn được giữ.'
        }
        confirmLabel={
          confirm?.kind === 'publish'
            ? 'Công bố'
            : confirm?.kind === 'discard'
              ? 'Xóa bản nháp'
              : 'Ngừng công bố'
        }
        tone={confirm?.kind === 'publish' ? 'primary' : 'danger'}
        loading={transition.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          transition.mutate(confirm, {
            onSuccess: () => {
              setNotice(
                confirm.kind === 'publish'
                  ? 'Đã công bố mức học phí.'
                  : confirm.kind === 'discard'
                    ? 'Đã xóa bản nháp học phí.'
                    : 'Đã ngừng công bố mức học phí.',
              );
              setConfirm(null);
            },
          });
        }}
      >
        {transition.isError && <Alert tone="danger">{transition.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}

const EMPTY_CLASS_FEE_FORM = {
  mode: 'online' as ClassFeeGuidanceVersion['mode'],
  minFee: '',
  maxFee: '',
  description: '',
};

export function AdminClassFeeGuidance() {
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: ['admin-class-fee-guidance'],
    queryFn: ({ signal }) =>
      api.get<ClassFeeGuidanceVersion[]>('/admin/pricing/class-fees', { signal }),
  });
  const save = useMutation({
    mutationFn: ({
      form,
      editing,
    }: {
      form: typeof EMPTY_CLASS_FEE_FORM;
      editing: ClassFeeGuidanceVersion | null;
    }) => {
      const values = {
        minFeeMinor: Number(form.minFee),
        maxFeeMinor: Number(form.maxFee),
        description: form.description.trim(),
      };
      if (editing) {
        const input = updateClassFeeGuidanceSchema.parse({
          editVersion: editing.editVersion,
          ...values,
        });
        return api.patch<ClassFeeGuidanceVersion>(`/admin/pricing/class-fees/${editing.id}`, input);
      }
      const input = createClassFeeGuidanceSchema.parse({ mode: form.mode, ...values });
      return api.post<ClassFeeGuidanceVersion>('/admin/pricing/class-fees', input);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-class-fee-guidance'] }),
  });
  const transition = useMutation({
    mutationFn: ({ kind, item }: ConfirmAction<ClassFeeGuidanceVersion>) =>
      api.post<ClassFeeGuidanceVersion>(
        `/admin/pricing/class-fees/${item.id}/${kind}`,
        kind === 'retire' ? { version: item.version } : { editVersion: item.editVersion },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-class-fee-guidance'] });
      void queryClient.invalidateQueries({ queryKey: ['published-class-fee-guidance'] });
    },
  });
  const [form, setForm] = useState(EMPTY_CLASS_FEE_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassFeeGuidanceVersion | null>(null);
  const [keyLocked, setKeyLocked] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction<ClassFeeGuidanceVersion> | null>(null);
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const errors = fieldErrors(save.error);

  function openForm(item?: ClassFeeGuidanceVersion) {
    save.reset();
    setLocalError('');
    setNotice('');
    setEditing(item?.status === 'draft' ? item : null);
    setKeyLocked(Boolean(item));
    setForm(
      item
        ? {
            mode: item.mode,
            minFee: String(item.minFeeMinor),
            maxFee: String(item.maxFeeMinor),
            description: item.description,
          }
        : EMPTY_CLASS_FEE_FORM,
    );
    setFormOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.reset();
    setLocalError('');
    const values = {
      minFeeMinor: Number(form.minFee),
      maxFeeMinor: Number(form.maxFee),
      description: form.description.trim(),
    };
    const input = editing
      ? updateClassFeeGuidanceSchema.safeParse({ editVersion: editing.editVersion, ...values })
      : createClassFeeGuidanceSchema.safeParse({ mode: form.mode, ...values });
    if (!form.minFee.trim() || !form.maxFee.trim() || !input.success) {
      setLocalError(
        input.success
          ? 'Nhập phí tối thiểu và tối đa.'
          : (input.error.issues[0]?.message ?? 'Khoảng phí chưa hợp lệ.'),
      );
      return;
    }
    save.mutate(
      { form, editing },
      {
        onSuccess: (result) => {
          setFormOpen(false);
          setNotice(`Đã lưu bản nháp khoảng phí ${modeText(result.mode)}.`);
        },
      },
    );
  }

  return (
    <section aria-labelledby="admin-class-fee-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="admin-class-fee-heading" className="text-xl font-semibold text-primary">
            Khoảng phí nhận lớp theo hình thức
          </h2>
          <p className="mt-1 text-sm text-muted">
            Thông tin tham khảo; phí áp dụng do gia sư chọn trong ba phương án khi ứng tuyển. Phụ
            huynh không trả phí dịch vụ.
          </p>
        </div>
        <Button variant="accent" onClick={() => openForm()} disabled={isReadOnlyPreview()}>
          <Plus aria-hidden="true" className="size-4" /> Thêm khoảng phí
        </Button>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {formOpen && (
        <form
          onSubmit={submit}
          className="grid gap-4 rounded-xl border border-border bg-bg p-5 shadow-card sm:grid-cols-2"
        >
          <div className="sm:col-span-2 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-primary">
              {editing ? 'Sửa khoảng phí nháp' : 'Thêm khoảng phí'}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFormOpen(false)}
              aria-label="Đóng biểu mẫu khoảng phí"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <SelectField
            label="Hình thức"
            required
            value={form.mode}
            disabled={keyLocked}
            onChange={(event) =>
              setForm({ ...form, mode: event.target.value as ClassFeeGuidanceVersion['mode'] })
            }
            error={errors.mode}
          >
            <option value="online">Trực tuyến</option>
            <option value="offline">Trực tiếp</option>
          </SelectField>
          <div className="hidden sm:block" />
          <TextField
            label="Phí tối thiểu (₫)"
            required
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={form.minFee}
            onChange={(event) => setForm({ ...form, minFee: event.target.value })}
            error={errors.minFeeMinor}
          />
          <TextField
            label="Phí tối đa (₫)"
            required
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={form.maxFee}
            onChange={(event) => setForm({ ...form, maxFee: event.target.value })}
            error={errors.maxFeeMinor}
          />
          <div className="sm:col-span-2">
            <TextareaField
              label="Mô tả"
              required
              maxLength={500}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              error={errors.description}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <Button type="submit" loading={save.isPending} disabled={isReadOnlyPreview()}>
              Lưu bản nháp
            </Button>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
          </div>
          {localError && (
            <div className="sm:col-span-2">
              <Alert tone="danger">{localError}</Alert>
            </div>
          )}
          {save.isError && (
            <div className="sm:col-span-2">
              <Alert tone="danger">{save.error.message}</Alert>
            </div>
          )}
        </form>
      )}
      {rows.isPending ? (
        <PageLoading label="Đang tải khoảng phí…" />
      ) : rows.isError ? (
        <Alert
          tone="danger"
          title="Không tải được khoảng phí"
          action={
            <Button variant="secondary" onClick={() => void rows.refetch()}>
              Thử lại
            </Button>
          }
        >
          {rows.error.message}
        </Alert>
      ) : rows.data.length === 0 ? (
        <EmptyState title="Chưa có khoảng phí tham khảo" />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {rows.data.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-bg p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold text-primary">Phí nhận lớp {modeText(item.mode)}</h3>
                {statusBadge(item.status)}
              </div>
              <p className="mt-2 text-sm text-muted">Phiên bản {item.version}</p>
              {item.status === 'draft' && item.version > 1 && (
                <p className="mt-2 text-sm text-muted">
                  Bản đã công bố trước đó vẫn hiển thị cho đến khi phiên bản này được công bố.
                </p>
              )}
              <p className="mt-3 text-2xl font-bold text-primary">
                {formatVnd(item.minFeeMinor)} – {formatVnd(item.maxFeeMinor)}
              </p>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.status !== 'retired' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isReadOnlyPreview()}
                    onClick={() => openForm(item)}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    {item.status === 'draft' ? 'Sửa' : 'Tạo phiên bản mới'}
                  </Button>
                )}
                {item.status === 'draft' && (
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={isReadOnlyPreview()}
                    onClick={() => {
                      transition.reset();
                      setConfirm({ kind: 'publish', item });
                    }}
                  >
                    <Send aria-hidden="true" className="size-4" /> Công bố
                  </Button>
                )}
                {item.status === 'draft' && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isReadOnlyPreview()}
                    onClick={() => {
                      transition.reset();
                      setConfirm({ kind: 'discard', item });
                    }}
                  >
                    Xóa bản nháp
                  </Button>
                )}
                {item.status === 'published' && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isReadOnlyPreview()}
                    onClick={() => {
                      transition.reset();
                      setConfirm({ kind: 'retire', item });
                    }}
                  >
                    Ngừng công bố
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === 'publish'
            ? 'Công bố khoảng phí'
            : confirm?.kind === 'discard'
              ? 'Xóa bản nháp khoảng phí'
              : 'Ngừng công bố khoảng phí'
        }
        description={
          confirm?.kind === 'publish'
            ? 'Khoảng phí tham khảo sẽ hiển thị công khai. Đây không phải khoản phí bắt buộc ngoài phương án gia sư chọn.'
            : confirm?.kind === 'discard'
              ? 'Bản nháp chưa công bố sẽ bị xóa.'
              : 'Khoảng phí này sẽ không còn hiển thị công khai. Lịch sử phiên bản vẫn được giữ.'
        }
        confirmLabel={
          confirm?.kind === 'publish'
            ? 'Công bố'
            : confirm?.kind === 'discard'
              ? 'Xóa bản nháp'
              : 'Ngừng công bố'
        }
        tone={confirm?.kind === 'publish' ? 'primary' : 'danger'}
        loading={transition.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          transition.mutate(confirm, {
            onSuccess: () => {
              setNotice(
                confirm.kind === 'publish'
                  ? 'Đã công bố khoảng phí.'
                  : confirm.kind === 'discard'
                    ? 'Đã xóa bản nháp khoảng phí.'
                    : 'Đã ngừng công bố khoảng phí.',
              );
              setConfirm(null);
            },
          });
        }}
      >
        {transition.isError && <Alert tone="danger">{transition.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}

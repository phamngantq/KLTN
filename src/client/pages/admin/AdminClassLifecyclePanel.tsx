import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  AdminAssignment,
  CancelClassInput,
  ClassLifecycle,
  ClassLifecycleActionInput,
} from '../../../shared/schemas/admin-assignments';
import type { AdminClass } from '../../../shared/schemas/classes';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge } from '../../components/ui/Feedback';
import { TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

type Action = 'revoke' | 'complete' | 'cancel';

export function AdminClassLifecyclePanel({
  item,
  onClose,
}: {
  item: AdminClass;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const lifecycle = useQuery({
    queryKey: ['admin-class-lifecycle', item.id],
    queryFn: ({ signal }) =>
      api.get<ClassLifecycle>(`/admin/classes/${encodeURIComponent(item.id)}/lifecycle`, {
        signal,
      }),
  });
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const [tuitionOpen, setTuitionOpen] = useState(false);
  const [tuition, setTuition] = useState('');
  const [partiesAgreed, setPartiesAgreed] = useState(false);
  const [tuitionError, setTuitionError] = useState('');
  const recordTuition = useMutation({
    mutationFn: ({
      assignmentId,
      assignmentVersion,
      agreedTuitionPerSessionMinor,
    }: {
      assignmentId: string;
      assignmentVersion: number;
      agreedTuitionPerSessionMinor: number;
    }) =>
      api.post<AdminAssignment>(`/admin/assignments/${encodeURIComponent(assignmentId)}/tuition`, {
        assignmentVersion,
        agreedTuitionPerSessionMinor,
        partiesAgreed: true,
      }),
  });
  const transition = useMutation({
    mutationFn: ({
      kind,
      input,
    }: {
      kind: Action;
      input: ClassLifecycleActionInput | CancelClassInput;
    }) => api.post<ClassLifecycle>(`/admin/classes/${encodeURIComponent(item.id)}/${kind}`, input),
  });

  function confirmTuition() {
    const current = lifecycle.data;
    if (
      !current ||
      current.classStatus !== 'active' ||
      !current.assignmentId ||
      !current.assignmentVersion ||
      current.agreedTuitionPerSessionMinor !== null
    )
      return;
    const normalizedTuition = tuition.trim();
    const amount = Number(normalizedTuition);
    if (
      !/^\d+$/.test(normalizedTuition) ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > 100_000_000
    ) {
      setTuitionError('Nhập học phí đã chốt từ 1 đến 100.000.000 VNĐ mỗi buổi.');
      return;
    }
    if (!partiesAgreed) {
      setTuitionError('Cần xác nhận hai bên đã thống nhất mức học phí này.');
      return;
    }
    recordTuition.mutate(
      {
        assignmentId: current.assignmentId,
        assignmentVersion: current.assignmentVersion,
        agreedTuitionPerSessionMinor: amount,
      },
      {
        onSuccess: () => {
          setTuitionOpen(false);
          setTuition('');
          setPartiesAgreed(false);
          setTuitionError('');
          setNotice(`Đã ghi học phí đã chốt ${formatVnd(amount)}/buổi.`);
          for (const key of [
            'admin-class-lifecycle',
            'admin-classes',
            'parent-requests',
            'parent-request',
            'tutor-assignments',
          ])
            void queryClient.invalidateQueries({ queryKey: [key] });
        },
      },
    );
  }

  function confirm() {
    const current = lifecycle.data;
    if (!current || !action) return;
    if (reason.trim().length < 3) {
      setLocalError('Cần ghi lý do ít nhất 3 ký tự.');
      return;
    }
    if (action !== 'cancel' && (!current.assignmentId || !current.assignmentVersion)) return;
    const input =
      action === 'cancel'
        ? {
            classVersion: current.classVersion,
            requestVersion: current.requestVersion,
            reason: reason.trim(),
          }
        : {
            classVersion: current.classVersion,
            requestVersion: current.requestVersion,
            assignmentId: current.assignmentId!,
            assignmentVersion: current.assignmentVersion!,
            reason: reason.trim(),
          };
    transition.mutate(
      { kind: action, input },
      {
        onSuccess: () => {
          setNotice(
            action === 'revoke'
              ? 'Đã rút gán. Lớp mở lại và gia sư cũ không còn quyền xem liên hệ.'
              : action === 'cancel'
                ? 'Đã hủy lớp và yêu cầu nguồn. Các đơn đang chờ đã được đóng.'
                : 'Đã ghi nhận hoàn tất lớp với lý do.',
          );
          setAction(null);
          setReason('');
          void queryClient.invalidateQueries({ queryKey: ['admin-class-lifecycle', item.id] });
          for (const key of [
            'admin-classes',
            'admin-requests',
            'admin-applications',
            'admin-contract-candidates',
          ])
            void queryClient.invalidateQueries({ queryKey: [key] });
        },
      },
    );
  }

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-label={`Vòng đời lớp ${item.code}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-primary">Vòng đời lớp {item.code}</h2>
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {lifecycle.isPending ? (
        <PageLoading label="Đang tải trạng thái lớp…" />
      ) : lifecycle.isError ? (
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" onClick={() => void lifecycle.refetch()}>
              Thử lại
            </Button>
          }
        >
          {lifecycle.error.message}
        </Alert>
      ) : (
        <div className="mt-3 grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={lifecycle.data.classStatus === 'active' ? 'success' : 'info'}>
              {lifecycle.data.classStatus === 'active'
                ? 'Đang hoạt động'
                : lifecycle.data.classStatus === 'open'
                  ? 'Đang tuyển lại'
                  : lifecycle.data.classStatus === 'completed'
                    ? 'Đã hoàn tất'
                    : lifecycle.data.classStatus === 'cancelled'
                      ? 'Đã hủy'
                      : lifecycle.data.classStatus}
            </Badge>
            {lifecycle.data.tutorDisplayName && (
              <span>Gia sư hiện tại: {lifecycle.data.tutorDisplayName}</span>
            )}
          </div>
          {lifecycle.data.classStatus === 'active' && (
            <div className="rounded-md border border-border bg-bg p-3 text-sm">
              <span className="font-medium">Học phí đã chốt: </span>
              {lifecycle.data.agreedTuitionPerSessionMinor === null
                ? 'Chưa ghi nhận'
                : `${formatVnd(lifecycle.data.agreedTuitionPerSessionMinor)}/buổi`}
            </div>
          )}
          {lifecycle.data.classStatus === 'active' &&
            lifecycle.data.assignmentId &&
            lifecycle.data.agreedTuitionPerSessionMinor === null && (
              <Button
                variant="secondary"
                disabled={isReadOnlyPreview()}
                onClick={() => {
                  recordTuition.reset();
                  setTuition('');
                  setPartiesAgreed(false);
                  setTuitionError('');
                  setTuitionOpen(true);
                }}
              >
                Ghi học phí đã chốt cho lớp cũ
              </Button>
            )}
          {lifecycle.data.classStatus === 'active' && lifecycle.data.assignmentId && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={isReadOnlyPreview()}
                onClick={() => {
                  transition.reset();
                  setReason('');
                  setLocalError('');
                  setAction('revoke');
                }}
              >
                Rút gán và tuyển lại
              </Button>
              <Button
                disabled={isReadOnlyPreview()}
                onClick={() => {
                  transition.reset();
                  setReason('');
                  setLocalError('');
                  setAction('complete');
                }}
              >
                Hoàn tất lớp
              </Button>
            </div>
          )}
          {lifecycle.data.classStatus === 'open' && lifecycle.data.requestStatus === 'sourcing' && (
            <Button
              variant="secondary"
              disabled={isReadOnlyPreview()}
              onClick={() => {
                transition.reset();
                setReason('');
                setLocalError('');
                setAction('cancel');
              }}
            >
              Hủy lớp đang tuyển
            </Button>
          )}
          <div>
            <h3 className="font-medium">Lịch sử xử lý</h3>
            {lifecycle.data.events.length === 0 ? (
              <p className="text-sm text-muted">Chưa có lần rút gán, hoàn tất hoặc hủy lớp.</p>
            ) : (
              <ol className="mt-2 grid gap-2">
                {lifecycle.data.events.map((event) => (
                  <li key={event.id} className="rounded border border-border bg-bg p-3 text-sm">
                    <p className="font-medium">
                      {event.eventType === 'revoked'
                        ? 'Rút gán gia sư'
                        : event.eventType === 'cancelled'
                          ? 'Hủy lớp'
                          : 'Hoàn tất lớp'}{' '}
                      · {new Date(event.createdAt).toLocaleString('vi-VN')}
                    </p>
                    <p>Lý do: {event.reason}</p>
                    {event.assignmentId && (
                      <p>
                        Học phí đã chốt của lần gán:{' '}
                        {event.agreedTuitionPerSessionMinor === null
                          ? 'Chưa ghi nhận'
                          : `${formatVnd(event.agreedTuitionPerSessionMinor)}/buổi`}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={action !== null}
        title={
          action === 'revoke'
            ? 'Rút gán gia sư'
            : action === 'cancel'
              ? 'Hủy lớp đang tuyển'
              : 'Hoàn tất lớp'
        }
        description={
          action === 'revoke'
            ? 'Lớp sẽ mở lại để nhận ứng tuyển mới. Gia sư hiện tại mất quyền xem liên hệ sau khi lưu.'
            : action === 'cancel'
              ? 'Lớp và yêu cầu của phụ huynh sẽ đóng. Các đơn đang chờ được từ chối có lý do; lịch sử vẫn được giữ.'
              : 'Lớp và yêu cầu của phụ huynh sẽ được ghi nhận hoàn tất. Lịch sử ứng tuyển, phí và hợp đồng vẫn được giữ.'
        }
        confirmLabel={
          action === 'revoke'
            ? 'Rút gán và mở lại'
            : action === 'cancel'
              ? 'Hủy lớp và yêu cầu'
              : 'Ghi nhận hoàn tất'
        }
        tone={action === 'revoke' || action === 'cancel' ? 'danger' : 'primary'}
        loading={transition.isPending}
        onCancel={() => setAction(null)}
        onConfirm={confirm}
      >
        <TextareaField
          label="Lý do"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setLocalError('');
          }}
          maxLength={action === 'cancel' ? 450 : 500}
          required
          error={localError}
        />
        {transition.isError && <Alert tone="danger">{transition.error.message}</Alert>}
      </ConfirmDialog>
      <ConfirmDialog
        open={tuitionOpen}
        title="Ghi học phí đã chốt"
        description={`Lớp ${item.code} đã được gán trước khi hệ thống yêu cầu ghi học phí. Chỉ lưu mức mà phụ huynh và gia sư đã thống nhất.`}
        confirmLabel="Lưu học phí đã chốt"
        loading={recordTuition.isPending}
        onCancel={() => setTuitionOpen(false)}
        onConfirm={confirmTuition}
      >
        <TextField
          label="Học phí đã chốt (VNĐ/buổi)"
          type="number"
          inputMode="numeric"
          min={1}
          max={100_000_000}
          step={1}
          value={tuition}
          onChange={(event) => {
            setTuition(event.target.value);
            setTuitionError('');
          }}
          required
          error={tuitionError || undefined}
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={partiesAgreed}
            onChange={(event) => {
              setPartiesAgreed(event.target.checked);
              setTuitionError('');
            }}
            className="mt-1 size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          Tôi xác nhận phụ huynh và gia sư đã thống nhất mức học phí này.
        </label>
        {recordTuition.isError && <Alert tone="danger">{recordTuition.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}

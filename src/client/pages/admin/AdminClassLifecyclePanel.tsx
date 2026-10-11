import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  CancelClassInput,
  ClassLifecycle,
  ClassLifecycleActionInput,
} from '../../../shared/schemas/admin-assignments';
import type { AdminClass } from '../../../shared/schemas/classes';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge } from '../../components/ui/Feedback';
import { TextareaField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api } from '../../lib/api-client';

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
  const transition = useMutation({
    mutationFn: ({
      kind,
      input,
    }: {
      kind: Action;
      input: ClassLifecycleActionInput | CancelClassInput;
    }) => api.post<ClassLifecycle>(`/admin/classes/${encodeURIComponent(item.id)}/${kind}`, input),
  });

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
    </section>
  );
}

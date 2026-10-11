import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { DeletedAccount } from '../../shared/schemas/privacy';
import { ME_KEY, useSession } from '../app/auth';
import { isReadOnlyPreview } from '../app/preview';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Alert, PageHeader } from '../components/ui/Feedback';
import { TextField } from '../components/ui/Field';
import { api, setCsrfToken } from '../lib/api-client';
import { ROLE_LABELS } from '../lib/format';

/** Signed-in account summary. Rendered behind RequireRole, so `user` is present. */
export function AccountPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const deletion = useMutation({
    mutationFn: () => api.post<DeletedAccount>('/account/deletion', { confirmation: 'DELETE' }),
    onSuccess: () => {
      setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
      void navigate('/');
    },
  });
  if (!user) return null;
  return (
    <section className="space-y-6">
      <PageHeader title="Tài khoản" />
      <dl className="grid max-w-lg grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-border p-4">
        <dt className="text-muted">Họ tên</dt>
        <dd>{user.displayName}</dd>
        <dt className="text-muted">Email</dt>
        <dd className="break-all">{user.email}</dd>
        <dt className="text-muted">Vai trò</dt>
        <dd>{ROLE_LABELS[user.role]}</dd>
      </dl>
      {user.role !== 'admin' && (
        <div className="max-w-2xl rounded-lg border border-danger p-5">
          <h2 className="text-lg font-semibold">Xóa tài khoản</h2>
          <p className="mt-2 text-sm text-muted">
            Hệ thống sẽ xóa thông tin liên hệ, hồ sơ và phiên đăng nhập của bạn. Mã lớp, yêu cầu và
            lịch sử nghiệp vụ được giữ ở dạng đã ẩn danh. Nếu còn lịch hoặc lớp đang xử lý, yêu cầu
            xóa sẽ được từ chối để bạn giải quyết cam kết trước.
          </p>
          {isReadOnlyPreview() && (
            <Alert tone="info">Bản xem trước không cho phép xóa tài khoản.</Alert>
          )}
          {deletion.isError && <Alert tone="danger">{deletion.error.message}</Alert>}
          <Button
            variant="danger"
            className="mt-4"
            disabled={isReadOnlyPreview()}
            onClick={() => {
              deletion.reset();
              setConfirmation('');
              setConfirmError('');
              setConfirmOpen(true);
            }}
          >
            Yêu cầu xóa tài khoản
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            title="Xác nhận xóa tài khoản"
            description="Thao tác này sẽ đăng xuất tất cả phiên và xóa dữ liệu liên hệ riêng. Nhập DELETE để xác nhận."
            confirmLabel="Xóa tài khoản"
            tone="danger"
            loading={deletion.isPending}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => {
              if (confirmation !== 'DELETE') {
                setConfirmError('Nhập đúng DELETE để xác nhận.');
                return;
              }
              setConfirmError('');
              deletion.mutate();
            }}
          >
            <TextField
              label="Nhập DELETE"
              value={confirmation}
              autoComplete="off"
              onChange={(event) => {
                setConfirmation(event.target.value);
                setConfirmError('');
              }}
              error={confirmError || undefined}
            />
            {deletion.isError && <Alert tone="danger">{deletion.error.message}</Alert>}
          </ConfirmDialog>
        </div>
      )}
    </section>
  );
}

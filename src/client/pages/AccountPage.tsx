import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { PublicUser, SessionPayload } from '../../shared/schemas/auth';
import type { DeletedAccount } from '../../shared/schemas/privacy';
import { ME_KEY, useLogout, useSession } from '../app/auth';
import { isReadOnlyPreview } from '../app/preview';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Alert, PageHeader } from '../components/ui/Feedback';
import { TextField } from '../components/ui/Field';
import { api, fieldErrors, setCsrfToken } from '../lib/api-client';
import { ROLE_LABELS } from '../lib/format';

/** Signed-in account summary. Rendered behind RequireRole, so `user` is present. */
export function AccountPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useLogout();
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
      <AccountInfo user={user} />
      <PasswordChange />
      <section
        aria-labelledby="sign-out-title"
        className="flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-5"
      >
        <div>
          <h2 id="sign-out-title" className="text-lg font-semibold">
            Đăng xuất
          </h2>
          <p className="mt-1 text-sm text-muted">Kết thúc phiên đăng nhập trên thiết bị này.</p>
        </div>
        <Button
          variant="secondary"
          loading={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSuccess: () => void navigate('/') })}
        >
          Đăng xuất
        </Button>
        {logout.isError && <Alert tone="danger">{logout.error.message}</Alert>}
      </section>
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

/** Where each role edits its role-specific personal details. */
const PROFILE_LINKS: Partial<Record<PublicUser['role'], { to: string; label: string }>> = {
  student: { to: '/parent/profile', label: 'Hồ sơ người học' },
  tutor: { to: '/tutor/profile', label: 'Hồ sơ gia sư' },
};

/** "Chỉnh sửa thông tin tài khoản": name for every role; email and role stay as registered. */
function AccountInfo({ user }: { user: PublicUser }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(user.displayName);
  const save = useMutation({
    mutationFn: () => api.patch<SessionPayload>('/me', { displayName }),
    onSuccess: (session) => {
      queryClient.setQueryData(ME_KEY, session);
      setDisplayName(session.user.displayName);
    },
  });
  const errors = save.isError ? fieldErrors(save.error) : {};
  const profile = PROFILE_LINKS[user.role];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim() || isReadOnlyPreview()) return;
    save.mutate();
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby="account-info-title"
      className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border p-5"
    >
      <h2 id="account-info-title" className="text-lg font-semibold">
        Thông tin tài khoản
      </h2>
      <TextField
        label="Họ tên"
        required
        maxLength={100}
        value={displayName}
        error={errors.displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
          save.reset();
        }}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Email đăng nhập</dt>
        <dd className="break-all">{user.email}</dd>
        <dt className="text-muted">Vai trò</dt>
        <dd>{ROLE_LABELS[user.role]}</dd>
      </dl>
      <p className="text-sm text-muted">
        Email và vai trò được giữ theo lúc đăng ký.
        {profile && (
          <>
            {' '}
            Thông tin cá nhân khác (số điện thoại, địa chỉ…) cập nhật tại{' '}
            <Link
              to={profile.to}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {profile.label}
            </Link>
            .
          </>
        )}
      </p>
      {save.isSuccess && (
        <p role="status" className="text-sm text-success">
          Đã lưu thông tin tài khoản.
        </p>
      )}
      {save.isError && !errors.displayName && <Alert tone="danger">{save.error.message}</Alert>}
      <Button
        type="submit"
        className="self-start"
        disabled={
          !displayName.trim() || displayName.trim() === user.displayName || isReadOnlyPreview()
        }
        loading={save.isPending}
      >
        Lưu thay đổi
      </Button>
    </form>
  );
}

/** Password change with the current password; other devices are signed out by the server. */
function PasswordChange() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mismatch, setMismatch] = useState('');
  const change = useMutation({
    mutationFn: () =>
      api.post<{ changed: true }>('/me/password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setRepeat('');
    },
  });
  const errors = change.isError ? fieldErrors(change.error) : {};
  const serverField = change.isError ? change.error.message : '';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyPreview()) return;
    if (next !== repeat) {
      setMismatch('Mật khẩu nhập lại không khớp.');
      return;
    }
    setMismatch('');
    change.mutate();
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby="password-title"
      className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border p-5"
    >
      <h2 id="password-title" className="text-lg font-semibold">
        Đổi mật khẩu
      </h2>
      <TextField
        label="Mật khẩu hiện tại"
        type="password"
        autoComplete="current-password"
        required
        value={current}
        error={errors.currentPassword}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <TextField
        label="Mật khẩu mới"
        type="password"
        autoComplete="new-password"
        required
        hint="Tối thiểu 8 ký tự."
        value={next}
        error={errors.newPassword}
        onChange={(event) => setNext(event.target.value)}
      />
      <TextField
        label="Nhập lại mật khẩu mới"
        type="password"
        autoComplete="new-password"
        required
        value={repeat}
        error={mismatch || undefined}
        onChange={(event) => {
          setRepeat(event.target.value);
          setMismatch('');
        }}
      />
      {change.isSuccess && (
        <p role="status" className="text-sm text-success">
          Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.
        </p>
      )}
      {change.isError && !errors.currentPassword && !errors.newPassword && (
        <Alert tone="danger">{serverField}</Alert>
      )}
      <Button
        type="submit"
        className="self-start"
        disabled={!current || !next || !repeat || isReadOnlyPreview()}
        loading={change.isPending}
      >
        Đổi mật khẩu
      </Button>
    </form>
  );
}

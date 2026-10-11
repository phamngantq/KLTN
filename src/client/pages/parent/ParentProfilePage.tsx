import { useState, type FormEvent } from 'react';
import { Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import type { ParentProfile } from '../../../shared/schemas/parents';
import { Button } from '../../components/ui/Button';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { useParentProfile, useUpdateParentProfile } from '../../features/parent-profile/api';
import { fieldErrors } from '../../lib/api-client';

/** Contact data is fetched only inside the parent route and saved by the owner API. */
export function ParentProfilePage() {
  const profile = useParentProfile();

  if (profile.isPending) return <PageLoading label="Đang tải hồ sơ phụ huynh…" />;
  if (profile.isError) {
    return (
      <Alert
        tone="danger"
        title="Không tải được hồ sơ phụ huynh"
        action={
          <Button variant="secondary" onClick={() => void profile.refetch()}>
            Thử lại
          </Button>
        }
      >
        {profile.error.message}
      </Alert>
    );
  }
  if (!profile.data) {
    return (
      <EmptyState
        title="Chưa có hồ sơ phụ huynh"
        description="Không tìm thấy dữ liệu hồ sơ cho tài khoản này."
        action={
          <Button variant="secondary" onClick={() => void profile.refetch()}>
            Tải lại
          </Button>
        }
      />
    );
  }
  return <ProfileEditor profile={profile.data} />;
}

function ProfileEditor({ profile }: { profile: ParentProfile }) {
  const update = useUpdateParentProfile();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [saved, setSaved] = useState(false);
  const errors = fieldErrors(update.error);
  const dirty = displayName !== profile.displayName || phone !== (profile.phone ?? '');

  function editName(value: string) {
    setDisplayName(value);
    setSaved(false);
    update.reset();
  }

  function editPhone(value: string) {
    setPhone(value);
    setSaved(false);
    update.reset();
  }

  function resetForm() {
    setDisplayName(profile.displayName);
    setPhone(profile.phone ?? '');
    setSaved(false);
    update.reset();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || update.isPending) return;
    update.mutate(
      { displayName, phone: phone.trim() || null },
      {
        onSuccess: (confirmed) => {
          setDisplayName(confirmed.displayName);
          setPhone(confirmed.phone ?? '');
          setSaved(true);
        },
      },
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Hồ sơ phụ huynh" description="Quản lý thông tin tài khoản của bạn" />
      <form onSubmit={onSubmit} noValidate className="flex max-w-3xl flex-col gap-6">
        {update.isError && !Object.keys(errors).length && (
          <Alert tone="danger" title="Không lưu được hồ sơ">
            {update.error.message}
          </Alert>
        )}
        <div className="overflow-hidden rounded-xl border border-border bg-bg shadow-card">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
              <UserRound aria-hidden="true" className="size-5 text-accent" />
              Thông tin cá nhân
            </h2>
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <TextField
              label="Họ và tên"
              name="displayName"
              autoComplete="name"
              required
              maxLength={100}
              value={displayName}
              onChange={(event) => editName(event.target.value)}
              error={errors.displayName}
            />
            <TextField
              label="Số điện thoại"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={16}
              hint="Tùy chọn. Nhập 8–15 chữ số, có thể bắt đầu bằng dấu +. Để trống để xóa số đã lưu."
              value={phone}
              onChange={(event) => editPhone(event.target.value)}
              error={errors.phone}
            />
            <div className="sm:col-span-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Mail aria-hidden="true" className="size-4 text-muted" />
                Email đăng nhập
              </p>
              <p className="mt-2 min-h-11 break-all rounded-md border border-border bg-surface px-3 py-2.5 text-muted">
                {profile.email}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-bg shadow-card">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
              <ShieldCheck aria-hidden="true" className="size-5 text-accent" />
              Thông tin tài khoản
            </h2>
          </div>
          <div className="grid gap-5 p-5 text-sm sm:grid-cols-2 sm:p-6">
            <div>
              <p className="font-medium">Vai trò</p>
              <p className="mt-2 min-h-11 rounded-md border border-border bg-surface px-3 py-2.5 text-muted">
                Phụ huynh
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-info-surface p-3 text-muted sm:col-span-2">
              <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>
                Thông tin liên hệ của bạn chỉ được dùng cho yêu cầu tìm gia sư theo quyền truy cập
                của hệ thống.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            loading={update.isPending}
            disabled={!dirty}
            className="min-w-40 rounded-xl"
          >
            Lưu hồ sơ
          </Button>
          <Button
            variant="secondary"
            onClick={resetForm}
            disabled={!dirty || update.isPending}
            className="min-w-32 rounded-xl"
          >
            Hủy
          </Button>
          {dirty && <span className="text-sm text-warning">Có thay đổi chưa lưu</span>}
          {saved && !dirty && (
            <span role="status" className="text-sm text-success">
              Đã lưu hồ sơ.
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

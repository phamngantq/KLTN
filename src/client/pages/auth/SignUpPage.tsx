import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import type { RegisterInput } from '../../../shared/schemas/auth';
import { homePathFor, safeNextPath, useRegister, useSession } from '../../app/auth';
import { FeatureUnavailablePage } from '../../app/FeatureUnavailablePage';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { fieldErrors, isApiError } from '../../lib/api-client';

export function SignUpPage() {
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const { user, isLoading } = useSession();
  const register = useRegister();
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterInput>({
    email: '',
    password: '',
    displayName: '',
    role: params.get('role') === 'tutor' ? 'tutor' : 'parent',
  });

  if (isReadOnlyPreview()) {
    return (
      <FeatureUnavailablePage
        title="Đăng ký chưa mở"
        message="Bản xem trước chỉ đọc không nhận đăng ký hoặc dữ liệu cá nhân."
        availableTo="/"
        availableLabel="Về trang chủ"
      />
    );
  }

  if (isLoading) return <PageLoading />;
  if (user && !register.isPending) return <Navigate to={next ?? homePathFor(user.role)} replace />;

  const errors = fieldErrors(register.error);
  if (isApiError(register.error, 'EMAIL_TAKEN')) errors.email = register.error.message;

  function update<K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    register.mutate(form, {
      onSuccess: (session) => navigate(next ?? homePathFor(session.user.role), { replace: true }),
    });
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-[length:var(--text-heading)] font-bold">Tạo tài khoản</h1>
      {register.error && !Object.keys(errors).length && (
        <Alert tone="danger" title="Không tạo được tài khoản">
          {register.error.message}
        </Alert>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Bạn là</legend>
          {(
            [
              ['parent', 'Phụ huynh'],
              ['tutor', 'Gia sư — tạo hồ sơ và ứng tuyển lớp'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border-strong px-3 has-[:checked]:border-primary has-[:checked]:bg-info-surface"
            >
              <input
                type="radio"
                name="role"
                value={value}
                checked={form.role === value}
                onChange={() => update('role', value)}
                className="size-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted">
          Phụ huynh có thể gửi yêu cầu tìm gia sư và theo dõi lớp. Gia sư tạo hồ sơ, gửi duyệt và
          ứng tuyển lớp đã công bố.
        </p>
        <TextField
          label="Họ và tên"
          name="displayName"
          autoComplete="name"
          required
          maxLength={100}
          value={form.displayName}
          onChange={(e) => update('displayName', e.target.value)}
          error={errors.displayName}
        />
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          error={errors.email}
        />
        <TextField
          label="Mật khẩu"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          hint="Tối thiểu 8 ký tự."
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          error={errors.password}
        />
        <Button type="submit" loading={register.isPending}>
          Tạo tài khoản
        </Button>
      </form>
      <p className="text-sm text-muted">
        Đã có tài khoản?{' '}
        <Link
          to={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}
          className="text-primary underline"
        >
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, GraduationCap } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import type { RegisterInput } from '../../../shared/schemas/auth';
import { homePathFor, safeNextPath, useRegister, useSession } from '../../app/auth';
import { FeatureUnavailablePage } from '../../app/FeatureUnavailablePage';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmAttempted, setConfirmAttempted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
  const confirmError = confirmAttempted
    ? !confirmPassword
      ? 'Vui lòng xác nhận mật khẩu'
      : form.password !== confirmPassword
        ? 'Mật khẩu không khớp'
        : undefined
    : undefined;

  function update<K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setConfirmAttempted(true);
    if (!confirmPassword || form.password !== confirmPassword) return;
    register.mutate(form, {
      onSuccess: (session) => navigate(next ?? homePathFor(session.user.role), { replace: true }),
    });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary to-primary-hover px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-bg p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-accent">
            <GraduationCap aria-hidden="true" className="size-12 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-primary">Đăng ký tài khoản</h1>
          <p className="mt-2 text-muted">Tạo tài khoản mới để sử dụng hệ thống</p>
        </div>
        {register.error && !Object.keys(errors).length && (
          <div className="mb-4">
            <Alert tone="danger" title="Không tạo được tài khoản">
              {register.error.message}
            </Alert>
          </div>
        )}
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            label="Họ và tên"
            name="displayName"
            autoComplete="name"
            placeholder="Nhập họ và tên"
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
            placeholder="Nhập email"
            required
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            error={errors.email}
          />
          <SelectField
            label="Vai trò"
            name="role"
            required
            value={form.role}
            onChange={(e) => update('role', e.target.value === 'tutor' ? 'tutor' : 'parent')}
            hint="Tài khoản kiểm duyệt viên được cấp riêng."
            error={errors.role}
          >
            <option value="parent">Phụ huynh / Học sinh</option>
            <option value="tutor">Gia sư</option>
          </SelectField>
          <div className="relative">
            <TextField
              label="Mật khẩu"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              placeholder="Nhập mật khẩu"
              className="pr-12"
              required
              minLength={8}
              maxLength={128}
              hint="Tối thiểu 8 ký tự."
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              error={errors.password}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute top-6 right-1 flex size-11 items-center justify-center rounded-md text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-focus"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
          <div className="relative">
            <TextField
              label="Xác nhận mật khẩu"
              type={showConfirmPassword ? 'text' : 'password'}
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu"
              className="pr-12"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={confirmError}
            />
            <button
              type="button"
              aria-label={showConfirmPassword ? 'Ẩn xác nhận mật khẩu' : 'Hiện xác nhận mật khẩu'}
              aria-pressed={showConfirmPassword}
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              className="absolute top-6 right-1 flex size-11 items-center justify-center rounded-md text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-focus"
            >
              {showConfirmPassword ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
          <Button type="submit" loading={register.isPending} className="w-full">
            Tạo tài khoản
          </Button>
          <p className="text-center text-sm text-muted">
            Đã có tài khoản?{' '}
            <Link
              to={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}
              className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus"
            >
              Đăng nhập ngay
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

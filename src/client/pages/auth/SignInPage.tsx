import { useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { homePathFor, safeNextPath, useLogin, useSession } from '../../app/auth';
import { FeatureUnavailablePage } from '../../app/FeatureUnavailablePage';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { fieldErrors } from '../../lib/api-client';

export function SignInPage() {
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const { user, isLoading } = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (isReadOnlyPreview()) {
    return (
      <FeatureUnavailablePage
        title="Đăng nhập chưa mở"
        message="Bản xem trước chỉ đọc không nhận đăng nhập hoặc dữ liệu tài khoản."
        availableTo="/"
        availableLabel="Về trang chủ"
      />
    );
  }

  if (isLoading) return <PageLoading />;
  if (user && !login.isPending) return <Navigate to={next ?? homePathFor(user.role)} replace />;

  const errors = fieldErrors(login.error);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: (session) => navigate(next ?? homePathFor(session.user.role), { replace: true }),
      },
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-primary to-primary-hover text-on-primary lg:flex lg:w-1/2 lg:items-center lg:justify-center lg:p-12">
        <div
          aria-hidden="true"
          className="absolute -left-32 top-12 size-96 rounded-full bg-white/5 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -right-32 bottom-0 size-96 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative z-10 w-full max-w-md text-center">
          <div className="mx-auto mb-8 flex size-24 items-center justify-center rounded-full bg-accent">
            <GraduationCap aria-hidden="true" className="size-16 text-primary" />
          </div>
          <p className="mb-6 text-4xl leading-tight font-semibold">
            Chào Mừng Đến Với
            <br />
            <span className="text-accent">Gia Sư Đỗ Hằng</span>
          </p>
          <p className="mb-8 text-xl text-white/90">Kết nối tri thức, kiến tạo tương lai</p>
          <div className="grid grid-cols-3 gap-4 text-sm text-white/80">
            <div>
              <span className="block text-lg font-semibold text-accent">Phụ huynh</span>Tìm gia sư
            </div>
            <div>
              <span className="block text-lg font-semibold text-accent">Gia sư</span>Tìm lớp học
            </div>
            <div>
              <span className="block text-lg font-semibold text-accent">Kiểm duyệt viên</span>Quản
              lý lớp
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-1 items-center justify-center bg-surface px-4 py-10 sm:px-8 lg:w-1/2">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="mb-8 inline-flex min-h-11 items-center gap-2 text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
            Quay lại trang chủ
          </Link>
          <div className="rounded-xl border border-primary/20 bg-bg p-6 shadow-xl sm:p-8">
            <div className="mb-6 text-center">
              <div className="mb-4 flex justify-center lg:hidden">
                <div className="flex size-20 items-center justify-center rounded-full bg-accent">
                  <GraduationCap aria-hidden="true" className="size-12 text-primary" />
                </div>
              </div>
              <h1 className="text-3xl font-semibold text-primary lg:text-4xl">Đăng nhập</h1>
              <p className="mt-2 text-base text-muted">
                Đăng nhập vào hệ thống Trung Tâm Gia Sư Đỗ Hằng
              </p>
            </div>
            {login.error && !Object.keys(errors).length && (
              <div className="mb-4">
                <Alert tone="danger" title="Đăng nhập không thành công">
                  {login.error.message}
                </Alert>
              </div>
            )}
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <TextField
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="email@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />
              <div className="relative">
                <TextField
                  label="Mật khẩu"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  className="pr-12"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <Button type="submit" loading={login.isPending} className="w-full">
                Đăng nhập
              </Button>
              <p className="text-center text-sm text-muted">
                Chưa có tài khoản?{' '}
                <Link
                  to={next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up'}
                  className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Đăng ký ngay
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

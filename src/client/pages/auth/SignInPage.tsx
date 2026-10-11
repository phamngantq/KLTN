import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { homePathFor, safeNextPath, useLogin, useSession } from '../../app/auth';
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
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-[length:var(--text-heading)] font-bold">Đăng nhập</h1>
      {login.error && !Object.keys(errors).length && (
        <Alert tone="danger" title="Đăng nhập không thành công">
          {login.error.message}
        </Alert>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TextField
          label="Mật khẩu"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Button type="submit" loading={login.isPending}>
          Đăng nhập
        </Button>
      </form>
      <p className="text-sm text-muted">
        Chưa có tài khoản?{' '}
        <Link
          to={next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up'}
          className="text-primary underline"
        >
          Đăng ký
        </Link>
      </p>
    </div>
  );
}

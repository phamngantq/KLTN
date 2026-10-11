import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { UserRole } from '../../shared/schemas/auth';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Feedback';
import { PageLoading } from '../components/ui/Spinner';
import { useSession } from './auth';
import { ForbiddenPage } from './errors';
import { FeatureUnavailablePage } from './FeatureUnavailablePage';
import { isReadOnlyPreview } from './preview';

/**
 * UX guard only — the API enforces auth/role/ownership on every request regardless.
 * Guests are sent to sign-in with a safe return path; wrong roles see 403.
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user, isLoading, error, refetch } = useSession();
  const location = useLocation();

  if (isReadOnlyPreview()) {
    return (
      <FeatureUnavailablePage
        title="Khu vực tài khoản chưa mở"
        message="Đây là bản xem trước chỉ đọc. Đăng nhập, yêu cầu tìm gia sư, đặt lịch và quản lý tài khoản chưa khả dụng."
        availableTo="/"
        availableLabel="Về trang chủ"
      />
    );
  }

  if (isLoading) return <PageLoading label="Đang kiểm tra phiên đăng nhập…" />;
  if (error) {
    return (
      <Alert
        tone="danger"
        title="Không tải được phiên đăng nhập"
        action={
          <Button variant="secondary" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
      >
        {error.message}
      </Alert>
    );
  }
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  if (!roles.includes(user.role)) return <ForbiddenPage />;
  return <>{children}</>;
}

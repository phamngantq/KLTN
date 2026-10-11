import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Không tìm thấy trang"
      description="Đường dẫn không tồn tại hoặc đã bị thay đổi."
      action={<ButtonLink to="/">Về trang chủ</ButtonLink>}
    />
  );
}

export function ForbiddenPage() {
  return (
    <EmptyState
      title="Bạn không có quyền truy cập trang này"
      description="Trang này dành cho vai trò khác. Hãy đăng nhập bằng tài khoản phù hợp."
      action={<ButtonLink to="/">Về trang chủ</ButtonLink>}
    />
  );
}

/** Route-level error boundary: shows a recoverable message, never a stack trace. */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <div className="mx-auto max-w-xl p-6">
      <EmptyState
        title="Đã có lỗi xảy ra"
        description="Vui lòng tải lại trang hoặc quay về trang chủ."
        action={
          <a href="/" className="text-primary underline">
            Về trang chủ
          </a>
        }
      />
    </div>
  );
}

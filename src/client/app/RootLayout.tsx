import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { UserRole } from '../../shared/schemas/auth';
import { Button, ButtonLink } from '../components/ui/Button';
import { Alert } from '../components/ui/Feedback';
import { ROLE_LABELS } from '../lib/format';
import { useLogout, useSession, type PublicUser } from './auth';
import { isReadOnlyPreview } from './preview';

interface NavItem {
  to: string;
  label: string;
}

/** Exported Figma paths with honest local content or a clear unavailable state. */
const PUBLIC_NAV: NavItem[] = [
  { to: '/', label: 'Trang chủ' },
  { to: '/gioi-thieu', label: 'Giới thiệu' },
  { to: '/dich-vu', label: 'Dịch vụ' },
  { to: '/bang-gia', label: 'Bảng giá' },
  { to: '/lop-hoc', label: 'Lớp học' },
  { to: '/blog/phu-huynh', label: 'Tin tức' },
  { to: '/lien-he', label: 'Liên hệ' },
];

/** Existing routes remain reachable during the new product's implementation. */
const CURRENT_NAV: { to: string; label: string; roles: readonly (UserRole | 'guest')[] }[] = [
  { to: '/tutors', label: 'Tìm gia sư', roles: ['guest', 'student', 'tutor', 'admin'] },
  { to: '/student/bookings', label: 'Lịch đặt hiện tại', roles: ['student'] },
  { to: '/tutor/bookings', label: 'Yêu cầu đặt lịch', roles: ['tutor'] },
  { to: '/tutor/availability', label: 'Lịch dạy', roles: ['tutor'] },
  { to: '/tutor/profile', label: 'Hồ sơ gia sư', roles: ['tutor'] },
  { to: '/admin/tutors', label: 'Duyệt gia sư', roles: ['admin'] },
  { to: '/account', label: 'Tài khoản', roles: ['student', 'tutor', 'admin'] },
];

const ROLE_PORTAL: Record<UserRole, NavItem> = {
  student: { to: '/parent', label: 'Khu vực phụ huynh' },
  tutor: { to: '/tutor', label: 'Khu vực gia sư' },
  admin: { to: '/admin', label: 'Khu vực kiểm duyệt' },
};

export function navItemsFor(user: PublicUser | null): NavItem[] {
  const role = user?.role ?? 'guest';
  return CURRENT_NAV.filter((item) => item.roles.includes(role)).map(({ to, label }) => ({
    to,
    label,
  }));
}

const primaryNavClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    isActive ? 'bg-accent text-on-accent' : 'text-on-primary hover:bg-white/10'
  }`;

const currentNavClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
    isActive ? 'bg-info-surface text-primary' : 'text-fg hover:bg-surface'
  }`;

export function RootLayout() {
  const { user, isLoading } = useSession();
  const preview = isReadOnlyPreview();
  const logout = useLogout();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fullBleed =
    PUBLIC_NAV.some((item) => item.to === location.pathname) ||
    location.pathname.startsWith('/blog/') ||
    location.pathname === '/forgot-password' ||
    /^\/(parent|tutor|admin)(\/|$)/.test(location.pathname);

  function logOut() {
    setMobileMenuOpen(false);
    logout.mutate(undefined, { onSuccess: () => navigate('/') });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg font-sans text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Bỏ qua tới nội dung chính
      </a>
      <header className="sticky top-0 z-40 bg-primary text-on-primary shadow-card print:hidden">
        <div className="mx-auto flex w-full max-w-[var(--container-max)] items-center gap-3 px-4 py-2">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="mr-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true" className="text-2xl text-accent">
              ✦
            </span>
            <span>Tutor Matching</span>
          </Link>
          <nav aria-label="Điều hướng chính" className="hidden lg:block">
            <ul className="flex items-center gap-0.5">
              {PUBLIC_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === '/'} className={primaryNavClass}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          {!isLoading && (
            <div className="hidden shrink-0 items-center gap-1 lg:flex">
              {user && !preview ? (
                <>
                  <Link
                    to="/account"
                    className="inline-flex min-h-11 max-w-40 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-3 text-sm text-on-primary focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {user.displayName} · {ROLE_LABELS[user.role]}
                  </Link>
                  <Button variant="accent" size="sm" loading={logout.isPending} onClick={logOut}>
                    Đăng xuất
                  </Button>
                </>
              ) : !preview ? (
                <>
                  <ButtonLink to="/sign-in" variant="secondary" size="sm">
                    Đăng nhập
                  </ButtonLink>
                  <ButtonLink to="/sign-up" variant="accent" size="sm">
                    Đăng ký
                  </ButtonLink>
                </>
              ) : null}
            </div>
          )}
          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-controls="mobile-navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-2xl focus-visible:outline-2 focus-visible:outline-accent lg:hidden"
          >
            <span aria-hidden="true">{mobileMenuOpen ? '×' : '☰'}</span>
          </button>
        </div>
        {mobileMenuOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Điều hướng di động"
            className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/20 px-4 pb-4 lg:hidden"
          >
            <ul className="mx-auto grid max-w-[var(--container-max)] gap-1 pt-2 sm:grid-cols-2">
              {PUBLIC_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={primaryNavClass}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              {user && !preview && (
                <li>
                  <NavLink
                    to={ROLE_PORTAL[user.role].to}
                    className={primaryNavClass}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {ROLE_PORTAL[user.role].label}
                  </NavLink>
                </li>
              )}
              {!preview &&
                navItemsFor(user).map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={primaryNavClass}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
            </ul>
            {!isLoading && (
              <div className="mx-auto flex max-w-[var(--container-max)] flex-wrap gap-2 border-t border-white/20 pt-3">
                {user && !preview ? (
                  <Button variant="accent" size="sm" loading={logout.isPending} onClick={logOut}>
                    Đăng xuất
                  </Button>
                ) : !preview ? (
                  <>
                    <ButtonLink
                      to="/sign-in"
                      variant="secondary"
                      size="sm"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Đăng nhập
                    </ButtonLink>
                    <ButtonLink
                      to="/sign-up"
                      variant="accent"
                      size="sm"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Đăng ký
                    </ButtonLink>
                  </>
                ) : null}
              </div>
            )}
          </nav>
        )}
      </header>
      {preview && (
        <div
          role="status"
          className="border-b border-border bg-info-surface px-4 py-3 text-center text-sm font-medium text-primary"
        >
          Bản xem trước chỉ đọc với dữ liệu minh họa. Chưa nhận đăng ký, yêu cầu tìm gia sư hoặc đặt
          lịch.
        </div>
      )}
      {logout.isError && (
        <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-3">
          <Alert
            tone="danger"
            title="Không thể đăng xuất"
            action={
              <Button size="sm" loading={logout.isPending} onClick={logOut}>
                Thử lại
              </Button>
            }
          >
            {logout.error.message || 'Vui lòng thử lại.'}
          </Alert>
        </div>
      )}
      <nav
        aria-label="Khu vực tài khoản và chức năng"
        className="border-b border-border bg-bg print:hidden"
      >
        <div className="mx-auto flex w-full max-w-[var(--container-max)] items-center gap-2 px-4">
          <ul className="flex min-w-0 gap-1 overflow-x-auto">
            {user && !preview && (
              <li className="shrink-0">
                <NavLink to={ROLE_PORTAL[user.role].to} className={currentNavClass}>
                  {ROLE_PORTAL[user.role].label}
                </NavLink>
              </li>
            )}
            {!preview && (
              <li className="flex shrink-0 items-center px-2 text-xs font-semibold text-muted">
                Đang hoạt động
              </li>
            )}
            {!preview &&
              navItemsFor(user).map((item) => (
                <li key={item.to} className="shrink-0">
                  <NavLink to={item.to} className={currentNavClass}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
          </ul>
        </div>
      </nav>
      <main
        id="main"
        tabIndex={-1}
        className={`w-full flex-1 outline-none print:max-w-none print:px-0 print:py-0 ${fullBleed ? '' : 'mx-auto max-w-[var(--container-max)] px-4 py-6'}`}
      >
        <Outlet />
      </main>
      <footer className="bg-primary px-4 py-8 text-on-primary print:hidden">
        <div className="mx-auto grid max-w-[var(--container-max)] gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="font-semibold">Tutor Matching</p>
            <p className="mt-2 text-sm text-on-primary/80">
              Kết nối phụ huynh với gia sư qua yêu cầu, ứng tuyển và điều phối lớp.
            </p>
          </div>
          <nav aria-label="Liên kết cuối trang" className="flex flex-col items-start gap-2 text-sm">
            <Link to="/gioi-thieu" className="underline-offset-4 hover:underline">
              Giới thiệu
            </Link>
            <Link to="/dich-vu" className="underline-offset-4 hover:underline">
              Dịch vụ
            </Link>
            <Link to="/lien-he" className="underline-offset-4 hover:underline">
              Liên hệ
            </Link>
          </nav>
          <p className="text-sm text-on-primary/80">
            Nội dung và phương án phí gia sư được công bố theo phiên bản đã duyệt.
          </p>
        </div>
      </footer>
    </div>
  );
}

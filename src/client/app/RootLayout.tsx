import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Button, ButtonLink } from '../components/ui/Button';
import type { UserRole } from '../../shared/schemas/auth';
import { ROLE_LABELS } from '../lib/format';
import { useLogout, useSession, type PublicUser } from './auth';

interface NavItem {
  to: string;
  label: string;
}

/**
 * Navigation only lists routes that exist and that the current role may open.
 * Each feature adds its entry here when its route ships (no inert links).
 */
const NAV: { to: string; label: string; roles: readonly (UserRole | 'guest')[] }[] = [
  { to: '/tutors', label: 'Tìm gia sư', roles: ['guest', 'student', 'tutor', 'admin'] },
  { to: '/student/bookings', label: 'Lịch học', roles: ['student'] },
  { to: '/tutor/bookings', label: 'Yêu cầu đặt lịch', roles: ['tutor'] },
  { to: '/tutor/availability', label: 'Lịch dạy', roles: ['tutor'] },
  { to: '/tutor/profile', label: 'Hồ sơ gia sư', roles: ['tutor'] },
  { to: '/account', label: 'Tài khoản', roles: ['student', 'tutor', 'admin'] },
];

export function navItemsFor(user: PublicUser | null): NavItem[] {
  const role = user?.role ?? 'guest';
  return NAV.filter((item) => item.roles.includes(role)).map(({ to, label }) => ({ to, label }));
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus ${
    isActive ? 'bg-info-surface text-primary' : 'text-fg hover:bg-surface'
  }`;

export function RootLayout() {
  const { user, isLoading } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col bg-bg font-sans text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
      >
        Bỏ qua tới nội dung chính
      </a>
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex max-w-[var(--container-max)] flex-wrap items-center gap-2 px-4 py-2">
          <Link
            to="/"
            className="mr-auto inline-flex min-h-11 items-center text-lg font-bold text-primary focus-visible:outline-2 focus-visible:outline-focus"
          >
            Tutor Matching
          </Link>
          <nav aria-label="Điều hướng chính" className="order-last w-full sm:order-none sm:w-auto">
            <ul className="flex flex-wrap gap-1">
              {navItemsFor(user).map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={navLinkClass}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          {!isLoading && (
            <div className="flex items-center gap-2">
              {user ? (
                <>
                  <span className="hidden text-sm text-muted md:inline">
                    {user.displayName} · {ROLE_LABELS[user.role]}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={logout.isPending}
                    onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/') })}
                  >
                    Đăng xuất
                  </Button>
                </>
              ) : (
                <>
                  <ButtonLink to="/sign-in" variant="ghost" size="sm">
                    Đăng nhập
                  </ButtonLink>
                  <ButtonLink to="/sign-up" size="sm">
                    Đăng ký
                  </ButtonLink>
                </>
              )}
            </div>
          )}
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[var(--container-max)] flex-1 px-4 py-6 outline-none"
      >
        <Outlet />
      </main>
      <footer className="border-t border-border py-4 text-center text-[length:var(--text-caption)] text-muted">
        Giao diện tạm thời — chưa đối chiếu thiết kế Figma.
      </footer>
    </div>
  );
}

import { useState } from 'react';
import { ChevronDown, GraduationCap, Mail, MapPin, Menu, Phone, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { UserRole } from '../../shared/schemas/auth';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Feedback';
import { ROLE_LABELS } from '../lib/format';
import { useLogout, useSession } from './auth';
import { isReadOnlyPreview } from './preview';

interface NavItem {
  to: string;
  label: string;
}

// The public menu follows the supplied Figma export. Services remain linked in the footer.
const PUBLIC_NAV: NavItem[] = [
  { to: '/', label: 'Trang chủ' },
  { to: '/gioi-thieu', label: 'Giới thiệu' },
  { to: '/bang-gia', label: 'Bảng giá' },
  { to: '/lop-hoc', label: 'Lớp học' },
  { to: '/lien-he', label: 'Liên hệ' },
];

const BLOG_NAV: NavItem[] = [
  { to: '/blog/phu-huynh', label: 'Tin tức Phụ huynh' },
  { to: '/blog/gia-su', label: 'Tin tức Gia sư' },
];

const ROLE_PORTAL: Record<UserRole, NavItem> = {
  student: { to: '/parent', label: 'Khu vực phụ huynh' },
  tutor: { to: '/tutor', label: 'Khu vực gia sư' },
  admin: { to: '/admin', label: 'Khu vực kiểm duyệt' },
};

function BrandSignature() {
  return (
    <>
      <GraduationCap aria-hidden="true" className="size-8 shrink-0" strokeWidth={2} />
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-semibold sm:text-xl">Gia Sư Đỗ Hằng</span>
        <span className="text-xs font-medium text-accent">Uy tín - Chất lượng</span>
      </span>
    </>
  );
}

const publicNavClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    isActive ? 'bg-accent text-on-accent' : 'text-on-primary hover:bg-white/10'
  }`;

export function RootLayout() {
  const { user, isLoading } = useSession();
  const preview = isReadOnlyPreview();
  const logout = useLogout();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAuthPage = ['/sign-in', '/sign-up', '/forgot-password'].includes(location.pathname);
  const isRoleRoute = /^\/(parent|tutor|admin)(\/|$)/.test(location.pathname);
  const fullBleed =
    isAuthPage ||
    isRoleRoute ||
    location.pathname === '/dich-vu' ||
    PUBLIC_NAV.some((item) => item.to === location.pathname) ||
    location.pathname.startsWith('/blog/');

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

      {!isAuthPage && (
        <header className="sticky top-0 z-40 bg-primary text-on-primary shadow-lg print:hidden">
          <div className="mx-auto flex w-full max-w-[var(--container-max)] items-center gap-3 px-4 py-4">
            <Link
              to="/"
              aria-label="Gia Sư Đỗ Hằng — Trang chủ"
              onClick={() => setMobileMenuOpen(false)}
              className="mr-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <BrandSignature />
            </Link>

            {!isRoleRoute && (
              <nav aria-label="Điều hướng chính" className="hidden xl:block">
                <ul className="flex items-center gap-1">
                  {PUBLIC_NAV.slice(0, 4).map((item) => (
                    <li key={item.to}>
                      <NavLink to={item.to} end={item.to === '/'} className={publicNavClass}>
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                  <li>
                    <details className="group relative">
                      <summary
                        className={`flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden ${
                          location.pathname.startsWith('/blog/')
                            ? 'bg-accent text-on-accent'
                            : 'text-on-primary hover:bg-white/10'
                        }`}
                      >
                        Tin tức <ChevronDown aria-hidden="true" className="size-4" />
                      </summary>
                      <div className="absolute left-0 top-full z-50 min-w-48 rounded-lg border border-border bg-bg p-2 text-primary shadow-lg">
                        {BLOG_NAV.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            className="block rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-focus"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </details>
                  </li>
                  <li>
                    <NavLink to="/lien-he" className={publicNavClass}>
                      Liên hệ
                    </NavLink>
                  </li>
                </ul>
              </nav>
            )}

            {!isLoading && (
              <div className="hidden shrink-0 items-center gap-2 md:flex">
                {user && !preview ? (
                  <>
                    <Link
                      to={ROLE_PORTAL[user.role].to}
                      className="inline-flex min-h-11 max-w-48 items-center rounded-lg px-3 text-sm font-medium text-on-primary hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {ROLE_PORTAL[user.role].label}
                    </Link>
                    <Link
                      to="/account"
                      className="inline-flex min-h-11 max-w-40 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg px-3 text-sm text-on-primary hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {user.displayName} · {ROLE_LABELS[user.role]}
                    </Link>
                    <Button variant="accent" size="sm" loading={logout.isPending} onClick={logOut}>
                      Đăng xuất
                    </Button>
                  </>
                ) : !preview ? (
                  <>
                    <Link
                      to="/sign-in"
                      className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-on-primary hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Đăng nhập
                    </Link>
                    <Link
                      to="/sign-up"
                      className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Đăng ký
                    </Link>
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
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-accent xl:hidden"
            >
              {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <nav
              id="mobile-navigation"
              aria-label="Điều hướng di động"
              className="max-h-[calc(100dvh-5rem)] overflow-y-auto border-t border-white/20 px-4 pb-4 xl:hidden"
            >
              <div className="mx-auto grid max-w-[var(--container-max)] gap-1 pt-2 sm:grid-cols-2">
                {PUBLIC_NAV.slice(0, 4).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={publicNavClass}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-3 text-sm font-medium text-on-primary hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                    Tin tức <ChevronDown aria-hidden="true" className="size-4" />
                  </summary>
                  <div className="ml-4 flex flex-col">
                    {BLOG_NAV.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </details>
                <NavLink
                  to="/lien-he"
                  className={publicNavClass}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Liên hệ
                </NavLink>
                {user && !preview && (
                  <>
                    <NavLink
                      to={ROLE_PORTAL[user.role].to}
                      className={publicNavClass}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {ROLE_PORTAL[user.role].label}
                    </NavLink>
                    <NavLink
                      to="/account"
                      className={publicNavClass}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Tài khoản
                    </NavLink>
                  </>
                )}
              </div>
              {!isLoading && !preview && (
                <div className="mx-auto mt-3 flex max-w-[var(--container-max)] gap-2 border-t border-white/20 pt-3">
                  {user ? (
                    <Button variant="accent" size="sm" loading={logout.isPending} onClick={logOut}>
                      Đăng xuất
                    </Button>
                  ) : (
                    <>
                      <Link
                        to="/sign-in"
                        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-on-primary hover:bg-white/10"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Đăng nhập
                      </Link>
                      <Link
                        to="/sign-up"
                        className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Đăng ký
                      </Link>
                    </>
                  )}
                </div>
              )}
            </nav>
          )}
        </header>
      )}

      {!isAuthPage && preview && (
        <div
          role="status"
          className="border-b border-border bg-info-surface px-4 py-3 text-center text-sm font-medium text-primary"
        >
          Bản xem trước chỉ đọc với dữ liệu minh họa. Chưa nhận đăng ký, yêu cầu tìm gia sư hoặc đặt
          lịch.
        </div>
      )}

      {!isAuthPage && logout.isError && (
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

      <main
        id="main"
        tabIndex={-1}
        className={`w-full flex-1 outline-none print:max-w-none print:px-0 print:py-0 ${fullBleed ? '' : 'mx-auto max-w-[var(--container-max)] px-4 py-6'}`}
      >
        <Outlet />
      </main>

      {!isAuthPage && (
        <footer className="mt-16 bg-primary px-4 py-12 text-on-primary print:hidden">
          <div className="mx-auto grid max-w-[var(--container-max)] gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <BrandSignature />
              </div>
              <p className="mt-4 text-sm text-on-primary/80">
                Kết nối phụ huynh và gia sư qua yêu cầu, ứng tuyển và điều phối lớp học.
              </p>
            </div>
            <nav aria-label="Liên kết cuối trang" className="text-sm">
              <h2 className="mb-4 font-semibold text-accent">Liên kết nhanh</h2>
              <div className="flex flex-col items-start gap-2 text-on-primary/80">
                <Link to="/gioi-thieu" className="hover:text-accent focus-visible:text-accent">
                  Giới thiệu
                </Link>
                <Link to="/dich-vu" className="hover:text-accent focus-visible:text-accent">
                  Dịch vụ
                </Link>
                <Link to="/bang-gia" className="hover:text-accent focus-visible:text-accent">
                  Bảng giá
                </Link>
                <Link to="/blog/phu-huynh" className="hover:text-accent focus-visible:text-accent">
                  Tin tức
                </Link>
              </div>
            </nav>
            <div className="text-sm">
              <h2 className="mb-4 font-semibold text-accent">Liên hệ</h2>
              <div className="space-y-2 text-on-primary/80">
                <a href="tel:0394618480" className="flex items-start gap-2 hover:text-accent">
                  <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  0394 618 480
                </a>
                <a
                  href="mailto:tuyendunggiasugio@gmail.com"
                  className="flex items-start gap-2 break-all hover:text-accent"
                >
                  <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  tuyendunggiasugio@gmail.com
                </a>
                <p className="flex items-start gap-2">
                  <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội
                </p>
              </div>
            </div>
            <div className="text-sm">
              <h2 className="mb-4 font-semibold text-accent">Hỗ trợ</h2>
              <p className="text-on-primary/80">
                Liên hệ qua hotline hoặc email để được hỗ trợ về yêu cầu tìm gia sư và nhận lớp.
              </p>
              <Link
                to="/lien-he"
                className="mt-3 inline-block underline-offset-4 hover:text-accent hover:underline"
              >
                Xem thông tin liên hệ
              </Link>
            </div>
          </div>
          <div className="mx-auto mt-8 max-w-[var(--container-max)] border-t border-white/20 pt-6 text-center text-sm text-on-primary/60">
            © {new Date().getFullYear()} Trung Tâm Gia Sư Đỗ Hằng.
          </div>
        </footer>
      )}
    </div>
  );
}

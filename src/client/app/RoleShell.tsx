import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  LayoutDashboard,
  MessageSquare,
  Search,
  Settings,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';

type Area = 'parent' | 'tutor' | 'moderator';

interface MenuLink {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Extra routes (e.g. a create form) that belong to this top-level item. */
  activePrefixes?: string[];
}

interface MenuGroup {
  label: string;
  icon: LucideIcon;
  items: MenuLink[];
}

type MenuEntry = MenuLink | MenuGroup;

const AREAS: Record<Area, { label: string; entries: MenuEntry[] }> = {
  parent: {
    label: 'Phụ huynh',
    entries: [
      { to: '/parent/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
      {
        to: '/parent',
        label: 'Tìm kiếm gia sư',
        icon: Search,
        activePrefixes: ['/parent/request', '/parent/requests/'],
      },
      { to: '/parent/bang-gia', label: 'Bảng giá', icon: Wallet },
      { to: '/parent/cam-nang', label: 'Cẩm nang', icon: BookOpen },
      { to: '/parent/khieu-nai', label: 'Khiếu nại', icon: MessageSquare },
    ],
  },
  tutor: {
    label: 'Gia sư',
    entries: [
      { to: '/tutor', label: 'Trang chủ', icon: Home },
      { to: '/tutor/profile', label: 'Hồ sơ gia sư', icon: UserRound },
      {
        label: 'Lớp học',
        icon: GraduationCap,
        items: [
          { to: '/tutor/new-classes', label: 'Danh sách lớp mới', icon: GraduationCap },
          { to: '/tutor/offers', label: 'Đăng lớp tìm học viên', icon: BookOpen },
          { to: '/tutor/matched-classes', label: 'Lớp phù hợp', icon: Users },
          { to: '/tutor/class-requests', label: 'Đơn nhận lớp', icon: ClipboardList },
          { to: '/tutor/classes', label: 'Lớp của tôi', icon: BookOpen },
          { to: '/tutor/class-history', label: 'Lịch sử lớp', icon: CalendarDays },
        ],
      },
      {
        label: 'Nội dung',
        icon: FileText,
        items: [
          { to: '/tutor/how-to-accept', label: 'Hướng dẫn nhận lớp', icon: CircleHelp },
          { to: '/tutor/contracts', label: 'Hợp đồng', icon: FileText },
          { to: '/tutor/terms', label: 'Điều khoản trách nhiệm', icon: ClipboardList },
          { to: '/tutor/blog', label: 'Tin tức gia sư', icon: BookOpen },
        ],
      },
      { to: '/tutor/pricing', label: 'Bảng giá', icon: Wallet },
      { to: '/tutor/khieu-nai', label: 'Khiếu nại', icon: MessageSquare },
      { to: '/tutor/contact', label: 'Liên hệ', icon: MessageSquare },
      {
        label: 'Lịch cũ',
        icon: CalendarDays,
        items: [
          { to: '/tutor/bookings', label: 'Lịch đặt hiện tại', icon: CalendarDays },
          { to: '/tutor/availability', label: 'Lịch dạy', icon: ClipboardList },
        ],
      },
    ],
  },
  moderator: {
    label: 'Kiểm duyệt viên',
    entries: [
      { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard },
      { to: '/admin/users', label: 'Người dùng', icon: Users },
      {
        label: 'Quản lý yêu cầu',
        icon: ClipboardList,
        items: [
          { to: '/admin/requests', label: 'Yêu cầu tìm gia sư', icon: ClipboardList },
          { to: '/admin/tutor-offers', label: 'Duyệt lớp tìm học viên', icon: BookOpen },
          { to: '/admin/tutor-offer-joins', label: 'Yêu cầu tham gia lớp', icon: ClipboardList },
          { to: '/admin/applications', label: 'Đơn nhận lớp', icon: FileText },
          { to: '/admin/classes', label: 'Lớp học', icon: GraduationCap },
          { to: '/admin/contracts', label: 'Hợp đồng lớp', icon: FileText },
          { to: '/admin/tutors', label: 'Duyệt hồ sơ gia sư', icon: Users },
        ],
      },
      {
        label: 'Nội dung',
        icon: BookOpen,
        items: [
          { to: '/admin/content/pages', label: 'Trang thông tin', icon: FileText },
          { to: '/admin/content/blog', label: 'Tin tức', icon: BookOpen },
          { to: '/admin/content/faq', label: 'Câu hỏi thường gặp', icon: CircleHelp },
          { to: '/admin/content/contracts', label: 'Mẫu hợp đồng', icon: FileText },
          { to: '/admin/content/terms', label: 'Điều khoản trách nhiệm', icon: ClipboardList },
          { to: '/admin/terms/quiz', label: 'Bài kiểm tra điều khoản', icon: ClipboardList },
          { to: '/admin/content/how-to-accept', label: 'Hướng dẫn nhận lớp', icon: CircleHelp },
        ],
      },
      {
        label: 'Dịch vụ & Giá',
        icon: Wallet,
        items: [
          { to: '/admin/services', label: 'Dịch vụ', icon: BookOpen },
          { to: '/admin/pricing', label: 'Bảng giá & phí', icon: Wallet },
        ],
      },
      {
        label: 'Báo cáo',
        icon: LayoutDashboard,
        items: [
          { to: '/admin/reports', label: 'Tổng quan báo cáo', icon: LayoutDashboard },
          { to: '/admin/reports/conversion', label: 'Tỷ lệ chuyển đổi', icon: Users },
          { to: '/admin/reports/no-tutor', label: 'Lớp thiếu gia sư', icon: GraduationCap },
          { to: '/admin/reports/revenue', label: 'Doanh thu', icon: Wallet },
        ],
      },
      { to: '/admin/support', label: 'Khiếu nại', icon: MessageSquare },
      { to: '/admin/settings', label: 'Cài đặt', icon: Settings },
    ],
  },
};

function isGroup(entry: MenuEntry): entry is MenuGroup {
  return 'items' in entry;
}

function isCurrentPath(pathname: string, to: string) {
  return (
    pathname === to ||
    (to !== '/parent' && to !== '/tutor' && to !== '/admin' && pathname.startsWith(`${to}/`))
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
    isActive ? 'bg-accent text-on-accent' : 'text-on-primary hover:bg-white/10'
  }`;

const submenuLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
    isActive ? 'bg-accent text-on-accent' : 'text-primary hover:bg-info-surface'
  }`;

function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden="true" size={16} strokeWidth={2} />;
}

/** Navigation shared by the header's desktop row and its mobile drawer. */
export function RoleNavigation({
  area,
  mobile = false,
  id,
  onNavigate,
}: {
  area: Area;
  mobile?: boolean;
  id?: string;
  onNavigate?: () => void;
}) {
  const config = AREAS[area];
  const { pathname } = useLocation();

  return (
    <nav
      id={id}
      aria-label={`Điều hướng ${mobile ? 'di động ' : ''}${config.label}`}
      className="mx-auto w-full max-w-[var(--container-max)] px-4 py-2"
    >
      <ul className={mobile ? 'grid gap-1' : 'flex flex-nowrap items-center gap-1'}>
        {config.entries.map((entry) => {
          if (!isGroup(entry)) {
            return (
              <li key={entry.to} className={mobile ? 'w-full' : undefined}>
                <NavLink
                  to={entry.to}
                  end={entry.to === '/parent' || entry.to === '/tutor' || entry.to === '/admin'}
                  className={({ isActive }) =>
                    `${linkClass({
                      isActive:
                        isActive ||
                        Boolean(
                          entry.activePrefixes?.some((prefix) => pathname.startsWith(prefix)),
                        ),
                    })} ${mobile ? 'w-full' : ''}`
                  }
                  onClick={onNavigate}
                >
                  <MenuIcon icon={entry.icon} />
                  {entry.label}
                </NavLink>
              </li>
            );
          }

          const isActive = entry.items.some((item) => isCurrentPath(pathname, item.to));
          return (
            <li
              key={entry.label}
              className={mobile ? 'relative min-w-0 w-full' : 'relative min-w-0'}
            >
              <details
                key={pathname}
                className="group"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector('summary')?.focus();
                  }
                }}
              >
                <summary
                  className={`flex min-h-11 cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden ${
                    isActive ? 'bg-accent text-on-accent' : 'text-on-primary hover:bg-white/10'
                  }`}
                >
                  <MenuIcon icon={entry.icon} />
                  <span>{entry.label}</span>
                  <ChevronDown
                    aria-hidden="true"
                    size={14}
                    className="ml-auto transition-transform group-open:rotate-180 md:ml-0"
                  />
                </summary>
                <ul
                  className={`z-40 mt-1 min-w-56 rounded-md border border-border bg-bg p-1 text-primary shadow-card ${mobile ? '' : 'absolute top-full left-0 max-h-[min(70dvh,32rem)] overflow-y-auto'}`}
                >
                  {entry.items.map((item) => (
                    <li key={item.to}>
                      <NavLink to={item.to} className={submenuLinkClass} onClick={onNavigate}>
                        <MenuIcon icon={item.icon} />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Role content wrapper; API role and ownership checks remain on the Worker. */
export function RoleShell({ area }: { area: Area }) {
  return (
    <div data-role-area={area} className="w-full min-w-0 print:block">
      <div className="mx-auto w-full max-w-[var(--container-max)] min-w-0 px-4 py-6 print:max-w-none print:px-0 print:py-0">
        <Outlet />
      </div>
    </div>
  );
}

import { NavLink, Outlet } from 'react-router';

type Area = 'parent' | 'tutor' | 'moderator';

interface AreaConfig {
  label: string;
  home: string;
  links: { to: string; label: string }[];
}

const AREAS: Record<Area, AreaConfig> = {
  parent: {
    label: 'Phụ huynh',
    home: '/parent',
    links: [
      { to: '/parent', label: 'Yêu cầu tìm gia sư' },
      { to: '/parent/trang-chu', label: 'Trang chủ' },
      { to: '/parent/profile', label: 'Hồ sơ' },
      { to: '/parent/lop-hoc', label: 'Lớp học' },
      { to: '/parent/bang-gia', label: 'Bảng giá' },
      { to: '/parent/blog', label: 'Tin tức' },
      { to: '/parent/khieu-nai', label: 'Khiếu nại' },
      { to: '/student/bookings', label: 'Lịch đã đặt' },
    ],
  },
  tutor: {
    label: 'Gia sư',
    home: '/tutor',
    links: [
      { to: '/tutor', label: 'Tổng quan' },
      { to: '/tutor/new-classes', label: 'Lớp mới' },
      { to: '/tutor/matched-classes', label: 'Lớp phù hợp' },
      { to: '/tutor/class-requests', label: 'Đơn nhận lớp' },
      { to: '/tutor/classes', label: 'Lớp của tôi' },
      { to: '/tutor/profile', label: 'Hồ sơ của tôi' },
      { to: '/tutor/contracts', label: 'Hợp đồng' },
      { to: '/tutor/terms', label: 'Điều khoản trách nhiệm' },
      { to: '/tutor/how-to-accept', label: 'Hướng dẫn nhận lớp' },
      { to: '/tutor/class-history', label: 'Lịch sử lớp' },
      { to: '/tutor/khieu-nai', label: 'Khiếu nại' },
      { to: '/tutor/bookings', label: 'Lịch đặt hiện tại' },
    ],
  },
  moderator: {
    label: 'Kiểm duyệt viên',
    home: '/admin',
    links: [
      { to: '/admin', label: 'Tổng quan' },
      { to: '/admin/users', label: 'Người dùng' },
      { to: '/admin/requests', label: 'Yêu cầu' },
      { to: '/admin/applications', label: 'Đơn nhận lớp' },
      { to: '/admin/classes', label: 'Lớp học' },
      { to: '/admin/tutors', label: 'Duyệt hồ sơ' },
      { to: '/admin/services', label: 'Dịch vụ' },
      { to: '/admin/pricing', label: 'Phương án phí' },
      { to: '/admin/terms/quiz', label: 'Bài kiểm tra điều khoản' },
      { to: '/admin/contracts', label: 'Hợp đồng lớp' },
      { to: '/admin/content/pages', label: 'Trang thông tin' },
      { to: '/admin/content/blog', label: 'Nội dung' },
      { to: '/admin/support', label: 'Hỗ trợ' },
      { to: '/admin/reports', label: 'Báo cáo' },
      { to: '/admin/settings', label: 'Cài đặt' },
    ],
  },
};

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
    isActive ? 'bg-info-surface text-primary' : 'text-fg hover:bg-surface'
  }`;

/** Role navigation only; API role and ownership checks remain on the Worker. */
export function RoleShell({ area }: { area: Area }) {
  const config = AREAS[area];

  return (
    <div className="mx-auto grid w-full max-w-[var(--container-max)] gap-6 px-4 py-6 print:block print:max-w-none print:px-0 print:py-0 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
      <aside className="min-w-0 print:hidden" aria-label={`Khu vực ${config.label}`}>
        <p className="mb-2 text-sm font-semibold text-primary">Khu vực {config.label}</p>
        <nav aria-label={`Điều hướng ${config.label}`}>
          <ul className="flex min-w-0 gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {config.links.map((link) => (
              <li key={link.to} className="shrink-0 lg:shrink">
                <NavLink to={link.to} end={link.to === config.home} className={linkClass}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

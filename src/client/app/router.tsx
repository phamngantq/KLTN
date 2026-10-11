import type { ReactNode } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import type { UserRole } from '../../shared/schemas/auth';
import { HomePage } from '../pages/HomePage';
import { PublicInfoPage } from '../pages/public/PublicInfoPage';
import { NotFoundPage, RouteErrorPage } from './errors';
import { FeatureUnavailablePage } from './FeatureUnavailablePage';
import { RequireRole } from './guards';
import { RoleShell } from './RoleShell';
import { RootLayout } from './RootLayout';

/** Route-level code splitting: each working feature loads on first navigation. */
function page(load: () => Promise<ReactNode>, roles?: UserRole[]): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const element = await load();
      return { element: roles ? <RequireRole roles={roles}>{element}</RequireRole> : element };
    },
  };
}

type PendingArea = 'parent' | 'tutor' | 'moderator';
type PendingRoute = readonly [path: string, title: string, message: string];

const RECOVERY: Record<PendingArea, { to: string; label: string }> = {
  parent: { to: '/student/bookings', label: 'Xem lịch đặt hiện tại' },
  tutor: { to: '/tutor/profile', label: 'Xem hồ sơ gia sư' },
  moderator: { to: '/admin/tutors', label: 'Duyệt gia sư hiện tại' },
};

function pending(area: PendingArea, title: string, message: string) {
  const recovery = RECOVERY[area];
  return (
    <FeatureUnavailablePage
      title={title}
      message={message}
      availableTo={recovery.to}
      availableLabel={recovery.label}
    />
  );
}

function pendingRoutes(area: PendingArea, definitions: readonly PendingRoute[]): RouteObject[] {
  return definitions.map(([path, title, message]) => ({
    path,
    element: pending(area, title, message),
  }));
}

const PARENT_PENDING = [
  [
    'khieu-nai',
    'Khiếu nại',
    'Kênh khiếu nại trực tuyến chưa mở; chưa có yêu cầu nào được gửi từ trang này.',
  ],
] as const satisfies readonly PendingRoute[];

const TUTOR_PENDING = [
  [
    'classes',
    'Lớp của tôi',
    'Lớp theo quy trình mới chưa được ghi nhận; lịch đặt hiện tại vẫn truy cập được.',
  ],
  [
    'new-classes',
    'Lớp mới',
    'Chưa có lớp được xuất bản từ dữ liệu thật. Chức năng đăng ký nhận lớp chưa mở.',
  ],
  ['matched-classes', 'Lớp phù hợp', 'Hệ thống chưa đưa ra đề xuất lớp dựa trên dữ liệu thật.'],
  ['class-requests', 'Đơn nhận lớp', 'Chưa thể nộp, rút hoặc theo dõi đơn nhận lớp trực tuyến.'],
  ['class-history', 'Lịch sử lớp', 'Chưa có lịch sử lớp được ghi nhận theo quy trình mới.'],
  [
    'contracts',
    'Hợp đồng',
    'Điều khoản và hợp đồng lớp học chưa được công bố và ký trên hệ thống.',
  ],
  [
    'how-to-accept',
    'Hướng dẫn nhận lớp',
    'Hướng dẫn nhận lớp sẽ được công bố sau khi quy trình và điều khoản được duyệt.',
  ],
  [
    'responsibility-terms',
    'Điều khoản trách nhiệm',
    'Bài kiểm tra và xác nhận điều khoản chưa mở; kết quả lưu trên thiết bị không có hiệu lực.',
  ],
  [
    'khieu-nai',
    'Khiếu nại',
    'Kênh khiếu nại trực tuyến chưa mở; chưa có yêu cầu nào được gửi từ trang này.',
  ],
] as const satisfies readonly PendingRoute[];

const MODERATOR_PENDING = [
  [
    'users',
    'Quản lý người dùng',
    'Chức năng quản lý tài khoản theo sản phẩm mới chưa mở. Duyệt gia sư hiện tại vẫn khả dụng.',
  ],
  [
    'requests',
    'Quản lý yêu cầu',
    'Yêu cầu tìm gia sư của phụ huynh chưa được tiếp nhận từ dữ liệu thật.',
  ],
  [
    'requests/find-tutor',
    'Yêu cầu tìm gia sư',
    'Chưa thể gán gia sư hoặc tạo lớp từ yêu cầu trên hệ thống.',
  ],
  [
    'requests/accept-class',
    'Đơn nhận lớp',
    'Chưa thể duyệt hoặc từ chối đơn nhận lớp trên hệ thống.',
  ],
  ['classes', 'Quản lý lớp', 'Chưa thể tạo, xuất bản hoặc gán lớp theo quy trình mới.'],
  ['services', 'Dịch vụ', 'Nội dung dịch vụ chưa có nguồn quản trị và công bố được xác nhận.'],
  [
    'pricing',
    'Phương án phí',
    'Phương án phí sẽ được công bố sau khi chính sách và phiên bản có hiệu lực được duyệt.',
  ],
  ['content/blog', 'Bài viết', 'Chưa thể biên tập hoặc xuất bản bài viết trên hệ thống.'],
  ['content/faq', 'Câu hỏi thường gặp', 'Nội dung hỏi đáp chưa có nguồn quản trị được xác nhận.'],
  [
    'content/contracts',
    'Mẫu hợp đồng',
    'Hợp đồng và điều khoản chưa được quản trị theo phiên bản trên hệ thống.',
  ],
  [
    'content/terms',
    'Điều khoản trách nhiệm',
    'Nội dung và bài kiểm tra điều khoản chưa được công bố.',
  ],
  [
    'content/how-to-accept',
    'Hướng dẫn nhận lớp',
    'Hướng dẫn nhận lớp chưa được công bố từ dữ liệu thật.',
  ],
  [
    'support',
    'Hỗ trợ và khiếu nại',
    'Chưa có hồ sơ hỗ trợ hoặc khiếu nại được tiếp nhận trên hệ thống.',
  ],
  ['reports', 'Báo cáo', 'Chưa có báo cáo từ dữ liệu lớp học được xác minh.'],
  ['reports/conversion', 'Báo cáo chuyển đổi', 'Chưa có nguồn sự kiện thật để tính chuyển đổi.'],
  ['reports/no-tutor', 'Lớp thiếu gia sư', 'Chưa có dữ liệu lớp thật để lập báo cáo.'],
  [
    'reports/revenue',
    'Báo cáo doanh thu',
    'Chưa có nguồn giao dịch đã xác minh để tính doanh thu.',
  ],
  ['settings', 'Cài đặt', 'Chức năng cấu hình sản phẩm mới chưa mở.'],
] as const satisfies readonly PendingRoute[];

const parentRoutes: RouteObject[] = [
  {
    index: true,
    ...page(async () => {
      const { ParentRequestsPage } = await import('../pages/parent/ParentRequestsPage');
      return <ParentRequestsPage />;
    }),
  },
  {
    path: 'request',
    ...page(async () => {
      const { ParentRequestFormPage } = await import('../pages/parent/ParentRequestFormPage');
      return <ParentRequestFormPage />;
    }),
  },
  {
    path: 'requests/:id',
    ...page(async () => {
      const { ParentRequestDetailPage } = await import('../pages/parent/ParentRequestDetailPage');
      return <ParentRequestDetailPage />;
    }),
  },
  {
    path: 'requests/:id/edit',
    ...page(async () => {
      const { ParentRequestFormPage } = await import('../pages/parent/ParentRequestFormPage');
      return <ParentRequestFormPage />;
    }),
  },
  { path: 'dashboard', element: <Navigate to="/parent" replace /> },
  { path: 'trang-chu', element: <HomePage /> },
  { path: 'gioi-thieu', element: <PublicInfoPage kind="about" /> },
  { path: 'dich-vu', element: <PublicInfoPage kind="services" /> },
  { path: 'bang-gia', element: <PublicInfoPage kind="pricing" /> },
  { path: 'lop-hoc', element: <PublicInfoPage kind="classes" /> },
  { path: 'blog', element: <PublicInfoPage kind="blog-parent" /> },
  { path: 'lien-he', element: <PublicInfoPage kind="contact" /> },
  ...pendingRoutes('parent', PARENT_PENDING),
  {
    path: 'profile',
    ...page(async () => {
      const { ParentProfilePage } = await import('../pages/parent/ParentProfilePage');
      return <ParentProfilePage />;
    }),
  },
];

const tutorRoutes: RouteObject[] = [
  {
    index: true,
    element: pending(
      'tutor',
      'Tổng quan gia sư',
      'Chưa có dữ liệu lớp học theo quy trình mới để tổng hợp.',
    ),
  },
  { path: 'dashboard', element: <Navigate to="/tutor" replace /> },
  { path: 'signed-contracts', element: <Navigate to="/tutor/contracts" replace /> },
  { path: 'tutor-blog', element: <Navigate to="/tutor/blog" replace /> },
  { path: 'pricing', element: <PublicInfoPage kind="pricing" /> },
  { path: 'blog', element: <PublicInfoPage kind="blog-tutor" /> },
  { path: 'contact', element: <PublicInfoPage kind="contact" /> },
  ...pendingRoutes('tutor', TUTOR_PENDING),
  {
    path: 'profile',
    ...page(async () => {
      const { TutorProfilePage } = await import('../pages/tutor/TutorProfilePage');
      return <TutorProfilePage />;
    }),
  },
  {
    path: 'availability',
    ...page(async () => {
      const { TutorAvailabilityPage } = await import('../pages/tutor/TutorAvailabilityPage');
      return <TutorAvailabilityPage />;
    }),
  },
  {
    path: 'bookings',
    ...page(async () => {
      const { TutorBookingsPage } = await import('../pages/tutor/TutorBookingsPage');
      return <TutorBookingsPage />;
    }),
  },
];

const moderatorRoutes: RouteObject[] = [
  {
    index: true,
    element: pending(
      'moderator',
      'Tổng quan kiểm duyệt',
      'Chưa có dữ liệu yêu cầu và lớp học thật để tổng hợp.',
    ),
  },
  { path: 'tutor-approval', element: <Navigate to="/admin/tutors" replace /> },
  { path: 'content', element: <Navigate to="/admin/content/blog" replace /> },
  { path: 'statistics', element: <Navigate to="/admin/reports" replace /> },
  ...pendingRoutes('moderator', MODERATOR_PENDING),
  {
    path: 'tutors',
    ...page(async () => {
      const { AdminTutorsPage } = await import('../pages/admin/AdminTutorsPage');
      return <AdminTutorsPage />;
    }),
  },
];

/** Code-export route matrix; unimplemented actions have explicit unavailable pages. */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'gioi-thieu', element: <PublicInfoPage kind="about" /> },
      { path: 'dich-vu', element: <PublicInfoPage kind="services" /> },
      { path: 'bang-gia', element: <PublicInfoPage kind="pricing" /> },
      { path: 'lop-hoc', element: <PublicInfoPage kind="classes" /> },
      { path: 'blog', element: <Navigate to="/blog/phu-huynh" replace /> },
      { path: 'blog/phu-huynh', element: <PublicInfoPage kind="blog-parent" /> },
      { path: 'blog/gia-su', element: <PublicInfoPage kind="blog-tutor" /> },
      { path: 'blog/:category/:id', element: <PublicInfoPage kind="blog-article" /> },
      { path: 'lien-he', element: <PublicInfoPage kind="contact" /> },
      { path: 'forgot-password', element: <PublicInfoPage kind="password-help" /> },
      { path: 'login', element: <Navigate to="/sign-in" replace /> },
      { path: 'register', element: <Navigate to="/sign-up" replace /> },
      {
        path: 'tutors',
        ...page(async () => {
          const { TutorsPage } = await import('../pages/discovery/TutorsPage');
          return <TutorsPage />;
        }),
      },
      {
        path: 'tutors/:slug',
        ...page(async () => {
          const { TutorDetailPage } = await import('../pages/discovery/TutorDetailPage');
          return <TutorDetailPage />;
        }),
      },
      {
        path: 'sign-in',
        ...page(async () => {
          const { SignInPage } = await import('../pages/auth/SignInPage');
          return <SignInPage />;
        }),
      },
      {
        path: 'sign-up',
        ...page(async () => {
          const { SignUpPage } = await import('../pages/auth/SignUpPage');
          return <SignUpPage />;
        }),
      },
      {
        path: 'account',
        ...page(async () => {
          const { AccountPage } = await import('../pages/AccountPage');
          return <AccountPage />;
        }, ['student', 'tutor', 'admin']),
      },
      {
        path: 'student/bookings',
        ...page(async () => {
          const { StudentBookingsPage } = await import('../pages/student/StudentBookingsPage');
          return <StudentBookingsPage />;
        }, ['student']),
      },
      {
        path: 'parent',
        element: (
          <RequireRole roles={['student']}>
            <RoleShell area="parent" />
          </RequireRole>
        ),
        children: parentRoutes,
      },
      {
        path: 'tutor',
        element: (
          <RequireRole roles={['tutor']}>
            <RoleShell area="tutor" />
          </RequireRole>
        ),
        children: tutorRoutes,
      },
      {
        path: 'admin',
        element: (
          <RequireRole roles={['admin']}>
            <RoleShell area="moderator" />
          </RequireRole>
        ),
        children: moderatorRoutes,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

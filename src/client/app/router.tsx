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
    'Yêu cầu tìm gia sư của người học chưa được tiếp nhận từ dữ liệu thật.',
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
    path: 'requests/:id/gia-su',
    ...page(async () => {
      const { ParentProposedTutorPage } = await import('../pages/parent/ParentProposedTutorPage');
      return <ParentProposedTutorPage />;
    }),
  },
  {
    path: 'requests/:id/de-xuat/:proposalId',
    ...page(async () => {
      const { ParentProposedTutorPage } = await import('../pages/parent/ParentProposedTutorPage');
      return <ParentProposedTutorPage />;
    }),
  },
  {
    path: 'requests/:id/edit',
    ...page(async () => {
      const { ParentRequestFormPage } = await import('../pages/parent/ParentRequestFormPage');
      return <ParentRequestFormPage />;
    }),
  },
  {
    path: 'dashboard',
    ...page(async () => {
      const { ParentDashboardPage } = await import('../pages/dashboards/RoleDashboards');
      return <ParentDashboardPage />;
    }),
  },
  { path: 'trang-chu', element: <HomePage /> },
  // Signed-in users see shared pages inside their area (see member-routes.ts).
  {
    path: 'gioi-thieu',
    ...page(async () => {
      const { PublishedContentPage } = await import('../pages/public/PublishedContentPage');
      return <PublishedContentPage kind="page" slug="about" fallbackTitle="Giới thiệu" />;
    }),
  },
  {
    path: 'dich-vu',
    ...page(async () => {
      const { PublicServicesPage } = await import('../pages/public/PublicServicesPage');
      return <PublicServicesPage />;
    }),
  },
  {
    path: 'lop-hoc/:id',
    ...page(async () => {
      const { PublicClassDetailPage } = await import('../pages/classes/ClassDetailPage');
      return <PublicClassDetailPage />;
    }),
  },
  {
    path: 'bang-gia',
    ...page(async () => {
      const { LearnerPricingPage } = await import('../pages/parent/LearnerPricingPage');
      return <LearnerPricingPage />;
    }),
  },
  {
    path: 'cam-nang',
    ...page(async () => {
      const { LearnerHandbookPage } = await import('../pages/parent/LearnerHandbookPage');
      return <LearnerHandbookPage />;
    }),
  },
  {
    path: 'cam-nang/:id',
    ...page(async () => {
      const { LearnerHandbookArticlePage } = await import('../pages/parent/LearnerHandbookPage');
      return <LearnerHandbookArticlePage />;
    }),
  },
  {
    path: 'lop-hoc',
    ...page(async () => {
      const { PublicClassBrowsePage } = await import('../pages/classes/ClassBrowsePage');
      return <PublicClassBrowsePage />;
    }),
  },
  {
    path: 'lop-tim-hoc-vien',
    ...page(async () => {
      const { TutorOfferBrowsePage } = await import('../pages/classes/TutorOfferBrowsePage');
      return <TutorOfferBrowsePage />;
    }),
  },
  {
    path: 'lop-tim-hoc-vien/:id',
    ...page(async () => {
      const { TutorOfferPublicDetailPage } = await import('../pages/classes/TutorOfferBrowsePage');
      return <TutorOfferPublicDetailPage />;
    }),
  },
  {
    path: 'tutor-offer-joins',
    ...page(async () => {
      const { ParentTutorOfferJoinsPage } =
        await import('../pages/parent/ParentTutorOfferJoinsPage');
      return <ParentTutorOfferJoinsPage />;
    }),
  },
  {
    path: 'tutor-offer-joins/:id',
    ...page(async () => {
      const { ParentTutorOfferJoinDetailPage } =
        await import('../pages/parent/ParentTutorOfferJoinDetailPage');
      return <ParentTutorOfferJoinDetailPage />;
    }),
  },
  {
    path: 'khieu-nai',
    ...page(async () => {
      const { ComplaintsPage } = await import('../pages/shared/ComplaintsPage');
      return <ComplaintsPage />;
    }),
  },
  { path: 'blog', element: <Navigate to="/parent/cam-nang" replace /> },
  {
    path: 'lien-he',
    ...page(async () => {
      const { PublicContactPage } = await import('../pages/public/PublicContactPage');
      return <PublicContactPage />;
    }),
  },
  ...pendingRoutes(
    'parent',
    PARENT_PENDING.filter(([path]) => path !== 'khieu-nai'),
  ),
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
    ...page(async () => {
      const { TutorDashboardPage } = await import('../pages/dashboards/RoleDashboards');
      return <TutorDashboardPage />;
    }),
  },
  { path: 'dashboard', element: <Navigate to="/tutor" replace /> },
  { path: 'signed-contracts', element: <Navigate to="/tutor/contracts" replace /> },
  { path: 'tutor-blog', element: <Navigate to="/tutor/blog" replace /> },
  {
    path: 'pricing',
    ...page(async () => {
      const { LearnerPricingPage } = await import('../pages/parent/LearnerPricingPage');
      return <LearnerPricingPage audience="tutor" />;
    }),
  },
  {
    path: 'blog',
    ...page(async () => {
      const { PublishedContentCollectionPage } =
        await import('../pages/public/PublishedContentPage');
      return (
        <PublishedContentCollectionPage
          kind="blog"
          slugPrefix="gia-su-"
          title="Tin tức gia sư"
          detailBase="/tutor/blog"
        />
      );
    }),
  },
  {
    path: 'blog/:id',
    ...page(async () => {
      const { TutorBlogArticleRoute } = await import('../pages/public/PublishedContentPage');
      return <TutorBlogArticleRoute />;
    }),
  },
  {
    path: 'contact',
    ...page(async () => {
      const { PublicContactPage } = await import('../pages/public/PublicContactPage');
      return <PublicContactPage />;
    }),
  },
  {
    path: 'gioi-thieu',
    ...page(async () => {
      const { PublishedContentPage } = await import('../pages/public/PublishedContentPage');
      return <PublishedContentPage kind="page" slug="about" fallbackTitle="Giới thiệu" />;
    }),
  },
  {
    path: 'dich-vu',
    ...page(async () => {
      const { PublicServicesPage } = await import('../pages/public/PublicServicesPage');
      return <PublicServicesPage />;
    }),
  },
  {
    path: 'offers',
    ...page(async () => {
      const { TutorOffersPage } = await import('../pages/tutor/TutorOffersPage');
      return <TutorOffersPage />;
    }),
  },
  {
    path: 'offers/new',
    ...page(async () => {
      const { TutorOfferFormPage } = await import('../pages/tutor/TutorOfferFormPage');
      return <TutorOfferFormPage />;
    }),
  },
  {
    path: 'offers/:id/edit',
    ...page(async () => {
      const { TutorOfferFormPage } = await import('../pages/tutor/TutorOfferFormPage');
      return <TutorOfferFormPage />;
    }),
  },
  {
    path: 'offers/:id',
    ...page(async () => {
      const { TutorOfferDetailPage } = await import('../pages/tutor/TutorOffersPage');
      return <TutorOfferDetailPage />;
    }),
  },
  {
    path: 'new-classes',
    ...page(async () => {
      const { TutorNewClassesPage } = await import('../pages/tutor/TutorClassPages');
      return <TutorNewClassesPage />;
    }),
  },
  {
    path: 'new-classes/:id',
    ...page(async () => {
      const { TutorClassDetailPage } = await import('../pages/tutor/TutorClassPages');
      return <TutorClassDetailPage />;
    }),
  },
  {
    path: 'new-classes/:id/nhan-lop',
    ...page(async () => {
      const { TutorAcceptClassPage } = await import('../pages/tutor/TutorClassPages');
      return <TutorAcceptClassPage />;
    }),
  },
  {
    path: 'matched-classes',
    ...page(async () => {
      const { TutorMatchedClassBrowsePage } = await import('../pages/classes/ClassBrowsePage');
      return <TutorMatchedClassBrowsePage />;
    }),
  },
  {
    path: 'class-requests',
    ...page(async () => {
      const { TutorApplicationsPage } = await import('../pages/tutor/TutorApplicationsPage');
      return <TutorApplicationsPage />;
    }),
  },
  {
    path: 'class-requests/:assignmentId/thu-gioi-thieu',
    ...page(async () => {
      const { TutorIntroductionLetterPage } =
        await import('../pages/tutor/TutorIntroductionLetterPage');
      return <TutorIntroductionLetterPage />;
    }),
  },
  {
    path: 'classes',
    ...page(async () => {
      const { TutorAssignedClassesPage } = await import('../pages/tutor/TutorAssignedClassesPage');
      return <TutorAssignedClassesPage />;
    }),
  },
  {
    path: 'class-history',
    ...page(async () => {
      const { TutorClassHistoryPage } = await import('../pages/tutor/TutorClassHistoryPage');
      return <TutorClassHistoryPage />;
    }),
  },
  {
    path: 'terms',
    ...page(async () => {
      const { TutorTermsPage } = await import('../pages/tutor/TutorTermsPage');
      return <TutorTermsPage />;
    }),
  },
  { path: 'responsibility-terms', element: <Navigate to="/tutor/terms" replace /> },
  {
    path: 'how-to-accept',
    ...page(async () => {
      const { TutorHowToAcceptPage } = await import('../pages/tutor/TutorHowToAcceptPage');
      return <TutorHowToAcceptPage />;
    }),
  },
  {
    path: 'contracts',
    ...page(async () => {
      const { TutorContractsPage } = await import('../pages/tutor/TutorContractsPage');
      return <TutorContractsPage />;
    }),
  },
  {
    path: 'hop-dong-mau',
    ...page(async () => {
      const { PublishedContentPage } = await import('../pages/public/PublishedContentPage');
      return (
        <PublishedContentPage
          kind="contract"
          slug="tutor-class-contract"
          audience="tutor"
          fallbackTitle="Hợp đồng mẫu"
        />
      );
    }),
  },
  {
    path: 'cam-nang',
    ...page(async () => {
      const { LearnerHandbookPage } = await import('../pages/parent/LearnerHandbookPage');
      return <LearnerHandbookPage audience="tutor" />;
    }),
  },
  {
    path: 'cam-nang/:id',
    ...page(async () => {
      const { LearnerHandbookArticlePage } = await import('../pages/parent/LearnerHandbookPage');
      return <LearnerHandbookArticlePage audience="tutor" />;
    }),
  },
  {
    path: 'khieu-nai',
    ...page(async () => {
      const { ComplaintsPage } = await import('../pages/shared/ComplaintsPage');
      return <ComplaintsPage />;
    }),
  },
  ...pendingRoutes(
    'tutor',
    TUTOR_PENDING.filter(
      ([path]) =>
        ![
          'classes',
          'class-history',
          'contracts',
          'responsibility-terms',
          'how-to-accept',
          'khieu-nai',
        ].includes(path),
    ),
  ),
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
    ...page(async () => {
      const { AdminDashboardPage } = await import('../pages/admin/AdminDashboardPage');
      return <AdminDashboardPage />;
    }),
  },
  { path: 'tutor-approval', element: <Navigate to="/admin/tutors" replace /> },
  { path: 'content', element: <Navigate to="/admin/content/blog" replace /> },
  { path: 'statistics', element: <Navigate to="/admin/reports" replace /> },
  {
    path: 'tutor-offers',
    ...page(async () => {
      const { AdminTutorOffersPage } = await import('../pages/admin/AdminTutorOffersPage');
      return <AdminTutorOffersPage />;
    }),
  },
  {
    path: 'tutor-offer-joins',
    ...page(async () => {
      const { AdminTutorOfferJoinsPage } = await import('../pages/admin/AdminTutorOfferJoinsPage');
      return <AdminTutorOfferJoinsPage />;
    }),
  },
  {
    path: 'users',
    ...page(async () => {
      const { AdminUsersPage } = await import('../pages/admin/AdminUsersPage');
      return <AdminUsersPage />;
    }),
  },
  {
    path: 'requests',
    ...page(async () => {
      const { AdminRequestsPage } = await import('../pages/admin/AdminRequestsPage');
      return <AdminRequestsPage />;
    }),
  },
  { path: 'requests/find-tutor', element: <Navigate to="/admin/requests" replace /> },
  {
    path: 'requests/accept-class',
    ...page(async () => {
      const { AdminApplicationsPage } = await import('../pages/admin/AdminApplicationsPage');
      return <AdminApplicationsPage />;
    }),
  },
  {
    path: 'applications',
    ...page(async () => {
      const { AdminApplicationsPage } = await import('../pages/admin/AdminApplicationsPage');
      return <AdminApplicationsPage />;
    }),
  },
  {
    path: 'classes',
    ...page(async () => {
      const { AdminClassesPage } = await import('../pages/admin/AdminClassesPage');
      return <AdminClassesPage />;
    }),
  },
  {
    path: 'pricing',
    ...page(async () => {
      const { AdminPricingPage } = await import('../pages/admin/AdminPricingPage');
      return <AdminPricingPage />;
    }),
  },
  {
    path: 'terms/quiz',
    ...page(async () => {
      const { AdminTermsQuizPage } = await import('../pages/admin/AdminTermsQuizPage');
      return <AdminTermsQuizPage />;
    }),
  },
  {
    path: 'contracts',
    ...page(async () => {
      const { AdminClassContractsPage } = await import('../pages/admin/AdminClassContractsPage');
      return <AdminClassContractsPage />;
    }),
  },
  {
    path: 'support',
    ...page(async () => {
      const { AdminComplaintsPage } = await import('../pages/admin/AdminComplaintsPage');
      return <AdminComplaintsPage />;
    }),
  },
  {
    path: 'settings',
    ...page(async () => {
      const { AdminSettingsPage } = await import('../pages/admin/AdminSettingsPage');
      return <AdminSettingsPage />;
    }),
  },
  {
    path: 'services',
    ...page(async () => {
      const { AdminServicesPage } = await import('../pages/admin/AdminServicesPage');
      return <AdminServicesPage />;
    }),
  },
  {
    path: 'content/pages',
    ...page(async () => {
      const { AdminContentPage } = await import('../pages/admin/AdminContentPage');
      return <AdminContentPage kind="page" title="Trang thông tin" />;
    }),
  },
  {
    path: 'content/blog',
    ...page(async () => {
      const { AdminContentPage } = await import('../pages/admin/AdminContentPage');
      return <AdminContentPage kind="blog" title="Bài viết" />;
    }),
  },
  {
    path: 'content/faq',
    ...page(async () => {
      const { AdminContentPage } = await import('../pages/admin/AdminContentPage');
      return <AdminContentPage kind="faq" title="Câu hỏi thường gặp" />;
    }),
  },
  {
    path: 'content/contracts',
    ...page(async () => {
      const { AdminContentPage } = await import('../pages/admin/AdminContentPage');
      return <AdminContentPage kind="contract" title="Mẫu hợp đồng" defaultAudience="tutor" />;
    }),
  },
  {
    path: 'content/terms',
    ...page(async () => {
      const { AdminContentPage } = await import('../pages/admin/AdminContentPage');
      return (
        <AdminContentPage kind="terms" title="Điều khoản trách nhiệm" defaultAudience="tutor" />
      );
    }),
  },
  {
    path: 'content/how-to-accept',
    ...page(async () => {
      const { AdminContentPage } = await import('../pages/admin/AdminContentPage');
      return <AdminContentPage kind="guide" title="Hướng dẫn nhận lớp" defaultAudience="tutor" />;
    }),
  },
  {
    path: 'reports',
    ...page(async () => {
      const { AdminReportsOverviewPage } = await import('../pages/admin/AdminReportsPage');
      return <AdminReportsOverviewPage />;
    }),
  },
  {
    path: 'reports/conversion',
    ...page(async () => {
      const { AdminConversionPage } = await import('../pages/admin/AdminReportsPage');
      return <AdminConversionPage />;
    }),
  },
  {
    path: 'reports/no-tutor',
    ...page(async () => {
      const { AdminNoTutorPage } = await import('../pages/admin/AdminReportsPage');
      return <AdminNoTutorPage />;
    }),
  },
  {
    path: 'reports/revenue',
    ...page(async () => {
      const { AdminRevenuePage } = await import('../pages/admin/AdminReportsPage');
      return <AdminRevenuePage />;
    }),
  },
  ...pendingRoutes(
    'moderator',
    MODERATOR_PENDING.filter(
      ([path]) =>
        ![
          'users',
          'requests',
          'requests/find-tutor',
          'requests/accept-class',
          'classes',
          'pricing',
          'services',
          'content/blog',
          'content/faq',
          'content/contracts',
          'content/terms',
          'content/how-to-accept',
          'reports',
          'reports/conversion',
          'reports/no-tutor',
          'reports/revenue',
          'support',
          'settings',
        ].includes(path),
    ),
  ),
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
      {
        path: 'gioi-thieu',
        ...page(async () => {
          const { PublishedContentPage } = await import('../pages/public/PublishedContentPage');
          return <PublishedContentPage kind="page" slug="about" fallbackTitle="Giới thiệu" />;
        }),
      },
      {
        path: 'dich-vu',
        ...page(async () => {
          const { PublicServicesPage } = await import('../pages/public/PublicServicesPage');
          return <PublicServicesPage />;
        }),
      },
      {
        path: 'bang-gia',
        ...page(async () => {
          const { PublicPricingPage } = await import('../pages/public/PublicPricingPage');
          return <PublicPricingPage />;
        }),
      },
      {
        path: 'lop-hoc',
        ...page(async () => {
          const { PublicClassBrowsePage } = await import('../pages/classes/ClassBrowsePage');
          return <PublicClassBrowsePage />;
        }),
      },
      {
        path: 'lop-tim-hoc-vien',
        ...page(async () => {
          const { TutorOfferBrowsePage } = await import('../pages/classes/TutorOfferBrowsePage');
          return <TutorOfferBrowsePage />;
        }),
      },
      {
        path: 'lop-tim-hoc-vien/:id',
        ...page(async () => {
          const { TutorOfferPublicDetailPage } =
            await import('../pages/classes/TutorOfferBrowsePage');
          return <TutorOfferPublicDetailPage />;
        }),
      },
      {
        path: 'lop-hoc/:id',
        ...page(async () => {
          const { PublicClassDetailPage } = await import('../pages/classes/ClassDetailPage');
          return <PublicClassDetailPage />;
        }),
      },
      { path: 'blog', element: <Navigate to="/blog/phu-huynh" replace /> },
      {
        path: 'blog/phu-huynh',
        ...page(async () => {
          const { PublishedContentCollectionPage } =
            await import('../pages/public/PublishedContentPage');
          return (
            <PublishedContentCollectionPage
              kind="blog"
              slugPrefix="phu-huynh-"
              title="Tin tức người học"
              detailBase="/blog/phu-huynh"
            />
          );
        }),
      },
      {
        path: 'blog/gia-su',
        ...page(async () => {
          const { PublishedContentCollectionPage } =
            await import('../pages/public/PublishedContentPage');
          return (
            <PublishedContentCollectionPage
              kind="blog"
              slugPrefix="gia-su-"
              title="Tin tức gia sư"
              detailBase="/blog/gia-su"
            />
          );
        }),
      },
      {
        path: 'blog/:category/:id',
        ...page(async () => {
          const { PublishedBlogArticleRoute } =
            await import('../pages/public/PublishedContentPage');
          return <PublishedBlogArticleRoute />;
        }),
      },
      {
        path: 'lien-he',
        ...page(async () => {
          const { PublicContactPage } = await import('../pages/public/PublicContactPage');
          return <PublicContactPage />;
        }),
      },
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

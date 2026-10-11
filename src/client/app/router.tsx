import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import type { UserRole } from '../../shared/schemas/auth';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage, RouteErrorPage } from './errors';
import { RequireRole } from './guards';
import { RootLayout } from './RootLayout';

/** Route-level code splitting: each page chunk loads on first navigation. */
function page(load: () => Promise<ReactNode>, roles?: UserRole[]): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const element = await load();
      return { element: roles ? <RequireRole roles={roles}>{element}</RequireRole> : element };
    },
  };
}

/** Route table (FIGMA_INVENTORY.md, PROVISIONAL). Exported for tests with a memory router. */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
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
        path: 'tutor/profile',
        ...page(async () => {
          const { TutorProfilePage } = await import('../pages/tutor/TutorProfilePage');
          return <TutorProfilePage />;
        }, ['tutor']),
      },
      {
        path: 'tutor/availability',
        ...page(async () => {
          const { TutorAvailabilityPage } = await import('../pages/tutor/TutorAvailabilityPage');
          return <TutorAvailabilityPage />;
        }, ['tutor']),
      },
      {
        path: 'tutor/bookings',
        ...page(async () => {
          const { TutorBookingsPage } = await import('../pages/tutor/TutorBookingsPage');
          return <TutorBookingsPage />;
        }, ['tutor']),
      },
      {
        path: 'admin/tutors',
        ...page(async () => {
          const { AdminTutorsPage } = await import('../pages/admin/AdminTutorsPage');
          return <AdminTutorsPage />;
        }, ['admin']),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

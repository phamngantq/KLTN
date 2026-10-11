import type { RouteObject } from 'react-router';
import { AccountPage } from '../pages/AccountPage';
import { AdminTutorsPage } from '../pages/admin/AdminTutorsPage';
import { SignInPage } from '../pages/auth/SignInPage';
import { SignUpPage } from '../pages/auth/SignUpPage';
import { TutorDetailPage } from '../pages/discovery/TutorDetailPage';
import { TutorsPage } from '../pages/discovery/TutorsPage';
import { HomePage } from '../pages/HomePage';
import { StudentBookingsPage } from '../pages/student/StudentBookingsPage';
import { TutorAvailabilityPage } from '../pages/tutor/TutorAvailabilityPage';
import { TutorBookingsPage } from '../pages/tutor/TutorBookingsPage';
import { TutorProfilePage } from '../pages/tutor/TutorProfilePage';
import { NotFoundPage, RouteErrorPage } from './errors';
import { RequireRole } from './guards';
import { RootLayout } from './RootLayout';

/** Route table (FIGMA_INVENTORY.md, PROVISIONAL). Exported for tests with a memory router. */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'tutors', element: <TutorsPage /> },
      { path: 'tutors/:slug', element: <TutorDetailPage /> },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'sign-up', element: <SignUpPage /> },
      {
        path: 'account',
        element: (
          <RequireRole roles={['student', 'tutor', 'admin']}>
            <AccountPage />
          </RequireRole>
        ),
      },
      {
        path: 'tutor/profile',
        element: (
          <RequireRole roles={['tutor']}>
            <TutorProfilePage />
          </RequireRole>
        ),
      },
      {
        path: 'tutor/availability',
        element: (
          <RequireRole roles={['tutor']}>
            <TutorAvailabilityPage />
          </RequireRole>
        ),
      },
      {
        path: 'student/bookings',
        element: (
          <RequireRole roles={['student']}>
            <StudentBookingsPage />
          </RequireRole>
        ),
      },
      {
        path: 'tutor/bookings',
        element: (
          <RequireRole roles={['tutor']}>
            <TutorBookingsPage />
          </RequireRole>
        ),
      },
      {
        path: 'admin/tutors',
        element: (
          <RequireRole roles={['admin']}>
            <AdminTutorsPage />
          </RequireRole>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

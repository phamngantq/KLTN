import type { RouteObject } from 'react-router';
import { AccountPage } from '../pages/AccountPage';
import { SignInPage } from '../pages/auth/SignInPage';
import { SignUpPage } from '../pages/auth/SignUpPage';
import { TutorDetailPage } from '../pages/discovery/TutorDetailPage';
import { TutorsPage } from '../pages/discovery/TutorsPage';
import { HomePage } from '../pages/HomePage';
import { TutorAvailabilityPage } from '../pages/tutor/TutorAvailabilityPage';
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

import type { UserRole } from '../../shared/schemas/auth';
import { homePathFor, safeNextPath } from './auth';

type Rule = readonly [pattern: RegExp, target: (match: RegExpExecArray) => string];

const AUTH_PAGES = /^\/(sign-in|sign-up|login|register|forgot-password)$/;
function id(match: RegExpExecArray, index = 1): string {
  const raw = match[index]!;
  try {
    return encodeURIComponent(decodeURIComponent(raw));
  } catch {
    return encodeURIComponent(raw); // malformed escape: keep it inert
  }
}

/** Guest page → the same page inside the signed-in role's area. Unknown guest pages go home. */
const RULES: Record<UserRole, readonly Rule[]> = {
  student: [
    [/^\/gioi-thieu$/, () => '/parent/gioi-thieu'],
    [/^\/dich-vu$/, () => '/parent/dich-vu'],
    [/^\/bang-gia$/, () => '/parent/bang-gia'],
    [/^\/lien-he$/, () => '/parent/lien-he'],
    [/^\/lop-hoc$/, () => '/parent/lop-hoc'],
    [/^\/lop-hoc\/([^/]+)$/, (m) => `/parent/lop-hoc/${id(m)}`],
    [/^\/lop-tim-hoc-vien$/, () => '/parent/lop-tim-hoc-vien'],
    [/^\/lop-tim-hoc-vien\/([^/]+)$/, (m) => `/parent/lop-tim-hoc-vien/${id(m)}`],
    [/^\/blog\/phu-huynh\/([^/]+)$/, (m) => `/parent/cam-nang/${id(m)}`],
    [/^\/blog(\/.*)?$/, () => '/parent/cam-nang'],
    [/^\/tutors(\/.*)?$/, () => '/parent'],
  ],
  tutor: [
    [/^\/gioi-thieu$/, () => '/tutor/gioi-thieu'],
    [/^\/dich-vu$/, () => '/tutor/dich-vu'],
    [/^\/bang-gia$/, () => '/tutor/pricing'],
    [/^\/lien-he$/, () => '/tutor/contact'],
    [/^\/lop-hoc$/, () => '/tutor/new-classes'],
    [/^\/lop-hoc\/([^/]+)$/, (m) => `/tutor/new-classes/${id(m)}`],
    [/^\/lop-tim-hoc-vien$/, () => '/tutor/offers'],
    [/^\/lop-tim-hoc-vien\/([^/]+)$/, (m) => `/tutor/offers/${id(m)}`],
    [/^\/blog\/gia-su\/([^/]+)$/, (m) => `/tutor/blog/${id(m)}`],
    [/^\/blog(\/.*)?$/, () => '/tutor/blog'],
    [/^\/tutors(\/.*)?$/, () => '/tutor'],
  ],
  admin: [],
};

/** Every page outside the role areas that a signed-in user must not stay on. */
const GUEST_PAGE =
  /^\/($|gioi-thieu$|dich-vu$|bang-gia$|lien-he$|lop-hoc(\/|$)|lop-tim-hoc-vien(\/|$)|blog(\/|$)|tutors(\/|$))/;

/**
 * Where a signed-in user should be instead of a guest page, or null to stay.
 * Shared pages (/account, legacy /student/bookings) and role areas are left alone.
 */
export function memberPathFor(role: UserRole, pathname: string, search: string): string | null {
  if (AUTH_PAGES.test(pathname)) {
    return safeNextPath(new URLSearchParams(search).get('next')) ?? homePathFor(role);
  }
  if (!GUEST_PAGE.test(pathname)) return null;
  for (const [pattern, target] of RULES[role]) {
    const match = pattern.exec(pathname);
    if (match) return target(match);
  }
  return homePathFor(role);
}

import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memberPathFor } from '../../src/client/app/member-routes';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('signed-in users never land on guest pages', () => {
  it('maps guest pages to the same page inside each role area', () => {
    expect(memberPathFor('student', '/', '')).toBe('/parent/dashboard');
    expect(memberPathFor('student', '/bang-gia', '')).toBe('/parent/bang-gia');
    expect(memberPathFor('student', '/lop-hoc/abc', '')).toBe('/parent/lop-hoc/abc');
    expect(memberPathFor('student', '/blog/phu-huynh/phu-huynh-x', '')).toBe(
      '/parent/cam-nang/phu-huynh-x',
    );
    expect(memberPathFor('student', '/blog/gia-su', '')).toBe('/parent/cam-nang');
    expect(memberPathFor('tutor', '/bang-gia', '')).toBe('/tutor/pricing');
    expect(memberPathFor('tutor', '/lop-hoc/abc', '')).toBe('/tutor/new-classes/abc');
    expect(memberPathFor('tutor', '/blog/gia-su/gia-su-y', '')).toBe('/tutor/blog/gia-su-y');
    expect(memberPathFor('admin', '/lien-he', '')).toBe('/admin');
    expect(memberPathFor('student', '/sign-in', '?next=/parent/khieu-nai')).toBe(
      '/parent/khieu-nai',
    );
    expect(memberPathFor('student', '/sign-in', '?next=//evil.example')).toBe('/parent/dashboard');
    expect(memberPathFor('student', '/lop-hoc/%E0%A4%A', '')).toBe(
      '/parent/lop-hoc/%25E0%25A4%25A',
    );
    // Role areas and shared pages are left alone.
    expect(memberPathFor('student', '/parent/khieu-nai', '')).toBeNull();
    expect(memberPathFor('student', '/account', '')).toBeNull();
    expect(memberPathFor('tutor', '/tutor/blog', '')).toBeNull();
  });

  it('redirects a signed-in learner from the guest home into the learner area', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/pricing/learner-guides') return { data: [] };
      if (req.path === '/pricing/learner-items') return { data: [] };
      return undefined;
    });
    const { router } = renderRoute('/bang-gia');
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent/bang-gia'));
    expect(await screen.findByRole('navigation', { name: 'Điều hướng Người học' })).toBeTruthy();
  });
});

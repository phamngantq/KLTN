import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { anonymous, mockApi, renderRoute } from './helpers';

afterEach(cleanup);

describe('tutor detail after booking cutover', () => {
  it('offers the parent request flow without loading slots or offering a booking action', async () => {
    const { calls } = mockApi((request) => {
      if (request.path === '/me') return anonymous;
      if (request.path === '/tutors/gia-su-an')
        return {
          data: {
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'gia-su-an',
            displayName: 'Gia sư An',
            bio: 'Gia sư Toán',
            hourlyRateMinor: 200_000,
            currency: 'VND',
            teachesOnline: true,
            teachesOffline: false,
            subjects: [],
          },
        };
      return undefined;
    });
    renderRoute('/tutors/gia-su-an');
    expect(await screen.findByRole('heading', { name: 'Gia sư An' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gửi yêu cầu tìm gia sư' }).getAttribute('href')).toBe(
      '/parent/request',
    );
    expect(screen.queryByRole('button', { name: 'Gửi yêu cầu đặt lịch' })).toBeNull();
    expect(calls.some((call) => call.path.includes('/slots'))).toBe(false);
  });
});

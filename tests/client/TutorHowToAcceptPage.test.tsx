import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Cách thức nhận lớp', () => {
  it('shows the two guides in tabs with their steps, notes and links', async () => {
    const { calls } = mockApi((req) =>
      req.path === '/me' ? sessionOf({ role: 'tutor' }) : undefined,
    );
    const { router } = renderRoute('/tutor/how-to-accept');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Cách thức nhận lớp' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Nhận lớp dạy',
      'Nhận lớp được đề xuất',
    ]);
    const direct = screen.getByRole('tabpanel', { name: 'Nhận lớp dạy' });
    expect(
      within(direct).getByText(/Chào mừng bạn đến với Trung tâm Gia sư Sư phạm Đỗ Hằng!/),
    ).toBeTruthy();
    // 4 own steps plus the 4 steps after receiving the learner's contact.
    expect(
      within(direct.querySelector('ol')!).getAllByText(/./, { selector: 'ol > li > span' }),
    ).toHaveLength(8);
    expect(within(direct).getByText(/chủ động liên hệ trong vòng 12 giờ/)).toBeTruthy();
    expect(within(direct).getByText(/Đối với lần nhận lớp đầu tiên:/)).toBeTruthy();
    expect(within(direct).getByRole('region', { name: 'Lưu ý' })).toBeTruthy();
    expect(
      within(direct)
        .getByRole('link', { name: 'Tìm kiếm lớp dạy → Danh sách lớp mới' })
        .getAttribute('href'),
    ).toBe('/tutor/new-classes');
    expect(within(direct).getByRole('link', { name: 'Hồ sơ gia sư' }).getAttribute('href')).toBe(
      '/tutor/profile',
    );

    await user.click(screen.getByRole('tab', { name: 'Nhận lớp được đề xuất' }));
    expect(router.state.location.search).toBe('?tab=de-xuat');
    const proposed = screen.getByRole('tabpanel', { name: 'Nhận lớp được đề xuất' });
    expect(within(proposed).getByText(/Môn học có thể dạy:/)).toBeTruthy();
    expect(within(proposed).getByText(/Chọn “Xác nhận nhận lớp”/)).toBeTruthy();
    expect(within(proposed).getByText(/không cần mất thời gian chờ phê duyệt/)).toBeTruthy();
    expect(
      within(proposed)
        .getByRole('link', { name: '“Đăng ký lớp học phù hợp”' })
        .getAttribute('href'),
    ).toBe('/tutor/profile?tab=dang-ky');
    expect(screen.queryByRole('tabpanel', { name: 'Nhận lớp dạy' })).toBeNull();
    // Static guide: no content API call.
    expect(calls.some((call) => call.path.startsWith('/content'))).toBe(false);
  });

  it('opens the proposed-class guide from the URL', async () => {
    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'tutor' }) : undefined));
    renderRoute('/tutor/how-to-accept?tab=de-xuat');
    expect(
      (await screen.findByRole('tab', { name: 'Nhận lớp được đề xuất' })).getAttribute(
        'aria-selected',
      ),
    ).toBe('true');
    expect(screen.getByText(/gia sư có thể chủ động đăng ký lớp học phù hợp/)).toBeTruthy();
  });
});

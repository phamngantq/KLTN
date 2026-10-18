import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { articlesFrom } from '../../src/client/pages/tutor/TutorContractTemplatePage';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('tutor contract template', () => {
  it('lays out the A4 contract and fills Bên B from the tutor profile, dotted when missing', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/profile')
        return {
          data: {
            displayName: 'Nguyễn Văn Gia Sư',
            dateOfBirth: '2002-05-09',
            idNumber: '001202000123',
            idIssuedOn: null,
            phone: '0912345678',
            email: 'gia-su@example.test',
            idResidence: null,
            school: 'Đại học Sư phạm Hà Nội',
          },
        };
      if (req.path.startsWith('/content/contract/tutor-class-contract'))
        return { status: 404, error: { code: 'CONTENT_NOT_FOUND', message: 'Không có.' } };
      return undefined;
    });
    renderRoute('/tutor/hop-dong-mau');
    const sheet = await screen.findByRole('article', { name: 'Hợp đồng gia sư' });
    expect(within(sheet).getByText('TRUNG TÂM GIA SƯ GROWGREEN')).toBeTruthy();
    expect(within(sheet).getByText('Cộng hòa xã hội chủ nghĩa Việt Nam')).toBeTruthy();
    expect(within(sheet).getByText('Độc lập - Tự do - Hạnh phúc')).toBeTruthy();
    expect(within(sheet).getByRole('heading', { name: 'Hợp đồng gia sư' })).toBeTruthy();
    expect(within(sheet).getByText(/Số: ………\/HĐGS-GG/)).toBeTruthy();

    const partyA = within(sheet).getByRole('region', { name: 'Bên A' });
    expect(within(partyA).getByText('Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội')).toBeTruthy();
    const partyB = within(sheet).getByRole('region', { name: 'Bên B' });
    expect(within(partyB).getByText('Nguyễn Văn Gia Sư')).toBeTruthy();
    expect(within(partyB).getByText('09/05/2002')).toBeTruthy();
    expect(within(partyB).getByText('001202000123')).toBeTruthy();
    expect(within(partyB).getByText('Đại học Sư phạm Hà Nội')).toBeTruthy();
    // Ngày cấp and hộ khẩu thường trú are empty: dotted lines to fill in.
    expect(within(partyB).getAllByLabelText('Để trống')).toHaveLength(2);

    expect(within(sheet).getByRole('heading', { name: /^Điều 1\./ })).toBeTruthy();
    expect(within(sheet).getByText('Đại diện Bên A')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'In / Lưu PDF' })).toBeTruthy();
  });

  it('uses the centre contract text when it is written as articles', () => {
    expect(
      articlesFrom('Lời mở đầu\nĐiều 1. Phạm vi\nNội dung A\nĐiều 2. Phí\nNội dung B\nNội dung C'),
    ).toEqual([
      { title: 'Điều 1. Phạm vi', paragraphs: ['Nội dung A'] },
      { title: 'Điều 2. Phí', paragraphs: ['Nội dung B', 'Nội dung C'] },
    ]);
    expect(articlesFrom('Đây là hợp đồng mẫu.')).toBeNull();
  });
});

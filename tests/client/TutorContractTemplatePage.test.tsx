import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('tutor contract template', () => {
  it('shows the centre contract on A4 and fills Bên B from the tutor profile', async () => {
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
            tutorType: 'pedagogy_student',
            school: 'Đại học Sư phạm Hà Nội',
          },
        };
      return undefined;
    });
    renderRoute('/tutor/hop-dong-mau');
    const sheet = await screen.findByRole('article', { name: 'Hợp đồng nhận lớp dạy gia sư' });
    expect(within(sheet).getByText('Cộng hòa xã hội chủ nghĩa Việt Nam')).toBeTruthy();
    expect(within(sheet).getByText('Độc lập – Tự do – Hạnh phúc')).toBeTruthy();
    expect(
      within(sheet).getByRole('heading', { name: 'Hợp đồng nhận lớp dạy gia sư' }),
    ).toBeTruthy();
    expect(within(sheet).getByText('Số: ………… /HĐNT-ĐH')).toBeTruthy();

    const partyA = within(sheet).getByRole('region', { name: 'Bên A' });
    expect(within(partyA).getByText(/Tầng 7, Số 41–43, Đường Khuất Duy Tiến/)).toBeTruthy();

    const partyB = within(sheet).getByRole('region', { name: 'Bên B' });
    expect(within(partyB).getByText('Nguyễn Văn Gia Sư')).toBeTruthy();
    expect(within(partyB).getByText('Ngày sinh: 09 / 05 / 2002')).toBeTruthy();
    expect(within(partyB).getByText('Ngày cấp: ……… / ……… / ………')).toBeTruthy();
    expect(within(partyB).getByText('001202000123')).toBeTruthy();
    // A pedagogy student: "Sinh viên" ticked with the school, "Giáo viên" left blank.
    expect(within(partyB).getByLabelText('Đã chọn')).toBeTruthy();
    expect(within(partyB).getByText('Đại học Sư phạm Hà Nội')).toBeTruthy();

    for (const title of [
      'ĐIỀU 1. PHẠM VI VÀ HIỆU LỰC ÁP DỤNG',
      'ĐIỀU 5. QUY ĐỊNH VỀ MỨC HOÀN PHÍ KHI LỚP DẠY GẶP TRỞ NGẠI',
      'ĐIỀU 7. HIỆU LỰC VÀ ĐIỀU KHOẢN CHUNG',
    ])
      expect(within(sheet).getByRole('heading', { name: title })).toBeTruthy();
    const refunds = within(sheet).getByRole('table', { name: /Các mức hoàn phí/ });
    expect(within(refunds).getAllByRole('row')).toHaveLength(5);
    expect(within(refunds).getByText('75%')).toBeTruthy();
    expect(within(sheet).getByText('(Ký, ghi rõ họ tên hoặc xác nhận trên hệ thống)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'In / Lưu PDF' })).toBeTruthy();
  });
});

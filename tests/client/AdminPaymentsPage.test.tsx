import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaymentTransaction } from '../../src/shared/schemas/payments';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tx = (id: string, overrides: Partial<PaymentTransaction> = {}): PaymentTransaction => ({
  id,
  providerTransactionId: `9${id}`,
  gateway: 'Vietcombank',
  accountNumber: '0123456789',
  transferType: 'in',
  amountMinor: 640_000,
  content: 'PNLLHD0000000000B',
  referenceCode: 'FT123',
  transactionAt: '2026-10-19 10:00:00',
  paymentCode: 'PNLLHD0000000000B',
  assignmentId: 'as-1',
  expectedAmountMinor: 640_000,
  status: 'matched',
  receivedAt: '2026-10-19T03:00:00.000Z',
  classCode: 'LH-D0000000000B',
  tutorDisplayName: 'Gia sư mẫu',
  ...overrides,
});

describe('admin payments', () => {
  it('lists SePay transactions with their reconciliation status and filters them', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path.startsWith('/admin/payments'))
        return {
          data: {
            items: [
              tx('1'),
              tx('2', {
                status: 'underpaid',
                amountMinor: 100_000,
              }),
              tx('3', {
                status: 'unmatched',
                assignmentId: null,
                classCode: null,
                tutorDisplayName: null,
                expectedAmountMinor: null,
                content: 'ung ho',
              }),
            ],
            page: 1,
            pageSize: 20,
            total: 3,
          },
        };
      return undefined;
    });
    renderRoute('/admin/payments');
    const table = await screen.findByRole('table', { name: 'Lịch sử giao dịch thanh toán' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Đã xác nhận phí nhận lớp')).toBeTruthy();
    expect(within(rows[0]!).getByText('LH-D0000000000B')).toBeTruthy();
    expect(within(rows[1]!).getByText('Thiếu tiền — cần xử lý')).toBeTruthy();
    expect(within(rows[1]!).getByText('Cần 640.000 ₫')).toBeTruthy();
    expect(within(rows[2]!).getByText('Không khớp mã lớp')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'underpaid' } });
    await waitFor(() =>
      expect(calls.some((call) => call.path.includes('status=underpaid'))).toBe(true),
    );
  });
});

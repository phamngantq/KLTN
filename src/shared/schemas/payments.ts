/** Bank transactions reported by SePay ("Lịch sử giao dịch"). */
export const PAYMENT_TRANSACTION_STATUSES = [
  'matched',
  'underpaid',
  'not_ready',
  'already_paid',
  'unmatched',
  'outgoing',
] as const;
export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentTransactionStatus, string> = {
  matched: 'Đã xác nhận phí nhận lớp',
  underpaid: 'Thiếu tiền — cần xử lý',
  not_ready: 'Lớp chưa đủ điều kiện — cần xử lý',
  already_paid: 'Lớp đã thanh toán trước đó',
  unmatched: 'Không khớp mã lớp',
  outgoing: 'Tiền ra',
};

export interface PaymentTransaction {
  id: string;
  providerTransactionId: string;
  gateway: string | null;
  accountNumber: string | null;
  transferType: 'in' | 'out';
  amountMinor: number;
  content: string;
  referenceCode: string | null;
  transactionAt: string;
  paymentCode: string | null;
  assignmentId: string | null;
  expectedAmountMinor: number | null;
  status: PaymentTransactionStatus;
  receivedAt: string;
  classCode: string | null;
  tutorDisplayName: string | null;
}

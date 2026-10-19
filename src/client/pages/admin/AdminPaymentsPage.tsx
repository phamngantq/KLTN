import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import type { Page } from '../../../shared/schemas/discovery';
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_TRANSACTION_STATUSES,
  type PaymentTransaction,
  type PaymentTransactionStatus,
} from '../../../shared/schemas/payments';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, toQuery } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

const TONES: Record<PaymentTransactionStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  matched: 'success',
  underpaid: 'danger',
  not_ready: 'warning',
  already_paid: 'warning',
  unmatched: 'neutral',
  outgoing: 'neutral',
};

/**
 * "Giao dịch thanh toán": every bank transaction SePay reported, newest first. Matched ones
 * recorded the placement fee automatically; the others need a moderator ("Hợp đồng lớp").
 */
export function AdminPaymentsPage() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const status = PAYMENT_TRANSACTION_STATUSES.find((item) => item === params.get('status'));
  const list = useQuery({
    queryKey: ['admin-payments', page, status],
    queryFn: ({ signal }) =>
      api.get<Page<PaymentTransaction>>(`/admin/payments${toQuery({ page, status })}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Giao dịch thanh toán"
        description="Lịch sử giao dịch chuyển khoản do SePay báo về. Giao dịch khớp mã lớp và đủ tiền được tự động ghi nhận phí nhận lớp; các giao dịch còn lại cần xử lý tại “Hợp đồng lớp”."
      />
      <div className="max-w-xs">
        <SelectField
          label="Trạng thái"
          value={status ?? ''}
          onChange={(event) => setParams(event.target.value ? { status: event.target.value } : {})}
        >
          <option value="">Tất cả</option>
          {PAYMENT_TRANSACTION_STATUSES.map((item) => (
            <option key={item} value={item}>
              {PAYMENT_STATUS_LABELS[item]}
            </option>
          ))}
        </SelectField>
      </div>
      {list.isPending ? (
        <PageLoading label="Đang tải giao dịch…" />
      ) : list.isError ? (
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" onClick={() => void list.refetch()}>
              Thử lại
            </Button>
          }
        >
          {list.error.message}
        </Alert>
      ) : list.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có giao dịch"
          description="Giao dịch sẽ xuất hiện khi SePay báo có tiền vào tài khoản nhận phí."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-bg shadow-card">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">Lịch sử giao dịch thanh toán</caption>
              <thead className="bg-surface text-xs uppercase text-muted">
                <tr>
                  {[
                    'Thời gian',
                    'Mã giao dịch',
                    'Số tiền',
                    'Nội dung',
                    'Lớp',
                    'Gia sư',
                    'Trạng thái',
                  ].map((head) => (
                    <th key={head} scope="col" className="px-3 py-2 font-semibold">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((item) => (
                  <tr key={item.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{item.transactionAt}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{item.providerTransactionId}</span>
                      {item.referenceCode && (
                        <span className="block text-xs text-muted">{item.referenceCode}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <strong
                        className={item.transferType === 'out' ? 'text-danger' : 'text-primary'}
                      >
                        {item.transferType === 'out' ? '−' : '+'}
                        {formatVnd(item.amountMinor)}
                      </strong>
                      {item.expectedAmountMinor !== null && (
                        <span className="block text-xs text-muted">
                          Cần {formatVnd(item.expectedAmountMinor)}
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-3 py-2 break-words">{item.content}</td>
                    <td className="px-3 py-2">{item.classCode ?? '—'}</td>
                    <td className="px-3 py-2">{item.tutorDisplayName ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge tone={TONES[item.status]}>{PAYMENT_STATUS_LABELS[item.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data.total > list.data.pageSize && (
            <nav aria-label="Trang giao dịch" className="flex items-center gap-3">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setParams({ ...(status && { status }), page: String(page - 1) })}
              >
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {page} / {Math.ceil(list.data.total / list.data.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={page * list.data.pageSize >= list.data.total}
                onClick={() => setParams({ ...(status && { status }), page: String(page + 1) })}
              >
                Trang sau
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

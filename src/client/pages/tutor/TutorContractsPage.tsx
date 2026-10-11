import { useState } from 'react';
import { CheckCircle2, FileText, ReceiptText } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { ClassContractRecord } from '../../../shared/schemas/terms-contracts';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useAcknowledgeContract, useTutorContracts } from '../../features/terms-contracts/api';

function feeSummary(item: ClassContractRecord): string {
  if (item.feeOptionKey === 'lesson_multiplier_with_deposit') {
    return `${item.rateBasisPoints / 10_000} lần học phí buổi; tỷ lệ đặt cọc ${Number(item.depositBasisPoints ?? 0) / 100}%`;
  }
  const basis = item.feeOptionKey === 'monthly_percent' ? 'học phí tháng' : 'học phí buổi đầu';
  return `${item.rateBasisPoints / 100}% ${basis}`;
}

export function TutorContractsPage() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const contracts = useTutorContracts(page);
  const acknowledge = useAcknowledgeContract();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [notice, setNotice] = useState('');
  const selected = contracts.data?.items.find((item) => item.id === selectedId) ?? null;
  const readOnly = isReadOnlyPreview();

  function select(id: string) {
    setSelectedId(id);
    setAgreed(false);
    setNotice('');
    acknowledge.reset();
  }

  function confirm() {
    if (!selected || !agreed || readOnly) return;
    acknowledge.mutate(
      { id: selected.id, version: selected.version },
      {
        onSuccess: () => {
          setAgreed(false);
          setNotice('Đã ghi nhận xác nhận nội dung hợp đồng của bạn.');
        },
      },
    );
  }

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold text-primary">Hợp đồng & Chính sách</h1>
        <p className="mt-2 text-muted">
          Xem hồ sơ hợp đồng do kiểm duyệt viên phát hành cho lớp đã gán và xác nhận nội dung sau
          khi đọc.
        </p>
      </header>
      {readOnly && <Alert tone="info">Bản xem trước chỉ cho phép đọc hồ sơ.</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {contracts.isPending ? (
        <PageLoading label="Đang tải hợp đồng…" />
      ) : contracts.isError ? (
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" onClick={() => void contracts.refetch()}>
              Thử lại
            </Button>
          }
        >
          {contracts.error.message}
        </Alert>
      ) : contracts.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có hợp đồng lớp"
          description="Hợp đồng sẽ xuất hiện khi kiểm duyệt viên phát hành cho lớp đã gán."
        />
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg bg-surface px-4 py-3 text-sm font-medium text-primary">
            <FileText className="size-5" aria-hidden="true" />
            Hợp đồng lớp của tôi ({contracts.data.total})
          </div>
          <ul className="grid gap-4" aria-label="Hồ sơ hợp đồng">
            {contracts.data.items.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-bg p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface text-primary">
                      <FileText className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-semibold text-primary">{item.contractTitle}</p>
                      <p className="text-sm text-muted">
                        Lớp {item.classCode} · phiên bản {item.contractRevision}
                      </p>
                    </div>
                  </div>
                  <Badge tone={item.status === 'acknowledged' ? 'success' : 'warning'}>
                    {item.status === 'acknowledged' ? 'Đã xác nhận' : 'Chờ xác nhận'}
                  </Badge>
                </div>
                <div className="mt-4 flex justify-end border-t border-border pt-4">
                  <Button variant="secondary" onClick={() => select(item.id)}>
                    Xem hợp đồng
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <nav aria-label="Trang hợp đồng" className="flex items-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => {
                setSelectedId(null);
                setParams(page > 2 ? { page: String(page - 1) } : {});
              }}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page} /{' '}
              {Math.max(1, Math.ceil(contracts.data.total / contracts.data.pageSize))}
            </span>
            <Button
              variant="secondary"
              disabled={page * contracts.data.pageSize >= contracts.data.total}
              onClick={() => {
                setSelectedId(null);
                setParams({ page: String(page + 1) });
              }}
            >
              Trang sau
            </Button>
          </nav>
        </>
      )}
      {selected && (
        <article
          className="overflow-hidden rounded-xl border border-border bg-bg shadow-card"
          aria-label="Chi tiết hợp đồng"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-4">
            <div className="flex items-center gap-3">
              <FileText className="size-6 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-semibold text-primary">{selected.contractTitle}</h2>
                <p className="mt-1 text-sm text-muted">
                  Lớp {selected.classCode} · phiên bản hợp đồng {selected.contractRevision}
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setSelectedId(null)}>
              Đóng
            </Button>
          </div>
          <div className="p-5">
            <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-bg p-5 text-sm leading-7">
              {selected.contractBodyText}
            </div>
            <section className="mt-5 rounded-lg border border-border bg-surface p-5">
              <h3 className="flex items-center gap-2 font-semibold text-primary">
                <ReceiptText className="size-5" aria-hidden="true" />
                Phương án phí đã chọn khi ứng tuyển
              </h3>
              <p className="mt-3 font-medium">
                {selected.feeOptionTitle}: {feeSummary(selected)}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">
                {selected.feePolicyText}
              </p>
            </section>
            {selected.status === 'issued' && (
              <div className="mt-5 space-y-3 border-t border-border pt-5">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-surface p-3">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(event) => setAgreed(event.target.checked)}
                  />
                  <span>
                    Tôi đã đọc nội dung hợp đồng phiên bản {selected.contractRevision} và phương án
                    phí của lớp này.
                  </span>
                </label>
                {acknowledge.isError && <Alert tone="danger">{acknowledge.error.message}</Alert>}
                <Button
                  disabled={!agreed || readOnly}
                  loading={acknowledge.isPending}
                  onClick={confirm}
                >
                  Xác nhận nội dung hợp đồng
                </Button>
              </div>
            )}
            {selected.status === 'acknowledged' && (
              <Alert tone="success">
                <CheckCircle2 className="mr-2 inline size-4" aria-hidden="true" />
                Đã xác nhận lúc{' '}
                {selected.acknowledgedAt
                  ? new Date(selected.acknowledgedAt).toLocaleString('vi-VN')
                  : ''}
                .
              </Alert>
            )}
          </div>
        </article>
      )}
    </section>
  );
}

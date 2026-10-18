import { useState } from 'react';
import { CheckCircle2, FileText, Printer } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { ClassContractRecord } from '../../../shared/schemas/terms-contracts';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useAcknowledgeContract, useTutorContracts } from '../../features/terms-contracts/api';
import { useOwnProfile } from '../../features/tutor-profile/api';
import { formatVnd } from '../../lib/format';
import { ContractSheet, type SignedContract } from './TutorContractTemplatePage';

/** Contract number printed on the sheet: stable, derived from the record. */
export function contractNumber(item: ClassContractRecord): string {
  return item.id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function signedOf(item: ClassContractRecord): SignedContract {
  return {
    number: contractNumber(item),
    signedAt: item.acknowledgedAt ?? item.issuedAt,
    issuedAt: item.issuedAt,
    acknowledgedAt: item.acknowledgedAt,
    classCode: item.classCode,
    feeOptionTitle: `${item.feeOptionTitle} (${feeSummary(item)})`,
    agreedTuitionPerSessionMinor: item.agreedTuitionPerSessionMinor,
    placementFeeAmountMinor: item.placementFeeAmountMinor,
    placementFeePaidAt: item.placementFeePaidAt,
    learnerConfirmedAt: item.learnerConfirmedAt,
  };
}

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
  const profile = useOwnProfile();
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
          setNotice('Đã ghi nhận bạn ký xác nhận hợp đồng.');
        },
      },
    );
  }

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <header className="print:hidden">
        <h1 className="text-3xl font-semibold text-primary">Hợp đồng đã ký</h1>
        <p className="mt-2 text-muted">
          Hợp đồng nhận lớp của từng lớp đã gán: xem bản hợp đồng đầy đủ, ký xác nhận và in hoặc lưu
          PDF.
        </p>
      </header>
      <div className={selected ? 'contents print:hidden' : 'contents'}>
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
                        <p className="mt-1 text-sm text-primary">
                          Học phí đã chốt:{' '}
                          {item.agreedTuitionPerSessionMinor === null
                            ? 'Chưa ghi nhận khi phát hành'
                            : `${formatVnd(item.agreedTuitionPerSessionMinor)}/buổi`}
                        </p>
                      </div>
                    </div>
                    <Badge tone={item.status === 'acknowledged' ? 'success' : 'warning'}>
                      {item.status === 'acknowledged' ? 'Đã xác nhận' : 'Chờ xác nhận'}
                    </Badge>
                  </div>
                  <div className="mt-4 flex justify-end border-t border-border pt-4">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        select(item.id);
                        window.setTimeout(
                          () =>
                            document
                              .querySelector('[aria-label="Chi tiết hợp đồng"]')
                              ?.scrollIntoView?.({ behavior: 'smooth' }),
                          0,
                        );
                      }}
                    >
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
      </div>
      {selected && (
        <section aria-label="Chi tiết hợp đồng" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <h2 className="text-xl font-semibold text-primary">
              Hợp đồng lớp {selected.classCode}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => window.print()} className="gap-2">
                <Printer aria-hidden="true" className="size-4" />
                In / Lưu PDF
              </Button>
              <Button variant="secondary" onClick={() => setSelectedId(null)}>
                Đóng
              </Button>
            </div>
          </div>
          <div className="min-w-0 overflow-x-auto print:overflow-visible">
            <ContractSheet tutor={profile.data ?? null} signed={signedOf(selected)} />
          </div>
          {selected.status === 'issued' && (
            <div className="space-y-3 rounded-xl border border-border bg-bg p-5 shadow-card print:hidden">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-surface p-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <span>Tôi đã đọc và đồng ý với các điều khoản trong hợp đồng</span>
              </label>
              {acknowledge.isError && <Alert tone="danger">{acknowledge.error.message}</Alert>}
              <Button
                disabled={!agreed || readOnly}
                loading={acknowledge.isPending}
                onClick={confirm}
              >
                Ký xác nhận hợp đồng
              </Button>
            </div>
          )}
          {selected.status === 'acknowledged' && (
            <Alert tone="success">
              <CheckCircle2 className="mr-2 inline size-4" aria-hidden="true" />
              Bạn đã ký xác nhận hợp đồng trên hệ thống lúc{' '}
              {selected.acknowledgedAt
                ? new Date(selected.acknowledgedAt).toLocaleString('vi-VN')
                : ''}
              .
            </Alert>
          )}
        </section>
      )}
    </section>
  );
}

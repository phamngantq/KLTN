import { useState } from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import type { ClassContractRecord } from '../../../shared/schemas/terms-contracts';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useAcknowledgeContract, useAllTutorContracts } from '../../features/terms-contracts/api';
import { useOwnProfile } from '../../features/tutor-profile/api';
import { ContractSheet, type SignedContract } from './TutorContractTemplatePage';

/** Contract number printed on the sheet: stable, derived from the record. */
export function contractNumber(item: ClassContractRecord): string {
  return item.id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function feeSummary(item: ClassContractRecord): string {
  if (item.feeOptionKey === 'lesson_multiplier_with_deposit') {
    return `${item.rateBasisPoints / 10_000} lần học phí buổi; tỷ lệ đặt cọc ${Number(item.depositBasisPoints ?? 0) / 100}%`;
  }
  const basis = item.feeOptionKey === 'monthly_percent' ? 'học phí tháng' : 'học phí buổi đầu';
  return `${item.rateBasisPoints / 100}% ${basis}`;
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);

/**
 * The tutor signs once (Điều 1.1): the first acknowledged record is "the" contract; while none
 * is signed, the earliest issued one awaits the signature. Every class record is a row of its
 * "Phụ lục 01", oldest first.
 */
export function masterContract(items: ClassContractRecord[]): ClassContractRecord | null {
  const signed = items
    .filter((item) => item.acknowledgedAt)
    .sort((a, b) => time(a.acknowledgedAt) - time(b.acknowledgedAt));
  if (signed[0]) return signed[0];
  return [...items].sort((a, b) => time(a.issuedAt) - time(b.issuedAt))[0] ?? null;
}

function signedOf(
  master: ClassContractRecord,
  items: ClassContractRecord[],
  total: number,
): SignedContract {
  return {
    number: contractNumber(master),
    signedAt: master.acknowledgedAt ?? master.issuedAt,
    issuedAt: master.issuedAt,
    acknowledgedAt: master.acknowledgedAt,
    classes: [...items]
      .sort((a, b) => time(a.issuedAt) - time(b.issuedAt))
      .map((item) => ({
        classCode: item.classCode,
        feeOptionTitle: `${item.feeOptionTitle} (${feeSummary(item)})`,
        agreedTuitionPerSessionMinor: item.agreedTuitionPerSessionMinor,
        placementFeeAmountMinor: item.placementFeeAmountMinor,
        placementFeePaidAt: item.placementFeePaidAt,
        confirmedAt: item.acknowledgedAt,
      })),
    moreClasses: Math.max(0, total - items.length),
  };
}

/** "Hợp đồng đã ký": the tutor's single contract, applied to every class they take. */
export function TutorContractsPage() {
  const contracts = useAllTutorContracts();
  const profile = useOwnProfile();
  const acknowledge = useAcknowledgeContract();
  const [agreed, setAgreed] = useState(false);
  const [notice, setNotice] = useState('');
  const readOnly = isReadOnlyPreview();
  const items = contracts.data?.items ?? [];
  const master = masterContract(items);

  function sign() {
    if (!master || !agreed || readOnly) return;
    acknowledge.mutate(
      { id: master.id, version: master.version },
      {
        onSuccess: () => {
          setAgreed(false);
          setNotice('Đã ghi nhận bạn ký xác nhận hợp đồng.');
        },
      },
    );
  }

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-[230mm] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-semibold text-primary">Hợp đồng đã ký</h1>
          <p className="mt-2 text-muted">
            Bạn chỉ ký hợp đồng nhận lớp một lần; hợp đồng áp dụng cho mọi lớp nhận sau đó. Mỗi lớp
            được ghi thành một dòng trong Phụ lục 01.
          </p>
        </div>
        {master && (
          <Button onClick={() => window.print()} className="gap-2">
            <Printer aria-hidden="true" className="size-4" />
            In / Lưu PDF
          </Button>
        )}
      </header>
      {readOnly && <Alert tone="info">Bản xem trước chỉ cho phép đọc hồ sơ.</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {contracts.isPending || profile.isPending ? (
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
      ) : !master ? (
        <EmptyState
          title="Chưa có hợp đồng"
          description="Hợp đồng sẽ xuất hiện khi trung tâm phát hành hợp đồng cho lớp đầu tiên bạn nhận."
        />
      ) : (
        <>
          <div className="min-w-0 overflow-x-auto print:overflow-visible">
            <ContractSheet
              tutor={profile.data ?? null}
              signed={signedOf(master, items, contracts.data.total)}
            />
          </div>
          {master.status === 'issued' ? (
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
              <Button disabled={!agreed || readOnly} loading={acknowledge.isPending} onClick={sign}>
                Ký xác nhận hợp đồng
              </Button>
            </div>
          ) : (
            <Alert tone="success">
              <CheckCircle2 className="mr-2 inline size-4" aria-hidden="true" />
              Bạn đã ký xác nhận hợp đồng trên hệ thống lúc{' '}
              {master.acknowledgedAt ? new Date(master.acknowledgedAt).toLocaleString('vi-VN') : ''}
              . Các lớp nhận sau được xác nhận ở bước “Hoàn tất nhận lớp” và ghi vào Phụ lục 01.
            </Alert>
          )}
        </>
      )}
    </section>
  );
}

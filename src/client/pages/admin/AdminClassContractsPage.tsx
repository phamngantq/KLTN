import { useState } from 'react';
import { CalendarDays, Eye, FileText, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import type {
  AdminContractCandidate,
  ClassContractRecord,
} from '../../../shared/schemas/terms-contracts';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { usePublishedContent } from '../../features/content/api';
import {
  useAdminContractCandidates,
  useAdminContracts,
  useIssueContract,
} from '../../features/terms-contracts/api';

export function AdminClassContractsPage() {
  const template = usePublishedContent('contract', 'tutor-class-contract', 'tutor');
  const [candidatePage, setCandidatePage] = useState(1);
  const [recordPage, setRecordPage] = useState(1);
  const candidates = useAdminContractCandidates(candidatePage);
  const records = useAdminContracts(recordPage);
  const issue = useIssueContract();
  const [selected, setSelected] = useState<AdminContractCandidate | null>(null);
  const [preview, setPreview] = useState<ClassContractRecord | null>(null);
  const [notice, setNotice] = useState('');
  const readOnly = isReadOnlyPreview();

  function confirm() {
    if (!selected || !template.data || readOnly) return;
    issue.mutate(
      {
        assignmentId: selected.assignmentId,
        assignmentVersion: selected.assignmentVersion,
        contentRevisionId: template.data.id,
      },
      {
        onSuccess: () => {
          setSelected(null);
          setNotice(`Đã phát hành hồ sơ hợp đồng cho lớp ${selected.classCode}.`);
        },
      },
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Hợp đồng lớp"
        description="Phát hành phiên bản hợp đồng đã công bố cho lớp được gán và theo dõi xác nhận của gia sư."
        actions={
          <ButtonLink variant="secondary" to="/admin/content/contracts" className="rounded-xl">
            <FileText aria-hidden="true" className="size-4" />
            Biên tập mẫu hợp đồng
          </ButtonLink>
        }
      />
      {readOnly && <Alert tone="info">Bản xem trước chỉ cho phép đọc.</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {issue.isError && <Alert tone="danger">{issue.error.message}</Alert>}
      {template.isPending ? (
        <PageLoading label="Đang tải mẫu hợp đồng…" />
      ) : template.isError ? (
        <Alert tone="warning" title="Chưa có mẫu hợp đồng hiện hành">
          Hãy{' '}
          <Link className="underline" to="/admin/content/contracts">
            công bố mẫu hợp đồng
          </Link>{' '}
          trước khi phát hành cho lớp.
        </Alert>
      ) : (
        <article className="overflow-hidden rounded-xl border border-border bg-bg shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
                <FileText aria-hidden="true" className="size-5" />
                Mẫu hiện hành: {template.data.title}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Hồ sơ đã phát hành giữ phiên bản tại thời điểm phát hành.
              </p>
            </div>
            <Badge tone="info">Phiên bản {template.data.revision}</Badge>
          </div>
          <details className="p-5 sm:p-6">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              Xem nội dung mẫu
            </summary>
            <div className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface p-4 text-sm leading-7">
              {template.data.bodyText}
            </div>
          </details>
        </article>
      )}
      <nav aria-label="Mục hợp đồng" className="flex flex-wrap gap-2 border-b border-border pb-3">
        <a
          href="#contract-candidates-heading"
          className="inline-flex min-h-11 items-center rounded-lg border border-primary bg-info-surface px-4 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Lớp đã gán
        </a>
        <a
          href="#contract-records-heading"
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-bg px-4 text-sm font-medium text-primary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Hồ sơ đã phát hành
        </a>
      </nav>
      <section className="space-y-4" aria-labelledby="contract-candidates-heading">
        <div>
          <h2 id="contract-candidates-heading" className="text-xl font-semibold text-primary">
            Lớp đã gán
          </h2>
          <p className="mt-1 text-sm text-muted">
            Phát hành mẫu hiện hành cho lớp có gia sư được gán.
          </p>
        </div>
        {candidates.isPending ? (
          <PageLoading label="Đang tải lớp đã gán…" />
        ) : candidates.isError ? (
          <Alert
            tone="danger"
            action={
              <Button variant="secondary" onClick={() => void candidates.refetch()}>
                Thử lại
              </Button>
            }
          >
            {candidates.error.message}
          </Alert>
        ) : candidates.data.items.length === 0 ? (
          <EmptyState
            title="Chưa có lớp được gán"
            description="Lớp được kiểm duyệt viên gán sẽ xuất hiện tại đây."
          />
        ) : (
          <>
            <ul className="grid gap-4 md:grid-cols-2">
              {candidates.data.items.map((item) => (
                <li
                  key={item.assignmentId}
                  className="flex min-w-0 flex-col justify-between gap-5 rounded-xl border border-border bg-bg p-5 shadow-card"
                >
                  <div>
                    <p className="font-mono text-xs text-muted">{item.classCode}</p>
                    <p className="mt-1 flex items-center gap-2 break-words font-semibold text-primary">
                      <UserRound aria-hidden="true" className="size-4 shrink-0" />
                      {item.tutorDisplayName}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                      <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                      Gán lúc {new Date(item.assignedAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  {item.contractId ? (
                    <div>
                      <Badge tone="success">Đã phát hành</Badge>
                    </div>
                  ) : (
                    <Button
                      disabled={!template.data || readOnly}
                      className="self-start rounded-xl"
                      onClick={() => {
                        setNotice('');
                        setSelected(item);
                      }}
                    >
                      Phát hành hợp đồng
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <nav
              aria-label="Trang lớp đã gán"
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <Button
                variant="secondary"
                disabled={candidatePage <= 1}
                onClick={() => setCandidatePage((value) => value - 1)}
              >
                Trang trước
              </Button>
              <span>
                Trang {candidatePage} /{' '}
                {Math.max(1, Math.ceil(candidates.data.total / candidates.data.pageSize))}
              </span>
              <Button
                variant="secondary"
                disabled={candidatePage * candidates.data.pageSize >= candidates.data.total}
                onClick={() => setCandidatePage((value) => value + 1)}
              >
                Trang sau
              </Button>
            </nav>
          </>
        )}
      </section>
      <section className="space-y-4" aria-labelledby="contract-records-heading">
        <h2 id="contract-records-heading" className="text-xl font-semibold text-primary">
          Hồ sơ đã phát hành
        </h2>
        {records.isPending ? (
          <PageLoading label="Đang tải hồ sơ…" />
        ) : records.isError ? (
          <Alert
            tone="danger"
            action={
              <Button variant="secondary" onClick={() => void records.refetch()}>
                Thử lại
              </Button>
            }
          >
            {records.error.message}
          </Alert>
        ) : records.data.items.length === 0 ? (
          <EmptyState title="Chưa phát hành hồ sơ nào" />
        ) : (
          <>
            <ul className="grid gap-4 md:grid-cols-2">
              {records.data.items.map((item) => (
                <li
                  key={item.id}
                  className="flex min-w-0 flex-col justify-between gap-5 rounded-xl border border-border bg-bg p-5 shadow-card"
                >
                  <div>
                    <p className="font-mono text-xs text-muted">{item.classCode}</p>
                    <p className="mt-1 break-words font-semibold text-primary">
                      {item.contractTitle}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                      <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                      Phiên bản {item.contractRevision} · phát hành{' '}
                      {new Date(item.issuedAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone={item.status === 'acknowledged' ? 'success' : 'warning'}>
                      {item.status === 'acknowledged'
                        ? 'Gia sư đã xác nhận'
                        : 'Chờ gia sư xác nhận'}
                    </Badge>
                    <Button
                      variant="secondary"
                      onClick={() => setPreview(item)}
                      className="rounded-xl"
                    >
                      <Eye aria-hidden="true" className="size-4" />
                      Xem
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <nav
              aria-label="Trang hồ sơ hợp đồng"
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <Button
                variant="secondary"
                disabled={recordPage <= 1}
                onClick={() => setRecordPage((value) => value - 1)}
              >
                Trang trước
              </Button>
              <span>
                Trang {recordPage} /{' '}
                {Math.max(1, Math.ceil(records.data.total / records.data.pageSize))}
              </span>
              <Button
                variant="secondary"
                disabled={recordPage * records.data.pageSize >= records.data.total}
                onClick={() => setRecordPage((value) => value + 1)}
              >
                Trang sau
              </Button>
            </nav>
          </>
        )}
      </section>
      {preview && (
        <article
          className="overflow-hidden rounded-xl border border-border bg-bg shadow-card"
          aria-label="Chi tiết hồ sơ hợp đồng"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4 sm:px-6">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-primary">
              <FileText aria-hidden="true" className="size-5" />
              {preview.contractTitle}
            </h2>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Đóng
            </Button>
          </div>
          <div className="space-y-4 p-5 sm:p-6">
            <p className="text-sm text-muted">
              Lớp {preview.classCode} · phiên bản {preview.contractRevision}
            </p>
            <div className="whitespace-pre-wrap break-words rounded-lg bg-surface p-4 text-sm leading-7">
              {preview.contractBodyText}
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="font-medium text-primary">Phương án phí: {preview.feeOptionTitle}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">
                {preview.feePolicyText}
              </p>
            </div>
          </div>
        </article>
      )}
      <ConfirmDialog
        open={selected !== null}
        title="Phát hành hồ sơ hợp đồng"
        description={
          <>
            Phát hành mẫu “{template.data?.title}” cho lớp {selected?.classCode} của gia sư{' '}
            {selected?.tutorDisplayName}. Hồ sơ sẽ tham chiếu phiên bản hợp đồng và phương án phí đã
            chọn.
          </>
        }
        confirmLabel="Phát hành"
        loading={issue.isPending}
        onCancel={() => setSelected(null)}
        onConfirm={confirm}
      />
    </section>
  );
}

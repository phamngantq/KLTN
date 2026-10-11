import { useState } from 'react';
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
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Hợp đồng lớp"
        description="Phát hành phiên bản hợp đồng đã công bố cho lớp được gán và theo dõi xác nhận của gia sư."
        actions={
          <ButtonLink variant="secondary" to="/admin/content/contracts">
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
        <article className="rounded-lg border border-border bg-bg p-4">
          <h2 className="font-semibold text-primary">Mẫu hiện hành: {template.data.title}</h2>
          <p className="text-sm text-muted">
            Phiên bản {template.data.revision}. Hồ sơ đã phát hành giữ phiên bản tại thời điểm phát
            hành.
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer font-medium">Xem nội dung mẫu</summary>
            <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
              {template.data.bodyText}
            </div>
          </details>
        </article>
      )}
      <section className="space-y-4" aria-labelledby="contract-candidates-heading">
        <h2 id="contract-candidates-heading" className="text-xl font-semibold">
          Lớp đã gán
        </h2>
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
            <ul className="grid gap-3">
              {candidates.data.items.map((item) => (
                <li
                  key={item.assignmentId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {item.classCode} · {item.tutorDisplayName}
                    </p>
                    <p className="text-sm text-muted">
                      Gán lúc {new Date(item.assignedAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  {item.contractId ? (
                    <Badge tone="success">Đã phát hành</Badge>
                  ) : (
                    <Button
                      disabled={!template.data || readOnly}
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
            <nav aria-label="Trang lớp đã gán" className="flex items-center gap-3">
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
        <h2 id="contract-records-heading" className="text-xl font-semibold">
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
            <ul className="grid gap-3">
              {records.data.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {item.classCode} · {item.contractTitle}
                    </p>
                    <p className="text-sm text-muted">
                      Phiên bản {item.contractRevision} · phát hành{' '}
                      {new Date(item.issuedAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={item.status === 'acknowledged' ? 'success' : 'warning'}>
                      {item.status === 'acknowledged'
                        ? 'Gia sư đã xác nhận'
                        : 'Chờ gia sư xác nhận'}
                    </Badge>
                    <Button variant="secondary" onClick={() => setPreview(item)}>
                      Xem
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <nav aria-label="Trang hồ sơ hợp đồng" className="flex items-center gap-3">
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
          className="rounded-lg border border-border bg-bg p-5"
          aria-label="Chi tiết hồ sơ hợp đồng"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">{preview.contractTitle}</h2>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Đóng
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted">
            Lớp {preview.classCode} · phiên bản {preview.contractRevision}
          </p>
          <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">
            {preview.contractBodyText}
          </div>
          <p className="mt-4 font-medium">Phương án phí: {preview.feeOptionTitle}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">
            {preview.feePolicyText}
          </p>
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

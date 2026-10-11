import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ParentTutorOfferJoin } from '../../../shared/schemas/tutor-offer-joins';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useParentTutorOfferJoinActions,
  useParentTutorOfferJoins,
} from '../../features/tutor-offer-joins/api';
import { formatVnd } from '../../lib/format';

const STATUS_LABELS: Record<ParentTutorOfferJoin['status'], string> = {
  submitted: 'Đã gửi',
  withdrawn: 'Đã rút',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
  completed: 'Đã hoàn tất',
  revoked: 'Đã thu hồi',
};

function pageFromUrl(params: URLSearchParams): number {
  const value = Number(params.get('page') ?? '1');
  return Number.isSafeInteger(value) && value >= 1 && value <= 1000 ? value : 1;
}

export function ParentTutorOfferJoinsPage() {
  const [params, setParams] = useSearchParams();
  const page = pageFromUrl(params);
  const joins = useParentTutorOfferJoins(page);
  const { withdraw } = useParentTutorOfferJoinActions();
  const [selected, setSelected] = useState<ParentTutorOfferJoin | null>(null);
  const [notice, setNotice] = useState('');

  function changePage(next: number) {
    const search = new URLSearchParams();
    if (next > 1) search.set('page', String(next));
    setParams(search);
    document.getElementById('main')?.focus();
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Yêu cầu tham gia lớp"
        description="Theo dõi các yêu cầu tham gia lớp tìm học viên đã gửi."
        actions={<ButtonLink to="/parent/lop-tim-hoc-vien">Xem lớp tìm học viên</ButtonLink>}
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      {joins.isPending ? (
        <PageLoading label="Đang tải yêu cầu tham gia lớp…" />
      ) : joins.isError ? (
        <Alert
          tone="danger"
          title="Không tải được yêu cầu"
          action={
            <Button variant="secondary" onClick={() => void joins.refetch()}>
              Thử lại
            </Button>
          }
        >
          {joins.error.message}
        </Alert>
      ) : joins.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có yêu cầu tham gia lớp"
          description="Chọn lớp tìm học viên rồi gửi thông tin học tập để bắt đầu."
          action={<ButtonLink to="/parent/lop-tim-hoc-vien">Xem danh sách lớp</ButtonLink>}
        />
      ) : (
        <>
          <p role="status" className="text-sm text-muted">
            Có {joins.data.total.toLocaleString('vi-VN')} yêu cầu của bạn.
          </p>
          <ul className="grid gap-4 md:grid-cols-2">
            {joins.data.items.map((join) => (
              <li
                key={join.id}
                className="min-w-0 rounded-xl border border-border bg-bg p-5 shadow-card"
              >
                <article className="flex h-full flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="break-words text-lg font-semibold text-primary">
                      {join.subjectName} · {join.offerGrade}
                    </h2>
                    <Badge
                      tone={
                        join.status === 'approved'
                          ? 'success'
                          : join.status === 'submitted'
                            ? 'info'
                            : 'neutral'
                      }
                    >
                      {STATUS_LABELS[join.status]}
                    </Badge>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Lớp học của học sinh</dt>
                      <dd>{join.studentGrade}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Hình thức</dt>
                      <dd>{join.offerMode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Học phí gia sư đề xuất</dt>
                      <dd>{formatVnd(join.proposedTuitionPerSessionMinor)}/buổi</dd>
                    </div>
                    {join.agreedTuitionPerSessionMinor !== null && (
                      <div>
                        <dt className="text-muted">Học phí đã chốt</dt>
                        <dd className="font-semibold text-primary">
                          {formatVnd(join.agreedTuitionPerSessionMinor)}/buổi
                        </dd>
                      </div>
                    )}
                    {join.teachingArea && (
                      <div>
                        <dt className="text-muted">Khu vực chung</dt>
                        <dd className="break-words">{join.teachingArea}</dd>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <dt className="text-muted">Nhu cầu học tập</dt>
                      <dd className="mt-1 whitespace-pre-line break-words">{join.learningNeeds}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-4">
                    <Link
                      className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
                      to={`/parent/tutor-offer-joins/${encodeURIComponent(join.id)}`}
                    >
                      Xem yêu cầu
                    </Link>
                    {join.offerStatus === 'published' && (
                      <Link
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
                        to={`/parent/lop-tim-hoc-vien/${encodeURIComponent(join.offerId)}`}
                      >
                        Xem lớp
                      </Link>
                    )}
                    {join.status === 'submitted' && (
                      <Button
                        variant="secondary"
                        disabled={isReadOnlyPreview()}
                        onClick={() => {
                          withdraw.reset();
                          setSelected(join);
                        }}
                      >
                        Rút yêu cầu
                      </Button>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {joins.data.total > joins.data.pageSize && (
            <nav
              aria-label="Trang yêu cầu tham gia lớp"
              className="flex items-center justify-center gap-3"
            >
              <Button variant="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {page} / {Math.ceil(joins.data.total / joins.data.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={page * joins.data.pageSize >= joins.data.total}
                onClick={() => changePage(page + 1)}
              >
                Trang sau
              </Button>
            </nav>
          )}
        </>
      )}
      {withdraw.isError && (
        <Alert tone="danger" title="Chưa rút được yêu cầu">
          {withdraw.error.message}
        </Alert>
      )}
      <ConfirmDialog
        open={selected !== null}
        title="Rút yêu cầu tham gia lớp?"
        description="Yêu cầu sẽ chuyển sang trạng thái đã rút."
        confirmLabel="Rút yêu cầu"
        tone="danger"
        loading={withdraw.isPending}
        onCancel={() => setSelected(null)}
        onConfirm={() =>
          selected &&
          withdraw.mutate(
            { id: selected.id, version: selected.version },
            {
              onSuccess: () => {
                setSelected(null);
                setNotice('Đã rút yêu cầu tham gia lớp.');
              },
            },
          )
        }
      />
    </section>
  );
}

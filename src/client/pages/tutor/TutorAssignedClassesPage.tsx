import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type {
  AssignedParentContact,
  TutorAssignment,
  TutorAssignmentHistory,
} from '../../../shared/schemas/admin-assignments';
import type { Page } from '../../../shared/schemas/discovery';
import { useSession } from '../../app/auth';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { api, toQuery } from '../../lib/api-client';

export function TutorAssignedClassesPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const assignments = useQuery({
    queryKey: ['tutor-assignments', user?.id, page],
    queryFn: ({ signal }) =>
      api.get<Page<TutorAssignment>>(`/tutor/assignments${toQuery({ page })}`, { signal }),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
  });
  const contactKey = ['tutor-assignment-contact', user?.id, selectedId] as const;
  const history = useQuery({
    queryKey: ['tutor-assignment-history', user?.id, historyPage],
    queryFn: ({ signal }) =>
      api.get<Page<TutorAssignmentHistory>>(
        `/tutor/assignments/history${toQuery({ page: historyPage })}`,
        { signal },
      ),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
  });
  const contact = useQuery({
    queryKey: contactKey,
    queryFn: ({ signal }) =>
      api.get<AssignedParentContact>(
        `/tutor/assignments/${encodeURIComponent(selectedId!)}/contact`,
        { signal },
      ),
    enabled: Boolean(user && selectedId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 15_000,
  });

  function closeContact() {
    if (selectedId) queryClient.removeQueries({ queryKey: contactKey });
    setSelectedId(null);
  }

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Lớp của tôi"
        description="Các lớp kiểm duyệt viên đã gán cho bạn. Thông tin liên hệ chỉ hiển thị khi bạn mở chi tiết lớp được giao."
      />
      {assignments.isPending ? (
        <PageLoading label="Đang tải lớp được giao…" />
      ) : assignments.isError ? (
        <Alert
          tone="danger"
          title="Không tải được lớp"
          action={
            <Button variant="secondary" onClick={() => void assignments.refetch()}>
              Thử lại
            </Button>
          }
        >
          {assignments.error.message}
        </Alert>
      ) : assignments.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có lớp được giao"
          description="Khi kiểm duyệt viên chọn đơn ứng tuyển của bạn, lớp sẽ xuất hiện tại đây."
        />
      ) : (
        <>
          <p className="text-sm text-muted" role="status">
            {assignments.data.total} lớp · Trang {assignments.data.page}
          </p>
          <ul className="grid gap-4">
            {assignments.data.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-bg p-4 shadow-card">
                <article className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-primary">
                      {item.classCode} · {item.subjectName} · {item.grade}
                    </h2>
                    <Badge tone="success">Đang hoạt động</Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {item.mode === 'online' ? 'Trực tuyến' : `Trực tiếp · ${item.publicArea ?? ''}`}
                  </p>
                  <div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        closeContact();
                        setSelectedId(item.id);
                      }}
                    >
                      Xem liên hệ phụ huynh
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
          <nav aria-label="Trang lớp được giao" className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => {
                closeContact();
                setParams(page > 2 ? { page: String(page - 1) } : {});
              }}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page} /{' '}
              {Math.max(1, Math.ceil(assignments.data.total / assignments.data.pageSize))}
            </span>
            <Button
              variant="secondary"
              disabled={page * assignments.data.pageSize >= assignments.data.total}
              onClick={() => {
                closeContact();
                setParams({ page: String(page + 1) });
              }}
            >
              Trang sau
            </Button>
          </nav>
        </>
      )}
      {selectedId && (
        <section
          className="rounded-lg border border-border bg-surface p-4"
          aria-label="Liên hệ phụ huynh"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Liên hệ phụ huynh</h2>
            <Button variant="secondary" onClick={closeContact}>
              Đóng
            </Button>
          </div>
          {contact.isPending ? (
            <PageLoading label="Đang kiểm tra quyền xem liên hệ…" />
          ) : contact.isError ? (
            <Alert
              tone="danger"
              action={
                <Button variant="secondary" onClick={() => void contact.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {contact.error.message}
            </Alert>
          ) : (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="font-medium text-muted">Phụ huynh</dt>
              <dd>{contact.data.parentDisplayName}</dd>
              <dt className="font-medium text-muted">Điện thoại</dt>
              <dd>
                <a className="text-primary underline" href={`tel:${contact.data.phone}`}>
                  {contact.data.phone}
                </a>
              </dd>
              <dt className="font-medium text-muted">Địa chỉ</dt>
              <dd>{contact.data.address ?? 'Phụ huynh chưa cung cấp'}</dd>
            </dl>
          )}
        </section>
      )}
      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-label="Lịch sử lớp được giao"
      >
        <h2 className="text-lg font-semibold text-primary">Lịch sử lớp đã kết thúc hoặc rút gán</h2>
        {history.isPending ? (
          <PageLoading label="Đang tải lịch sử lớp…" />
        ) : history.isError ? (
          <Alert
            tone="danger"
            action={
              <Button variant="secondary" onClick={() => void history.refetch()}>
                Thử lại
              </Button>
            }
          >
            {history.error.message}
          </Alert>
        ) : history.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Chưa có lịch sử rút gán hoặc hoàn tất.</p>
        ) : (
          <>
            <ul className="mt-3 grid gap-3">
              {history.data.items.map((item) => (
                <li
                  key={item.assignmentId}
                  className="rounded border border-border bg-bg p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>
                      {item.classCode} · {item.subjectName} · {item.grade}
                    </strong>
                    <Badge tone={item.outcome === 'completed' ? 'success' : 'neutral'}>
                      {item.outcome === 'completed' ? 'Đã hoàn tất' : 'Đã rút gán'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted">
                    {new Date(item.endedAt).toLocaleString('vi-VN')} · {item.reason}
                  </p>
                </li>
              ))}
            </ul>
            <nav aria-label="Trang lịch sử lớp" className="mt-3 flex items-center gap-3">
              <Button
                variant="secondary"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage(historyPage - 1)}
              >
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {historyPage} /{' '}
                {Math.max(1, Math.ceil(history.data.total / history.data.pageSize))}
              </span>
              <Button
                variant="secondary"
                disabled={historyPage * history.data.pageSize >= history.data.total}
                onClick={() => setHistoryPage(historyPage + 1)}
              >
                Trang sau
              </Button>
            </nav>
          </>
        )}
      </section>
    </section>
  );
}

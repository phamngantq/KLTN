import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Clock3, MapPin, Phone, UserRound, Wallet } from 'lucide-react';
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
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { api, toQuery } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

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
    <section className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold text-primary">Lớp của tôi</h1>
        <p className="mt-2 text-muted">
          Các lớp kiểm duyệt viên đã gán cho bạn. Thông tin liên hệ chỉ hiển thị khi bạn mở chi tiết
          lớp được giao.
        </p>
      </header>
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
          <div
            className="flex items-center gap-4 rounded-xl border border-border bg-bg p-5 shadow-card"
            role="status"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white">
              <BookOpen className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-semibold text-primary">{assignments.data.total}</p>
              <p className="text-sm text-muted">Lớp đang dạy · Trang {assignments.data.page}</p>
            </div>
          </div>
          <ul className="grid gap-4">
            {assignments.data.items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-l-4 border-border border-l-accent bg-bg p-5 shadow-card"
              >
                <article className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-semibold text-primary">
                        {item.subjectName} · {item.grade}
                      </h2>
                      <p className="mt-1 text-sm text-muted">Mã lớp: {item.classCode}</p>
                    </div>
                    <Badge tone="success">Đang hoạt động</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-sm text-muted">
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      {item.mode === 'online'
                        ? 'Trực tuyến'
                        : `Trực tiếp · ${item.publicArea ?? ''}`}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Wallet className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      Học phí đã chốt:{' '}
                      {item.agreedTuitionPerSessionMinor === null
                        ? 'Chưa ghi nhận'
                        : `${formatVnd(item.agreedTuitionPerSessionMinor)}/buổi`}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        closeContact();
                        setSelectedId(item.id);
                      }}
                    >
                      Xem liên hệ người học
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
          className="overflow-hidden rounded-xl border border-border bg-bg shadow-card"
          aria-label="Liên hệ người học"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 bg-primary px-5 py-4 text-white">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UserRound className="size-5" aria-hidden="true" />
              Liên hệ người học
            </h2>
            <Button variant="secondary" onClick={closeContact}>
              Đóng
            </Button>
          </div>
          <div className="p-5">
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
              <dl className="grid gap-3 text-sm sm:grid-cols-[9rem_1fr]">
                <dt className="font-medium text-muted">Người học</dt>
                <dd>{contact.data.parentDisplayName}</dd>
                <dt className="flex items-center gap-2 font-medium text-muted">
                  <Phone className="size-4" aria-hidden="true" />
                  Điện thoại
                </dt>
                <dd>
                  <a className="text-primary underline" href={`tel:${contact.data.phone}`}>
                    {contact.data.phone}
                  </a>
                </dd>
                <dt className="flex items-center gap-2 font-medium text-muted">
                  <MapPin className="size-4" aria-hidden="true" />
                  Địa chỉ
                </dt>
                <dd>{contact.data.address ?? 'Người học chưa cung cấp'}</dd>
              </dl>
            )}
          </div>
        </section>
      )}
      <section
        className="rounded-xl border border-border bg-bg p-5 shadow-card"
        aria-label="Lịch sử lớp được giao"
      >
        <h2 className="flex items-center gap-2 text-xl font-semibold text-primary">
          <Clock3 className="size-5" aria-hidden="true" />
          Lịch sử lớp đã kết thúc hoặc rút gán
        </h2>
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
                  className="rounded-lg border border-border bg-surface p-4 text-sm"
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
                  <p className="mt-1 text-muted">
                    Học phí đã chốt:{' '}
                    {item.agreedTuitionPerSessionMinor === null
                      ? 'Chưa ghi nhận'
                      : `${formatVnd(item.agreedTuitionPerSessionMinor)}/buổi`}
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

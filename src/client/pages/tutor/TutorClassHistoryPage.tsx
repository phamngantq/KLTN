import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarDays, FileText } from 'lucide-react';
import { useState } from 'react';
import type { TutorAssignmentHistory } from '../../../shared/schemas/admin-assignments';
import type { Page } from '../../../shared/schemas/discovery';
import { useSession } from '../../app/auth';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { api, toQuery } from '../../lib/api-client';
import { formatDate, formatTime } from '../../lib/format';

const TIMEZONE = 'Asia/Ho_Chi_Minh';

export function TutorClassHistoryPage() {
  const { user } = useSession();
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ['tutor-assignment-history', user?.id, page],
    queryFn: ({ signal }) =>
      api.get<Page<TutorAssignmentHistory>>(`/tutor/assignments/history${toQuery({ page })}`, {
        signal,
      }),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
  });
  return (
    <section className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold text-[#0e2f5f]">Lịch sử nhận lớp</h1>
        <p className="mt-2 text-sm text-muted">
          Các lớp đã hoàn tất hoặc được kiểm duyệt viên rút gán. Lịch sử này không chứa liên hệ
          riêng tư của phụ huynh.
        </p>
      </header>
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
        <EmptyState
          title="Chưa có lịch sử lớp học"
          description="Các lớp đã hoàn tất hoặc rút gán sẽ xuất hiện tại đây."
        />
      ) : (
        <>
          <div
            className="flex items-center gap-4 rounded-xl border border-border bg-white p-5 shadow-card"
            role="status"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[#0e2f5f] text-white">
              <BookOpen aria-hidden="true" className="size-6" />
            </span>
            <div>
              <p className="text-2xl font-semibold text-[#0e2f5f]">{history.data.total}</p>
              <p className="text-sm text-muted">Lớp trong lịch sử</p>
            </div>
          </div>
          <ul className="grid gap-5">
            {history.data.items.map((item) => (
              <li
                key={item.assignmentId}
                className="min-w-0 overflow-hidden rounded-xl border border-l-4 border-border border-l-accent bg-white shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5 sm:px-6">
                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-semibold text-[#0e2f5f]">
                      {item.subjectName} · {item.grade}
                    </h2>
                    <p className="mt-1 font-mono text-xs text-muted">Mã lớp: {item.classCode}</p>
                  </div>
                  <Badge tone={item.outcome === 'completed' ? 'success' : 'neutral'}>
                    {item.outcome === 'completed' ? 'Đã hoàn tất' : 'Đã rút gán'}
                  </Badge>
                </div>
                <div className="grid gap-4 p-5 text-sm sm:grid-cols-2 sm:px-6">
                  <div className="flex min-w-0 items-start gap-2">
                    <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                    <div>
                      <p className="text-xs text-muted">Hình thức lớp học</p>
                      <p className="font-medium">
                        {item.mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <CalendarDays
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted"
                    />
                    <div>
                      <p className="text-xs text-muted">Ngày kết thúc</p>
                      <p className="font-medium">
                        {formatDate(item.endedAt, TIMEZONE)} · {formatTime(item.endedAt, TIMEZONE)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="border-t border-border bg-slate-50 px-5 py-4 text-sm sm:px-6">
                  <p className="text-xs text-muted">Lý do kết thúc</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-fg">{item.reason}</p>
                </div>
              </li>
            ))}
          </ul>
          <nav aria-label="Trang lịch sử lớp" className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page} / {Math.max(1, Math.ceil(history.data.total / history.data.pageSize))}
            </span>
            <Button
              variant="secondary"
              disabled={page * history.data.pageSize >= history.data.total}
              onClick={() => setPage(page + 1)}
            >
              Trang sau
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}

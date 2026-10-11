import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { TutorAssignmentHistory } from '../../../shared/schemas/admin-assignments';
import type { Page } from '../../../shared/schemas/discovery';
import { useSession } from '../../app/auth';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { api, toQuery } from '../../lib/api-client';

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
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Lịch sử lớp học"
        description="Các lớp đã hoàn tất hoặc được kiểm duyệt viên rút gán. Lịch sử này không chứa liên hệ riêng tư của phụ huynh."
      />
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
        <p className="text-sm text-muted">Chưa có lịch sử rút gán hoặc hoàn tất.</p>
      ) : (
        <>
          <ul className="grid gap-3">
            {history.data.items.map((item) => (
              <li
                key={item.assignmentId}
                className="rounded border border-border bg-bg p-4 text-sm"
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
          <nav aria-label="Trang lịch sử lớp" className="flex items-center gap-3">
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

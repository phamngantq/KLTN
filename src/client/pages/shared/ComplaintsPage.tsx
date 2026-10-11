import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Eye, MessageSquare, Plus, Send } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  COMPLAINT_STATUSES,
  createComplaintSchema,
  type ComplaintDetail,
  type ComplaintStatus,
  type ComplaintSummary,
  type CreateComplaintInput,
} from '../../../shared/schemas/complaints';
import type { Page } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, buttonClass } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, fieldErrors, toQuery } from '../../lib/api-client';

const LABELS: Record<ComplaintStatus, string> = {
  submitted: 'Đã gửi',
  in_review: 'Đang xem xét',
  resolved: 'Đã xử lý',
};

export function ComplaintsPage() {
  const [params] = useSearchParams();
  const classId = params.get('classId');
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [validation, setValidation] = useState('');
  const [notice, setNotice] = useState('');
  const keyRef = useRef<string | null>(null);
  const complaints = useQuery({
    queryKey: ['complaints', status, page],
    queryFn: ({ signal }) =>
      api.get<Page<ComplaintSummary>>(
        `/complaints${toQuery({ status: status || undefined, page })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({
    queryKey: ['complaint', selectedId],
    queryFn: ({ signal }) =>
      api.get<ComplaintDetail>(`/complaints/${encodeURIComponent(selectedId!)}`, { signal }),
    enabled: selectedId !== null,
  });
  const create = useMutation({
    mutationFn: ({ input, key }: { input: CreateComplaintInput; key: string }) =>
      api.post<ComplaintDetail>('/complaints', input, { headers: { 'Idempotency-Key': key } }),
    onSuccess: (created) => {
      keyRef.current = null;
      setTitle('');
      setBody('');
      setValidation('');
      setNotice(`Đã gửi khiếu nại ${created.code}.`);
      setSelectedId(created.id);
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    const input = createComplaintSchema.safeParse({ classId, title, body });
    if (!input.success) {
      setValidation(input.error.issues[0]?.message ?? 'Thông tin khiếu nại chưa hợp lệ.');
      return;
    }
    setValidation('');
    keyRef.current ??= crypto.randomUUID();
    create.mutate({ input: input.data, key: keyRef.current });
  }

  const errors = fieldErrors(create.error);
  const totalPages = Math.max(
    1,
    Math.ceil((complaints.data?.total ?? 0) / (complaints.data?.pageSize ?? 12)),
  );

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#0e2f5f]">Khiếu nại của tôi</h1>
          <p className="mt-2 text-sm text-muted">
            Quản lý và theo dõi các khiếu nại gửi đến trung tâm. Nội dung chỉ hiển thị cho bạn và
            kiểm duyệt viên.
          </p>
        </div>
        <a href="#new-complaint" className={buttonClass('primary')}>
          <Plus aria-hidden="true" className="size-4" />
          Tạo khiếu nại
        </a>
      </div>
      {isReadOnlyPreview() && (
        <Alert tone="info">Bản xem trước chỉ cho phép xem, chưa nhận khiếu nại mới.</Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}

      <form
        id="new-complaint"
        onSubmit={submit}
        className="flex max-w-2xl scroll-mt-24 flex-col gap-4 rounded-xl border border-border bg-white p-5 shadow-card sm:p-6"
      >
        <h2 className="flex items-center gap-2 text-xl font-semibold text-[#0e2f5f]">
          <MessageSquare aria-hidden="true" className="size-5" />
          Gửi khiếu nại
        </h2>
        {classId && <p className="text-sm text-muted">Khiếu nại liên quan đến lớp được chọn.</p>}
        <TextField
          label="Tiêu đề"
          value={title}
          required
          minLength={5}
          maxLength={120}
          onChange={(event) => {
            setTitle(event.target.value);
            keyRef.current = null;
          }}
          error={errors.title}
        />
        <TextareaField
          label="Nội dung"
          value={body}
          required
          minLength={10}
          maxLength={5000}
          onChange={(event) => {
            setBody(event.target.value);
            keyRef.current = null;
          }}
          error={errors.body}
          hint="Không gửi mật khẩu hoặc giấy tờ cá nhân trong nội dung."
        />
        {validation && <Alert tone="danger">{validation}</Alert>}
        {create.isError && <Alert tone="danger">{create.error.message}</Alert>}
        <div>
          <Button type="submit" loading={create.isPending} disabled={isReadOnlyPreview()}>
            <Send aria-hidden="true" className="size-4" />
            Gửi khiếu nại
          </Button>
        </div>
      </form>

      <section
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-card"
        aria-labelledby="complaint-list-heading"
      >
        <div className="border-b border-border px-4 pt-5 sm:px-6">
          <h2
            id="complaint-list-heading"
            className="flex items-center gap-2 text-xl font-semibold text-[#0e2f5f]"
          >
            <MessageSquare aria-hidden="true" className="size-5" />
            Danh sách khiếu nại
          </h2>
          <div
            role="group"
            className="mt-4 flex gap-1 overflow-x-auto"
            aria-label="Lọc trạng thái khiếu nại"
          >
            {(['', ...COMPLAINT_STATUSES] as const).map((value) => (
              <button
                key={value || 'all'}
                type="button"
                aria-pressed={status === value}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
                className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus ${status === value ? 'border-[#0e2f5f] text-[#0e2f5f]' : 'border-transparent text-muted hover:text-[#0e2f5f]'}`}
              >
                {value ? LABELS[value] : 'Tất cả'}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {complaints.isPending ? (
            <PageLoading label="Đang tải khiếu nại…" />
          ) : complaints.isError ? (
            <Alert
              tone="danger"
              action={
                <Button variant="secondary" onClick={() => void complaints.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {complaints.error.message}
            </Alert>
          ) : complaints.data.items.length === 0 ? (
            <EmptyState
              title="Chưa có khiếu nại"
              description="Khi gửi thành công, khiếu nại sẽ xuất hiện tại đây."
            />
          ) : (
            <>
              <ul className="grid gap-3">
                {complaints.data.items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-border bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#0e2f5f]">{item.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                          <span className="font-mono text-xs">{item.code}</span>
                          <span aria-hidden="true">·</span>
                          <CalendarDays aria-hidden="true" className="size-4" />
                          {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <Badge tone={item.status === 'resolved' ? 'success' : 'info'}>
                        {LABELS[item.status]}
                      </Badge>
                    </div>
                    <Button
                      variant="secondary"
                      className="mt-3"
                      onClick={() => setSelectedId(item.id)}
                    >
                      <Eye aria-hidden="true" className="size-4" />
                      Xem chi tiết
                    </Button>
                  </li>
                ))}
              </ul>
              <nav aria-label="Phân trang khiếu nại" className="flex items-center gap-3">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Trước
                </Button>
                <span>
                  Trang {page}/{totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Sau
                </Button>
              </nav>
            </>
          )}
        </div>
      </section>

      {selectedId && (
        <section
          className="max-w-2xl rounded-xl border border-border bg-white p-5 shadow-card sm:p-6"
          aria-label="Chi tiết khiếu nại"
        >
          <div className="mb-3 flex justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#0e2f5f]">Chi tiết khiếu nại</h2>
            <Button variant="secondary" onClick={() => setSelectedId(null)}>
              Đóng
            </Button>
          </div>
          {detail.isPending ? (
            <PageLoading label="Đang tải chi tiết…" />
          ) : detail.isError ? (
            <Alert
              tone="danger"
              action={
                <Button variant="secondary" onClick={() => void detail.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {detail.error.message}
            </Alert>
          ) : (
            <div className="space-y-3">
              <p className="font-medium">{detail.data.title}</p>
              <p className="whitespace-pre-wrap">{detail.data.body}</p>
              <Badge tone={detail.data.status === 'resolved' ? 'success' : 'info'}>
                {LABELS[detail.data.status]}
              </Badge>
              {detail.data.resolution && (
                <div className="rounded-md border border-success p-3">
                  <h3 className="font-medium">Kết quả xử lý</h3>
                  <p className="whitespace-pre-wrap">{detail.data.resolution}</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
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
      <PageHeader
        title="Khiếu nại của tôi"
        description="Gửi và theo dõi yêu cầu hỗ trợ. Nội dung chỉ hiển thị cho bạn và kiểm duyệt viên."
      />
      {isReadOnlyPreview() && (
        <Alert tone="info">Bản xem trước chỉ cho phép xem, chưa nhận khiếu nại mới.</Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}

      <form
        onSubmit={submit}
        className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border bg-surface p-5"
      >
        <h2 className="text-lg font-semibold">Gửi khiếu nại</h2>
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
            Gửi khiếu nại
          </Button>
        </div>
      </form>

      <div className="flex max-w-xs flex-col gap-1">
        <SelectField
          label="Lọc trạng thái"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ComplaintStatus | '');
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {COMPLAINT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {LABELS[value]}
            </option>
          ))}
        </SelectField>
      </div>
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
              <li key={item.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-sm text-muted">
                      {item.code} · {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                  <Badge tone={item.status === 'resolved' ? 'success' : 'info'}>
                    {LABELS[item.status]}
                  </Badge>
                </div>
                <Button variant="secondary" className="mt-3" onClick={() => setSelectedId(item.id)}>
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

      {selectedId && (
        <section
          className="max-w-2xl rounded-lg border border-border p-5"
          aria-label="Chi tiết khiếu nại"
        >
          <div className="mb-3 flex justify-between gap-3">
            <h2 className="text-lg font-semibold">Chi tiết khiếu nại</h2>
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

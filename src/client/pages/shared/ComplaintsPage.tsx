import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  CircleCheck,
  Clock,
  Eye,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  COMPLAINT_ATTACHMENT_MAX_COUNT,
  COMPLAINT_ATTACHMENT_TYPES,
  COMPLAINT_GROUP_KEYS,
  COMPLAINT_GROUPS,
  createComplaintSchema,
  type ComplaintCounts,
  type ComplaintDetail,
  type ComplaintGroup,
  type ComplaintStatus,
  type CreateComplaintInput,
  type OwnComplaintSummary,
} from '../../../shared/schemas/complaints';
import type { Page } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import {
  ATTACHMENT_ACCEPT,
  AttachmentLinks,
  PendingFile,
  prepareEvidence,
} from '../../components/domain/ComplaintAttachments';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { TextareaField, TextField } from '../../components/ui/Field';
import { ListFooter, StatusTabs, SummaryCard } from '../../components/ui/ListControls';
import { PageLoading } from '../../components/ui/Spinner';
import { requestDate } from '../../features/parent-requests/format';
import { api, fieldErrors, toQuery } from '../../lib/api-client';

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  draft: 'Chưa gửi',
  submitted: 'Đã gửi',
  in_review: 'Đang xử lý',
  resolved: 'Đã xử lý',
};
const STATUS_TONES: Record<ComplaintStatus, 'neutral' | 'info' | 'warning' | 'success'> = {
  draft: 'neutral',
  submitted: 'info',
  in_review: 'warning',
  resolved: 'success',
};
const GROUP_LABELS: Record<ComplaintGroup, string> = {
  draft: 'Chưa gửi',
  processing: 'Đang xử lý',
  resolved: 'Đã xử lý',
};
const PAGE_SIZES = [10, 20, 40] as const;

type Filters = { q: string; from: string; to: string };
type Editor = { mode: 'create' } | { mode: 'edit'; complaint: OwnComplaintSummary };

const isLocalDate = (value: string | null): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

function groupCount(counts: ComplaintCounts | undefined, group: ComplaintGroup) {
  if (!counts) return null;
  return COMPLAINT_GROUPS[group].reduce((sum, status) => sum + counts[status], 0);
}

export function ComplaintsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const preview = isReadOnlyPreview();
  const classId = params.get('classId');
  const groupParam = params.get('group');
  const group: ComplaintGroup = COMPLAINT_GROUP_KEYS.includes(groupParam as ComplaintGroup)
    ? (groupParam as ComplaintGroup)
    : 'draft';
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const rawSize = Number(params.get('pageSize') ?? PAGE_SIZES[0]);
  const pageSize = PAGE_SIZES.includes(rawSize as (typeof PAGE_SIZES)[number])
    ? rawSize
    : PAGE_SIZES[0];
  const applied: Filters = {
    q: params.get('q')?.slice(0, 100) ?? '',
    from: isLocalDate(params.get('from')) ? params.get('from')! : '',
    to: isLocalDate(params.get('to')) ? params.get('to')! : '',
  };
  const [filters, setFilters] = useState<Filters>(applied);
  const [editor, setEditor] = useState<Editor | null>(classId ? { mode: 'create' } : null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<OwnComplaintSummary | null>(null);
  const [notice, setNotice] = useState('');

  const counts = useQuery({
    queryKey: ['complaint-counts'],
    queryFn: ({ signal }) => api.get<ComplaintCounts>('/complaints/counts', { signal }),
  });
  const list = useQuery({
    queryKey: ['complaints', group, applied, page, pageSize],
    queryFn: ({ signal }) =>
      api.get<Page<OwnComplaintSummary>>(
        `/complaints${toQuery({
          group,
          q: applied.q || undefined,
          from: applied.from || undefined,
          to: applied.to || undefined,
          page: page > 1 ? page : undefined,
          pageSize,
        })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['complaints'] });
    void queryClient.invalidateQueries({ queryKey: ['complaint-counts'] });
  }

  const submitDraft = useMutation({
    mutationFn: (item: OwnComplaintSummary) =>
      api.post<ComplaintDetail>(`/complaints/${encodeURIComponent(item.id)}/submit`, {
        version: item.version,
      }),
    onSuccess: (sent) => {
      setNotice(`Đã gửi khiếu nại ${sent.code} đến trung tâm.`);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (item: OwnComplaintSummary) =>
      api.delete(`/complaints/${encodeURIComponent(item.id)}`, { version: item.version }),
    onSuccess: () => {
      setNotice(`Đã xóa bản nháp ${deleting?.code ?? ''}.`.trim());
      setDeleting(null);
      refresh();
    },
  });

  function navigate(
    next: Partial<Filters & { group: ComplaintGroup; page: number; pageSize: number }>,
  ) {
    const merged = { ...applied, group, page: 1, pageSize, ...next };
    const search = new URLSearchParams();
    if (merged.group !== 'draft') search.set('group', merged.group);
    for (const key of ['q', 'from', 'to'] as const) if (merged[key]) search.set(key, merged[key]);
    if (merged.page > 1) search.set('page', String(merged.page));
    if (merged.pageSize !== PAGE_SIZES[0]) search.set('pageSize', String(merged.pageSize));
    setParams(search);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...filters, q: filters.q.trim() });
  }

  function resetFilters() {
    const empty = { q: '', from: '', to: '' };
    setFilters(empty);
    navigate(empty);
    refresh();
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-primary">Khiếu nại của tôi</h1>
          <p className="mt-1 text-sm text-muted">
            Quản lý và theo dõi các khiếu nại gửi đến trung tâm
          </p>
        </div>
        {!preview && (
          <Button
            className="gap-2"
            onClick={() => {
              setNotice('');
              setEditor({ mode: 'create' });
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            Tạo khiếu nại
          </Button>
        )}
      </div>
      {preview && (
        <Alert tone="info">Bản xem trước chỉ cho phép xem, chưa nhận khiếu nại mới.</Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {(submitDraft.isError || remove.isError) && (
        <Alert tone="danger" title="Chưa thực hiện được thao tác">
          {(submitDraft.error ?? remove.error)?.message}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label={GROUP_LABELS.draft}
          value={groupCount(counts.data, 'draft')}
          unit="khiếu nại"
          icon={Clock}
          active={group === 'draft'}
          onSelect={() => navigate({ group: 'draft' })}
        />
        <SummaryCard
          label={GROUP_LABELS.processing}
          value={groupCount(counts.data, 'processing')}
          unit="khiếu nại"
          icon={CircleAlert}
          tone="info"
          active={group === 'processing'}
          onSelect={() => navigate({ group: 'processing' })}
        />
        <SummaryCard
          label={GROUP_LABELS.resolved}
          value={groupCount(counts.data, 'resolved')}
          unit="khiếu nại"
          icon={CircleCheck}
          tone="success"
          active={group === 'resolved'}
          onSelect={() => navigate({ group: 'resolved' })}
        />
      </div>

      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-xl border border-border bg-bg p-4 shadow-card md:grid-cols-2 xl:grid-cols-[minmax(0,3fr)_repeat(2,minmax(0,1fr))_auto] xl:items-end"
      >
        <TextField
          label="Từ khóa"
          type="search"
          placeholder="Mã, tiêu đề, nội dung…"
          maxLength={100}
          value={filters.q}
          onChange={(event) => setFilters({ ...filters, q: event.target.value })}
        />
        <TextField
          label="Từ ngày"
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(event) => setFilters({ ...filters, from: event.target.value })}
        />
        <TextField
          label="Đến ngày"
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(event) => setFilters({ ...filters, to: event.target.value })}
        />
        <div className="flex gap-2">
          <Button type="submit" className="gap-2">
            <Filter aria-hidden="true" className="size-4" />
            Lọc
          </Button>
          <Button type="button" variant="secondary" className="gap-2" onClick={resetFilters}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Làm mới
          </Button>
        </div>
      </form>

      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-bg shadow-card">
        <StatusTabs
          label="Trạng thái khiếu nại"
          tabs={COMPLAINT_GROUP_KEYS.map((key) => ({
            key,
            label: GROUP_LABELS[key],
            count: groupCount(counts.data, key),
          }))}
          selected={group}
          onSelect={(key) => navigate({ group: key })}
        />
        {list.isPending ? (
          <div className="p-6">
            <PageLoading label="Đang tải khiếu nại…" />
          </div>
        ) : list.isError ? (
          <div className="p-4">
            <Alert
              tone="danger"
              title="Không tải được khiếu nại"
              action={
                <Button variant="secondary" onClick={() => void list.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {list.error.message}
            </Alert>
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Chưa có khiếu nại phù hợp"
              description="Không có khiếu nại nào khớp với tab và bộ lọc hiện tại."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
                  <tr>
                    {['Mã', 'Tiêu đề / Nội dung', 'Ngày tạo', 'Trạng thái'].map((label) => (
                      <th key={label} scope="col" className="px-4 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.data.items.map((item) => (
                    <tr key={item.id} className="hover:bg-surface">
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted">
                        {item.code}
                      </td>
                      <td className="max-w-xl px-4 py-3">
                        <p className="font-semibold text-primary">{item.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{item.body}</p>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                        {requestDate(item.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {item.status === 'draft' && !preview ? (
                            <>
                              <RowAction
                                label={`Sửa ${item.code}`}
                                onClick={() => {
                                  setNotice('');
                                  setEditor({ mode: 'edit', complaint: item });
                                }}
                              >
                                <Pencil aria-hidden="true" className="size-4" />
                                Sửa
                              </RowAction>
                              <RowAction
                                label={`Gửi ${item.code}`}
                                emphasis
                                disabled={submitDraft.isPending}
                                onClick={() => {
                                  setNotice('');
                                  submitDraft.mutate(item);
                                }}
                              >
                                <Send aria-hidden="true" className="size-4" />
                                Gửi
                              </RowAction>
                              <RowAction
                                label={`Xóa ${item.code}`}
                                danger
                                onClick={() => setDeleting(item)}
                              >
                                <Trash2 aria-hidden="true" className="size-4" />
                              </RowAction>
                            </>
                          ) : (
                            <RowAction
                              label={`Xem ${item.code}`}
                              onClick={() => setViewingId(item.id)}
                            >
                              <Eye aria-hidden="true" className="size-4" />
                              Xem
                            </RowAction>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListFooter
              page={page}
              pageSize={pageSize}
              pageSizes={PAGE_SIZES}
              shown={list.data.items.length}
              total={list.data.total}
              navigationLabel="Trang khiếu nại"
              onPage={(next) => navigate({ page: next })}
              onPageSize={(size) => navigate({ pageSize: size })}
            />
          </>
        )}
      </div>

      {editor && (
        <ComplaintEditor
          key={editor.mode === 'edit' ? editor.complaint.id : 'new'}
          editor={editor}
          classId={classId}
          onClose={() => {
            setEditor(null);
            refresh(); // a failed upload may already have saved the draft
          }}
          onSaved={(saved, sent) => {
            setEditor(null);
            setNotice(
              sent
                ? `Đã gửi khiếu nại ${saved.code} đến trung tâm.`
                : `Đã lưu bản nháp ${saved.code}.`,
            );
            refresh();
            if (sent && group === 'draft') navigate({ group: 'processing' });
          }}
        />
      )}
      {viewingId && <ComplaintViewer id={viewingId} onClose={() => setViewingId(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        title="Xóa bản nháp khiếu nại"
        description={`Bản nháp ${deleting?.code ?? ''} sẽ bị xóa và không khôi phục được.`}
        confirmLabel="Xóa bản nháp"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

function RowAction({
  label,
  onClick,
  disabled,
  emphasis,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 ${
        danger
          ? 'border-danger/40 text-danger hover:bg-danger-surface'
          : emphasis
            ? 'border-primary text-primary hover:bg-info-surface'
            : 'border-border text-fg hover:bg-surface'
      }`}
    >
      {children}
    </button>
  );
}

/** Native <dialog> shell: focus trap, Escape and focus return come from the browser. */
function Modal({
  title,
  onClose,
  locked = false,
  children,
}: {
  title: string;
  onClose: () => void;
  locked?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  const titleId = `${title.replace(/\W+/g, '-')}-title`;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) onClose();
      }}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-xl border border-border bg-bg p-0 text-fg shadow-card backdrop:bg-fg/40"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-lg font-semibold text-primary">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

function ComplaintEditor({
  editor,
  classId,
  onClose,
  onSaved,
}: {
  editor: Editor;
  classId: string | null;
  onClose: () => void;
  onSaved: (saved: ComplaintDetail, sent: boolean) => void;
}) {
  const existing = editor.mode === 'edit' ? editor.complaint : null;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [localError, setLocalError] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const keyRef = useRef<string | null>(null);
  // Set once the draft exists, so a retry after a failed upload edits it instead of re-creating.
  const draftRef = useRef<{ id: string; version: number } | null>(
    existing ? { id: existing.id, version: existing.version } : null,
  );
  const linkedClass = existing ? existing.classId : classId;
  const current = useQuery({
    queryKey: ['complaint', existing?.id],
    queryFn: ({ signal }) =>
      api.get<ComplaintDetail>(`/complaints/${encodeURIComponent(existing!.id)}`, { signal }),
    enabled: existing !== null,
  });
  const kept = (current.data?.attachments ?? []).filter((item) => !removed.includes(item.id));
  const roomLeft = COMPLAINT_ATTACHMENT_MAX_COUNT - kept.length - files.length;

  const save = useMutation({
    mutationFn: async ({ input, send }: { input: CreateComplaintInput; send: boolean }) => {
      let draft: ComplaintDetail;
      if (!draftRef.current) {
        keyRef.current ??= crypto.randomUUID();
        // Always start as a draft: evidence can only be attached before sending.
        draft = await api.post<ComplaintDetail>(
          '/complaints',
          { ...input, submit: false },
          { headers: { 'Idempotency-Key': keyRef.current } },
        );
      } else {
        draft = await api.patch<ComplaintDetail>(
          `/complaints/${encodeURIComponent(draftRef.current.id)}`,
          {
            classId: input.classId,
            title: input.title,
            body: input.body,
            version: draftRef.current.version,
          },
        );
      }
      draftRef.current = { id: draft.id, version: draft.version };
      setDraftSaved(true);
      const path = `/complaints/${encodeURIComponent(draft.id)}`;
      for (const attachmentId of removed) {
        await api.delete(`${path}/attachments/${encodeURIComponent(attachmentId)}`);
        setRemoved((list) => list.filter((value) => value !== attachmentId));
      }
      for (const file of files) {
        const form = new FormData();
        form.set('file', await prepareEvidence(file));
        await api.upload(`${path}/attachments`, form);
        setFiles((list) => list.filter((value) => value !== file));
      }
      return send
        ? api.post<ComplaintDetail>(`${path}/submit`, { version: draft.version })
        : api.get<ComplaintDetail>(path);
    },
    onSuccess: (saved, { send }) => onSaved(saved, send),
  });

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const chosen = [...list];
    const rejected = chosen.find(
      (file) => !(COMPLAINT_ATTACHMENT_TYPES as readonly string[]).includes(file.type),
    );
    if (rejected) {
      setLocalError(`${rejected.name}: chỉ nhận ảnh JPG, PNG, WebP hoặc tệp PDF.`);
      return;
    }
    if (chosen.length > roomLeft) {
      setLocalError(`Mỗi khiếu nại có tối đa ${COMPLAINT_ATTACHMENT_MAX_COUNT} tệp minh chứng.`);
      return;
    }
    setLocalError('');
    setFiles((current) => [...current, ...chosen]);
  }

  function persist(send: boolean) {
    const parsed = createComplaintSchema.safeParse({ classId: linkedClass, title, body });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Thông tin khiếu nại chưa hợp lệ.');
      return;
    }
    setLocalError('');
    save.mutate({ input: parsed.data, send });
  }

  const errors = fieldErrors(save.error);
  return (
    <Modal
      title={existing ? `Sửa khiếu nại ${existing.code}` : 'Tạo khiếu nại'}
      onClose={onClose}
      locked={save.isPending}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          persist(true);
        }}
      >
        {linkedClass && <p className="text-sm text-muted">Khiếu nại liên quan đến lớp đã chọn.</p>}
        <TextField
          label="Tiêu đề"
          required
          maxLength={120}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            keyRef.current = null;
          }}
          error={errors.title}
        />
        <TextareaField
          label="Nội dung"
          required
          maxLength={5000}
          hint="Mô tả sự việc, thời gian và mong muốn của bạn. Nội dung chỉ bạn và kiểm duyệt viên xem được."
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            keyRef.current = null;
          }}
          error={errors.body}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="complaint-evidence" className="text-sm font-medium text-fg">
            Đính kèm minh chứng
          </label>
          <input
            id="complaint-evidence"
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            disabled={save.isPending || roomLeft <= 0}
            aria-describedby="complaint-evidence-hint"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }}
            className="text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-border file:bg-surface file:px-4 file:text-sm file:font-medium file:text-primary"
          />
          <p id="complaint-evidence-hint" className="text-xs text-muted">
            Ảnh JPG, PNG, WebP hoặc PDF; tối đa {COMPLAINT_ATTACHMENT_MAX_COUNT} tệp, mỗi tệp 1,5
            MB. Ảnh lớn được tự thu nhỏ. Minh chứng chỉ bạn và kiểm duyệt viên xem được.
          </p>
          {(kept.length > 0 || files.length > 0) && (
            <ul className="flex flex-col gap-2">
              {kept.map((item) => (
                <PendingFile
                  key={item.id}
                  name={item.fileName}
                  size={item.sizeBytes}
                  disabled={save.isPending}
                  onRemove={() => setRemoved((list) => [...list, item.id])}
                />
              ))}
              {files.map((file, index) => (
                <PendingFile
                  key={`${file.name}-${index}`}
                  name={file.name}
                  size={file.size}
                  disabled={save.isPending}
                  onRemove={() => setFiles((list) => list.filter((value) => value !== file))}
                />
              ))}
            </ul>
          )}
        </div>
        {(localError || (save.isError && !Object.keys(errors).length)) && (
          <p role="alert" className="text-sm text-danger">
            {localError || save.error?.message}
          </p>
        )}
        {save.isError && draftSaved && !existing && (
          <p className="text-xs text-muted">
            Khiếu nại đã được lưu nháp; bạn có thể thử lại hoặc mở lại từ tab “Chưa gửi”.
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={save.isPending && save.variables?.send === false}
            disabled={save.isPending}
            onClick={() => persist(false)}
          >
            Lưu nháp
          </Button>
          <Button
            type="submit"
            className="gap-2"
            loading={save.isPending && save.variables?.send === true}
            disabled={save.isPending}
          >
            <Send aria-hidden="true" className="size-4" />
            Gửi khiếu nại
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ComplaintViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['complaint', id],
    queryFn: ({ signal }) =>
      api.get<ComplaintDetail>(`/complaints/${encodeURIComponent(id)}`, { signal }),
  });
  return (
    <Modal title="Chi tiết khiếu nại" onClose={onClose}>
      {detail.isPending ? (
        <PageLoading label="Đang tải khiếu nại…" />
      ) : detail.isError ? (
        <Alert tone="danger">{detail.error.message}</Alert>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted">{detail.data.code}</span>
            <Badge tone={STATUS_TONES[detail.data.status]}>
              {STATUS_LABELS[detail.data.status]}
            </Badge>
          </div>
          <p className="text-base font-semibold text-primary">{detail.data.title}</p>
          <p className="whitespace-pre-line break-words">{detail.data.body}</p>
          <dl className="grid gap-1 text-xs text-muted sm:grid-cols-2">
            <div>
              <dt className="inline">Ngày tạo: </dt>
              <dd className="inline">{requestDate(detail.data.createdAt)}</dd>
            </div>
            {detail.data.submittedAt && (
              <div>
                <dt className="inline">Ngày gửi: </dt>
                <dd className="inline">{requestDate(detail.data.submittedAt)}</dd>
              </div>
            )}
          </dl>
          <AttachmentLinks
            attachments={detail.data.attachments}
            basePath={`/complaints/${encodeURIComponent(detail.data.id)}`}
          />
          {detail.data.resolution && (
            <div className="rounded-lg border border-success bg-success-surface p-3">
              <p className="font-semibold text-success">Kết quả xử lý</p>
              <p className="mt-1 whitespace-pre-line break-words">{detail.data.resolution}</p>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </Modal>
  );
}

import { useState, type FormEvent } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Link } from 'react-router';
import {
  CONTENT_AUDIENCES,
  CONTENT_KINDS,
  CONTENT_STATUSES,
  createContentSchema,
  editContentSchema,
  type AdminContent,
  type ContentAudience,
  type ContentKind,
  type ContentStatus,
} from '../../../shared/schemas/content';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Spinner';
import {
  useAdminContent,
  useAdminContentList,
  useContentActions,
} from '../../features/content/api';
import { fieldErrors } from '../../lib/api-client';
import { ContentText } from '../public/PublishedContentPage';

const KIND_LABELS: Record<ContentKind, string> = {
  page: 'Trang giới thiệu',
  service: 'Dịch vụ',
  blog: 'Bài viết',
  faq: 'Câu hỏi thường gặp',
  guide: 'Hướng dẫn',
  contract: 'Hợp đồng',
  terms: 'Điều khoản',
};
const AUDIENCE_LABELS: Record<ContentAudience, string> = {
  public: 'Công khai',
  parent: 'Phụ huynh',
  tutor: 'Gia sư',
};
const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Bản nháp',
  published: 'Đã công bố',
  retired: 'Đã ngừng công bố',
};

interface EditorForm {
  kind: ContentKind;
  slug: string;
  audience: ContentAudience;
  title: string;
  summary: string;
  bodyText: string;
}

function emptyForm(kind: ContentKind, audience: ContentAudience): EditorForm {
  return { kind, slug: '', audience, title: '', summary: '', bodyText: '' };
}
function formFromContent(item: AdminContent): EditorForm {
  return {
    kind: item.kind,
    slug: item.slug,
    audience: item.audience,
    title: item.title,
    summary: item.summary,
    bodyText: item.bodyText,
  };
}

export function AdminContentPage({
  kind,
  title = 'Quản lý nội dung',
  defaultAudience = 'public',
}: {
  kind?: ContentKind;
  title?: string;
  defaultAudience?: ContentAudience;
}) {
  const [filterKind, setFilterKind] = useState<ContentKind | ''>(kind ?? '');
  const [filterStatus, setFilterStatus] = useState<ContentStatus | ''>('');
  const [filterAudience, setFilterAudience] = useState<ContentAudience | ''>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EditorForm>(() => emptyForm(kind ?? 'page', defaultAudience));
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [confirmation, setConfirmation] = useState<'publish' | 'retire' | null>(null);
  const list = useAdminContentList({
    kind: kind ?? (filterKind || undefined),
    audience: filterAudience || undefined,
    status: filterStatus || undefined,
    page,
    pageSize: 12,
  });
  const detail = useAdminContent(selectedId);
  const actions = useContentActions();
  const current = selectedId ? detail.data : null;
  const readOnly = isReadOnlyPreview();
  const busy =
    actions.create.isPending ||
    actions.edit.isPending ||
    actions.revise.isPending ||
    actions.publish.isPending ||
    actions.retire.isPending;
  const actionError =
    actions.create.error ||
    actions.edit.error ||
    actions.revise.error ||
    actions.publish.error ||
    actions.retire.error;
  const errors = fieldErrors(actionError);
  const dirty =
    current?.status === 'draft' &&
    (form.title !== current.title ||
      form.summary !== current.summary ||
      form.bodyText !== current.bodyText);
  const blogCategory = form.slug.startsWith('gia-su-') ? 'gia-su' : 'phu-huynh';
  const blogSlug = form.slug.replace(/^(phu-huynh|gia-su)-/, '');

  function resetEditor() {
    setSelectedId(null);
    setForm(emptyForm(kind ?? 'page', defaultAudience));
    setNotice('');
    setLocalError('');
  }

  function select(item: AdminContent) {
    setSelectedId(item.id);
    setForm(formFromContent(item));
    setNotice('');
    setLocalError('');
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setLocalError('');
    if (readOnly || busy) return;
    if (!current) {
      const parsed = createContentSchema.safeParse(form);
      if (!parsed.success) {
        setLocalError(parsed.error.issues[0]?.message ?? 'Nội dung chưa hợp lệ.');
        return;
      }
      actions.create.mutate(parsed.data, {
        onSuccess: (item) => {
          setSelectedId(item.id);
          setForm(formFromContent(item));
          setNotice('Đã lưu bản nháp. Nội dung chỉ hiển thị công khai sau khi được công bố.');
        },
      });
      return;
    }
    if (current.status !== 'draft') return;
    const parsed = editContentSchema.safeParse({
      title: form.title,
      summary: form.summary,
      bodyText: form.bodyText,
      editVersion: current.editVersion,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Nội dung chưa hợp lệ.');
      return;
    }
    actions.edit.mutate(
      { id: current.id, input: parsed.data },
      {
        onSuccess: (item) => {
          setForm(formFromContent(item));
          setNotice('Đã lưu thay đổi vào bản nháp.');
        },
      },
    );
  }

  function revise() {
    if (!current || readOnly || busy) return;
    setNotice('');
    actions.revise.mutate(
      { id: current.id, editVersion: current.editVersion },
      {
        onSuccess: (draft) => {
          setSelectedId(draft.id);
          setForm(formFromContent(draft));
          setNotice('Đã tạo bản nháp mới từ phiên bản được công bố.');
        },
      },
    );
  }

  function confirmTransition() {
    if (!current || !confirmation || readOnly || busy) return;
    const input = { id: current.id, editVersion: current.editVersion };
    if (confirmation === 'publish') {
      actions.publish.mutate(input, {
        onSuccess: () => {
          setConfirmation(null);
          setNotice('Nội dung đã được công bố.');
        },
      });
    } else {
      actions.retire.mutate(input, {
        onSuccess: () => {
          setConfirmation(null);
          setNotice('Nội dung đã ngừng công bố.');
        },
      });
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#0e2f5f]">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Biên tập bản nháp, xem trước nội dung và công bố phiên bản đã duyệt. Nội dung công bố
            được giữ nguyên để đối chiếu lịch sử.
          </p>
        </div>
        <Button variant="accent" onClick={resetEditor}>
          <Plus aria-hidden="true" className="size-4" />
          Tạo nội dung mới
        </Button>
      </div>
      {kind === 'terms' && (
        <nav aria-label="Quản lý điều khoản" className="grid gap-2 sm:grid-cols-2">
          <Link
            to="/admin/content/terms"
            aria-current="page"
            className="flex min-h-11 items-center justify-center rounded-lg border border-[#0e2f5f] bg-[#0e2f5f] px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Nội dung điều khoản
          </Link>
          <Link
            to="/admin/terms/quiz"
            className="flex min-h-11 items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-[#0e2f5f] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Bài kiểm tra điều khoản
          </Link>
        </nav>
      )}
      {readOnly && <Alert tone="info">Bản xem trước chỉ cho phép đọc nội dung.</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {actionError && <Alert tone="danger">{actionError.message}</Alert>}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section
          className="min-w-0 space-y-5 rounded-xl border border-border bg-white p-4 shadow-card sm:p-6"
          aria-labelledby="content-list-heading"
        >
          <h2
            id="content-list-heading"
            className="flex items-center gap-2 text-xl font-semibold text-[#0e2f5f]"
          >
            <FileText aria-hidden="true" className="size-5" />
            Các phiên bản nội dung
          </h2>
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
            {!kind && (
              <SelectField
                label="Loại"
                value={filterKind}
                onChange={(event) => {
                  setFilterKind(event.target.value as ContentKind | '');
                  setPage(1);
                }}
              >
                <option value="">Tất cả</option>
                {CONTENT_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {KIND_LABELS[value]}
                  </option>
                ))}
              </SelectField>
            )}
            <SelectField
              label="Đối tượng"
              value={filterAudience}
              onChange={(event) => {
                setFilterAudience(event.target.value as ContentAudience | '');
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              {CONTENT_AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {AUDIENCE_LABELS[value]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Trạng thái"
              value={filterStatus}
              onChange={(event) => {
                setFilterStatus(event.target.value as ContentStatus | '');
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              {CONTENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </SelectField>
          </div>
          {list.isPending ? (
            <div aria-busy="true" className="space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-20" />
              ))}
            </div>
          ) : list.isError ? (
            <Alert
              tone="danger"
              title="Không tải được nội dung"
              action={
                <Button variant="secondary" onClick={() => void list.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {list.error.message}
            </Alert>
          ) : list.data.items.length === 0 ? (
            <EmptyState title="Chưa có nội dung" />
          ) : (
            <>
              <ul className="space-y-3">
                {list.data.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => select(item)}
                      aria-current={selectedId === item.id ? 'true' : undefined}
                      className={`flex min-h-20 w-full flex-col items-start gap-2 rounded-xl border bg-white p-4 text-left transition-shadow hover:border-[#0e2f5f] hover:shadow-md focus-visible:outline-2 focus-visible:outline-focus ${selectedId === item.id ? 'border-[#0e2f5f] shadow-md' : 'border-border'}`}
                    >
                      <span className="flex w-full flex-wrap items-center gap-2">
                        <span className="font-semibold text-[#0e2f5f]">{item.title}</span>
                        <Badge
                          tone={
                            item.status === 'published'
                              ? 'success'
                              : item.status === 'draft'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {STATUS_LABELS[item.status]}
                        </Badge>
                      </span>
                      <span className="text-xs text-muted">
                        {KIND_LABELS[item.kind]} · {AUDIENCE_LABELS[item.audience]} · {item.slug} ·
                        phiên bản {item.revision}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {list.data.total > list.data.pageSize && (
                <nav
                  aria-label="Trang nội dung quản trị"
                  className="flex items-center justify-between gap-2"
                >
                  <Button
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Trước
                  </Button>
                  <span className="text-sm text-muted">
                    {page} / {Math.ceil(list.data.total / list.data.pageSize)}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={page * list.data.pageSize >= list.data.total}
                    onClick={() => setPage(page + 1)}
                  >
                    Sau
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>

        <section
          className="min-w-0 rounded-xl border border-border bg-white p-4 shadow-card sm:p-6"
          aria-labelledby="content-editor-heading"
        >
          <h2
            id="content-editor-heading"
            className="flex items-center gap-2 text-xl font-semibold text-[#0e2f5f]"
          >
            <FileText aria-hidden="true" className="size-5 shrink-0" />
            {current ? `Phiên bản ${current.revision}: ${current.title}` : 'Tạo bản nháp'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {current?.status === 'published'
              ? 'Phiên bản đã công bố được giữ nguyên. Tạo bản nháp mới để chỉnh sửa.'
              : 'Nội dung chỉ hiển thị cho người đọc sau khi được công bố.'}
          </p>
          {selectedId && detail.isPending ? (
            <Skeleton className="mt-4 h-80" />
          ) : selectedId && detail.isError ? (
            <Alert
              tone="danger"
              title="Không tải được phiên bản"
              action={
                <Button variant="secondary" onClick={() => void detail.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {detail.error.message}
            </Alert>
          ) : (
            <>
              {current?.status !== 'draft' && current ? (
                <div className="mt-5 space-y-4">
                  <p className="text-sm text-muted">
                    {KIND_LABELS[current.kind]} · {AUDIENCE_LABELS[current.audience]} ·{' '}
                    {STATUS_LABELS[current.status]}
                    {current.publishedAt && (
                      <> · công bố {new Date(current.publishedAt).toLocaleDateString('vi-VN')}</>
                    )}
                  </p>
                  <p className="font-medium">{current.summary}</p>
                  <ContentText text={current.bodyText} />
                  {current.status === 'published' && (
                    <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                      <Button
                        variant="secondary"
                        onClick={revise}
                        loading={actions.revise.isPending}
                        disabled={readOnly || busy}
                      >
                        Tạo bản nháp mới
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => setConfirmation('retire')}
                        disabled={readOnly || busy}
                      >
                        Ngừng công bố
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={save} className="mt-5 space-y-5 border-t border-border pt-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label="Loại nội dung"
                      value={form.kind}
                      disabled={Boolean(current) || Boolean(kind)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          kind: event.target.value as ContentKind,
                          slug: '',
                          audience: event.target.value === 'blog' ? 'public' : form.audience,
                        })
                      }
                      required
                    >
                      {CONTENT_KINDS.map((value) => (
                        <option key={value} value={value}>
                          {KIND_LABELS[value]}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Đối tượng đọc"
                      value={form.audience}
                      disabled={Boolean(current) || form.kind === 'blog'}
                      onChange={(event) =>
                        setForm({ ...form, audience: event.target.value as ContentAudience })
                      }
                      required
                    >
                      {CONTENT_AUDIENCES.map((value) => (
                        <option key={value} value={value}>
                          {AUDIENCE_LABELS[value]}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  {form.kind === 'blog' && (
                    <SelectField
                      label="Danh mục bài viết"
                      value={blogCategory}
                      disabled={Boolean(current)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          slug: `${event.target.value}-${blogSlug}`,
                          audience: 'public',
                        })
                      }
                    >
                      <option value="phu-huynh">Phụ huynh</option>
                      <option value="gia-su">Gia sư</option>
                    </SelectField>
                  )}
                  <TextField
                    label="Đường dẫn"
                    value={form.kind === 'blog' ? blogSlug : form.slug}
                    disabled={Boolean(current)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        slug:
                          form.kind === 'blog'
                            ? `${blogCategory}-${event.target.value.toLowerCase()}`
                            : event.target.value.toLowerCase(),
                      })
                    }
                    hint={
                      form.kind === 'blog'
                        ? `Đường dẫn công khai: /blog/${blogCategory}/${blogCategory}-${blogSlug || 'ten-bai-viet'}`
                        : 'Chữ thường, số và dấu gạch ngang. Ví dụ: contact, pricing, tutor-responsibility.'
                    }
                    error={errors.slug}
                    maxLength={form.kind === 'blog' ? 100 - blogCategory.length - 1 : 100}
                    required
                  />
                  <TextField
                    label="Tiêu đề"
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    error={errors.title}
                    maxLength={160}
                    required
                  />
                  <TextareaField
                    label="Mô tả ngắn"
                    value={form.summary}
                    onChange={(event) => setForm({ ...form, summary: event.target.value })}
                    error={errors.summary}
                    maxLength={500}
                  />
                  <TextareaField
                    label="Nội dung văn bản"
                    value={form.bodyText}
                    onChange={(event) => setForm({ ...form, bodyText: event.target.value })}
                    hint="Văn bản thuần; xuống dòng để tách đoạn. Mã HTML và tệp đính kèm không được thực thi."
                    error={errors.bodyText}
                    maxLength={20_000}
                    rows={12}
                    required
                  />
                  {localError && <Alert tone="danger">{localError}</Alert>}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      loading={actions.create.isPending || actions.edit.isPending}
                      disabled={readOnly || busy || (Boolean(current) && !dirty)}
                    >
                      {current ? 'Lưu bản nháp' : 'Tạo bản nháp'}
                    </Button>
                    {current && (
                      <Button
                        variant="secondary"
                        disabled={readOnly || busy || Boolean(dirty)}
                        onClick={() => setConfirmation('publish')}
                      >
                        Công bố
                      </Button>
                    )}
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation === 'retire' ? 'Ngừng công bố nội dung?' : 'Công bố nội dung?'}
        description={
          confirmation === 'retire'
            ? 'Phiên bản này sẽ không còn hiển thị trên trang công khai. Lịch sử vẫn được giữ.'
            : 'Nội dung này sẽ xuất hiện cho đúng nhóm người đọc. Phiên bản trước sẽ được lưu trong lịch sử.'
        }
        confirmLabel={confirmation === 'retire' ? 'Ngừng công bố' : 'Công bố'}
        tone={confirmation === 'retire' ? 'danger' : 'primary'}
        loading={actions.publish.isPending || actions.retire.isPending}
        onConfirm={confirmTransition}
        onCancel={() => setConfirmation(null)}
      />
    </section>
  );
}

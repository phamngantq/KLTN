import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarDays, CircleCheck, CircleX, EyeOff, GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ADMIN_FILTER_LABELS,
  ADMIN_TUTOR_FILTERS,
  type AdminTutor,
  type AdminTutorFilter,
  type ModerationAction,
} from '../../../shared/schemas/admin';
import type { Page } from '../../../shared/schemas/discovery';
import { teachingModes } from '../../components/domain/TutorCard';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { TextareaField } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Spinner';
import { api, fieldErrors, toQuery } from '../../lib/api-client';
import { formatDate, formatVnd } from '../../lib/format';

const ADMIN_TUTORS_KEY = ['admin-tutors'] as const;

const ACTION_LABELS: Record<ModerationAction, string> = {
  approve: 'Duyệt & công khai',
  reject: 'Từ chối',
  hide: 'Ẩn khỏi tìm kiếm',
};

/** Actions offered per queue (the server re-checks the actual state). */
const ACTIONS_FOR: Record<AdminTutorFilter, ModerationAction[]> = {
  pending: ['approve', 'reject'],
  approved: ['hide', 'reject'],
  hidden: ['approve', 'reject'],
  rejected: [],
  draft: [],
};

export function AdminTutorsPage() {
  const [params, setParams] = useSearchParams();
  const filter = (ADMIN_TUTOR_FILTERS.find((f) => f === params.get('status')) ??
    'pending') as AdminTutorFilter;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: [...ADMIN_TUTORS_KEY, filter, page],
    queryFn: ({ signal }) =>
      api.get<Page<AdminTutor>>(`/admin/tutors${toQuery({ status: filter, page })}`, { signal }),
    placeholderData: keepPreviousData,
  });
  const mutation = useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: ModerationAction;
      reason?: string;
    }) =>
      api.post<AdminTutor>(
        `/admin/tutors/${encodeURIComponent(id)}/${action}`,
        reason ? { reason } : {},
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ADMIN_TUTORS_KEY }),
  });
  const [dialog, setDialog] = useState<{ tutor: AdminTutor; action: ModerationAction } | null>(
    null,
  );
  const [reason, setReason] = useState('');
  const [reasonMissing, setReasonMissing] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  function open(tutor: AdminTutor, action: ModerationAction) {
    mutation.reset();
    setReason('');
    setReasonMissing(false);
    setNotice(null);
    setDialog({ tutor, action });
  }

  function submit() {
    if (!dialog) return;
    mutation.mutate(
      {
        id: dialog.tutor.userId,
        action: dialog.action,
        ...(reason.trim() && { reason: reason.trim() }),
      },
      {
        onSuccess: (updated) => {
          setDialog(null);
          setNotice({
            tone: 'success',
            text: `${ACTION_LABELS[dialog.action]}: ${updated.displayName}.`,
          });
        },
      },
    );
  }

  const data = list.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reasonRequired = dialog?.action === 'reject' || dialog?.action === 'hide';
  const errors = fieldErrors(mutation.error);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Duyệt gia sư"
        description="Chỉ hồ sơ đã duyệt và công khai mới xuất hiện trong tìm kiếm."
      />
      <nav
        aria-label="Hàng đợi"
        className="overflow-x-auto rounded-xl border border-primary/20 bg-bg p-3 shadow-card"
      >
        <ul className="flex min-w-max gap-2">
          {ADMIN_TUTOR_FILTERS.map((f) => (
            <li key={f}>
              <Link
                to={`?status=${f}`}
                aria-current={f === filter ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  f === filter ? 'bg-accent text-on-accent' : 'text-primary hover:bg-info-surface'
                }`}
              >
                {ADMIN_FILTER_LABELS[f]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div aria-live="polite" aria-busy={list.isFetching}>
        {list.isPending ? (
          <Skeleton className="h-40" />
        ) : list.isError ? (
          <Alert
            tone="danger"
            title="Không tải được hàng đợi"
            action={
              <Button variant="secondary" onClick={() => void list.refetch()}>
                Thử lại
              </Button>
            }
          >
            {list.error.message}
          </Alert>
        ) : list.data.items.length === 0 ? (
          <EmptyState title={`Không có hồ sơ "${ADMIN_FILTER_LABELS[filter]}"`} />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {list.data.items.map((tutor) => (
              <li key={tutor.userId} className="min-w-0">
                <article className="flex h-full flex-col gap-4 rounded-xl border border-primary/20 border-l-4 border-l-accent bg-bg p-5 shadow-card transition-shadow hover:shadow-lg">
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-info-surface text-primary"
                    >
                      <GraduationCap size={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-primary">{tutor.displayName}</h2>
                      <p className="break-all text-sm text-muted">{tutor.email}</p>
                    </div>
                    <Badge
                      tone={
                        filter === 'approved'
                          ? 'success'
                          : filter === 'pending'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {ADMIN_FILTER_LABELS[filter]}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="flex items-start gap-2">
                      <BookOpen
                        aria-hidden="true"
                        size={17}
                        className="mt-0.5 shrink-0 text-warning"
                      />
                      <span>
                        {tutor.subjects.map((s) => s.name).join(', ') || 'Chưa chọn môn'} ·{' '}
                        {teachingModes(tutor) || 'Chưa chọn hình thức'} ·{' '}
                        {tutor.hourlyRateMinor !== null
                          ? `${formatVnd(tutor.hourlyRateMinor)}/giờ`
                          : 'Chưa có học phí'}
                      </span>
                    </p>
                    <p className="flex items-center gap-2 text-muted">
                      <CalendarDays
                        aria-hidden="true"
                        size={17}
                        className="shrink-0 text-warning"
                      />
                      Cập nhật {formatDate(tutor.updatedAt, 'Asia/Ho_Chi_Minh')}
                    </p>
                  </div>
                  <p className="whitespace-pre-line rounded-md bg-surface p-3 text-sm text-muted">
                    {tutor.bio || '(Chưa có giới thiệu)'}
                  </p>
                  {tutor.moderationNote && (
                    <p className="rounded-md border-l-4 border-warning bg-warning-surface p-3 text-sm">
                      <strong>Ghi chú kiểm duyệt:</strong> {tutor.moderationNote}
                    </p>
                  )}
                  {ACTIONS_FOR[filter].length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
                      {ACTIONS_FOR[filter].map((action) => {
                        const Icon =
                          action === 'approve'
                            ? CircleCheck
                            : action === 'reject'
                              ? CircleX
                              : EyeOff;
                        return (
                          <Button
                            key={action}
                            size="sm"
                            variant={
                              action === 'approve'
                                ? 'primary'
                                : action === 'reject'
                                  ? 'danger'
                                  : 'secondary'
                            }
                            onClick={() => open(tutor, action)}
                          >
                            <Icon aria-hidden="true" size={16} />
                            {ACTION_LABELS[action]}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
        {data && totalPages > 1 && (
          <nav aria-label="Phân trang" className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setParams({ status: filter, page: String(page - 1) })}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page}/{totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setParams({ status: filter, page: String(page + 1) })}
            >
              Trang sau
            </Button>
          </nav>
        )}
      </div>

      <ConfirmDialog
        open={dialog !== null}
        title={dialog ? `${ACTION_LABELS[dialog.action]}: ${dialog.tutor.displayName}` : ''}
        tone={dialog?.action === 'approve' ? 'primary' : 'danger'}
        confirmLabel={dialog ? ACTION_LABELS[dialog.action] : ''}
        loading={mutation.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (reasonRequired && !reason.trim()) {
            setReasonMissing(true);
            return;
          }
          submit();
        }}
        description={
          dialog?.action === 'approve'
            ? 'Hồ sơ sẽ xuất hiện công khai trong tìm kiếm.'
            : 'Gia sư sẽ thấy lý do này trong trang hồ sơ của mình.'
        }
      >
        <TextareaField
          label={reasonRequired ? 'Lý do' : 'Ghi chú (tùy chọn)'}
          required={reasonRequired}
          maxLength={500}
          value={reason}
          onChange={(e) => {
            setReasonMissing(false);
            setReason(e.target.value);
          }}
          error={errors.reason ?? (reasonMissing ? 'Vui lòng nhập lý do.' : undefined)}
        />
        {mutation.isError && !errors.reason && (
          <Alert tone="danger">{mutation.error.message}</Alert>
        )}
      </ConfirmDialog>
    </section>
  );
}

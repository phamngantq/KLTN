import {
  BookOpen,
  CalendarDays,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  DollarSign,
  GraduationCap,
  MapPin,
  UserRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { ApplicationStatus } from '../../../shared/schemas/classes';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useOwnApplication } from '../../features/class-requests/api';
import { useWithdrawApplication } from '../../features/classes/api';
import { formatDate, WEEKDAY_LABELS } from '../../lib/format';
import { ClassAcceptancePanel } from './ClassAcceptancePanel';
import { BackLink, Badges, Fact, money, requirementList, ScheduleLines } from './TutorClassPages';

const STATUS: Record<
  ApplicationStatus,
  { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' }
> = {
  submitted: { label: 'Chờ duyệt', tone: 'info' },
  selected: { label: 'Đã duyệt', tone: 'success' },
  rejected: { label: 'Bị từ chối', tone: 'danger' },
  withdrawn: { label: 'Đã hủy nhận lớp', tone: 'neutral' },
};

const BACK = '/tutor/class-requests';

/**
 * Chi tiết một lớp đã đăng ký: every public class fact, the free time sent with the request and,
 * by status, the cancel action, the centre's rejection reason or the completion step. The
 * learner's name, phone and street address are never part of this response.
 */
export function TutorClassRequestDetailPage() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const detail = useOwnApplication(applicationId);
  const withdraw = useWithdrawApplication();
  const [cancelling, setCancelling] = useState(false);
  const [completing, setCompleting] = useState(false);
  const preview = isReadOnlyPreview();

  if (detail.isPending) return <PageLoading label="Đang tải thông tin lớp…" />;
  if (detail.isError)
    return (
      <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
        <BackLink to={BACK} />
        <Alert
          tone="danger"
          title="Không tải được thông tin lớp"
          action={
            <Button variant="secondary" onClick={() => void detail.refetch()}>
              Thử lại
            </Button>
          }
        >
          {detail.error.message}
        </Alert>
      </section>
    );

  const application = detail.data;
  const item = application.class;
  const status = STATUS[application.status];
  const requirements = item.tutorRequirements ? requirementList(item.tutorRequirements) : [];
  const windows = application.availability?.windows ?? [];

  function confirmCancel() {
    if (withdraw.isPending || preview) return;
    withdraw.mutate(
      { id: application.id, version: application.version },
      {
        onSuccess: () => {
          setCancelling(false);
          void detail.refetch();
        },
        onError: () => void detail.refetch(),
      },
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <BackLink to={BACK} />
        <h1 className="text-3xl font-semibold text-primary">Chi tiết lớp đã đăng ký</h1>
      </div>
      <article className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
        <header className="flex flex-col gap-3 bg-primary px-6 py-6 text-on-primary sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badges item={item} dark />
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <h2 className="text-3xl font-semibold">
            {item.subjectName} – {item.grade}
          </h2>
          <p className="text-sm text-white/80">
            Mã lớp: {item.code} · Gửi yêu cầu ngày{' '}
            {formatDate(application.createdAt, 'Asia/Ho_Chi_Minh')}
          </p>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          {application.status === 'rejected' && (
            <section
              aria-labelledby="rejection-reason"
              className="flex gap-3 rounded-xl border border-danger/30 bg-danger-surface p-5"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-danger" />
              <div>
                <h3 id="rejection-reason" className="text-lg font-semibold text-danger">
                  Lý do từ chối của trung tâm
                </h3>
                <p className="mt-1 text-lg">
                  {application.rejectionReason ?? 'Trung tâm chưa ghi lý do.'}
                </p>
              </div>
            </section>
          )}
          <section aria-labelledby="class-info" className="flex flex-col gap-5">
            <h3 id="class-info" className="text-xl font-semibold text-primary">
              Thông tin lớp học
            </h3>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Fact icon={<MapPin className="size-6" />}>
                <dt className="text-sm text-muted">Địa điểm</dt>
                <dd className="text-lg font-medium">
                  {item.mode === 'online' ? 'Học trực tuyến' : (item.publicArea ?? 'Chưa công bố')}
                </dd>
              </Fact>
              <Fact icon={<CalendarDays className="size-6" />}>
                <dt className="text-sm text-muted">Lịch học</dt>
                <dd>
                  <ScheduleLines item={item} />
                </dd>
              </Fact>
              <Fact icon={<DollarSign className="size-6" />}>
                <dt className="text-sm text-muted">Học phí / buổi</dt>
                <dd className="text-2xl font-bold text-primary">
                  {item.expectedBudgetMinor === null
                    ? 'Thỏa thuận'
                    : `${money(item.expectedBudgetMinor)}/buổi`}
                </dd>
              </Fact>
              <Fact icon={<BookOpen className="size-6" />}>
                <dt className="text-sm text-muted">Hình thức dạy</dt>
                <dd className="text-lg font-medium">
                  {item.mode === 'online' ? 'Online' : 'Offline'}
                </dd>
              </Fact>
              {item.studentTraits && (
                <div className="sm:col-span-2">
                  <Fact icon={<UserRound className="size-6" />}>
                    <dt className="text-sm text-muted">Đặc điểm học sinh</dt>
                    <dd className="text-lg">{item.studentTraits}</dd>
                  </Fact>
                </div>
              )}
              {windows.length > 0 && (
                <div className="sm:col-span-2">
                  <Fact icon={<Clock3 className="size-6" />}>
                    <dt className="text-sm text-muted">Thời gian rảnh bạn đã gửi</dt>
                    <dd>
                      <ul className="flex flex-col gap-0.5">
                        {windows.map((window) => (
                          <li key={`${window.weekday}-${window.startLocal}`}>
                            {WEEKDAY_LABELS[window.weekday] ?? window.weekday}: {window.startLocal}–
                            {window.endLocal}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </Fact>
                </div>
              )}
            </dl>
          </section>
          {requirements.length > 0 && (
            <section
              aria-labelledby="class-requirements"
              className="flex flex-col gap-3 border-t border-border pt-6"
            >
              <h3
                id="class-requirements"
                className="flex items-center gap-2 text-xl font-semibold text-primary"
              >
                <GraduationCap aria-hidden="true" className="size-6 text-accent" />
                Yêu cầu gia sư
              </h3>
              <ul className="flex flex-col gap-2 text-lg">
                {requirements.map((requirement) => (
                  <li key={requirement} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-3 size-1.5 shrink-0 rounded-full bg-accent"
                    />
                    {requirement}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="rounded-xl bg-surface p-4 text-sm text-muted">
            Thông tin liên hệ và địa chỉ cụ thể của người học chỉ được cung cấp sau khi bạn hoàn tất
            các điều kiện nhận lớp.
          </p>
          {completing && application.acceptance && (
            <ClassAcceptancePanel acceptance={application.acceptance} classCode={item.code} />
          )}
          {completing && !application.acceptance && (
            <Alert tone="info">
              Trung tâm đang hoàn thiện thông tin lớp. Vui lòng quay lại sau.
            </Alert>
          )}
          {(application.status === 'submitted' || application.status === 'selected') && (
            <div className="flex flex-wrap gap-3 border-t border-border pt-6">
              {application.status === 'submitted' && !preview && (
                <Button
                  variant="secondary"
                  className="gap-2 text-danger"
                  onClick={() => {
                    withdraw.reset();
                    setCancelling(true);
                  }}
                >
                  <X aria-hidden="true" className="size-4" />
                  Hủy nhận lớp
                </Button>
              )}
              {application.status === 'selected' &&
                (application.acceptance?.completed ? (
                  <Button
                    className="gap-2"
                    onClick={() => navigate('/tutor/class-requests?tab=hoan-tat')}
                  >
                    <ClipboardCheck aria-hidden="true" className="size-4" />
                    Xem trong Lớp đã hoàn tất
                  </Button>
                ) : (
                  <Button
                    className="gap-2"
                    aria-expanded={completing}
                    onClick={() => setCompleting(!completing)}
                  >
                    <ClipboardCheck aria-hidden="true" className="size-4" />
                    Hoàn tất nhận lớp
                  </Button>
                ))}
            </div>
          )}
        </div>
      </article>
      <ConfirmDialog
        open={cancelling}
        title="Hủy nhận lớp?"
        description={`Yêu cầu nhận lớp ${item.code} sẽ bị hủy. Bạn có thể gửi lại nếu lớp vẫn đang tuyển.`}
        confirmLabel="Hủy nhận lớp"
        tone="danger"
        loading={withdraw.isPending}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(false)}
      >
        {withdraw.isError && <Alert tone="danger">{withdraw.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}

import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  DollarSign,
  GraduationCap,
  MapPin,
  UserRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useTutorProposal } from '../../features/class-requests/api';
import { formatDate, WEEKDAY_LABELS } from '../../lib/format';
import {
  canComplete,
  completionPath,
  ConfirmProposalPanel,
  DeclineProposalDialog,
  isPending,
  proposalNote,
  proposalStatus,
} from './ProposalParts';
import { BackLink, Fact, money, requirementList } from './TutorClassPages';

const BACK = '/tutor/class-requests?tab=de-xuat';

/**
 * Chi tiết lớp được đề xuất: public request facts only (no learner name, phone or address),
 * with "Xác nhận nhận lớp" / "Từ chối nhận lớp" while the proposal waits for the tutor.
 */
export function TutorProposalDetailPage() {
  const { proposalId } = useParams();
  const [params, setParams] = useSearchParams();
  const detail = useTutorProposal(proposalId);
  const [declining, setDeclining] = useState(false);
  const confirming = params.get('xac-nhan') === '1';
  const preview = isReadOnlyPreview();

  function setConfirming(open: boolean) {
    setParams(open ? { 'xac-nhan': '1' } : {}, { replace: true, preventScrollReset: true });
  }

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

  const item = detail.data;
  const state = proposalStatus(item);
  const note = proposalNote(item);
  const pending = isPending(item);
  const requirements = item.tutorRequirements ? requirementList(item.tutorRequirements) : [];
  const sessions = item.sessionsPerWeek ?? (item.schedule.length || null);

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <BackLink to={BACK} />
        <h1 className="text-3xl font-semibold text-primary">Chi tiết lớp được đề xuất</h1>
      </div>
      <article className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
        <header className="flex flex-col gap-3 bg-primary px-6 py-6 text-on-primary sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span className="rounded-full bg-accent px-3 py-0.5 text-on-accent">
                {item.subjectName}
              </span>
              <span className="rounded-full border border-white/60 px-3 py-0.5">
                Phù hợp {item.fitScore}%
              </span>
            </div>
            <Badge tone={state.tone}>{state.label}</Badge>
          </div>
          <h2 className="text-3xl font-semibold">
            {item.subjectName} – {item.grade}
          </h2>
          <p className="text-sm text-white/80">
            Mã yêu cầu: {item.requestCode} · Đề xuất ngày{' '}
            {formatDate(item.createdAt, 'Asia/Ho_Chi_Minh')}
          </p>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          {note && (
            <p className="rounded-xl bg-info-surface p-4 text-primary" role="status">
              {note}
            </p>
          )}
          {item.tutorResponse === 'declined' && item.tutorDeclineReason && (
            <p className="rounded-xl bg-surface p-4">
              <span className="font-semibold">Lý do bạn từ chối: </span>
              {item.tutorDeclineReason}
            </p>
          )}
          <section aria-labelledby="class-info" className="flex flex-col gap-5">
            <h3 id="class-info" className="text-xl font-semibold text-primary">
              Thông tin lớp học
            </h3>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Fact icon={<MapPin className="size-6" />}>
                <dt className="text-sm text-muted">Địa điểm</dt>
                <dd className="text-lg font-medium">
                  {item.mode === 'online' ? 'Học trực tuyến' : (item.area ?? 'Chưa công bố')}
                </dd>
              </Fact>
              <Fact icon={<CalendarDays className="size-6" />}>
                <dt className="text-sm text-muted">Lịch học</dt>
                <dd className="flex flex-col gap-1">
                  {sessions && <p className="text-lg font-medium">{sessions} buổi/tuần</p>}
                  {item.schedule.length === 0 ? (
                    <p className="text-muted">Trao đổi lịch học sau</p>
                  ) : (
                    <ul aria-label="Thời gian có thể học" className="flex flex-col gap-0.5">
                      {item.schedule.map((window) => (
                        <li key={`${window.weekday}-${window.startLocal}`}>
                          {WEEKDAY_LABELS[window.weekday] ?? window.weekday}: {window.startLocal}–
                          {window.endLocal}
                        </li>
                      ))}
                    </ul>
                  )}
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
            Thông tin liên hệ chi tiết của phụ huynh chỉ được cung cấp sau khi bạn hoàn tất thủ tục
            nhận lớp tại trung tâm.
          </p>
          {pending && confirming && !preview && (
            <ConfirmProposalPanel item={item} onCancel={() => setConfirming(false)} />
          )}
          {item.tutorResponse === 'accepted' && confirming && (
            <Alert tone="success" title="Đã xác nhận nhận lớp">
              Trung tâm sẽ liên hệ với phụ huynh và hẹn bạn đến văn phòng để ký hợp đồng cam kết,
              thanh toán phí nhận lớp.
            </Alert>
          )}
          {canComplete(item) && (
            <div className="flex flex-wrap gap-3 border-t border-border pt-6">
              <ButtonLink to={completionPath(item)} className="gap-2">
                <ClipboardCheck aria-hidden="true" className="size-4" />
                Hoàn tất nhận lớp
              </ButtonLink>
            </div>
          )}
          {pending && !confirming && !preview && (
            <div className="flex flex-wrap gap-3 border-t border-border pt-6">
              <Button className="gap-2" onClick={() => setConfirming(true)}>
                <ClipboardCheck aria-hidden="true" className="size-4" />
                Xác nhận nhận lớp
              </Button>
              <Button
                variant="secondary"
                className="gap-2 text-danger"
                onClick={() => setDeclining(true)}
              >
                <X aria-hidden="true" className="size-4" />
                Từ chối nhận lớp
              </Button>
            </div>
          )}
        </div>
      </article>
      <DeclineProposalDialog
        key={declining ? item.id : 'closed'}
        item={declining ? item : null}
        onClose={() => setDeclining(false)}
      />
    </section>
  );
}

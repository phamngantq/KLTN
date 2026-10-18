import {
  BookOpen,
  CalendarDays,
  DollarSign,
  FileText,
  GraduationCap,
  Home,
  MapPin,
  Phone,
  Printer,
  UserRound,
} from 'lucide-react';
import { useParams } from 'react-router';
import { EDUCATION_LEVEL_LABELS } from '../../../shared/schemas/requests';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useCompletedDetail } from '../../features/class-requests/api';
import { formatDate, formatVnd, WEEKDAY_LABELS } from '../../lib/format';
import { IntroductionLetterArticle } from './TutorIntroductionLetterPage';
import { BackLink, Fact, money, requirementList } from './TutorClassPages';

const BACK = '/tutor/class-requests?tab=hoan-tat';

/**
 * "Xem chi tiết" of a completed class: class and schedule, learner contact, the street address to
 * teach at and the centre's introduction letter. The server returns it only once completed.
 */
export function TutorCompletedClassDetailPage() {
  const { assignmentId } = useParams();
  const detail = useCompletedDetail(assignmentId);

  if (detail.isPending) return <PageLoading label="Đang tải thông tin lớp…" />;
  if (detail.isError)
    return (
      <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
        <BackLink to={BACK} />
        <Alert
          tone="warning"
          title="Chưa xem được chi tiết lớp"
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
  const requirements = item.tutorRequirements ? requirementList(item.tutorRequirements) : [];
  const sessions = item.sessionsPerWeek ?? (item.schedule.length || null);
  const letterPath = `/tutor/class-requests/${encodeURIComponent(item.assignmentId)}/thu-gioi-thieu`;

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <BackLink to={BACK} />
        <h1 className="text-3xl font-semibold text-primary">Chi tiết lớp đã hoàn tất</h1>
      </div>
      <article className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
        <header className="flex flex-col gap-3 bg-primary px-6 py-6 text-on-primary sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full bg-accent px-3 py-0.5 text-sm font-medium text-on-accent">
              {item.subjectName}
            </span>
            <Badge tone="success">Đã hoàn tất nhận lớp</Badge>
          </div>
          <h2 className="text-3xl font-semibold">
            {item.subjectName} – {item.grade}
          </h2>
          <p className="text-sm text-white/80">
            Mã lớp: {item.classCode} · Hoàn tất ngày{' '}
            {formatDate(item.completedAt, 'Asia/Ho_Chi_Minh')}
          </p>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          <section aria-labelledby="class-info" className="flex flex-col gap-5">
            <h3 id="class-info" className="text-xl font-semibold text-primary">
              Thông tin lớp học và lịch học
            </h3>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Fact icon={<MapPin className="size-6" />}>
                <dt className="text-sm text-muted">Khu vực</dt>
                <dd className="text-lg font-medium">
                  {item.mode === 'online' ? 'Học trực tuyến' : (item.publicArea ?? 'Trực tiếp')}
                </dd>
              </Fact>
              <Fact icon={<CalendarDays className="size-6" />}>
                <dt className="text-sm text-muted">Lịch học</dt>
                <dd className="flex flex-col gap-1">
                  {sessions && <p className="text-lg font-medium">{sessions} buổi/tuần</p>}
                  {item.schedule.length === 0 ? (
                    <p className="text-muted">Trao đổi lịch học với người học</p>
                  ) : (
                    <ul aria-label="Lịch học hằng tuần" className="flex flex-col gap-0.5">
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
                <dd>
                  <p className="text-2xl font-bold text-primary">
                    {item.agreedTuitionPerSessionMinor !== null
                      ? `${money(item.agreedTuitionPerSessionMinor)}/buổi`
                      : item.expectedBudgetMinor !== null
                        ? `${money(item.expectedBudgetMinor)}/buổi`
                        : 'Thỏa thuận'}
                  </p>
                  <p className="text-sm text-muted">
                    Phí nhận lớp đã thanh toán: {formatVnd(item.placementFeeAmountMinor)}
                  </p>
                </dd>
              </Fact>
              <Fact icon={<GraduationCap className="size-6" />}>
                <dt className="text-sm text-muted">Môn học · Cấp học</dt>
                <dd className="text-lg font-medium">
                  {item.subjectName} ·{' '}
                  {item.educationLevel ? EDUCATION_LEVEL_LABELS[item.educationLevel] : item.grade}
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
                    <dd className="whitespace-pre-line text-lg">{item.studentTraits}</dd>
                  </Fact>
                </div>
              )}
            </dl>
            {requirements.length > 0 && (
              <div>
                <p className="mb-2 font-semibold text-primary">Yêu cầu gia sư</p>
                <ul className="flex list-disc flex-col gap-1 pl-5">
                  {requirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <section
            aria-labelledby="learner-contact"
            className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
          >
            <h3 id="learner-contact" className="text-xl font-semibold text-primary">
              Thông tin liên hệ người học
            </h3>
            <dl className="grid gap-3 sm:grid-cols-[11rem_1fr]">
              <dt className="flex items-center gap-2 font-medium text-muted">
                <UserRound aria-hidden="true" className="size-4" />
                Phụ huynh / người học
              </dt>
              <dd>{item.contact.learnerDisplayName}</dd>
              {item.contact.studentName && (
                <>
                  <dt className="flex items-center gap-2 font-medium text-muted">
                    <GraduationCap aria-hidden="true" className="size-4" />
                    Học sinh
                  </dt>
                  <dd>{item.contact.studentName}</dd>
                </>
              )}
              <dt className="flex items-center gap-2 font-medium text-muted">
                <Phone aria-hidden="true" className="size-4" />
                Điện thoại
              </dt>
              <dd>
                <a className="text-primary underline" href={`tel:${item.contact.phone}`}>
                  {item.contact.phone}
                </a>
              </dd>
              <dt className="flex items-center gap-2 font-medium text-muted">
                <Home aria-hidden="true" className="size-4" />
                Địa chỉ dạy học
              </dt>
              <dd>
                {item.mode === 'online'
                  ? 'Học trực tuyến — trao đổi đường dẫn học với người học'
                  : (item.contact.address ??
                    'Người học chưa cung cấp, vui lòng liên hệ để xác nhận')}
              </dd>
            </dl>
          </section>
          <section aria-labelledby="intro-letter" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3
                id="intro-letter"
                className="flex items-center gap-2 text-xl font-semibold text-primary"
              >
                <FileText aria-hidden="true" className="size-6 text-accent" />
                Thư giới thiệu của trung tâm
              </h3>
              <ButtonLink to={letterPath} variant="secondary" className="gap-2">
                <Printer aria-hidden="true" className="size-4" />
                In / Lưu PDF
              </ButtonLink>
            </div>
            <IntroductionLetterArticle letter={item.letter} />
          </section>
        </div>
      </article>
    </section>
  );
}

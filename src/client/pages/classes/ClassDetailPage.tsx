import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Clock,
  DollarSign,
  GraduationCap,
  MapPin,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useSession } from '../../app/auth';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { usePublicClass, type PublicClass } from '../../features/classes/api';
import { formatDate, formatVnd, WEEKDAY_LABELS } from '../../lib/format';

function ClassFacts({ item }: { item: PublicClass }) {
  return (
    <section className="min-w-0 p-5 sm:p-6" aria-labelledby="class-facts-heading">
      <h2 id="class-facts-heading" className="font-semibold text-primary">
        Thông tin lớp học
      </h2>
      <dl className="mt-5 grid gap-5 sm:grid-cols-2">
        <div className="flex min-w-0 items-start gap-3">
          <GraduationCap aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <dt className="text-sm text-muted">Môn học · Khối lớp</dt>
            <dd className="font-medium text-fg">
              {item.subjectName} · {item.grade}
            </dd>
          </div>
        </div>
        <div className="flex min-w-0 items-start gap-3">
          <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <dt className="text-sm text-muted">Địa điểm</dt>
            <dd className="font-medium text-fg">
              {item.mode === 'online' ? 'Học trực tuyến' : item.publicArea || 'Chưa công bố'}
            </dd>
          </div>
        </div>
        <div className="flex min-w-0 items-start gap-3">
          <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <dt className="text-sm text-muted">Lịch học mong muốn</dt>
            <dd className="text-fg">
              {item.schedule.discussLater ? (
                'Trao đổi thời gian sau'
              ) : item.schedule.windows.length ? (
                <ul className="space-y-1">
                  {item.schedule.windows.map((window) => (
                    <li key={`${window.weekday}-${window.startLocal}`}>
                      {WEEKDAY_LABELS[window.weekday] ?? `Ngày ${window.weekday}`} ·{' '}
                      {window.startLocal}–{window.endLocal}
                    </li>
                  ))}
                </ul>
              ) : (
                'Chưa có khung giờ cụ thể'
              )}
              <span className="mt-1 block text-xs text-muted">
                Múi giờ {item.schedule.timezone}
              </span>
            </dd>
          </div>
        </div>
        <div className="flex min-w-0 items-start gap-3">
          <DollarSign aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <dt className="text-sm text-muted">Học phí dự kiến</dt>
            <dd className="text-lg font-bold text-primary">
              {item.expectedBudgetMinor === null
                ? 'Trao đổi thêm'
                : formatVnd(item.expectedBudgetMinor)}
            </dd>
            <p className="text-xs text-muted">
              Mức chi của người học; phí nhận lớp được chọn khi ứng tuyển.
            </p>
          </div>
        </div>
        <div className="flex min-w-0 items-start gap-3">
          <BookOpen aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <dt className="text-sm text-muted">Hình thức dạy</dt>
            <dd className="font-medium text-fg">
              {item.mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}
            </dd>
          </div>
        </div>
        <div className="flex min-w-0 items-start gap-3">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <dt className="text-sm text-muted">Ngày công bố</dt>
            <dd className="font-medium text-fg">
              {item.publishedAt ? formatDate(item.publishedAt, 'Asia/Ho_Chi_Minh') : 'Chưa công bố'}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}

function Detail() {
  const { id } = useParams();
  const detail = usePublicClass(id);
  const { user } = useSession();
  const backTo = '/lop-hoc';
  const tutorPath = `/tutor/new-classes/${encodeURIComponent(id ?? '')}`;

  return (
    <section className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5">
      <Link
        to={backTo}
        className="inline-flex min-h-11 w-fit items-center gap-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Danh sách lớp
      </Link>
      {detail.isPending ? (
        <PageLoading label="Đang tải thông tin lớp…" />
      ) : detail.isError ? (
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
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-bg shadow-card">
          <header className="bg-primary px-5 py-5 text-on-primary sm:px-6">
            <div className="mb-3 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-accent px-3 py-1 text-on-accent">
                {detail.data.subjectName}
              </span>
              <span className="rounded-full border border-white/50 px-3 py-1">
                {detail.data.grade}
              </span>
              <span className="rounded-full border border-green-300 bg-green-700 px-3 py-1 text-white">
                Đang tìm gia sư
              </span>
            </div>
            <h1 className="text-2xl font-semibold">
              {detail.data.subjectName} · {detail.data.grade}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Mã lớp: {detail.data.code}
              {detail.data.publishedAt
                ? ` · Đăng ngày ${formatDate(detail.data.publishedAt, 'Asia/Ho_Chi_Minh')}`
                : ''}
            </p>
          </header>
          <ClassFacts item={detail.data} />
          <div className="border-t border-border">
            {user?.role === 'tutor' ? (
              <div className="p-5 sm:p-6">
                <ButtonLink
                  variant="accent"
                  className="w-full rounded-xl text-base font-semibold"
                  to={tutorPath}
                >
                  Đăng ký nhận lớp
                </ButtonLink>
              </div>
            ) : user ? (
              <div className="p-5 sm:p-6">
                <Alert title="Dành cho gia sư">
                  Chỉ gia sư đã được duyệt mới có thể ứng tuyển lớp.
                </Alert>
              </div>
            ) : (
              <div className="p-5 sm:p-6">
                <ButtonLink
                  variant="accent"
                  className="w-full rounded-xl text-base font-semibold"
                  to={`/sign-in?next=${encodeURIComponent(tutorPath)}`}
                >
                  Đăng nhập gia sư để ứng tuyển
                </ButtonLink>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function PublicClassDetailPage() {
  return <Detail />;
}

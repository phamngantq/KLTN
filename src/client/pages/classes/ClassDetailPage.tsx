import { useRef, useState } from 'react';
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
import { FEE_OPTION_KEYS } from '../../../shared/schemas/classes';
import { useSession } from '../../app/auth';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { SelectField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useApplyForClass,
  useFeeOptions,
  usePublicClass,
  type PublicClass,
} from '../../features/classes/api';
import { formatDate, formatVnd, WEEKDAY_LABELS } from '../../lib/format';
import { isApiError } from '../../lib/api-client';

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
              Mức chi của phụ huynh; phí nhận lớp được chọn khi ứng tuyển.
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

function TutorApplicationForm({ item }: { item: PublicClass }) {
  const preview = isReadOnlyPreview();
  const feeOptions = useFeeOptions(item.id, !preview);
  const apply = useApplyForClass();
  const [feeOptionVersionId, setFeeOptionVersionId] = useState('');
  const idempotencyKey = useRef<string | null>(null);
  const selected = feeOptions.data?.find((option) => option.id === feeOptionVersionId);
  const hasAllOptions = FEE_OPTION_KEYS.every((key) =>
    feeOptions.data?.some((option) => option.optionKey === key),
  );
  const termsError =
    isApiError(apply.error, 'TERMS_ACK_REQUIRED') ||
    isApiError(apply.error, 'TERMS_QUIZ_UNAVAILABLE');

  function submit() {
    if (!feeOptionVersionId || apply.isPending || preview) return;
    idempotencyKey.current ??= crypto.randomUUID();
    apply.mutate(
      {
        classId: item.id,
        feeOptionVersionId,
        classVersion: item.version,
        idempotencyKey: idempotencyKey.current,
      },
      {
        onError: () => {
          // A stale class or option must be checked against the latest server state.
          void feeOptions.refetch();
        },
      },
    );
  }

  if (preview) {
    return (
      <Alert title="Bản xem trước chỉ đọc">
        Chức năng ứng tuyển lớp chưa mở trên bản xem trước.
      </Alert>
    );
  }

  return (
    <section className="p-5 sm:p-6" aria-labelledby="apply-heading">
      <h2 id="apply-heading" className="text-xl font-semibold text-primary">
        Đăng ký nhận lớp
      </h2>
      <p className="mt-1 text-sm text-muted">
        Chọn một phương án phí đã được kiểm duyệt viên công bố. Việc ứng tuyển không phải thanh
        toán.
      </p>
      {feeOptions.isPending ? (
        <PageLoading label="Đang tải phương án phí…" />
      ) : feeOptions.isError ? (
        <Alert
          tone="danger"
          title="Không tải được phương án phí"
          action={
            <Button variant="secondary" onClick={() => void feeOptions.refetch()}>
              Thử lại
            </Button>
          }
        >
          {feeOptions.error.message}
        </Alert>
      ) : !hasAllOptions ? (
        <Alert tone="warning" title="Chưa thể ứng tuyển">
          Chưa có đủ ba phương án phí nhận lớp được công bố cho lớp này.
        </Alert>
      ) : apply.isSuccess ? (
        <Alert tone="success" title="Đã gửi đơn ứng tuyển">
          Hệ thống đã ghi nhận đơn của bạn.{' '}
          <Link className="font-medium text-primary underline" to="/tutor/class-requests">
            Theo dõi đơn ứng tuyển
          </Link>
          .
        </Alert>
      ) : (
        <div className="mt-4 flex max-w-xl flex-col gap-4">
          <p className="text-sm text-muted">
            Trước khi ứng tuyển, gia sư cần hoàn thành bài kiểm tra và xác nhận điều khoản hiện
            hành.{' '}
            <Link
              className="font-medium text-primary underline underline-offset-4"
              to="/tutor/terms"
            >
              Xem điều khoản và bài kiểm tra
            </Link>
          </p>
          <SelectField
            label="Phương án phí nhận lớp"
            value={feeOptionVersionId}
            onChange={(event) => {
              setFeeOptionVersionId(event.target.value);
              idempotencyKey.current = null;
              apply.reset();
            }}
            required
          >
            <option value="">Chọn phương án</option>
            {feeOptions.data.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title} · Phiên bản {option.version}
              </option>
            ))}
          </SelectField>
          {selected && (
            <p className="whitespace-pre-line rounded-md bg-info-surface p-3 text-sm">
              {selected.policyText}
            </p>
          )}
          {apply.isError && (
            <Alert tone="danger" title="Chưa gửi được đơn ứng tuyển">
              {apply.error.message}{' '}
              {termsError ? (
                <Link
                  className="block font-medium text-primary underline underline-offset-4"
                  to="/tutor/terms"
                >
                  Hoàn thành điều khoản và bài kiểm tra
                </Link>
              ) : (
                <span className="block">Nếu lớp đã thay đổi, tải lại trang trước khi thử lại.</span>
              )}
            </Alert>
          )}
          <Button
            variant="accent"
            className="w-full rounded-xl text-base font-semibold"
            onClick={submit}
            loading={apply.isPending}
            disabled={!feeOptionVersionId}
          >
            Gửi đơn ứng tuyển
          </Button>
        </div>
      )}
    </section>
  );
}

function Detail({ tutor }: { tutor: boolean }) {
  const { id } = useParams();
  const detail = usePublicClass(id);
  const { user } = useSession();
  const backTo = tutor ? '/tutor/new-classes' : '/lop-hoc';
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
            {tutor ? (
              <TutorApplicationForm item={detail.data} />
            ) : user?.role === 'tutor' ? (
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
  return <Detail tutor={false} />;
}

export function TutorClassDetailPage() {
  return <Detail tutor />;
}

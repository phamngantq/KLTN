import { BookOpen, MapPin, Wallet } from 'lucide-react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import type { PublicTutorOffer } from '../../../shared/schemas/tutor-offers';
import { useSession } from '../../app/auth';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { usePublicTutorOffer, usePublicTutorOffers } from '../../features/tutor-offers/api';
import { formatVnd } from '../../lib/format';
import { ParentTutorOfferJoinForm } from '../parent/ParentTutorOfferJoinForm';

function pageFromUrl(params: URLSearchParams): number {
  const value = Number(params.get('page') ?? '1');
  return Number.isSafeInteger(value) && value >= 1 && value <= 1000 ? value : 1;
}

function TutorOfferCard({ item, detailBase }: { item: PublicTutorOffer; detailBase: string }) {
  return (
    <li className="min-w-0">
      <article className="flex h-full flex-col gap-4 rounded-xl border border-primary/20 bg-bg p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent">
            {item.subjectName}
          </span>
          <Badge tone="success">Đang tìm học viên</Badge>
        </div>
        <h2 className="break-words text-xl font-semibold text-primary">
          {item.subjectName} · {item.grade}
        </h2>
        <p className="text-sm font-medium text-primary">Gia sư {item.tutorDisplayName}</p>
        <dl className="flex flex-1 flex-col gap-3 text-sm">
          <div>
            <dt className="flex items-center gap-2 text-muted">
              <BookOpen aria-hidden="true" className="size-4" /> Hình thức
            </dt>
            <dd className="mt-1">{item.mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}</dd>
          </div>
          {item.mode === 'offline' && (
            <div>
              <dt className="flex items-center gap-2 text-muted">
                <MapPin aria-hidden="true" className="size-4" /> Khu vực
              </dt>
              <dd className="mt-1 break-words">{item.area ?? 'Trao đổi khu vực sau'}</dd>
            </div>
          )}
          <div>
            <dt className="flex items-center gap-2 text-muted">
              <Wallet aria-hidden="true" className="size-4" /> Học phí đề xuất
            </dt>
            <dd className="mt-1 font-semibold text-primary">
              {formatVnd(item.proposedTuitionPerSessionMinor)}/buổi
            </dd>
          </div>
        </dl>
        <ButtonLink
          to={`${detailBase}/${encodeURIComponent(item.id)}`}
          variant="secondary"
          className="w-full justify-center"
        >
          Xem chi tiết
        </ButtonLink>
      </article>
    </li>
  );
}

export function TutorOfferBrowsePage() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const page = pageFromUrl(params);
  const offers = usePublicTutorOffers(page);
  const detailBase = pathname.startsWith('/parent/')
    ? '/parent/lop-tim-hoc-vien'
    : '/lop-tim-hoc-vien';

  function changePage(nextPage: number) {
    const next = new URLSearchParams();
    if (nextPage > 1) next.set('page', String(nextPage));
    setParams(next);
    document.getElementById('main')?.focus();
  }

  return (
    <section className="mx-auto flex w-full max-w-[var(--container-max)] min-w-0 flex-col gap-6 px-4 py-10">
      <PageHeader
        title="Lớp tìm học viên"
        description="Các lớp do gia sư đăng đã được kiểm duyệt hợp đồng và công bố."
      />
      {offers.isPending ? (
        <PageLoading label="Đang tải lớp tìm học viên…" />
      ) : offers.isError ? (
        <Alert
          tone="danger"
          title="Không tải được danh sách"
          action={
            <Button variant="secondary" onClick={() => void offers.refetch()}>
              Thử lại
            </Button>
          }
        >
          {offers.error.message}
        </Alert>
      ) : offers.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có lớp tìm học viên"
          description="Các lớp đã được kiểm duyệt sẽ xuất hiện tại đây."
        />
      ) : (
        <>
          <p className="text-sm text-muted" role="status">
            Có {offers.data.total.toLocaleString('vi-VN')} lớp đang tìm học viên.
          </p>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {offers.data.items.map((item) => (
              <TutorOfferCard key={item.id} item={item} detailBase={detailBase} />
            ))}
          </ul>
          {offers.data.total > offers.data.pageSize && (
            <nav
              aria-label="Trang lớp tìm học viên"
              className="flex items-center justify-center gap-3"
            >
              <Button variant="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {page} / {Math.ceil(offers.data.total / offers.data.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={page * offers.data.pageSize >= offers.data.total}
                onClick={() => changePage(page + 1)}
              >
                Trang sau
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

export function TutorOfferPublicDetailPage() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { user } = useSession();
  const offer = usePublicTutorOffer(id);
  const backTo = pathname.startsWith('/parent/') ? '/parent/lop-tim-hoc-vien' : '/lop-tim-hoc-vien';
  return (
    <section className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 px-4 py-10">
      <Link
        to={backTo}
        className="min-h-11 self-start py-2 text-sm font-medium text-primary underline"
      >
        Về danh sách lớp tìm học viên
      </Link>
      {offer.isPending ? (
        <PageLoading label="Đang tải chi tiết lớp…" />
      ) : offer.isError ? (
        <Alert
          tone="danger"
          title="Không tải được lớp"
          action={
            <Button variant="secondary" onClick={() => void offer.refetch()}>
              Thử lại
            </Button>
          }
        >
          {offer.error.message}
        </Alert>
      ) : (
        <>
          <PageHeader
            title={`${offer.data.subjectName} · ${offer.data.grade}`}
            description={`Gia sư ${offer.data.tutorDisplayName} · Hợp đồng đăng lớp đã được kiểm duyệt.`}
          />
          <div className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6">
            <Badge tone="success">Đang tìm học viên</Badge>
            <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Môn học</dt>
                <dd className="mt-1 font-semibold text-primary">{offer.data.subjectName}</dd>
              </div>
              <div>
                <dt className="text-muted">Lớp học</dt>
                <dd className="mt-1">{offer.data.grade}</dd>
              </div>
              <div>
                <dt className="text-muted">Hình thức</dt>
                <dd className="mt-1">
                  {offer.data.mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}
                </dd>
              </div>
              {offer.data.mode === 'offline' && (
                <div>
                  <dt className="text-muted">Khu vực</dt>
                  <dd className="mt-1 break-words">{offer.data.area ?? 'Trao đổi khu vực sau'}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted">Học phí đề xuất</dt>
                <dd className="mt-1 font-semibold text-primary">
                  {formatVnd(offer.data.proposedTuitionPerSessionMinor)}/buổi
                </dd>
              </div>
            </dl>
          </div>
          {user?.role === 'student' ? (
            <ParentTutorOfferJoinForm key={offer.data.id} offer={offer.data} />
          ) : !user && !isReadOnlyPreview() ? (
            <Alert
              tone="info"
              action={
                <ButtonLink to={`/sign-in?next=${encodeURIComponent(pathname)}`}>
                  Đăng nhập phụ huynh
                </ButtonLink>
              }
            >
              Đăng nhập để gửi yêu cầu tham gia lớp.
            </Alert>
          ) : null}
        </>
      )}
    </section>
  );
}

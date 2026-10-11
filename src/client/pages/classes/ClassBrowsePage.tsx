import type { FormEvent, ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { BookOpen, Search, Users } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router';
import { REQUEST_GRADE_OPTIONS } from '../../../shared/schemas/requests';
import { classSorts } from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import { ClassCard } from '../../components/domain/ClassCard';
import { useSession } from '../../app/auth';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Spinner';
import {
  useMatchedClasses,
  usePublicClasses,
  type ClassFilters,
  type PublicClass,
} from '../../features/classes/api';
import { useSubjects } from '../../features/tutor-profile/api';

function ClassHero({
  title,
  description,
  actions,
  embedded,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  embedded?: boolean;
}) {
  return (
    <header
      className={`bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-14 text-on-primary md:py-16 ${embedded ? 'rounded-2xl' : ''}`}
    >
      <div className="mx-auto max-w-4xl text-center">
        <BookOpen
          aria-hidden="true"
          size={64}
          strokeWidth={1.75}
          className="mx-auto mb-5 text-accent"
        />
        <h1 className="text-4xl font-bold leading-tight md:text-5xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-3xl text-lg text-on-primary/90 md:text-xl">
          {description}
        </p>
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}

function pageFromUrl(params: URLSearchParams): number {
  const value = Number(params.get('page') ?? '1');
  return Number.isSafeInteger(value) && value > 0 && value <= 1000 ? value : 1;
}

function filtersFromUrl(params: URLSearchParams): ClassFilters {
  const mode = params.get('mode');
  const sort = params.get('sort');
  return {
    subjectId: params.get('subjectId') || undefined,
    grade: params.get('grade') || undefined,
    mode: mode === 'online' || mode === 'offline' ? mode : undefined,
    area: params.get('area') || undefined,
    sort:
      sort && classSorts.includes(sort as (typeof classSorts)[number])
        ? (sort as (typeof classSorts)[number])
        : undefined,
    page: pageFromUrl(params),
    pageSize: 12,
  };
}

function ClassFiltersForm({
  params,
  setParams,
}: {
  params: URLSearchParams;
  setParams: (next: URLSearchParams) => void;
}) {
  const filters = filtersFromUrl(params);
  const subjects = useSubjects();
  const hasFilters = Boolean(
    filters.subjectId || filters.grade || filters.mode || filters.area || filters.sort,
  );

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['subjectId', 'grade', 'mode', 'area', 'sort']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    setParams(next);
  }

  return (
    <form
      key={params.toString()}
      onSubmit={apply}
      role="search"
      aria-label="Bộ lọc lớp học"
      className="grid gap-4 rounded-xl border border-primary/20 bg-bg p-5 shadow-lg md:grid-cols-2 xl:grid-cols-5 xl:p-6"
    >
      <SelectField label="Môn học" name="subjectId" defaultValue={filters.subjectId ?? ''}>
        <option value="">Tất cả môn</option>
        {subjects.data?.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Lớp" name="grade" defaultValue={filters.grade ?? ''}>
        <option value="">Tất cả lớp</option>
        {REQUEST_GRADE_OPTIONS.map((grade) => (
          <option key={grade} value={grade}>
            {grade}
          </option>
        ))}
      </SelectField>
      <SelectField label="Hình thức" name="mode" defaultValue={filters.mode ?? ''}>
        <option value="">Tất cả</option>
        <option value="online">Trực tuyến</option>
        <option value="offline">Trực tiếp</option>
      </SelectField>
      <TextField label="Khu vực" name="area" defaultValue={filters.area ?? ''} maxLength={120} />
      <SelectField label="Sắp xếp" name="sort" defaultValue={filters.sort ?? 'newest'}>
        <option value="newest">Mới nhất</option>
        <option value="oldest">Cũ nhất</option>
        <option value="budget_asc">Ngân sách tăng dần</option>
        <option value="budget_desc">Ngân sách giảm dần</option>
      </SelectField>
      <div className="flex flex-wrap items-end justify-end gap-2 md:col-span-2 xl:col-span-5">
        <Button type="submit">
          <Search aria-hidden="true" size={18} />
          Lọc lớp học
        </Button>
        {hasFilters && (
          <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>
            Xóa lọc
          </Button>
        )}
      </div>
    </form>
  );
}

function ClassResults({
  query,
  params,
  setParams,
  detailBase,
  filtered,
}: {
  query: UseQueryResult<Page<PublicClass>, Error>;
  params: URLSearchParams;
  setParams: (next: URLSearchParams) => void;
  detailBase: string;
  filtered: boolean;
}) {
  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
    document.getElementById('main')?.focus();
  }

  return (
    <div aria-live="polite" aria-busy={query.isFetching}>
      {query.isPending ? (
        <ul
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-label="Đang tải lớp học"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-64" />
            </li>
          ))}
        </ul>
      ) : query.isError ? (
        <Alert
          tone="danger"
          title="Không tải được danh sách lớp"
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
          }
        >
          {query.error.message}
        </Alert>
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có lớp phù hợp"
          description={
            filtered
              ? 'Hãy thử thay đổi bộ lọc hoặc khu vực.'
              : 'Chưa có lớp được công bố ở thời điểm này.'
          }
          action={
            filtered ? (
              <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>
                Xóa bộ lọc
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-5 flex items-center gap-2 text-sm text-muted">
            <Users aria-hidden="true" size={18} />
            Tìm thấy{' '}
            <strong className="text-primary">{query.data.total.toLocaleString('vi-VN')}</strong> lớp
            đang tìm gia sư
          </p>
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {query.data.items.map((item) => (
              <li key={item.id} className="min-w-0">
                <ClassCard
                  item={item}
                  detailPath={`${detailBase}/${encodeURIComponent(item.id)}`}
                />
              </li>
            ))}
          </ul>
          {query.data.total > query.data.pageSize && (
            <nav
              aria-label="Trang lớp học"
              className="mt-6 flex flex-wrap items-center justify-center gap-3"
            >
              <Button
                variant="secondary"
                disabled={query.data.page <= 1}
                onClick={() => goToPage(query.data.page - 1)}
              >
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {query.data.page} / {Math.ceil(query.data.total / query.data.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={query.data.page * query.data.pageSize >= query.data.total}
                onClick={() => goToPage(query.data.page + 1)}
              >
                Trang sau
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function BrowseClasses({ tutor }: { tutor: boolean }) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const { user } = useSession();
  const filters = filtersFromUrl(params);
  const query = usePublicClasses(filters);
  const filtered = Boolean(filters.subjectId || filters.grade || filters.mode || filters.area);
  const preview = isReadOnlyPreview();
  const parent = user?.role === 'student';
  const tutorAccount = user?.role === 'tutor';

  return (
    <section className="min-w-0">
      <ClassHero
        title={tutor ? 'Lớp mới' : 'Danh sách lớp học'}
        description={
          tutor
            ? 'Tìm kiếm lớp học phù hợp với năng lực và thời gian của bạn.'
            : 'Tìm kiếm lớp học đã được công bố. Thông tin liên hệ riêng chỉ mở cho gia sư được gán.'
        }
        embedded={tutor || pathname.startsWith('/parent/')}
        actions={
          tutor ? (
            <ButtonLink to="/tutor/class-requests" variant="accent">
              Đơn ứng tuyển của tôi
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="bg-surface px-4 py-8">
        <div className="mx-auto max-w-[var(--container-max)]">
          <ClassFiltersForm params={params} setParams={setParams} />
        </div>
      </div>
      <div className="mx-auto max-w-[var(--container-max)] px-4 py-12">
        <ClassResults
          query={query}
          params={params}
          setParams={setParams}
          detailBase={tutor ? '/tutor/new-classes' : '/lop-hoc'}
          filtered={filtered}
        />
      </div>
      {!tutor && (
        <section className="bg-surface px-4 py-14 text-center" aria-labelledby="class-cta-title">
          <div className="mx-auto max-w-4xl">
            <h2 id="class-cta-title" className="text-3xl font-semibold text-primary">
              {parent ? 'Bạn cần tìm gia sư?' : 'Bạn là gia sư?'}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
              {parent
                ? 'Gửi yêu cầu học tập để kiểm duyệt viên hỗ trợ chọn gia sư.'
                : 'Tạo hồ sơ để xem lớp mới và ứng tuyển khi đáp ứng điều kiện.'}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {!preview && (
                <ButtonLink
                  to={
                    parent
                      ? '/parent/request'
                      : tutorAccount
                        ? '/tutor/new-classes'
                        : '/sign-up?role=tutor'
                  }
                  variant="accent"
                >
                  {parent ? 'Gửi yêu cầu' : tutorAccount ? 'Xem lớp mới' : 'Đăng ký làm gia sư'}
                </ButtonLink>
              )}
              <ButtonLink to="/lien-he" variant="secondary">
                Liên hệ tư vấn
              </ButtonLink>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

export function PublicClassBrowsePage() {
  return <BrowseClasses tutor={false} />;
}

export function TutorNewClassBrowsePage() {
  return <BrowseClasses tutor />;
}

export function TutorMatchedClassBrowsePage() {
  const [params, setParams] = useSearchParams();
  const page = pageFromUrl(params);
  const query = useMatchedClasses(page);

  return (
    <section className="min-w-0">
      <ClassHero
        title="Lớp phù hợp"
        description="Lớp được lọc từ sở thích môn, lớp và khu vực bạn đã lưu trong hồ sơ."
        embedded
        actions={
          <ButtonLink to="/tutor/profile" variant="accent">
            Cập nhật sở thích
          </ButtonLink>
        }
      />
      <div className="px-4 py-12">
        <ClassResults
          query={query}
          params={params}
          setParams={setParams}
          detailBase="/tutor/new-classes"
          filtered={false}
        />
      </div>
    </section>
  );
}

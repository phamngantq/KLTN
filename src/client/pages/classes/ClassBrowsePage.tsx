import type { FormEvent } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { REQUEST_GRADE_OPTIONS } from '../../../shared/schemas/requests';
import { classSorts } from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import { ClassCard } from '../../components/domain/ClassCard';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Spinner';
import {
  useMatchedClasses,
  usePublicClasses,
  type ClassFilters,
  type PublicClass,
} from '../../features/classes/api';
import { useSubjects } from '../../features/tutor-profile/api';

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
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Lọc</Button>
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
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Đang tải lớp học">
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
          <p className="mb-3 text-sm text-muted">{query.data.total} lớp đang tìm gia sư</p>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
  const filters = filtersFromUrl(params);
  const query = usePublicClasses(filters);
  const filtered = Boolean(filters.subjectId || filters.grade || filters.mode || filters.area);

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={tutor ? 'Lớp mới' : 'Danh sách lớp học'}
        description="Xem các lớp đã được kiểm duyệt viên công bố. Thông tin liên hệ riêng chỉ mở cho gia sư được gán."
        actions={
          tutor ? (
            <ButtonLink to="/tutor/class-requests" variant="secondary">
              Đơn ứng tuyển của tôi
            </ButtonLink>
          ) : undefined
        }
      />
      <ClassFiltersForm params={params} setParams={setParams} />
      <ClassResults
        query={query}
        params={params}
        setParams={setParams}
        detailBase={tutor ? '/tutor/new-classes' : '/lop-hoc'}
        filtered={filtered}
      />
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
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Lớp phù hợp"
        description="Lớp được lọc từ sở thích môn, lớp và khu vực bạn đã lưu trong hồ sơ."
        actions={
          <ButtonLink to="/tutor/profile" variant="secondary">
            Cập nhật sở thích
          </ButtonLink>
        }
      />
      <ClassResults
        query={query}
        params={params}
        setParams={setParams}
        detailBase="/tutor/new-classes"
        filtered={false}
      />
    </section>
  );
}

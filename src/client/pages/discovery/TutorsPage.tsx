import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { SORT_LABELS, TUTOR_SORTS } from '../../../shared/schemas/discovery';
import { TutorCard } from '../../components/domain/TutorCard';
import { Button } from '../../components/ui/Button';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Spinner';
import { filtersFromParams, useTutorSearch } from '../../features/discovery/api';
import { useSubjects } from '../../features/tutor-profile/api';

export function TutorsPage() {
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const search = useTutorSearch(filters);
  const subjects = useSubjects();
  const hasFilters = Boolean(filters.subject || filters.mode || filters.minRate || filters.maxRate);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['subject', 'mode', 'minRate', 'maxRate', 'sort']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    setParams(next); // new filters always start from page 1
  }

  function goToPage(page: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
    document.getElementById('main')?.focus();
  }

  const page = search.data;
  const totalPages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title="Tìm gia sư" description="Chỉ hiển thị gia sư đã được duyệt." />

      {/* Uncontrolled inputs keyed by the URL so back/forward and reload restore them. */}
      <form
        key={params.toString()}
        onSubmit={applyFilters}
        role="search"
        aria-label="Bộ lọc gia sư"
        className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
      >
        <SelectField
          label="Môn học"
          name="subject"
          defaultValue={filters.subject ?? ''}
          className="lg:col-span-1"
        >
          <option value="">Tất cả môn</option>
          {subjects.data?.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Hình thức" name="mode" defaultValue={filters.mode ?? ''}>
          <option value="">Tất cả</option>
          <option value="online">Trực tuyến</option>
          <option value="offline">Trực tiếp</option>
        </SelectField>
        <TextField
          label="Giá từ (₫/giờ)"
          name="minRate"
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          defaultValue={filters.minRate ?? ''}
        />
        <TextField
          label="Đến (₫/giờ)"
          name="maxRate"
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          defaultValue={filters.maxRate ?? ''}
        />
        <SelectField label="Sắp xếp" name="sort" defaultValue={filters.sort ?? 'rate_asc'}>
          {TUTOR_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </SelectField>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            Lọc
          </Button>
          {hasFilters && (
            <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>
              Xóa lọc
            </Button>
          )}
        </div>
      </form>

      <div aria-live="polite" aria-busy={search.isFetching}>
        {search.isPending ? (
          <ul
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Đang tải danh sách"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-48" />
              </li>
            ))}
          </ul>
        ) : search.isError ? (
          <Alert
            tone="danger"
            title="Không tải được danh sách gia sư"
            action={
              <Button variant="secondary" onClick={() => void search.refetch()}>
                Thử lại
              </Button>
            }
          >
            {search.error.message}
          </Alert>
        ) : page && page.items.length === 0 ? (
          <EmptyState
            title="Không có gia sư phù hợp"
            description={
              hasFilters
                ? 'Thử nới rộng khoảng giá hoặc chọn môn khác.'
                : 'Hiện chưa có gia sư nào được duyệt.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>
                  Xóa bộ lọc
                </Button>
              ) : undefined
            }
          />
        ) : page ? (
          <>
            <p className="mb-3 text-sm text-muted">{page.total} gia sư</p>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {page.items.map((tutor) => (
                <li key={tutor.id} className="relative">
                  <TutorCard tutor={tutor} />
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <nav aria-label="Phân trang" className="mt-6 flex items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  disabled={page.page <= 1}
                  onClick={() => goToPage(page.page - 1)}
                >
                  Trang trước
                </Button>
                <span className="text-sm text-muted">
                  Trang {page.page}/{totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page.page >= totalPages}
                  onClick={() => goToPage(page.page + 1)}
                >
                  Trang sau
                </Button>
              </nav>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

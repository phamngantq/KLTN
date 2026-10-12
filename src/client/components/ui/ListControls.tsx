import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/** Status card above a tabbed list ("Tìm kiếm gia sư", "Khiếu nại của tôi"). */
export function SummaryCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'neutral',
  active = false,
  onSelect,
}: {
  label: string;
  value: number | null;
  unit: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'warning' | 'info' | 'success';
  active?: boolean;
  onSelect?: () => void;
}) {
  const tones = {
    neutral: 'bg-surface text-primary',
    warning: 'bg-warning-surface text-warning',
    info: 'bg-info-surface text-primary',
    success: 'bg-success-surface text-success',
  } as const;
  const content: ReactNode = (
    <>
      <span className="flex items-center gap-2 text-sm font-medium">
        {Icon && <Icon aria-hidden="true" className="size-5" />}
        {label}
      </span>
      <span className="mt-3 block text-3xl font-bold">{value ?? '—'}</span>
      <span className="mt-1 block text-sm opacity-70">{unit}</span>
    </>
  );
  const className = `rounded-xl border p-5 text-left ${tones[tone]} ${
    active ? 'border-2 border-primary shadow-card' : 'border-border'
  }`;
  if (!onSelect) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`${className} transition-shadow hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
    >
      {content}
    </button>
  );
}

export function StatusTabs<Key extends string>({
  label,
  tabs,
  selected,
  onSelect,
}: {
  label: string;
  tabs: { key: Key; label: string; count: number | null }[];
  selected: Key | null;
  onSelect: (key: Key) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const isSelected = selected === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(tab.key)}
            className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
              isSelected
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-primary'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  isSelected ? 'bg-primary text-on-primary' : 'bg-surface text-muted'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-bg text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** "Hiển thị [10] · 1–2 / 2 bản ghi" plus first/previous/next/last page buttons. */
export function ListFooter({
  page,
  pageSize,
  pageSizes,
  shown,
  total,
  navigationLabel,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  pageSizes: readonly number[];
  shown: number;
  total: number;
  navigationLabel: string;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = shown ? (page - 1) * pageSize + 1 : 0;
  const lastRow = (page - 1) * pageSize + shown;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-3 text-sm text-muted">
        <label className="flex items-center gap-2">
          Hiển thị
          <select
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="min-h-11 rounded-md border border-border bg-bg px-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-focus"
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span role="status">
          {firstRow}–{lastRow} / <strong>{total}</strong> bản ghi
        </span>
      </div>
      <nav aria-label={navigationLabel} className="flex items-center gap-1">
        <PageButton label="Trang đầu" disabled={page <= 1} onClick={() => onPage(1)}>
          <ChevronsLeft aria-hidden="true" className="size-4" />
        </PageButton>
        <PageButton label="Trang trước" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden="true" className="size-4" />
        </PageButton>
        <span
          aria-current="page"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary px-2 text-sm font-semibold text-on-primary"
        >
          {page}
        </span>
        <PageButton label="Trang sau" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
          <ChevronRight aria-hidden="true" className="size-4" />
        </PageButton>
        <PageButton label="Trang cuối" disabled={page >= lastPage} onClick={() => onPage(lastPage)}>
          <ChevronsRight aria-hidden="true" className="size-4" />
        </PageButton>
      </nav>
    </div>
  );
}

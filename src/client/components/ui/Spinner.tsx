interface SpinnerProps {
  size?: 'sm' | 'md';
  /** Accessible text; pass "" when the surrounding control already announces busy state. */
  label?: string;
}

export function Spinner({ size = 'md', label = 'Đang tải…' }: SpinnerProps) {
  const dimension = size === 'sm' ? 'size-4' : 'size-6';
  return (
    <span role={label ? 'status' : undefined} className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`${dimension} inline-block animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none`}
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

/** Placeholder block for list/card loading states. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-border motion-reduce:animate-none ${className}`}
    />
  );
}

export function PageLoading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center text-muted">
      <Spinner label={label} />
    </div>
  );
}

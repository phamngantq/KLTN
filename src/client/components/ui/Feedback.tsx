import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'danger' | 'warning';

const TONES: Record<Tone, string> = {
  info: 'border-primary bg-info-surface text-fg',
  success: 'border-success bg-success-surface text-fg',
  danger: 'border-danger bg-danger-surface text-fg',
  warning: 'border-warning bg-warning-surface text-fg',
};

const TITLES: Record<Tone, string> = {
  info: 'Thông tin',
  success: 'Thành công',
  danger: 'Có lỗi',
  warning: 'Lưu ý',
};

interface AlertProps {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}

/** Errors use role=alert (announced immediately); others role=status. Never colour-only. */
export function Alert({ tone = 'info', title, children, action }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex flex-col gap-2 rounded-md border-l-4 p-4 ${TONES[tone]}`}
    >
      <p className="font-semibold">{title ?? TITLES[tone]}</p>
      <div className="text-sm">{children}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong p-8 text-center">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {description && <p className="max-w-prose text-muted">{description}</p>}
      {action}
    </div>
  );
}

const BADGE_TONES: Record<Tone | 'neutral', string> = {
  neutral: 'bg-surface text-fg border-border-strong',
  info: 'bg-info-surface text-primary border-primary',
  success: 'bg-success-surface text-success border-success',
  danger: 'bg-danger-surface text-danger border-danger',
  warning: 'bg-warning-surface text-warning border-warning',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone | 'neutral';
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[length:var(--text-caption)] font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-primary md:text-3xl">{title}</h1>
        {description && <p className="text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

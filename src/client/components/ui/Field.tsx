import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const CONTROL =
  'w-full min-h-11 rounded-md border border-border-strong bg-bg px-3 py-2 text-fg ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ' +
  'aria-[invalid=true]:border-danger disabled:bg-surface disabled:text-muted';

interface ShellProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean | undefined;
  children: (control: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

/** Label + hint + error wiring shared by all form controls (DESIGN_RULES §D2). */
function FieldShell({ label, hint, error, required, children }: ShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && (
        <p id={hintId} className="text-[length:var(--text-caption)] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type Common = { label: ReactNode; hint?: ReactNode; error?: string | undefined };

export function TextField({
  label,
  hint,
  error,
  className = '',
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={props.required}>
      {(control) => <input className={`${CONTROL} ${className}`} {...control} {...props} />}
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className = '',
  children,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={props.required}>
      {(control) => (
        <select className={`${CONTROL} ${className}`} {...control} {...props}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  className = '',
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={props.required}>
      {(control) => (
        <textarea className={`${CONTROL} min-h-28 ${className}`} {...control} {...props} />
      )}
    </FieldShell>
  );
}

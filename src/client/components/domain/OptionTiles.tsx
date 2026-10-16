import { useId, useState, type ReactNode } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';

export interface OptionTile {
  key: string;
  label: string;
  checked: boolean;
  /** Tutor-added options can be removed; built-in ones cannot. */
  removable?: boolean;
  hint?: string;
}

/**
 * Multi-select group drawn as rounded checkbox tiles in a grid, with an optional
 * "+ Thêm lựa chọn" form. `onAdd` returns an error message, or null when it accepted the label.
 */
export function OptionTiles({
  legend,
  description,
  options,
  onToggle,
  onRemove,
  onAdd,
  addForm,
  columns = 'sm:grid-cols-2 lg:grid-cols-3',
  error,
  children,
}: {
  legend: string;
  description?: string;
  options: OptionTile[];
  onToggle: (key: string, checked: boolean) => void;
  onRemove?: (key: string) => void;
  onAdd?: (label: string) => string | null;
  /** Replaces the single text input, e.g. province + place for areas. */
  addForm?: (close: () => void) => ReactNode;
  columns?: string;
  error?: string | undefined;
  children?: ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  function close() {
    setAdding(false);
    setDraft('');
    setAddError(null);
  }

  function confirm() {
    const message = onAdd?.(draft) ?? null;
    if (message) {
      setAddError(message);
      return;
    }
    close();
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 text-base font-semibold text-primary">{legend}</legend>
      {description && <p className="-mt-2 text-sm text-muted">{description}</p>}
      <ul className={`grid grid-cols-1 gap-2 ${columns}`}>
        {options.map((option) => (
          <li key={option.key} className="relative min-w-0">
            <label
              className={`relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${
                option.checked
                  ? 'border-primary bg-info-surface font-medium text-primary'
                  : 'border-border bg-bg hover:border-primary'
              } ${option.removable ? 'pr-12' : ''}`}
            >
              <input
                type="checkbox"
                className="absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-xl opacity-0"
                checked={option.checked}
                onChange={(event) => onToggle(option.key, event.target.checked)}
              />
              <span
                aria-hidden="true"
                className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 ${
                  option.checked
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border-strong bg-bg'
                }`}
              >
                {option.checked && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 break-words">
                {option.label}
                {option.hint && (
                  <span className="block text-xs font-normal text-muted">{option.hint}</span>
                )}
              </span>
            </label>
            {option.removable && onRemove && (
              <button
                type="button"
                aria-label={`Xóa lựa chọn ${option.label}`}
                onClick={() => onRemove(option.key)}
                className="absolute top-1/2 right-1 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {children}
      {error && <p className="text-sm text-danger">{error}</p>}
      {(onAdd || addForm) &&
        (adding ? (
          addForm ? (
            addForm(close)
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-primary/40 p-3">
              <label htmlFor={inputId} className="text-sm font-medium">
                Lựa chọn mới
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={inputId}
                  autoFocus
                  maxLength={80}
                  value={draft}
                  aria-invalid={Boolean(addError)}
                  aria-describedby={addError ? errorId : undefined}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setAddError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      confirm();
                    }
                    if (event.key === 'Escape') close();
                  }}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-strong bg-bg px-3 text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                />
                <div className="flex gap-2">
                  <Button type="button" onClick={confirm}>
                    Thêm
                  </Button>
                  <Button type="button" variant="secondary" onClick={close}>
                    Hủy
                  </Button>
                </div>
              </div>
              {addError && (
                <p id={errorId} role="alert" className="text-sm text-danger">
                  {addError}
                </p>
              )}
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label={`Thêm lựa chọn: ${legend}`}
            className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg border border-dashed border-primary px-3 text-sm font-medium text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Plus aria-hidden="true" className="size-4" />
            Thêm lựa chọn
          </button>
        ))}
    </fieldset>
  );
}

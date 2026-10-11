import { useState, type FormEvent } from 'react';
import { addDays, todayIn } from '../../../shared/time';
import {
  useCreateException,
  useDeleteException,
  useExceptions,
} from '../../features/availability/api';
import { fieldErrors } from '../../lib/api-client';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../ui/Feedback';
import { TextField } from '../ui/Field';
import { PageLoading } from '../ui/Spinner';
import { TimeSelect } from './TimeSelect';

type Mode = 'closed-day' | 'closed-window' | 'extra';

const MODE_LABELS: Record<Mode, string> = {
  'closed-day': 'Nghỉ cả ngày',
  'closed-window': 'Nghỉ một khung giờ',
  extra: 'Mở thêm khung giờ',
};

function describeDate(date: string) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function AffectedWarning({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Alert tone="warning" title="Có buổi học bị ảnh hưởng">
      {count} buổi học đã đặt nằm ngoài lịch sau thay đổi này. Các buổi này{' '}
      <strong>không bị hủy tự động</strong>.
    </Alert>
  );
}

/** Date-specific overrides; kept separate from weekly hours so a day off never deletes a rule. */
export function ExceptionsPanel() {
  const exceptions = useExceptions();
  const create = useCreateException();
  const remove = useDeleteException();
  const timezone = exceptions.data?.timezone ?? 'Asia/Ho_Chi_Minh';
  const today = todayIn(timezone);
  const [mode, setMode] = useState<Mode>('closed-day');
  const [date, setDate] = useState(addDays(today, 1));
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('10:00');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [affected, setAffected] = useState<number | null>(null);
  const errors = fieldErrors(create.error);

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setAffected(null);
    create.mutate(
      {
        date,
        kind: mode === 'extra' ? 'extra' : 'closed',
        ...(mode !== 'closed-day' && { start, end }),
      },
      { onSuccess: (result) => setAffected(result.affectedBookings) },
    );
  }

  const toDelete = exceptions.data?.exceptions.find((e) => e.id === pendingDelete);

  return (
    <section aria-labelledby="exceptions-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="exceptions-heading" className="text-lg font-semibold">
          Ngoại lệ theo ngày
        </h2>
        <p className="text-sm text-muted">
          Nghỉ lễ, nghỉ đột xuất hoặc mở thêm giờ cho một ngày cụ thể. Không ảnh hưởng lịch tuần.
          Múi giờ: {timezone}.
        </p>
      </div>

      <form
        onSubmit={onCreate}
        noValidate
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 w-full text-sm font-medium">Loại ngoại lệ</legend>
          {(Object.keys(MODE_LABELS) as Mode[]).map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-bg px-3 has-[:checked]:border-primary has-[:checked]:bg-info-surface"
            >
              <input
                type="radio"
                name="exception-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="size-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm">{MODE_LABELS[value]}</span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <TextField
              label="Ngày"
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={errors.date}
              required
            />
          </div>
          {mode !== 'closed-day' && (
            <div className="flex items-center gap-2">
              <TimeSelect
                kind="start"
                aria-label="Giờ bắt đầu ngoại lệ"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <span aria-hidden="true">–</span>
              <TimeSelect
                kind="end"
                aria-label="Giờ kết thúc ngoại lệ"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          )}
          <Button type="submit" loading={create.isPending}>
            Thêm ngoại lệ
          </Button>
        </div>
        {create.isError && (
          <Alert tone="danger" title="Không thêm được ngoại lệ">
            {Object.values(errors)[0] ?? create.error.message}
          </Alert>
        )}
        {affected !== null && <AffectedWarning count={affected} />}
        {affected === 0 && <Alert tone="success">Đã thêm ngoại lệ.</Alert>}
      </form>

      {exceptions.isPending ? (
        <PageLoading />
      ) : exceptions.isError ? (
        <Alert
          tone="danger"
          title="Không tải được ngoại lệ"
          action={
            <Button variant="secondary" onClick={() => void exceptions.refetch()}>
              Thử lại
            </Button>
          }
        >
          {exceptions.error.message}
        </Alert>
      ) : exceptions.data.exceptions.length === 0 ? (
        <EmptyState
          title="Chưa có ngoại lệ sắp tới"
          description="Lịch tuần đang được áp dụng cho mọi ngày."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {exceptions.data.exceptions.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="w-28 font-medium">{describeDate(e.date)}</span>
              <Badge tone={e.kind === 'closed' ? 'warning' : 'success'}>
                {e.kind === 'closed' ? (e.start ? 'Nghỉ' : 'Nghỉ cả ngày') : 'Mở thêm'}
              </Badge>
              {e.start && (
                <span className="text-sm">
                  {e.start}–{e.end}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                aria-label={`Xóa ngoại lệ ngày ${describeDate(e.date)}`}
                onClick={() => setPendingDelete(e.id)}
              >
                Xóa
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xóa ngoại lệ?"
        description={
          toDelete
            ? `Ngoại lệ ngày ${describeDate(toDelete.date)} sẽ bị xóa; lịch tuần được áp dụng lại cho ngày này.`
            : ''
        }
        confirmLabel="Xóa ngoại lệ"
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove.mutate(pendingDelete, {
            onSuccess: (result) => {
              setPendingDelete(null);
              setAffected(result.affectedBookings);
            },
          });
        }}
      >
        {remove.isError && <Alert tone="danger">{remove.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}

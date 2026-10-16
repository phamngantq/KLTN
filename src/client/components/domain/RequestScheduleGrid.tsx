import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { CreateParentRequestInput } from '../../../shared/schemas/requests';

type Window = CreateParentRequestInput['schedule']['windows'][number];
type Slot = Pick<Window, 'startLocal' | 'endLocal'>;

const TIME_SLOTS: Slot[] = [
  { startLocal: '09:00', endLocal: '10:30' },
  { startLocal: '10:30', endLocal: '12:00' },
  { startLocal: '13:30', endLocal: '15:00' },
  { startLocal: '15:30', endLocal: '17:00' },
  { startLocal: '17:30', endLocal: '19:00' },
  { startLocal: '19:30', endLocal: '21:00' },
  { startLocal: '21:00', endLocal: '22:30' },
];

const DAYS = [
  { weekday: 1, short: 'T2', name: 'Thứ Hai' },
  { weekday: 2, short: 'T3', name: 'Thứ Ba' },
  { weekday: 3, short: 'T4', name: 'Thứ Tư' },
  { weekday: 4, short: 'T5', name: 'Thứ Năm' },
  { weekday: 5, short: 'T6', name: 'Thứ Sáu' },
  { weekday: 6, short: 'T7', name: 'Thứ Bảy' },
  { weekday: 7, short: 'CN', name: 'Chủ nhật' },
] as const;

const sameCell = (window: Window, weekday: number, slot: Slot) =>
  window.weekday === weekday &&
  window.startLocal === slot.startLocal &&
  window.endLocal === slot.endLocal;

export function isRequestGridWindow(window: Window): boolean {
  return TIME_SLOTS.some(
    (slot) => window.startLocal === slot.startLocal && window.endLocal === slot.endLocal,
  );
}

export function RequestScheduleGrid({
  value,
  onChange,
  maxWindows = Number.POSITIVE_INFINITY,
  disabled = false,
  caption = 'Chọn thời gian học mong muốn theo tuần',
}: {
  value: Window[];
  onChange: (windows: Window[]) => void;
  maxWindows?: number;
  disabled?: boolean;
  caption?: string;
}) {
  const valueRef = useRef(value);
  const dragRef = useRef<'add' | 'remove' | null>(null);
  const [limitMessage, setLimitMessage] = useState('');

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  function selected(weekday: number, slot: Slot): boolean {
    return value.some((window) => sameCell(window, weekday, slot));
  }

  function change(next: Window[]) {
    if (disabled) return;
    if (next.length > maxWindows) {
      setLimitMessage(`Chỉ được chọn tối đa ${maxWindows} khung giờ mỗi tuần.`);
      return;
    }
    valueRef.current = next;
    setLimitMessage('');
    onChange(next);
  }

  function applyCell(weekday: number, slot: Slot, mode: 'add' | 'remove') {
    const current = valueRef.current;
    const exists = current.some((window) => sameCell(window, weekday, slot));
    if (mode === 'add' && !exists) change([...current, { weekday, ...slot }]);
    if (mode === 'remove' && exists)
      change(current.filter((window) => !sameCell(window, weekday, slot)));
  }

  function beginPointer(event: PointerEvent<HTMLButtonElement>, weekday: number, slot: Slot) {
    if (disabled) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragRef.current = selected(weekday, slot) ? 'remove' : 'add';
    event.currentTarget.setPointerCapture?.(event.pointerId);
    applyCell(weekday, slot, dragRef.current);
  }

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !dragRef.current) return;
    const target = document.elementFromPoint?.(event.clientX, event.clientY);
    const cell = target?.closest<HTMLButtonElement>('[data-weekday][data-slot]');
    if (!cell || !event.currentTarget.contains(cell)) return;
    const weekday = Number(cell.dataset.weekday);
    const slot = TIME_SLOTS[Number(cell.dataset.slot)];
    if (slot && weekday >= 1 && weekday <= 7) applyCell(weekday, slot, dragRef.current);
  }

  function toggleGroup(cells: Window[]) {
    if (disabled) return;
    const current = valueRef.current;
    const includes = (window: Window) =>
      current.some((item) => sameCell(item, window.weekday, window));
    const allSelected = cells.every(includes);
    if (allSelected) {
      change(
        current.filter((item) => !cells.some((window) => sameCell(item, window.weekday, window))),
      );
    } else {
      change([...current, ...cells.filter((window) => !includes(window))]);
    }
  }

  const selectedCount = value.filter(isRequestGridWindow).length;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Chọn từng ô, cả ngày hoặc cả khung giờ.</p>
        {selectedCount > 0 && !disabled && (
          <button
            type="button"
            onClick={() =>
              change(valueRef.current.filter((window) => !isRequestGridWindow(window)))
            }
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <X aria-hidden="true" className="size-4" /> Xóa lựa chọn
          </button>
        )}
      </div>
      <div
        className="min-w-0 overflow-x-auto"
        onPointerMove={movePointer}
        onPointerUp={() => (dragRef.current = null)}
        onPointerCancel={() => (dragRef.current = null)}
      >
        <table className="w-full min-w-[440px] border-separate border-spacing-1 text-center">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="min-w-20" />
              {DAYS.map((day) => {
                const cells = TIME_SLOTS.map((slot) => ({ weekday: day.weekday, ...slot }));
                const allSelected = cells.every((window) => selected(day.weekday, window));
                return (
                  <th scope="col" key={day.weekday}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(cells)}
                      disabled={disabled}
                      aria-label={`${allSelected ? 'Bỏ chọn' : 'Chọn'} cả ${day.name}`}
                      className={`min-h-11 w-full rounded-lg px-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${allSelected ? 'bg-info-surface text-primary' : 'text-muted hover:bg-info-surface'}`}
                    >
                      {day.short}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((slot, slotIndex) => {
              const cells = DAYS.map((day) => ({ weekday: day.weekday, ...slot }));
              const allSelected = cells.every((window) => selected(window.weekday, slot));
              return (
                <tr key={slot.startLocal}>
                  <th scope="row" className="sticky left-0 z-10 bg-surface text-right">
                    <button
                      type="button"
                      onClick={() => toggleGroup(cells)}
                      disabled={disabled}
                      aria-label={`${allSelected ? 'Bỏ chọn' : 'Chọn'} khung ${slot.startLocal}–${slot.endLocal} cả tuần`}
                      className={`min-h-11 w-full rounded-md px-1 text-[11px] leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${allSelected ? 'font-semibold text-primary' : 'text-muted hover:text-primary'}`}
                    >
                      {slot.startLocal}
                      <br />
                      {slot.endLocal}
                    </button>
                  </th>
                  {DAYS.map((day) => {
                    const active = selected(day.weekday, slot);
                    return (
                      <td key={day.weekday}>
                        <button
                          type="button"
                          data-weekday={day.weekday}
                          data-slot={slotIndex}
                          aria-label={`${day.name}, ${slot.startLocal}–${slot.endLocal}`}
                          aria-pressed={active}
                          disabled={disabled}
                          onPointerDown={(event) => beginPointer(event, day.weekday, slot)}
                          onClick={(event) => {
                            if (event.detail === 0)
                              applyCell(day.weekday, slot, active ? 'remove' : 'add');
                          }}
                          className={`flex min-h-11 min-w-10 w-full touch-none items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${disabled ? 'cursor-default border-border bg-surface opacity-50' : active ? 'border-primary bg-primary text-on-primary' : 'border-border bg-bg hover:border-primary hover:bg-info-surface'}`}
                        >
                          {active && <Check aria-hidden="true" className="size-4" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted" role="status">
        {disabled
          ? 'Lưới thời gian đã tắt vì bạn chọn trao đổi thời gian sau.'
          : Number.isFinite(maxWindows)
            ? `Đã chọn ${value.length} khung giờ/tuần · tối đa ${maxWindows} khung giờ cho cả lịch.`
            : `Đã chọn ${value.length} khung giờ/tuần`}
      </p>
      {limitMessage && (
        <p role="alert" className="text-sm text-danger">
          {limitMessage}
        </p>
      )}
    </div>
  );
}

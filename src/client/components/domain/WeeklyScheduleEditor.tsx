import { useState } from 'react';
import { findOverlaps } from '../../../shared/availability';
import { timeToMinutes, type WeeklyAvailability } from '../../../shared/schemas/availability';
import { minutesToTime } from '../../../shared/time';
import { useSaveWeekly } from '../../features/availability/api';
import { WEEKDAY_LABELS } from '../../lib/format';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Feedback';
import { SelectField } from '../ui/Field';
import { TimeSelect } from './TimeSelect';

interface DraftRule {
  key: string;
  weekday: number;
  start: string;
  end: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

const TIMEZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/London',
  'America/New_York',
  'UTC',
];

function toDraft(weekly: WeeklyAvailability): DraftRule[] {
  return weekly.rules.map((rule) => ({ key: rule.id, ...rule }));
}

function snapshot(timezone: string, rules: DraftRule[]) {
  return JSON.stringify({
    timezone,
    rules: rules
      .map(({ weekday, start, end, effectiveFrom, effectiveTo }) => [
        weekday,
        start,
        end,
        effectiveFrom,
        effectiveTo,
      ])
      .sort(),
  });
}

/** Weekly recurring hours, Monday → Sunday. Mirrors server validation for instant feedback. */
export function WeeklyScheduleEditor({ weekly }: { weekly: WeeklyAvailability }) {
  const [baseline, setBaseline] = useState(weekly);
  const [timezone, setTimezone] = useState(weekly.timezone);
  const [rules, setRules] = useState<DraftRule[]>(() => toDraft(weekly));
  const save = useSaveWeekly();
  const [result, setResult] = useState<{ affectedBookings: number } | null>(null);

  const dirty = snapshot(timezone, rules) !== snapshot(baseline.timezone, toDraft(baseline));
  const inverted = new Set(
    rules.filter((r) => timeToMinutes(r.start) >= timeToMinutes(r.end)).map((r) => r.key),
  );
  const overlapping = new Set(
    findOverlaps(rules).flatMap(({ first, second }) => [rules[first]!.key, rules[second]!.key]),
  );
  const invalid = inverted.size > 0 || overlapping.size > 0;

  function change(next: DraftRule[]) {
    setResult(null);
    setRules(next);
  }

  function addWindow(weekday: number) {
    const sameDay = rules.filter((r) => r.weekday === weekday);
    const lastEnd = sameDay.length
      ? Math.max(...sameDay.map((r) => timeToMinutes(r.end)))
      : 18 * 60;
    const start = Math.min(lastEnd, 22 * 60);
    change([
      ...rules,
      {
        key: crypto.randomUUID(),
        weekday,
        start: minutesToTime(start),
        end: minutesToTime(start + 60),
        effectiveFrom: null,
        effectiveTo: null,
      },
    ]);
  }

  function onSave() {
    save.mutate(
      {
        timezone,
        rules: rules.map(({ weekday, start, end, effectiveFrom, effectiveTo }) => ({
          weekday,
          start,
          end,
          effectiveFrom,
          effectiveTo,
        })),
      },
      {
        onSuccess: ({ affectedBookings, ...saved }) => {
          setBaseline(saved);
          setTimezone(saved.timezone);
          setRules(toDraft(saved));
          setResult({ affectedBookings });
        },
      },
    );
  }

  return (
    <section aria-labelledby="weekly-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="weekly-heading" className="text-lg font-semibold">
          Lịch lặp hằng tuần
        </h2>
        <p className="text-sm text-muted">
          Các khung giờ lặp lại mỗi tuần. Bước 30 phút, không vắt qua nửa đêm.
        </p>
      </div>
      <div className="max-w-xs">
        <SelectField
          label="Múi giờ"
          value={timezone}
          onChange={(e) => {
            setResult(null);
            setTimezone(e.target.value);
          }}
        >
          {[...new Set([timezone, ...TIMEZONES])].map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </SelectField>
      </div>

      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
          const dayRules = rules
            .filter((r) => r.weekday === weekday)
            .sort((a, b) => a.start.localeCompare(b.start));
          const label = WEEKDAY_LABELS[weekday]!;
          return (
            <li key={weekday} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <h3 className="w-28 shrink-0 pt-2 font-medium">{label}</h3>
              <div className="flex flex-1 flex-col gap-2">
                {dayRules.length === 0 && <p className="pt-2 text-sm text-muted">Không dạy</p>}
                {dayRules.map((rule) => {
                  const ruleInvalid = inverted.has(rule.key) || overlapping.has(rule.key);
                  const update = (patch: Partial<DraftRule>) =>
                    change(rules.map((r) => (r.key === rule.key ? { ...r, ...patch } : r)));
                  return (
                    <div key={rule.key} className="flex flex-wrap items-center gap-2">
                      <TimeSelect
                        kind="start"
                        aria-label={`${label}: giờ bắt đầu`}
                        value={rule.start}
                        invalid={ruleInvalid}
                        onChange={(e) => update({ start: e.target.value })}
                      />
                      <span aria-hidden="true">–</span>
                      <TimeSelect
                        kind="end"
                        aria-label={`${label}: giờ kết thúc`}
                        value={rule.end}
                        invalid={ruleInvalid}
                        onChange={(e) => update({ end: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Xóa khung ${rule.start}–${rule.end} ${label}`}
                        onClick={() => change(rules.filter((r) => r.key !== rule.key))}
                      >
                        Xóa
                      </Button>
                      {inverted.has(rule.key) && (
                        <span className="text-sm text-danger">
                          Giờ bắt đầu phải trước giờ kết thúc.
                        </span>
                      )}
                      {!inverted.has(rule.key) && overlapping.has(rule.key) && (
                        <span className="text-sm text-danger">Trùng với khung giờ khác.</span>
                      )}
                      {(rule.effectiveFrom || rule.effectiveTo) && (
                        <span className="text-sm text-muted">
                          Hiệu lực {rule.effectiveFrom ?? '…'} → {rule.effectiveTo ?? '…'}
                        </span>
                      )}
                    </div>
                  );
                })}
                <div>
                  <Button variant="secondary" size="sm" onClick={() => addWindow(weekday)}>
                    + Thêm khung giờ
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {save.isError && (
        <Alert tone="danger" title="Không lưu được lịch">
          {save.error.message}
        </Alert>
      )}
      {result && result.affectedBookings > 0 && (
        <Alert tone="warning" title="Có buổi học bị ảnh hưởng">
          {result.affectedBookings} buổi học đã đặt không còn nằm trong lịch mới. Các buổi này{' '}
          <strong>không bị hủy tự động</strong> — hãy xử lý trong mục Yêu cầu đặt lịch.
        </Alert>
      )}
      {result && result.affectedBookings === 0 && <Alert tone="success">Đã lưu lịch tuần.</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSave} disabled={!dirty || invalid} loading={save.isPending}>
          Lưu lịch tuần
        </Button>
        {dirty && (
          <Button
            variant="secondary"
            onClick={() => {
              setTimezone(baseline.timezone);
              setRules(toDraft(baseline));
            }}
            disabled={save.isPending}
          >
            Hoàn tác thay đổi
          </Button>
        )}
        {dirty && <span className="text-sm text-warning">Có thay đổi chưa lưu</span>}
        {invalid && (
          <span className="text-sm text-danger">Sửa các khung giờ không hợp lệ trước khi lưu.</span>
        )}
      </div>
    </section>
  );
}

const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

export function formatVnd(amountMinor: number): string {
  return vnd.format(amountMinor);
}

/** e.g. "Thứ Hai, 02/11/2026" in the given IANA time zone. */
export function formatDate(isoUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(isoUtc));
}

/** 24h "HH:mm" in the given IANA time zone. */
export function formatTime(isoUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(isoUtc));
}

export function formatTimeRange(startUtc: string, endUtc: string, timeZone: string): string {
  return `${formatTime(startUtc, timeZone)}–${formatTime(endUtc, timeZone)}`;
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
  7: 'Chủ nhật',
};

export const ROLE_LABELS = { student: 'Học viên', tutor: 'Gia sư', admin: 'Quản trị' } as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0]];
  return letters.join('').toUpperCase() || '?';
}

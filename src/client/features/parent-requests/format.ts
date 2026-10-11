import type { RequestStatus } from '../../../shared/schemas/requests';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: 'Bản nháp',
  submitted: 'Đã gửi',
  sourcing: 'Đang tìm gia sư',
  assigned: 'Đã gán gia sư',
  fulfilled: 'Đã hoàn tất',
  cancelled: 'Đã hủy',
};

export const WEEKDAY_LABELS = [
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
  'Chủ nhật',
] as const;

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday - 1] ?? `Ngày ${weekday}`;
}

export function requestDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

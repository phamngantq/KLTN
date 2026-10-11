import { z } from 'zod';
import { BOOKING_DURATIONS, type BookingDuration } from './availability';

export const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * Only what the student chooses. Price, rate, student identity and status are derived server-side;
 * any extra field (e.g. priceMinor, studentId, status) is rejected with 422.
 */
export const createBookingSchema = z.strictObject({
  tutorId: z.uuid(),
  startUtc: z.iso.datetime({ offset: false, precision: 3 }),
  durationMinutes: z
    .number()
    .int()
    .refine((v): v is BookingDuration => (BOOKING_DURATIONS as readonly number[]).includes(v), {
      message: 'Thời lượng phải là 30, 60, 90 hoặc 120 phút.',
    }),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export interface Booking {
  id: string;
  tutorId: string;
  studentId: string;
  tutorName: string;
  studentName: string;
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes: number;
  status: BookingStatus;
  hourlyRateMinor: number;
  priceMinor: number;
  currency: 'VND';
  createdAt: string;
  updatedAt: string;
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn thành',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
};

/** Shown before any cancellation (DEC-005). */
export const CANCELLATION_POLICY =
  'Có thể hủy yêu cầu hoặc buổi học đã xác nhận trước giờ bắt đầu. Sau giờ bắt đầu không thể hủy trên hệ thống.';

export const BOOKING_ACTIONS = ['confirm', 'reject', 'cancel', 'complete'] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];

/** Tabs/filters accept one or more statuses, e.g. `?status=CANCELLED,REJECTED,EXPIRED`. */
export const bookingListSchema = z.object({
  status: z
    .string()
    .transform((v) => v.split(',').filter(Boolean))
    .pipe(z.array(z.enum(BOOKING_STATUSES)).min(1).max(BOOKING_STATUSES.length))
    .optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type BookingListQuery = z.infer<typeof bookingListSchema>;

/** Which actions the viewer may attempt now (server re-checks every rule on submit). */
export interface BookingWithActions extends Booking {
  allowedActions: BookingAction[];
}

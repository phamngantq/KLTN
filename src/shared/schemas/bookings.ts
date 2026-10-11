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

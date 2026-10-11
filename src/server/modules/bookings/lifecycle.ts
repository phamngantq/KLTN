/**
 * Booking state machine (PLAN §3.4, TASKS §A.6, DEC-005). Checked as (actor, current state, action);
 * the client never sets a status directly.
 *
 *   PENDING ──confirm(tutor)──▶ CONFIRMED ──complete(tutor, after end)──▶ COMPLETED
 *      │                           │
 *      ├─reject(tutor)──▶ REJECTED  └─cancel(participant, before start)──▶ CANCELLED
 *      └─cancel(participant, before start)──▶ CANCELLED
 *
 * EXPIRED exists in the schema but nothing sets it automatically (no Cron, TASKS §A.6).
 */
import type { BookingAction, BookingStatus } from '../../../shared/schemas/bookings';

export type Participant = 'tutor' | 'student';

interface Rule {
  from: readonly BookingStatus[];
  to: BookingStatus;
  actor: Participant | 'either';
  /** Free the 30-minute claims in the same transaction (slot becomes bookable again). */
  releasesClaims: boolean;
  timing: (b: { startsAtUtc: string; endsAtUtc: string }, now: Date) => boolean;
  timingMessage: string;
}

export const TRANSITIONS: Record<BookingAction, Rule> = {
  confirm: {
    from: ['PENDING'],
    to: 'CONFIRMED',
    actor: 'tutor',
    releasesClaims: false,
    timing: (b, now) => now.getTime() < Date.parse(b.startsAtUtc),
    timingMessage: 'Không thể xác nhận buổi học đã bắt đầu.',
  },
  reject: {
    from: ['PENDING'],
    to: 'REJECTED',
    actor: 'tutor',
    releasesClaims: true,
    timing: () => true,
    timingMessage: '',
  },
  cancel: {
    from: ['PENDING', 'CONFIRMED'],
    to: 'CANCELLED',
    actor: 'either',
    releasesClaims: true,
    timing: (b, now) => now.getTime() < Date.parse(b.startsAtUtc),
    timingMessage: 'Chỉ có thể hủy trước giờ bắt đầu.',
  },
  complete: {
    from: ['CONFIRMED'],
    to: 'COMPLETED',
    actor: 'tutor',
    // Claims are kept: completion must never re-open time that was actually used.
    releasesClaims: false,
    timing: (b, now) => now.getTime() >= Date.parse(b.endsAtUtc),
    timingMessage: 'Chỉ có thể đánh dấu hoàn thành sau khi buổi học kết thúc.',
  },
};

export function actorAllowed(rule: Rule, participant: Participant): boolean {
  return rule.actor === 'either' || rule.actor === participant;
}

/** Actions the participant could perform right now (UI hint; the server re-validates). */
export function allowedActions(
  booking: { status: BookingStatus; startsAtUtc: string; endsAtUtc: string },
  participant: Participant,
  now: Date,
): BookingAction[] {
  return (Object.keys(TRANSITIONS) as BookingAction[]).filter((action) => {
    const rule = TRANSITIONS[action];
    return (
      actorAllowed(rule, participant) &&
      rule.from.includes(booking.status) &&
      rule.timing(booking, now)
    );
  });
}

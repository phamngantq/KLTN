/**
 * Drizzle mirror of migrations/*.sql. The SQL migrations are the source of truth;
 * keep this file in sync with the SQL by hand (a schema sync test is still TODO in TASK-02).
 */
import { sql } from 'drizzle-orm';
import { DEFAULT_TIMEZONE } from '../../shared/schemas/availability';
import { BOOKING_STATUSES } from '../../shared/schemas/bookings';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const USER_ROLES = ['student', 'tutor', 'admin'] as const;
export const USER_STATUSES = ['active', 'suspended'] as const;
export const APPROVAL_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const;
export const VISIBILITIES = ['private', 'public'] as const;
export const EXCEPTION_KINDS = ['closed', 'extra'] as const;
export const IDEMPOTENCY_STATUSES = ['processing', 'completed'] as const;
export const CURRENCIES = ['VND'] as const;

// Column builders shared by several tables.
const currency = () => text('currency', { enum: CURRENCIES }).notNull().default('VND');
const timezone = () => text('timezone').notNull().default(DEFAULT_TIMEZONE);
const timestamps = () => ({
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull(),
    status: text('status', { enum: USER_STATUSES }).notNull().default('active'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('users_email_normalized_uq').on(t.emailNormalized)],
);

export const authCredentials = sqliteTable('auth_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
  },
  (t) => [
    uniqueIndex('auth_sessions_token_hash_uq').on(t.tokenHash),
    index('auth_sessions_user_expires_idx').on(t.userId, t.expiresAt),
  ],
);

export const tutorProfiles = sqliteTable(
  'tutor_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    bio: text('bio').notNull().default(''),
    hourlyRateMinor: integer('hourly_rate_minor'),
    currency: currency(),
    teachesOnline: integer('teaches_online', { mode: 'boolean' }).notNull().default(false),
    teachesOffline: integer('teaches_offline', { mode: 'boolean' }).notNull().default(false),
    approvalStatus: text('approval_status', { enum: APPROVAL_STATUSES }).notNull().default('draft'),
    visibility: text('visibility', { enum: VISIBILITIES }).notNull().default('private'),
    ...timestamps(),
    moderationNote: text('moderation_note'),
  },
  (t) => [
    uniqueIndex('tutor_profiles_slug_uq').on(t.slug),
    index('tutor_profiles_public_rate_idx').on(t.approvalStatus, t.visibility, t.hourlyRateMinor),
    index('tutor_profiles_moderation_idx').on(t.approvalStatus, t.updatedAt),
  ],
);

export const subjects = sqliteTable(
  'subjects',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('subjects_slug_uq').on(t.slug)],
);

export const tutorSubjects = sqliteTable(
  'tutor_subjects',
  {
    tutorId: text('tutor_id')
      .notNull()
      .references(() => tutorProfiles.userId, { onDelete: 'cascade' }),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.tutorId, t.subjectId] }),
    index('tutor_subjects_subject_idx').on(t.subjectId, t.tutorId),
  ],
);

export const availabilityRules = sqliteTable(
  'availability_rules',
  {
    id: text('id').primaryKey(),
    tutorId: text('tutor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startLocal: text('start_local').notNull(),
    endLocal: text('end_local').notNull(),
    timezone: timezone(),
    effectiveFrom: text('effective_from'),
    effectiveTo: text('effective_to'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('availability_rules_tutor_weekday_idx').on(t.tutorId, t.weekday)],
);

export const availabilityExceptions = sqliteTable(
  'availability_exceptions',
  {
    id: text('id').primaryKey(),
    tutorId: text('tutor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dateLocal: text('date_local').notNull(),
    kind: text('kind', { enum: EXCEPTION_KINDS }).notNull(),
    startLocal: text('start_local'),
    endLocal: text('end_local'),
    timezone: timezone(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('availability_exceptions_tutor_date_idx').on(t.tutorId, t.dateLocal)],
);

export const bookings = sqliteTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    tutorId: text('tutor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    studentId: text('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    startsAtUtc: text('starts_at_utc').notNull(),
    endsAtUtc: text('ends_at_utc').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    status: text('status', { enum: BOOKING_STATUSES }).notNull(),
    hourlyRateMinor: integer('hourly_rate_minor').notNull(),
    priceMinor: integer('price_minor').notNull(),
    currency: currency(),
    ...timestamps(),
    version: integer('version').notNull().default(0),
  },
  (t) => [
    index('bookings_tutor_starts_idx').on(t.tutorId, t.startsAtUtc),
    index('bookings_student_starts_idx').on(t.studentId, t.startsAtUtc),
  ],
);

export const bookingSlotClaims = sqliteTable(
  'booking_slot_claims',
  {
    tutorId: text('tutor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    slotStartUtc: text('slot_start_utc').notNull(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.tutorId, t.slotStartUtc] }),
    index('booking_slot_claims_booking_idx').on(t.bookingId),
  ],
);

export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status', { enum: IDEMPOTENCY_STATUSES }).notNull(),
    responseStatus: integer('response_status'),
    resultRef: text('result_ref'),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.endpoint, t.idempotencyKey] }),
    index('idempotency_keys_expires_idx').on(t.expiresAt),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    metadata: text('metadata')
      .notNull()
      .default(sql`'{}'`),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('audit_logs_target_idx').on(t.targetType, t.targetId, t.createdAt),
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt),
  ],
);

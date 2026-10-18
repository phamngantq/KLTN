/**
 * Drizzle mirror of migrations/*.sql. The SQL migrations are the source of truth;
 * keep this file in sync with the SQL by hand (a schema sync test is still TODO in TASK-02).
 */
import { desc, sql } from 'drizzle-orm';
import { DEFAULT_TIMEZONE } from '../../shared/schemas/availability';
import { BOOKING_STATUSES } from '../../shared/schemas/bookings';
import { COMPLAINT_ATTACHMENT_TYPES, COMPLAINT_STATUSES } from '../../shared/schemas/complaints';
import { CONTENT_CATEGORIES } from '../../shared/schemas/content';
import { CLASS_ASSIGNMENT_STATUSES } from '../../shared/schemas/admin-assignments';
import { EDUCATION_LEVELS, REQUEST_STATUSES } from '../../shared/schemas/requests';
import {
  CLASS_STATUSES,
  FEE_OPTION_KEYS,
  FEE_OPTION_STATUSES,
  APPLICATION_STATUSES,
} from '../../shared/schemas/classes';
import {
  PRICING_CATALOG_STATUSES,
  PRICING_LEVELS,
  PRICING_MODES,
  LEARNER_PRICE_DIMENSIONS,
  LEARNER_PRICE_GROUPS,
  TUTOR_TYPES,
} from '../../shared/schemas/pricing';
import { TUTOR_OFFER_STATUSES } from '../../shared/schemas/tutor-offers';
import {
  CUSTOM_OPTION_KINDS,
  ID_VERIFICATION_METHODS,
  TUTOR_DOCUMENT_KINDS,
  TUTOR_DOCUMENT_TYPES,
} from '../../shared/schemas/tutors';
import { TUTOR_OFFER_JOIN_STATUSES } from '../../shared/schemas/tutor-offer-joins';
import {
  type AnySQLiteColumn,
  blob,
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

/** Minimal private parent contact. Existing student rows may have no profile until first edit. */
export const parentProfiles = sqliteTable('parent_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone'),
  ...timestamps(),
});

export const parentRequests = sqliteTable(
  'parent_requests',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    parentUserId: text('parent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    grade: text('grade').notNull(),
    mode: text('mode', { enum: ['online', 'offline'] }).notNull(),
    area: text('area'),
    expectedBudgetMinor: integer('expected_budget_minor'),
    description: text('description').notNull(),
    status: text('status', { enum: REQUEST_STATUSES }).notNull().default('draft'),
    version: integer('version').notNull().default(1),
    mutationId: text('mutation_id').notNull(),
    timezone: timezone(),
    discussLater: integer('discuss_later', { mode: 'boolean' }).notNull(),
    ...timestamps(),
    educationLevel: text('education_level', { enum: EDUCATION_LEVELS }),
    sessionsPerWeek: integer('sessions_per_week'),
    tutorRequirements: text('tutor_requirements').notNull().default(''),
    studentTraits: text('student_traits').notNull().default(''),
  },
  (t) => [
    uniqueIndex('parent_requests_code_uq').on(t.code),
    index('parent_requests_owner_created_idx').on(t.parentUserId, desc(t.createdAt), t.id),
    index('parent_requests_status_updated_idx').on(t.status, desc(t.updatedAt), t.id),
  ],
);

export const parentRequestPrivate = sqliteTable('parent_request_private', {
  requestId: text('request_id')
    .primaryKey()
    .references(() => parentRequests.id, { onDelete: 'cascade' }),
  contactPhone: text('contact_phone'),
  contactAddress: text('contact_address'),
  contactConsentAt: text('contact_consent_at'),
  contactConsentVersion: text('contact_consent_version'),
  studentName: text('student_name'),
});

export const requestScheduleWindows = sqliteTable(
  'request_schedule_windows',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => parentRequests.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startLocal: text('start_local').notNull(),
    endLocal: text('end_local').notNull(),
    timezone: timezone(),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.weekday, t.startLocal] }),
    index('request_schedule_windows_request_weekday_idx').on(t.requestId, t.weekday),
  ],
);

export const classListings = sqliteTable(
  'class_listings',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    sourceRequestId: text('source_request_id')
      .notNull()
      .references(() => parentRequests.id, { onDelete: 'restrict' }),
    sourceRequestVersion: integer('source_request_version').notNull(),
    parentUserId: text('parent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    grade: text('grade').notNull(),
    mode: text('mode', { enum: ['online', 'offline'] }).notNull(),
    publicArea: text('public_area'),
    expectedBudgetMinor: integer('expected_budget_minor'),
    status: text('status', { enum: CLASS_STATUSES }).notNull().default('draft'),
    version: integer('version').notNull().default(1),
    mutationId: text('mutation_id').notNull(),
    publishedAt: text('published_at'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('class_listings_code_uq').on(t.code),
    uniqueIndex('class_listings_source_request_uq').on(t.sourceRequestId),
    index('class_listings_public_idx').on(t.status, desc(t.publishedAt), t.id),
    index('class_listings_filter_idx').on(
      t.status,
      t.subjectId,
      t.grade,
      t.mode,
      desc(t.publishedAt),
      t.id,
    ),
  ],
);

/** Tutor-origin offers seek students and never carry parent request contact details. */
export const tutorStudentOffers = sqliteTable(
  'tutor_student_offers',
  {
    id: text('id').primaryKey(),
    tutorUserId: text('tutor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    grade: text('grade').notNull(),
    mode: text('mode', { enum: ['online', 'offline'] }).notNull(),
    area: text('area'),
    proposedTuitionPerSessionMinor: integer('proposed_tuition_per_session_minor').notNull(),
    status: text('status', { enum: TUTOR_OFFER_STATUSES }).notNull().default('draft'),
    version: integer('version').notNull().default(1),
    contractRevisionId: text('contract_revision_id').references(() => contentRevisions.id, {
      onDelete: 'restrict',
    }),
    acknowledgedAt: text('acknowledged_at'),
    reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: text('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    publishedAt: text('published_at'),
    contactPhone: text('contact_phone'),
    contactShareConsentAt: text('contact_share_consent_at'),
    contactShareConsentVersion: text('contact_share_consent_version'),
    mutationId: text('mutation_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    index('tutor_student_offers_owner_idx').on(t.tutorUserId, desc(t.updatedAt), t.id),
    index('tutor_student_offers_review_idx').on(t.status, desc(t.updatedAt), t.id),
    index('tutor_student_offers_public_idx').on(
      t.status,
      t.subjectId,
      t.grade,
      t.mode,
      desc(t.publishedAt),
      t.id,
    ),
  ],
);

export const tutorOfferContractAcks = sqliteTable(
  'tutor_offer_contract_acks',
  {
    id: text('id').primaryKey(),
    offerId: text('offer_id')
      .notNull()
      .references(() => tutorStudentOffers.id, { onDelete: 'restrict' }),
    tutorUserId: text('tutor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    offerVersion: integer('offer_version').notNull(),
    contractRevisionId: text('contract_revision_id')
      .notNull()
      .references(() => contentRevisions.id, { onDelete: 'restrict' }),
    acknowledgedAt: text('acknowledged_at').notNull(),
    contactShareConsentAt: text('contact_share_consent_at'),
    contactShareConsentVersion: text('contact_share_consent_version'),
  },
  (t) => [index('tutor_offer_contract_acks_offer_idx').on(t.offerId, desc(t.acknowledgedAt))],
);

/** Parent requests to join a tutor-origin offer. Phone never enters public projections. */
export const tutorOfferJoinRequests = sqliteTable(
  'tutor_offer_join_requests',
  {
    id: text('id').primaryKey(),
    offerId: text('offer_id')
      .notNull()
      .references(() => tutorStudentOffers.id, { onDelete: 'restrict' }),
    parentUserId: text('parent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    offerVersion: integer('offer_version').notNull(),
    studentGrade: text('student_grade').notNull(),
    learningNeeds: text('learning_needs').notNull(),
    teachingArea: text('teaching_area'),
    detailsConsentVersion: text('details_consent_version').notNull(),
    detailsConsentedAt: text('details_consented_at').notNull(),
    contactConsentVersion: text('contact_consent_version').notNull(),
    contactConsentedAt: text('contact_consented_at').notNull(),
    contactPhone: text('contact_phone'),
    status: text('status', { enum: TUTOR_OFFER_JOIN_STATUSES }).notNull().default('submitted'),
    version: integer('version').notNull().default(1),
    reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: text('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    agreedTuitionPerSessionMinor: integer('agreed_tuition_per_session_minor'),
    partiesAgreedAt: text('parties_agreed_at'),
    terminatedBy: text('terminated_by').references(() => users.id, { onDelete: 'restrict' }),
    terminatedAt: text('terminated_at'),
    terminalReason: text('terminal_reason'),
    withdrawnAt: text('withdrawn_at'),
    mutationId: text('mutation_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('tutor_offer_join_requests_live_unique')
      .on(t.offerId, t.parentUserId)
      .where(sql`${t.status} IN ('submitted', 'approved')`),
    index('tutor_offer_join_requests_parent_idx').on(t.parentUserId, desc(t.createdAt), t.id),
    index('tutor_offer_join_requests_offer_idx').on(t.offerId, desc(t.createdAt), t.id),
    index('tutor_offer_join_requests_review_idx').on(t.status, desc(t.createdAt), t.id),
  ],
);

export const feeOptionVersions = sqliteTable(
  'fee_option_versions',
  {
    id: text('id').primaryKey(),
    optionKey: text('option_key', { enum: FEE_OPTION_KEYS }).notNull(),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    policyText: text('policy_text').notNull(),
    rateBasisPoints: integer('rate_basis_points').notNull(),
    depositBasisPoints: integer('deposit_basis_points'),
    scopeSubjectId: text('scope_subject_id').references(() => subjects.id, {
      onDelete: 'restrict',
    }),
    scopeMode: text('scope_mode', { enum: ['online', 'offline'] }),
    status: text('status', { enum: FEE_OPTION_STATUSES }).notNull(),
    effectiveFrom: text('effective_from'),
    effectiveTo: text('effective_to'),
    approvedBy: text('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    publishedAt: text('published_at'),
    mutationId: text('mutation_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('fee_option_versions_key_version_uq').on(t.optionKey, t.version),
    index('fee_option_versions_available_idx').on(
      t.status,
      t.scopeSubjectId,
      t.scopeMode,
      t.effectiveFrom,
      t.effectiveTo,
    ),
  ],
);

/** Learner "Bảng giá" reference ranges; guidance only, never a settled price. */
export const learnerPriceGuides = sqliteTable(
  'learner_price_guides',
  {
    id: text('id').primaryKey(),
    dimension: text('dimension', { enum: LEARNER_PRICE_DIMENSIONS }).notNull(),
    tutorType: text('tutor_type', { enum: TUTOR_TYPES }),
    subjectId: text('subject_id').references(() => subjects.id, { onDelete: 'restrict' }),
    educationLevel: text('education_level', { enum: EDUCATION_LEVELS }).notNull(),
    minPriceMinor: integer('min_price_minor').notNull(),
    maxPriceMinor: integer('max_price_minor').notNull(),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('published'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('learner_price_guides_key_uq').on(
      t.dimension,
      sql`COALESCE(${t.tutorType}, '')`,
      sql`COALESCE(${t.subjectId}, '')`,
      t.educationLevel,
    ),
    index('learner_price_guides_public_idx').on(t.status, t.dimension),
  ],
);

export const learnerPriceItems = sqliteTable(
  'learner_price_items',
  {
    id: text('id').primaryKey(),
    groupKey: text('group_key', { enum: LEARNER_PRICE_GROUPS }).notNull(),
    label: text('label').notNull(),
    minPriceMinor: integer('min_price_minor').notNull(),
    maxPriceMinor: integer('max_price_minor').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('published'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('learner_price_items_label_uq').on(t.groupKey, t.label),
    index('learner_price_items_public_idx').on(t.status, t.groupKey, t.sortOrder),
  ],
);

export const tuitionPriceVersions = sqliteTable(
  'tuition_price_versions',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    gradeLabel: text('grade_label').notNull(),
    level: text('level', { enum: PRICING_LEVELS }).notNull(),
    mode: text('mode', { enum: PRICING_MODES }).notNull(),
    pricePerSessionMinor: integer('price_per_session_minor').notNull(),
    version: integer('version').notNull(),
    editVersion: integer('edit_version').notNull().default(1),
    status: text('status', { enum: PRICING_CATALOG_STATUSES }).notNull(),
    approvedBy: text('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    publishedAt: text('published_at'),
    mutationId: text('mutation_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('tuition_price_versions_key_version_uq').on(
      t.subjectId,
      t.gradeLabel,
      t.level,
      t.mode,
      t.version,
    ),
    index('tuition_price_versions_public_idx').on(
      t.status,
      t.subjectId,
      t.gradeLabel,
      t.level,
      t.mode,
      desc(t.version),
    ),
  ],
);

export const classFeeGuidanceVersions = sqliteTable(
  'class_fee_guidance_versions',
  {
    id: text('id').primaryKey(),
    mode: text('mode', { enum: PRICING_MODES }).notNull(),
    minFeeMinor: integer('min_fee_minor').notNull(),
    maxFeeMinor: integer('max_fee_minor').notNull(),
    description: text('description').notNull(),
    version: integer('version').notNull(),
    editVersion: integer('edit_version').notNull().default(1),
    status: text('status', { enum: PRICING_CATALOG_STATUSES }).notNull(),
    approvedBy: text('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    publishedAt: text('published_at'),
    mutationId: text('mutation_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('class_fee_guidance_versions_key_version_uq').on(t.mode, t.version),
    index('class_fee_guidance_versions_public_idx').on(t.status, t.mode, desc(t.version)),
  ],
);

export const tutorApplications = sqliteTable(
  'tutor_applications',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classListings.id, { onDelete: 'restrict' }),
    tutorUserId: text('tutor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    feeOptionVersionId: text('fee_option_version_id')
      .notNull()
      .references(() => feeOptionVersions.id, { onDelete: 'restrict' }),
    status: text('status', { enum: APPLICATION_STATUSES }).notNull().default('submitted'),
    rejectionReason: text('rejection_reason'),
    version: integer('version').notNull().default(1),
    mutationId: text('mutation_id').notNull(),
    ...timestamps(),
    matchSnapshotJson: text('match_snapshot_json').notNull().default('{}'),
    availableWeekdays: text('available_weekdays'),
    availableStart: text('available_start'),
    availableEnd: text('available_end'),
    availabilityJson: text('availability_json'),
  },
  (t) => [
    uniqueIndex('tutor_applications_live_uq')
      .on(t.classId, t.tutorUserId)
      .where(sql`${t.status} = 'submitted'`),
    index('tutor_applications_tutor_created_idx').on(t.tutorUserId, desc(t.createdAt), t.id),
    index('tutor_applications_class_status_idx').on(t.classId, t.status, desc(t.createdAt), t.id),
  ],
);

export const classAssignments = sqliteTable(
  'class_assignments',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classListings.id, { onDelete: 'restrict' }),
    applicationId: text('application_id')
      .notNull()
      .references(() => tutorApplications.id, { onDelete: 'restrict' }),
    tutorUserId: text('tutor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedBy: text('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: text('status', { enum: CLASS_ASSIGNMENT_STATUSES }).notNull().default('active'),
    version: integer('version').notNull().default(1),
    mutationId: text('mutation_id').notNull(),
    assignedAt: text('assigned_at').notNull(),
    revokedAt: text('revoked_at'),
    agreedTuitionPerSessionMinor: integer('agreed_tuition_per_session_minor'),
    tuitionRecordedBy: text('tuition_recorded_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    tuitionRecordedAt: text('tuition_recorded_at'),
    learnerConfirmedAt: text('learner_confirmed_at'),
    learnerConfirmedBy: text('learner_confirmed_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    placementFeePaidAt: text('placement_fee_paid_at'),
    placementFeeAmountMinor: integer('placement_fee_amount_minor'),
    placementFeeRecordedBy: text('placement_fee_recorded_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    placementFeeReportedAt: text('placement_fee_reported_at'),
  },
  (t) => [
    uniqueIndex('class_assignments_application_uq').on(t.applicationId),
    uniqueIndex('class_assignments_active_class_uq')
      .on(t.classId)
      .where(sql`${t.status} = 'active'`),
    index('class_assignments_tutor_status_idx').on(t.tutorUserId, t.status, desc(t.assignedAt)),
  ],
);

export const classLifecycleEvents = sqliteTable(
  'class_lifecycle_events',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classListings.id, { onDelete: 'restrict' }),
    assignmentId: text('assignment_id')
      .notNull()
      .references(() => classAssignments.id, { onDelete: 'restrict' }),
    eventType: text('event_type', { enum: ['revoked', 'completed'] }).notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    mutationId: text('mutation_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('class_lifecycle_events_assignment_uq').on(t.assignmentId),
    uniqueIndex('class_lifecycle_events_mutation_uq').on(t.mutationId),
    index('class_lifecycle_events_class_idx').on(t.classId, desc(t.createdAt)),
  ],
);

export const classCancellations = sqliteTable(
  'class_cancellations',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classListings.id, { onDelete: 'restrict' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    mutationId: text('mutation_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('class_cancellations_class_uq').on(t.classId),
    uniqueIndex('class_cancellations_mutation_uq').on(t.mutationId),
  ],
);

export const contentRevisions = sqliteTable(
  'content_revisions',
  {
    id: text('id').primaryKey(),
    kind: text('kind', {
      enum: ['page', 'service', 'blog', 'faq', 'guide', 'contract', 'terms'],
    }).notNull(),
    slug: text('slug').notNull(),
    audience: text('audience', { enum: ['public', 'parent', 'tutor'] }).notNull(),
    revision: integer('revision').notNull(),
    editVersion: integer('edit_version').notNull().default(1),
    status: text('status', { enum: ['draft', 'published', 'retired'] })
      .notNull()
      .default('draft'),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    bodyText: text('body_text').notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    publishedBy: text('published_by').references(() => users.id, { onDelete: 'set null' }),
    revisedFromId: text('revised_from_id').references((): AnySQLiteColumn => contentRevisions.id, {
      onDelete: 'restrict',
    }),
    publishedAt: text('published_at'),
    ...timestamps(),
    lastMutationId: text('last_mutation_id'),
    category: text('category', { enum: CONTENT_CATEGORIES }),
    authorName: text('author_name'),
  },
  (t) => [
    uniqueIndex('content_one_draft_uq')
      .on(t.kind, t.slug, t.audience)
      .where(sql`${t.status} = 'draft'`),
    uniqueIndex('content_one_published_uq')
      .on(t.kind, t.slug, t.audience)
      .where(sql`${t.status} = 'published'`),
    index('content_public_idx').on(t.kind, t.audience, t.status, desc(t.publishedAt)),
    index('content_history_idx').on(t.kind, t.slug, t.audience, desc(t.revision)),
    index('content_category_idx').on(t.kind, t.audience, t.status, t.category, desc(t.publishedAt)),
  ],
);

export const termsQuizzes = sqliteTable(
  'terms_quizzes',
  {
    id: text('id').primaryKey(),
    termsContentRevisionId: text('terms_content_revision_id')
      .notNull()
      .unique()
      .references(() => contentRevisions.id, { onDelete: 'restrict' }),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    editVersion: integer('edit_version').notNull().default(1),
    questionsJson: text('questions_json').notNull(),
    minimumCorrect: integer('minimum_correct').notNull(),
    mutationId: text('mutation_id').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    publishedBy: text('published_by').references(() => users.id, { onDelete: 'restrict' }),
    publishedAt: text('published_at'),
    ...timestamps(),
  },
  (t) => [index('terms_quizzes_status_idx').on(t.status, desc(t.publishedAt))],
);

export const termsQuizAttempts = sqliteTable(
  'terms_quiz_attempts',
  {
    id: text('id').primaryKey(),
    tutorUserId: text('tutor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    quizId: text('quiz_id')
      .notNull()
      .references(() => termsQuizzes.id, { onDelete: 'restrict' }),
    answersJson: text('answers_json').notNull(),
    correctCount: integer('correct_count').notNull(),
    passed: integer('passed', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('terms_quiz_attempts_tutor_quiz_idx').on(t.tutorUserId, t.quizId, desc(t.createdAt)),
  ],
);

export const termsAcknowledgements = sqliteTable(
  'terms_acknowledgements',
  {
    tutorUserId: text('tutor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    quizId: text('quiz_id')
      .notNull()
      .references(() => termsQuizzes.id, { onDelete: 'restrict' }),
    attemptId: text('attempt_id')
      .notNull()
      .unique()
      .references(() => termsQuizAttempts.id, { onDelete: 'restrict' }),
    termsContentRevisionId: text('terms_content_revision_id')
      .notNull()
      .references(() => contentRevisions.id, { onDelete: 'restrict' }),
    acknowledgedAt: text('acknowledged_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tutorUserId, t.quizId] })],
);

export const classContractRecords = sqliteTable(
  'class_contract_records',
  {
    id: text('id').primaryKey(),
    assignmentId: text('assignment_id')
      .notNull()
      .unique()
      .references(() => classAssignments.id, { onDelete: 'restrict' }),
    classId: text('class_id')
      .notNull()
      .references(() => classListings.id, { onDelete: 'restrict' }),
    tutorUserId: text('tutor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    feeOptionVersionId: text('fee_option_version_id')
      .notNull()
      .references(() => feeOptionVersions.id, { onDelete: 'restrict' }),
    contractContentRevisionId: text('contract_content_revision_id')
      .notNull()
      .references(() => contentRevisions.id, { onDelete: 'restrict' }),
    status: text('status', { enum: ['issued', 'acknowledged'] })
      .notNull()
      .default('issued'),
    version: integer('version').notNull().default(1),
    issuedBy: text('issued_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    issuedAt: text('issued_at').notNull(),
    acknowledgedAt: text('acknowledged_at'),
    mutationId: text('mutation_id').notNull(),
    agreedTuitionPerSessionMinor: integer('agreed_tuition_per_session_minor'),
  },
  (t) => [index('class_contract_records_tutor_idx').on(t.tutorUserId, desc(t.issuedAt))],
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
    negotiableTime: integer('negotiable_time', { mode: 'boolean' }).notNull().default(false),
    approvalStatus: text('approval_status', { enum: APPROVAL_STATUSES }).notNull().default('draft'),
    visibility: text('visibility', { enum: VISIBILITIES }).notNull().default('private'),
    ...timestamps(),
    moderationNote: text('moderation_note'),
    tutorType: text('tutor_type', { enum: TUTOR_TYPES }),
    school: text('school'),
    specialization: text('specialization'),
    experienceYears: integer('experience_years'),
    experienceSummary: text('experience_summary'),
    major: text('major'),
    graduationYear: integer('graduation_year'),
  },
  (t) => [
    uniqueIndex('tutor_profiles_slug_uq').on(t.slug),
    index('tutor_profiles_public_rate_idx').on(t.approvalStatus, t.visibility, t.hourlyRateMinor),
    index('tutor_profiles_moderation_idx').on(t.approvalStatus, t.updatedAt),
  ],
);

export const tutorPreferenceGrades = sqliteTable(
  'tutor_preference_grades',
  {
    tutorId: text('tutor_id')
      .notNull()
      .references(() => tutorProfiles.userId, { onDelete: 'cascade' }),
    grade: text('grade').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tutorId, t.grade] })],
);

export const tutorPreferenceAreas = sqliteTable(
  'tutor_preference_areas',
  {
    tutorId: text('tutor_id')
      .notNull()
      .references(() => tutorProfiles.userId, { onDelete: 'cascade' }),
    area: text('area').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tutorId, t.area] })],
);

/** One checkbox acceptance per published "Điều khoản trách nhiệm" revision; see 0035. */
export const termsConsents = sqliteTable(
  'terms_consents',
  {
    tutorUserId: text('tutor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    termsContentRevisionId: text('terms_content_revision_id')
      .notNull()
      .references(() => contentRevisions.id, { onDelete: 'restrict' }),
    acceptedAt: text('accepted_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tutorUserId, t.termsContentRevisionId] })],
);

/** Owner/moderator-only contact and citizen-ID facts of a tutor; see migration 0034. */
export const tutorPrivateProfiles = sqliteTable('tutor_private_profiles', {
  tutorId: text('tutor_id')
    .primaryKey()
    .references(() => tutorProfiles.userId, { onDelete: 'cascade' }),
  phone: text('phone'),
  dateOfBirth: text('date_of_birth'),
  idNumber: text('id_number'),
  idIssuedOn: text('id_issued_on'),
  idResidence: text('id_residence'),
  idVerification: text('id_verification', { enum: ID_VERIFICATION_METHODS })
    .notNull()
    .default('center'),
  updatedAt: text('updated_at').notNull(),
});

/** Citizen-ID photos and credentials, read and written as bytes with raw D1 statements. */
export const tutorDocuments = sqliteTable(
  'tutor_documents',
  {
    id: text('id').primaryKey(),
    tutorId: text('tutor_id')
      .notNull()
      .references(() => tutorProfiles.userId, { onDelete: 'cascade' }),
    kind: text('kind', { enum: TUTOR_DOCUMENT_KINDS }).notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type', { enum: TUTOR_DOCUMENT_TYPES }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    data: blob('data', { mode: 'buffer' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('tutor_documents_id_side_uq')
      .on(t.tutorId, t.kind)
      .where(sql`${t.kind} <> 'credential'`),
    index('tutor_documents_tutor_idx').on(t.tutorId, t.createdAt),
  ],
);

/** Tutor-added "Đăng ký lớp học phù hợp" options; see migration 0033. */
export const tutorCustomOptions = sqliteTable(
  'tutor_custom_options',
  {
    tutorId: text('tutor_id')
      .notNull()
      .references(() => tutorProfiles.userId, { onDelete: 'cascade' }),
    kind: text('kind', { enum: CUSTOM_OPTION_KINDS }).notNull(),
    labelKey: text('label_key').notNull(),
    label: text('label').notNull(),
    selected: integer('selected', { mode: 'boolean' }).notNull().default(false),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tutorId, t.kind, t.labelKey] })],
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

export const complaints = sqliteTable(
  'complaints',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    creatorUserId: text('creator_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    classId: text('class_id').references(() => classListings.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status', { enum: COMPLAINT_STATUSES }).notNull().default('submitted'),
    version: integer('version').notNull().default(1),
    triageReason: text('triage_reason'),
    resolution: text('resolution'),
    handledBy: text('handled_by').references(() => users.id, { onDelete: 'restrict' }),
    resolvedAt: text('resolved_at'),
    submittedAt: text('submitted_at'),
    mutationId: text('mutation_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('complaints_code_uq').on(t.code),
    index('complaints_owner_created_idx').on(t.creatorUserId, desc(t.createdAt), t.id),
    index('complaints_status_created_idx').on(t.status, desc(t.createdAt), t.id),
    index('complaints_class_idx').on(t.classId, desc(t.createdAt)),
  ],
);

export const complaintAttachments = sqliteTable(
  'complaint_attachments',
  {
    id: text('id').primaryKey(),
    complaintId: text('complaint_id')
      .notNull()
      .references(() => complaints.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    contentType: text('content_type', { enum: COMPLAINT_ATTACHMENT_TYPES }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // Read and written with raw D1 statements as bytes; never selected in list queries.
    data: blob('data', { mode: 'buffer' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('complaint_attachments_complaint_idx').on(t.complaintId, t.createdAt)],
);

/** One profile photo per user, read and written as bytes with raw D1 statements. */
export const profilePhotos = sqliteTable('profile_photos', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  contentType: text('content_type', { enum: ['image/jpeg', 'image/png', 'image/webp'] }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** "Danh sách gia sư được đề xuất": the centre's fit-scored proposals for one request. */
export const requestTutorProposals = sqliteTable(
  'request_tutor_proposals',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => parentRequests.id, { onDelete: 'cascade' }),
    tutorUserId: text('tutor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    fitScore: integer('fit_score').notNull(),
    status: text('status', { enum: ['proposed', 'selected', 'declined'] })
      .notNull()
      .default('proposed'),
    proposedBy: text('proposed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    selectedAt: text('selected_at'),
    tutorResponse: text('tutor_response', { enum: ['accepted', 'declined'] }),
    tutorRespondedAt: text('tutor_responded_at'),
    tutorDeclineReason: text('tutor_decline_reason'),
  },
  (t) => [
    uniqueIndex('request_tutor_proposals_pair_uq').on(t.requestId, t.tutorUserId),
    uniqueIndex('request_tutor_proposals_one_selected_uq')
      .on(t.requestId)
      .where(sql`${t.status} = 'selected'`),
    index('request_tutor_proposals_request_idx').on(t.requestId, desc(t.fitScore)),
    index('request_tutor_proposals_tutor_idx').on(t.tutorUserId, desc(t.createdAt), t.id),
  ],
);

export const accountDeletions = sqliteTable('account_deletions', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'restrict' }),
  deletedAt: text('deleted_at').notNull(),
});

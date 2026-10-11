import type { Page } from '../../../shared/schemas/discovery';
import type {
  AdminReportOverview,
  ConversionReport,
  NoTutorClass,
  NoTutorQuery,
  ParentDashboard,
  ReportRange,
  RevenueReport,
  TutorDashboard,
} from '../../../shared/schemas/reports';
import { addDays, localToUtc } from '../../../shared/time';

function bounds(range: ReportRange): [string, string] {
  return [
    localToUtc(range.from, 0, range.timeZone).toISOString(),
    localToUtc(addDays(range.to, 1), 0, range.timeZone).toISOString(),
  ];
}

function percent(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 100;
}

export async function conversion(db: D1Database, range: ReportRange): Promise<ConversionReport> {
  const [fromUtc, toUtc] = bounds(range);
  const row = await db
    .prepare(
      `
    WITH cohort AS (
      SELECT DISTINCT target_id AS request_id FROM audit_logs
      WHERE action = 'parent_request.submitted' AND created_at >= ? AND created_at < ?
    )
    SELECT COUNT(DISTINCT r.request_id) AS submitted_requests,
      COUNT(DISTINCT CASE WHEN c.published_at IS NOT NULL THEN c.id END) AS published_classes,
      COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN c.id END) AS assigned_classes,
      COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.id END) AS completed_classes
    FROM cohort r
    LEFT JOIN class_listings c ON c.source_request_id = r.request_id
    LEFT JOIN class_assignments a ON a.class_id = c.id
  `,
    )
    .bind(fromUtc, toUtc)
    .first<{
      submitted_requests: number;
      published_classes: number;
      assigned_classes: number;
      completed_classes: number;
    }>();
  const submittedRequests = row?.submitted_requests ?? 0;
  const publishedClasses = row?.published_classes ?? 0;
  const assignedClasses = row?.assigned_classes ?? 0;
  const completedClasses = row?.completed_classes ?? 0;
  return {
    range,
    submittedRequests,
    publishedClasses,
    assignedClasses,
    completedClasses,
    publishRatePercent: percent(publishedClasses, submittedRequests),
    assignRatePercent: percent(assignedClasses, submittedRequests),
    completeRatePercent: percent(completedClasses, submittedRequests),
  };
}

export async function noTutorClasses(
  db: D1Database,
  query: NoTutorQuery,
): Promise<Page<NoTutorClass>> {
  const [fromUtc, toUtc] = bounds(query);
  const predicate = `c.status = 'open' AND c.published_at >= ? AND c.published_at < ?`;
  const [rows, countRow] = await Promise.all([
    db
      .prepare(
        `
      SELECT c.id, c.code, s.name AS subject_name, c.grade, c.mode, c.public_area,
        c.published_at, COUNT(a.id) AS submitted_application_count
      FROM class_listings c
      JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN tutor_applications a ON a.class_id = c.id AND a.status = 'submitted'
      WHERE ${predicate}
      GROUP BY c.id
      ORDER BY c.published_at ASC, c.id ASC
      LIMIT ? OFFSET ?
    `,
      )
      .bind(fromUtc, toUtc, query.pageSize, (query.page - 1) * query.pageSize)
      .all<{
        id: string;
        code: string;
        subject_name: string;
        grade: string;
        mode: 'online' | 'offline';
        public_area: string | null;
        published_at: string;
        submitted_application_count: number;
      }>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM class_listings c WHERE ${predicate}`)
      .bind(fromUtc, toUtc)
      .first<{ total: number }>(),
  ]);
  return {
    items: rows.results.map((row) => ({
      id: row.id,
      code: row.code,
      subjectName: row.subject_name,
      grade: row.grade,
      mode: row.mode,
      publicArea: row.public_area,
      publishedAt: row.published_at,
      submittedApplicationCount: row.submitted_application_count,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: countRow?.total ?? 0,
  };
}

export function revenue(range: ReportRange): RevenueReport {
  return { available: false, reason: 'NO_VERIFIED_PAYMENT_SOURCE', range };
}

export async function overview(db: D1Database, range: ReportRange): Promise<AdminReportOverview> {
  const [fromUtc, toUtc] = bounds(range);
  const [funnel, counts] = await Promise.all([
    conversion(db, range),
    db
      .prepare(
        `
      SELECT
        COUNT(CASE WHEN c.status = 'open' THEN 1 END) AS open_classes,
        COUNT(CASE WHEN c.status = 'open' AND NOT EXISTS (
          SELECT 1 FROM tutor_applications a WHERE a.class_id = c.id AND a.status = 'submitted'
        ) THEN 1 END) AS open_without_applications,
        COUNT(CASE WHEN c.status = 'active' THEN 1 END) AS active_classes,
        COUNT(CASE WHEN c.status = 'completed' THEN 1 END) AS completed_classes
      FROM class_listings c WHERE c.published_at >= ? AND c.published_at < ?
    `,
      )
      .bind(fromUtc, toUtc)
      .first<{
        open_classes: number;
        open_without_applications: number;
        active_classes: number;
        completed_classes: number;
      }>(),
  ]);
  return {
    range,
    conversion: funnel,
    openClasses: counts?.open_classes ?? 0,
    openWithoutApplications: counts?.open_without_applications ?? 0,
    activeClasses: counts?.active_classes ?? 0,
    completedClasses: counts?.completed_classes ?? 0,
    revenue: revenue(range),
  };
}

export async function parentDashboard(db: D1Database, parentId: string): Promise<ParentDashboard> {
  const row = await db
    .prepare(
      `
    SELECT
      COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draft_requests,
      COUNT(CASE WHEN status = 'submitted' THEN 1 END) AS submitted_requests,
      COUNT(CASE WHEN status = 'sourcing' THEN 1 END) AS sourcing_requests,
      COUNT(CASE WHEN status = 'assigned' THEN 1 END) AS assigned_requests,
      COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) AS fulfilled_requests,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_requests
    FROM parent_requests WHERE parent_user_id = ?
  `,
    )
    .bind(parentId)
    .first<{
      draft_requests: number;
      submitted_requests: number;
      sourcing_requests: number;
      assigned_requests: number;
      fulfilled_requests: number;
      cancelled_requests: number;
    }>();
  return {
    draftRequests: row?.draft_requests ?? 0,
    submittedRequests: row?.submitted_requests ?? 0,
    sourcingRequests: row?.sourcing_requests ?? 0,
    assignedRequests: row?.assigned_requests ?? 0,
    fulfilledRequests: row?.fulfilled_requests ?? 0,
    cancelledRequests: row?.cancelled_requests ?? 0,
  };
}

export async function tutorDashboard(db: D1Database, tutorId: string): Promise<TutorDashboard> {
  const [applications, assignments] = await Promise.all([
    db
      .prepare(
        `SELECT
      COUNT(CASE WHEN status = 'submitted' THEN 1 END) AS submitted_applications,
      COUNT(CASE WHEN status = 'selected' THEN 1 END) AS selected_applications
      FROM tutor_applications WHERE tutor_user_id = ?`,
      )
      .bind(tutorId)
      .first<{ submitted_applications: number; selected_applications: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS active_assignments FROM class_assignments a
         JOIN class_listings c ON c.id = a.class_id
         WHERE a.tutor_user_id = ? AND a.status = 'active' AND c.status = 'active'`,
      )
      .bind(tutorId)
      .first<{ active_assignments: number }>(),
  ]);
  return {
    submittedApplications: applications?.submitted_applications ?? 0,
    selectedApplications: applications?.selected_applications ?? 0,
    activeAssignments: assignments?.active_assignments ?? 0,
  };
}

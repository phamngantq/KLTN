import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import type {
  AdminTutor,
  AdminTutorListQuery,
  ModerationAction,
} from '../../../shared/schemas/admin';
import type { Page } from '../../../shared/schemas/discovery';
import type { ApprovalStatus, Visibility } from '../../../shared/schemas/tutors';
import type { Db } from '../../db/client';
import { auditLogs, tutorProfiles, users } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { subjectsByTutor } from '../tutors/repository';
import { getOwnProfile, sortSubjects } from '../tutors/service';

const FILTERS: Record<AdminTutorListQuery['status'], SQL> = {
  pending: eq(tutorProfiles.approvalStatus, 'pending'),
  approved: and(
    eq(tutorProfiles.approvalStatus, 'approved'),
    eq(tutorProfiles.visibility, 'public'),
  )!,
  hidden: and(
    eq(tutorProfiles.approvalStatus, 'approved'),
    eq(tutorProfiles.visibility, 'private'),
  )!,
  rejected: eq(tutorProfiles.approvalStatus, 'rejected'),
  draft: eq(tutorProfiles.approvalStatus, 'draft'),
};

export async function listTutors(db: Db, query: AdminTutorListQuery): Promise<Page<AdminTutor>> {
  const where = FILTERS[query.status];
  // Served by tutor_profiles_moderation_idx (approval_status, updated_at).
  const [rows, totals] = await Promise.all([
    db
      .select({
        userId: tutorProfiles.userId,
        slug: tutorProfiles.slug,
        displayName: users.displayName,
        email: users.email,
        bio: tutorProfiles.bio,
        hourlyRateMinor: tutorProfiles.hourlyRateMinor,
        teachesOnline: tutorProfiles.teachesOnline,
        teachesOffline: tutorProfiles.teachesOffline,
        approvalStatus: tutorProfiles.approvalStatus,
        visibility: tutorProfiles.visibility,
        moderationNote: tutorProfiles.moderationNote,
        updatedAt: tutorProfiles.updatedAt,
      })
      .from(tutorProfiles)
      .innerJoin(users, eq(users.id, tutorProfiles.userId))
      .where(where)
      .orderBy(desc(tutorProfiles.updatedAt), desc(tutorProfiles.userId))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db.select({ total: count() }).from(tutorProfiles).where(where).all(),
  ]);
  const subjects = await subjectsByTutor(
    db,
    rows.map((r) => r.userId),
  );
  return {
    items: rows.map((row) => ({ ...row, subjects: sortSubjects(subjects.get(row.userId) ?? []) })),
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

interface Outcome {
  approvalStatus: ApprovalStatus;
  visibility: Visibility;
}

/** Allowed (current state → next state) per action. */
function nextState(action: ModerationAction, current: Outcome): Outcome | null {
  const { approvalStatus: status, visibility } = current;
  switch (action) {
    case 'approve': // new submission, or re-publishing a hidden profile
      return status === 'pending' || (status === 'approved' && visibility === 'private')
        ? { approvalStatus: 'approved', visibility: 'public' }
        : null;
    case 'reject':
      return status === 'pending' || status === 'approved'
        ? { approvalStatus: 'rejected', visibility: 'private' }
        : null;
    case 'hide':
      return status === 'approved' && visibility === 'public'
        ? { approvalStatus: 'approved', visibility: 'private' }
        : null;
  }
}

/**
 * Admin moderation as a compare-and-set batch: the profile update only applies if the state is
 * still what the admin saw, and the audit entry (actor, target, reason) is written in the same
 * transaction only when that update happened.
 */
export async function moderate(
  db: Db,
  adminId: string,
  tutorId: string,
  action: ModerationAction,
  reason: string | undefined,
  now = new Date(),
): Promise<AdminTutor> {
  const profile = await getOwnProfile(db, tutorId);
  if (!profile) throw new AppError(404, 'TUTOR_NOT_FOUND', 'Không tìm thấy hồ sơ gia sư.');
  const next = nextState(action, profile);
  if (!next) {
    throw new AppError(
      409,
      'INVALID_STATE',
      'Không thể thực hiện thao tác với trạng thái hiện tại của hồ sơ.',
    );
  }
  if (action === 'approve' && profile.missing.length > 0) {
    throw new AppError(
      422,
      'PROFILE_INCOMPLETE',
      'Hồ sơ chưa đủ thông tin để duyệt.',
      profile.missing,
    );
  }

  const nowIso = now.toISOString();
  const note = action === 'approve' ? null : (reason ?? null);
  const update = db
    .update(tutorProfiles)
    .set({ ...next, moderationNote: note, updatedAt: nowIso })
    .where(
      and(
        eq(tutorProfiles.userId, tutorId),
        eq(tutorProfiles.approvalStatus, profile.approvalStatus),
        eq(tutorProfiles.visibility, profile.visibility),
      ),
    )
    .returning({ userId: tutorProfiles.userId });
  const metadata = JSON.stringify({
    from: { approvalStatus: profile.approvalStatus, visibility: profile.visibility },
    to: next,
    reason: reason ?? null,
  });
  const audit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${adminId}, ${`tutor.${action}`}, 'tutor_profile', ${tutorId}, ${metadata}, ${nowIso}
        WHERE EXISTS (SELECT 1 FROM tutor_profiles
                      WHERE user_id = ${tutorId} AND approval_status = ${next.approvalStatus}
                        AND visibility = ${next.visibility} AND updated_at = ${nowIso})`,
  );
  const [updated] = await db.batch([update, audit]);
  if (updated.length !== 1) {
    throw new AppError(409, 'STALE_PROFILE', 'Hồ sơ vừa được cập nhật. Vui lòng tải lại.');
  }

  const row = await db
    .select({ email: users.email, updatedAt: tutorProfiles.updatedAt })
    .from(tutorProfiles)
    .innerJoin(users, eq(users.id, tutorProfiles.userId))
    .where(eq(tutorProfiles.userId, tutorId))
    .get();
  return {
    userId: tutorId,
    slug: profile.slug,
    displayName: profile.displayName,
    email: row?.email ?? '',
    bio: profile.bio,
    hourlyRateMinor: profile.hourlyRateMinor,
    teachesOnline: profile.teachesOnline,
    teachesOffline: profile.teachesOffline,
    subjects: profile.subjects,
    ...next,
    moderationNote: note,
    updatedAt: row?.updatedAt ?? nowIso,
  };
}

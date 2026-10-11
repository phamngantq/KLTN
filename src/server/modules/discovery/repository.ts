import { and, asc, count, desc, eq, exists, gte, isNotNull, lte, type SQL } from 'drizzle-orm';
import type { TutorSearchQuery } from '../../../shared/schemas/discovery';
import type { Db } from '../../db/client';
import { subjects, tutorProfiles, tutorSubjects, users } from '../../db/schema';

const publicColumns = {
  id: tutorProfiles.userId,
  slug: tutorProfiles.slug,
  displayName: users.displayName,
  bio: tutorProfiles.bio,
  hourlyRateMinor: tutorProfiles.hourlyRateMinor,
  currency: tutorProfiles.currency,
  teachesOnline: tutorProfiles.teachesOnline,
  teachesOffline: tutorProfiles.teachesOffline,
};

/** The single definition of "publicly listed": approved + public + active account + priced. */
export function isPubliclyListed(): SQL {
  return and(
    eq(tutorProfiles.approvalStatus, 'approved'),
    eq(tutorProfiles.visibility, 'public'),
    eq(users.status, 'active'),
    isNotNull(tutorProfiles.hourlyRateMinor),
  )!;
}

function filters(db: Db, query: TutorSearchQuery): SQL {
  const conditions: SQL[] = [isPubliclyListed()];
  if (query.subject) {
    conditions.push(
      exists(
        db
          .select({ one: tutorSubjects.subjectId })
          .from(tutorSubjects)
          .innerJoin(subjects, eq(subjects.id, tutorSubjects.subjectId))
          .where(
            and(eq(tutorSubjects.tutorId, tutorProfiles.userId), eq(subjects.slug, query.subject)),
          ),
      ),
    );
  }
  if (query.mode === 'online') conditions.push(eq(tutorProfiles.teachesOnline, true));
  if (query.mode === 'offline') conditions.push(eq(tutorProfiles.teachesOffline, true));
  if (query.minRate !== undefined)
    conditions.push(gte(tutorProfiles.hourlyRateMinor, query.minRate));
  if (query.maxRate !== undefined)
    conditions.push(lte(tutorProfiles.hourlyRateMinor, query.maxRate));
  return and(...conditions)!;
}

const ORDER = {
  rate_asc: [asc(tutorProfiles.hourlyRateMinor), asc(tutorProfiles.userId)],
  rate_desc: [desc(tutorProfiles.hourlyRateMinor), asc(tutorProfiles.userId)],
  newest: [desc(tutorProfiles.createdAt), asc(tutorProfiles.userId)],
} as const;

export async function searchTutors(db: Db, query: TutorSearchQuery) {
  const where = filters(db, query);
  const [rows, totals] = await db.batch([
    db
      .select(publicColumns)
      .from(tutorProfiles)
      .innerJoin(users, eq(users.id, tutorProfiles.userId))
      .where(where)
      .orderBy(...ORDER[query.sort])
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(tutorProfiles)
      .innerJoin(users, eq(users.id, tutorProfiles.userId))
      .where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
}

export function findPublicBySlug(db: Db, slug: string) {
  return db
    .select(publicColumns)
    .from(tutorProfiles)
    .innerJoin(users, eq(users.id, tutorProfiles.userId))
    .where(and(eq(tutorProfiles.slug, slug), isPubliclyListed()))
    .get();
}

export function findPublicById(db: Db, id: string) {
  return db
    .select({ ...publicColumns })
    .from(tutorProfiles)
    .innerJoin(users, eq(users.id, tutorProfiles.userId))
    .where(and(eq(tutorProfiles.userId, id), isPubliclyListed()))
    .get();
}

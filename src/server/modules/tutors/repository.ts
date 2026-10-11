import { and, asc, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { ApprovalStatus, Subject } from '../../../shared/schemas/tutors';
import type { Db } from '../../db/client';
import {
  subjects,
  tutorPreferenceAreas,
  tutorPreferenceGrades,
  tutorProfiles,
  tutorSubjects,
  users,
} from '../../db/schema';

export function listSubjects(db: Db): Promise<Subject[]> {
  return db
    .select({ id: subjects.id, slug: subjects.slug, name: subjects.name })
    .from(subjects)
    .orderBy(asc(subjects.name))
    .all();
}

export async function countExistingSubjects(db: Db, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(inArray(subjects.id, ids))
    .all();
  return rows.length;
}

export async function findDisplayName(db: Db, userId: string): Promise<string | undefined> {
  const row = await db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.name;
}

export function findProfileRow(db: Db, userId: string) {
  return db
    .select({
      userId: tutorProfiles.userId,
      slug: tutorProfiles.slug,
      displayName: users.displayName,
      bio: tutorProfiles.bio,
      hourlyRateMinor: tutorProfiles.hourlyRateMinor,
      currency: tutorProfiles.currency,
      teachesOnline: tutorProfiles.teachesOnline,
      teachesOffline: tutorProfiles.teachesOffline,
      negotiableTime: tutorProfiles.negotiableTime,
      approvalStatus: tutorProfiles.approvalStatus,
      visibility: tutorProfiles.visibility,
      moderationNote: tutorProfiles.moderationNote,
    })
    .from(tutorProfiles)
    .innerJoin(users, eq(users.id, tutorProfiles.userId))
    .where(eq(tutorProfiles.userId, userId))
    .get();
}

export async function classPreferencesByTutor(db: Db, userId: string) {
  const [grades, areas] = await Promise.all([
    db
      .select({ grade: tutorPreferenceGrades.grade })
      .from(tutorPreferenceGrades)
      .where(eq(tutorPreferenceGrades.tutorId, userId))
      .orderBy(asc(tutorPreferenceGrades.grade))
      .all(),
    db
      .select({ area: tutorPreferenceAreas.area })
      .from(tutorPreferenceAreas)
      .where(eq(tutorPreferenceAreas.tutorId, userId))
      .orderBy(asc(tutorPreferenceAreas.area))
      .all(),
  ]);
  return {
    preferredGrades: grades.map((row) => row.grade),
    preferredAreas: areas.map((row) => row.area),
  };
}

export async function subjectsByTutor(db: Db, tutorIds: string[]): Promise<Map<string, Subject[]>> {
  const map = new Map<string, Subject[]>();
  if (tutorIds.length === 0) return map;
  const rows = await db
    .select({
      tutorId: tutorSubjects.tutorId,
      id: subjects.id,
      slug: subjects.slug,
      name: subjects.name,
    })
    .from(tutorSubjects)
    .innerJoin(subjects, eq(subjects.id, tutorSubjects.subjectId))
    .where(inArray(tutorSubjects.tutorId, tutorIds))
    .orderBy(asc(subjects.name))
    .all();
  for (const { tutorId, ...subject } of rows) {
    const list = map.get(tutorId) ?? [];
    list.push(subject);
    map.set(tutorId, list);
  }
  return map;
}

export interface ProfileWrite {
  userId: string;
  slug: string; // used only when the profile row is created
  displayName?: string | undefined;
  bio?: string | undefined;
  hourlyRateMinor?: number | undefined;
  teachesOnline?: boolean | undefined;
  teachesOffline?: boolean | undefined;
  subjectIds?: string[] | undefined;
  preferredGrades?: string[] | undefined;
  preferredAreas?: string[] | undefined;
  negotiableTime?: boolean | undefined;
}

/**
 * Creates or updates the caller's profile, display name and subjects in one atomic batch.
 * Moderation fields (approval_status, visibility, slug) are never written from here.
 */
export async function upsertProfile(db: Db, write: ProfileWrite, now: string): Promise<void> {
  const fields = {
    ...(write.bio !== undefined && { bio: write.bio }),
    ...(write.hourlyRateMinor !== undefined && { hourlyRateMinor: write.hourlyRateMinor }),
    ...(write.teachesOnline !== undefined && { teachesOnline: write.teachesOnline }),
    ...(write.teachesOffline !== undefined && { teachesOffline: write.teachesOffline }),
    ...(write.negotiableTime !== undefined && { negotiableTime: write.negotiableTime }),
  };
  const upsert = db
    .insert(tutorProfiles)
    .values({ userId: write.userId, slug: write.slug, ...fields, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: tutorProfiles.userId, set: { ...fields, updatedAt: now } });
  const rest: BatchItem<'sqlite'>[] = [];
  if (write.displayName !== undefined) {
    rest.push(
      db
        .update(users)
        .set({ displayName: write.displayName, updatedAt: now })
        .where(eq(users.id, write.userId)),
    );
  }
  if (write.subjectIds !== undefined) {
    rest.push(db.delete(tutorSubjects).where(eq(tutorSubjects.tutorId, write.userId)));
    for (const subjectId of write.subjectIds) {
      rest.push(db.insert(tutorSubjects).values({ tutorId: write.userId, subjectId }));
    }
  }
  if (write.preferredGrades !== undefined) {
    rest.push(
      db.delete(tutorPreferenceGrades).where(eq(tutorPreferenceGrades.tutorId, write.userId)),
    );
    for (const grade of write.preferredGrades) {
      rest.push(db.insert(tutorPreferenceGrades).values({ tutorId: write.userId, grade }));
    }
  }
  if (write.preferredAreas !== undefined) {
    rest.push(
      db.delete(tutorPreferenceAreas).where(eq(tutorPreferenceAreas.tutorId, write.userId)),
    );
    for (const area of write.preferredAreas) {
      rest.push(db.insert(tutorPreferenceAreas).values({ tutorId: write.userId, area }));
    }
  }
  await db.batch([upsert, ...rest]);
}

/** Compare-and-set on approval_status; returns true when this call performed the transition. */
export async function transitionApproval(
  db: Db,
  userId: string,
  from: ApprovalStatus[],
  to: ApprovalStatus,
  now: string,
): Promise<boolean> {
  const rows = await db
    .update(tutorProfiles)
    .set({ approvalStatus: to, updatedAt: now })
    .where(and(eq(tutorProfiles.userId, userId), inArray(tutorProfiles.approvalStatus, from)))
    .returning({ userId: tutorProfiles.userId });
  return rows.length === 1;
}

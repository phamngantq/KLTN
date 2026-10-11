import type {
  ProfileRequirement,
  Subject,
  TutorProfile,
  UpdateTutorProfileInput,
} from '../../../shared/schemas/tutors';
import type { Db } from '../../db/client';
import { AppError, isUniqueViolation } from '../../lib/errors';
import * as repo from './repository';
import { slugWithSuffix } from './slug';

const vietnamese = new Intl.Collator('vi');

/** Vietnamese collation (SQLite's binary ORDER BY misplaces letters such as Đ). */
export function sortSubjects(subjects: Subject[]): Subject[] {
  return [...subjects].sort((a, b) => vietnamese.compare(a.name, b.name));
}

export async function listSubjects(db: Db): Promise<Subject[]> {
  return sortSubjects(await repo.listSubjects(db));
}

type ProfileRow = NonNullable<Awaited<ReturnType<typeof repo.findProfileRow>>>;

export function missingRequirements(row: ProfileRow, subjects: Subject[]): ProfileRequirement[] {
  const missing: ProfileRequirement[] = [];
  if (row.bio.trim().length === 0) missing.push('bio');
  if (subjects.length === 0) missing.push('subjects');
  if (row.hourlyRateMinor === null) missing.push('hourlyRate');
  if (!row.teachesOnline && !row.teachesOffline) missing.push('teachingMode');
  return missing;
}

export async function getOwnProfile(db: Db, userId: string): Promise<TutorProfile | null> {
  const row = await repo.findProfileRow(db, userId);
  if (!row) return null;
  const subjects = sortSubjects((await repo.subjectsByTutor(db, [userId])).get(userId) ?? []);
  const preferences = await repo.classPreferencesByTutor(db, userId);
  return { ...row, ...preferences, subjects, missing: missingRequirements(row, subjects) };
}

/** Upserts the caller's own profile. Ownership comes from the session; moderation fields are not writable. */
export async function updateOwnProfile(
  db: Db,
  userId: string,
  input: UpdateTutorProfileInput,
  now = new Date(),
): Promise<TutorProfile> {
  if (
    input.subjectIds &&
    (await repo.countExistingSubjects(db, input.subjectIds)) !== input.subjectIds.length
  ) {
    throw new AppError(422, 'UNKNOWN_SUBJECT', 'Có môn học không tồn tại.', [
      { path: 'subjectIds' },
    ]);
  }
  const existing = await repo.findProfileRow(db, userId);
  const write = (slug: string) =>
    repo.upsertProfile(db, { userId, slug, ...input }, now.toISOString());

  if (existing) {
    await write(existing.slug);
  } else {
    // Display name for the slug: new value if provided, else the account name.
    const nameForSlug = input.displayName ?? (await repo.findDisplayName(db, userId)) ?? 'gia-su';
    try {
      await write(slugWithSuffix(nameForSlug));
    } catch (err) {
      if (!isUniqueViolation(err, 'tutor_profiles.slug')) throw err;
      await write(slugWithSuffix(nameForSlug)); // random suffix collision: retry once
    }
  }
  const profile = await getOwnProfile(db, userId);
  if (!profile) throw new Error('Profile missing after upsert');
  return profile;
}

/** draft|rejected → pending, only when the profile is complete. */
export async function submitForReview(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<TutorProfile> {
  const profile = await getOwnProfile(db, userId);
  if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Bạn chưa tạo hồ sơ gia sư.');
  if (profile.missing.length > 0) {
    throw new AppError(
      422,
      'PROFILE_INCOMPLETE',
      'Hồ sơ chưa đủ thông tin để gửi duyệt.',
      profile.missing,
    );
  }
  const moved = await repo.transitionApproval(
    db,
    userId,
    ['draft', 'rejected'],
    'pending',
    now.toISOString(),
  );
  if (!moved) {
    throw new AppError(409, 'INVALID_STATE', 'Hồ sơ đang chờ duyệt hoặc đã được duyệt.');
  }
  return { ...profile, approvalStatus: 'pending' };
}

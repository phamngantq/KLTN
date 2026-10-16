import type {
  ProfileRequirement,
  Subject,
  TutorCustomOption,
  TutorProfile,
  UpdateTutorProfileInput,
} from '../../../shared/schemas/tutors';
import { GRADE_OPTIONS, optionKey } from '../../../shared/schemas/tutors';
import type { Db } from '../../db/client';
import { AppError, isUniqueViolation } from '../../lib/errors';
import type { TutorVerification } from '../../../shared/schemas/admin';
import { listDocuments } from './documents';
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
  // The rate is no longer asked for in the profile; it stays optional (public directory only).
  if (!row.teachesOnline && !row.teachesOffline) missing.push('teachingMode');
  return missing;
}

export async function getOwnProfile(
  db: Db,
  userId: string,
  d1?: D1Database,
): Promise<TutorProfile | null> {
  const row = await repo.findProfileRow(db, userId);
  if (!row) return null;
  const subjects = sortSubjects((await repo.subjectsByTutor(db, [userId])).get(userId) ?? []);
  const [preferences, customOptions, privateFacts, documents] = await Promise.all([
    repo.classPreferencesByTutor(db, userId),
    repo.customOptionsByTutor(db, userId),
    repo.privateProfile(db, userId),
    d1 ? listDocuments(d1, userId) : Promise.resolve([]),
  ]);
  return {
    ...row,
    hasPhoto: Boolean(row.hasPhoto),
    ...preferences,
    ...privateFacts,
    documents,
    customOptions,
    subjects,
    missing: missingRequirements(row, subjects),
  };
}

/** Upserts the caller's own profile. Ownership comes from the session; moderation fields are not writable. */
export async function updateOwnProfile(
  db: Db,
  userId: string,
  input: UpdateTutorProfileInput,
  now = new Date(),
  d1?: D1Database,
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
  const customOptions = await checkedCustomOptions(db, userId, input);
  const write = (slug: string) =>
    repo.upsertProfile(
      db,
      { userId, slug, ...input, ...(customOptions && { customOptions }) },
      now.toISOString(),
    );

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
  const profile = await getOwnProfile(db, userId, d1);
  if (!profile) throw new Error('Profile missing after upsert');
  return profile;
}

/** Moderator view of a tutor's private facts and documents. */
export async function tutorVerification(
  db: Db,
  d1: D1Database,
  tutorId: string,
): Promise<TutorVerification> {
  if (!(await repo.findProfileRow(db, tutorId))) {
    throw new AppError(404, 'PROFILE_NOT_FOUND', 'Không tìm thấy hồ sơ gia sư.');
  }
  const [privateFacts, documents] = await Promise.all([
    repo.privateProfile(db, tutorId),
    listDocuments(d1, tutorId),
  ]);
  return { ...privateFacts, documents };
}

const invalid = (path: string, message: string) =>
  new AppError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.', [{ path, message }]);

/**
 * Validates "Tự thêm lựa chọn": no option may repeat a built-in one, and every preferred grade
 * must be a system grade or one of the tutor's own. Grade/area selection is taken from the
 * preferred lists so matching and the checkboxes never disagree.
 */
async function checkedCustomOptions(
  db: Db,
  userId: string,
  input: UpdateTutorProfileInput,
): Promise<TutorCustomOption[] | undefined> {
  if (input.customOptions === undefined && input.preferredGrades === undefined) return undefined;
  const options = input.customOptions ?? (await repo.customOptionsByTutor(db, userId));
  if (input.customOptions) {
    const builtIn: Record<'subject' | 'grade', Set<string>> = {
      subject: new Set((await repo.listSubjects(db)).map((subject) => optionKey(subject.name))),
      grade: new Set(GRADE_OPTIONS.map(optionKey)),
    };
    const clash = input.customOptions.findIndex((option) =>
      builtIn[option.kind].has(optionKey(option.label)),
    );
    if (clash >= 0) throw invalid(`customOptions.${clash}.label`, 'Lựa chọn đã có sẵn.');
  }
  if (input.preferredGrades) {
    const allowed = new Set([
      ...GRADE_OPTIONS,
      ...options.filter((option) => option.kind === 'grade').map((option) => option.label),
    ]);
    const unknown = input.preferredGrades.findIndex((grade) => !allowed.has(grade));
    if (unknown >= 0) throw invalid(`preferredGrades.${unknown}`, 'Lớp học không hợp lệ.');
  }
  if (!input.customOptions) return undefined;
  const preferences = await repo.classPreferencesByTutor(db, userId);
  const chosenGrades = new Set(
    (input.preferredGrades ?? preferences.preferredGrades).map(optionKey),
  );
  return input.customOptions.map((option) =>
    option.kind === 'grade'
      ? { ...option, selected: chosenGrades.has(optionKey(option.label)) }
      : option,
  );
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

import type { Page, PublicTutor, TutorSearchQuery } from '../../../shared/schemas/discovery';
import type { Db } from '../../db/client';
import { AppError } from '../../lib/errors';
import { subjectsByTutor } from '../tutors/repository';
import { sortSubjects } from '../tutors/service';
import * as repo from './repository';

type Row = Awaited<ReturnType<typeof repo.findPublicBySlug>>;

async function withSubjects(db: Db, rows: NonNullable<Row>[]): Promise<PublicTutor[]> {
  const subjects = await subjectsByTutor(
    db,
    rows.map((r) => r.id),
  );
  // hourlyRateMinor is non-null by the isPubliclyListed() predicate.
  return rows.map((row) => ({
    ...row,
    hourlyRateMinor: row.hourlyRateMinor ?? 0,
    subjects: sortSubjects(subjects.get(row.id) ?? []),
  }));
}

export async function searchTutors(db: Db, query: TutorSearchQuery): Promise<Page<PublicTutor>> {
  const { rows, total } = await repo.searchTutors(db, query);
  return { items: await withSubjects(db, rows), page: query.page, pageSize: query.pageSize, total };
}

const notFound = () => new AppError(404, 'TUTOR_NOT_FOUND', 'Không tìm thấy gia sư.');

/** Unapproved, hidden or suspended tutors are indistinguishable from non-existent ones (404). */
export async function getPublicTutor(db: Db, slug: string): Promise<PublicTutor> {
  const row = await repo.findPublicBySlug(db, slug);
  if (!row) throw notFound();
  return (await withSubjects(db, [row]))[0]!;
}

export async function getPublicTutorById(db: Db, id: string): Promise<PublicTutor> {
  const row = await repo.findPublicById(db, id);
  if (!row) throw notFound();
  return (await withSubjects(db, [row]))[0]!;
}

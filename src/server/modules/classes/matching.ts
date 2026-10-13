import type {
  ClassMatch,
  ClassRecommendation,
  ClassSearchQuery,
  MatchAdjustment,
  MatchCriterion,
  PublicClass,
} from '../../../shared/schemas/classes';
import { MATCH_ALGORITHM_VERSION } from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import type { Db } from '../../db/client';
import { AppError } from '../../lib/errors';
import * as repo from './repository';

const notFound = () => new AppError(404, 'CLASS_NOT_FOUND', 'Không tìm thấy lớp phù hợp.');

function criterion(
  key: MatchCriterion['key'],
  score: number,
  maxScore: number,
  unknownScore: number,
  reasons: { match: string; adjustable: string; unknown: string },
): MatchCriterion {
  const status =
    maxScore === 0 || score === unknownScore
      ? 'unknown'
      : score === maxScore
        ? 'match'
        : 'adjustable';
  return { key, score, maxScore, status, reason: reasons[status] };
}

/** Deterministic, explainable advisory score. It never grants application permission. */
export function toRecommendation(row: repo.ScoredClass): ClassRecommendation {
  const grade = criterion('grade', row.gradeScore, 20, 10, {
    match: 'Khối lớp thuộc ưu tiên đã khai báo của gia sư.',
    adjustable: 'Khối lớp ngoài ưu tiên; gia sư cần xác nhận có thể dạy riêng lớp này.',
    unknown: 'Gia sư chưa khai báo khối lớp ưu tiên.',
  });
  const area = criterion('area', row.areaScore, 15, 7, {
    match:
      row.class.mode === 'online'
        ? 'Lớp học trực tuyến không yêu cầu khu vực.'
        : 'Khu vực công khai nằm trong ưu tiên của gia sư.',
    adjustable: 'Khu vực công khai ngoài ưu tiên; gia sư cần xác nhận có thể dạy tại khu vực này.',
    unknown: 'Chưa đủ khu vực công khai hoặc ưu tiên địa bàn để đối chiếu.',
  });
  const schedule = criterion('schedule', row.scheduleScore, 15, 7, {
    match: 'Ít nhất một khung giờ của lớp nằm trong lịch rảnh định kỳ cùng múi giờ.',
    adjustable: 'Chưa có khung giờ trùng lịch rảnh định kỳ; gia sư cần xác nhận có thể sắp xếp.',
    unknown: 'Chưa đủ lịch rảnh định kỳ cùng múi giờ để đối chiếu.',
  });
  const criteria: MatchCriterion[] = [
    {
      key: 'subject',
      score: 30,
      maxScore: 30,
      status: 'match',
      reason: 'Môn học thuộc hồ sơ gia sư.',
    },
    {
      key: 'mode',
      score: 20,
      maxScore: 20,
      status: 'match',
      reason: 'Gia sư đã đăng ký hình thức dạy của lớp.',
    },
    grade,
    area,
    schedule,
    {
      key: 'budget',
      score: 0,
      maxScore: 0,
      status: 'unknown',
      reason:
        'Ngân sách lớp tính theo buổi, còn học phí hồ sơ gia sư tính theo giờ; chưa có thời lượng buổi học đã chốt để so sánh.',
    },
  ];
  const adjustments = criteria
    .filter(
      (item): item is MatchCriterion & { key: MatchAdjustment } => item.status === 'adjustable',
    )
    .map((item) => item.key);
  const profileChangesPreview = {
    preferredGrade: grade.status === 'adjustable' ? row.class.grade : null,
    preferredArea:
      area.status === 'adjustable' ? (row.class.publicArea?.split(',')[0]?.trim() ?? null) : null,
    negotiableTime: schedule.status === 'adjustable' && !row.negotiableTime,
  };
  const coverage = criteria.reduce(
    (sum, item) => sum + (item.status === 'unknown' ? 0 : item.maxScore),
    0,
  );
  const score = criteria.reduce((sum, item) => sum + item.score, 0);
  const level: ClassMatch['level'] =
    coverage < 70
      ? 'uncertain'
      : adjustments.length === 0
        ? 'strong'
        : adjustments.length === 1 && score >= 65
          ? 'near'
          : 'low';
  return {
    class: row.class,
    match: {
      algorithmVersion: MATCH_ALGORITHM_VERSION,
      score,
      coverage,
      level,
      criteria,
      adjustments,
      profileChangesPreview,
    },
  };
}

export async function listRecommendations(
  db: Db,
  tutorId: string,
  query: ClassSearchQuery,
): Promise<Page<ClassRecommendation>> {
  if (!(await repo.tutorEligible(db, tutorId))) {
    throw new AppError(403, 'TUTOR_NOT_APPROVED', 'Hồ sơ gia sư chưa được duyệt.');
  }
  const page = await repo.searchCandidateClasses(db, tutorId, query);
  return { ...page, items: page.items.map(toRecommendation) };
}

export async function getRecommendation(
  db: Db,
  tutorId: string,
  classId: string,
): Promise<ClassRecommendation> {
  return (await getRecommendationWithState(db, tutorId, classId)).recommendation;
}

/** Keep private profile state paired with the exact recommendation read. */
export async function getRecommendationWithState(
  db: Db,
  tutorId: string,
  classId: string,
): Promise<{ recommendation: ClassRecommendation; negotiableTime: boolean }> {
  if (!(await repo.tutorEligible(db, tutorId))) {
    throw new AppError(403, 'TUTOR_NOT_APPROVED', 'Hồ sơ gia sư chưa được duyệt.');
  }
  const row = await repo.findCandidateClass(db, tutorId, classId);
  if (!row) throw notFound();
  return { recommendation: toRecommendation(row), negotiableTime: row.negotiableTime };
}

/** Fit of an already assigned tutor, scored with the same criteria as recommendations. */
export async function assignedTutorFit(
  db: Db,
  tutorId: string,
  classId: string,
): Promise<ClassMatch | null> {
  const row = await repo.scoreTutorForClass(db, tutorId, classId);
  if (!row) return null;
  return toRecommendation({
    class: { mode: row.mode, grade: row.grade, publicArea: row.publicArea } as PublicClass,
    gradeScore: row.gradeScore,
    areaScore: row.areaScore,
    scheduleScore: row.scheduleScore,
    negotiableTime: row.negotiableTime === 1,
  }).match;
}

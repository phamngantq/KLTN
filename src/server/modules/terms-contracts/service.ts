import type { Page } from '../../../shared/schemas/discovery';
import {
  type AdminContractCandidate,
  quizQuestionsSchema,
  type AdminTermsQuiz,
  type ClassContractRecord,
  type QuizQuestion,
  type TutorQuizAttempt,
  type TutorTermsAcknowledgement,
  type TutorTermsQuiz,
} from '../../../shared/schemas/terms-contracts';
import { AppError } from '../../lib/errors';

interface ContentRow {
  id: string;
  revision: number;
  title: string;
  body_text: string;
}
interface QuizRow {
  id: string;
  terms_content_revision_id: string;
  status: 'draft' | 'published';
  edit_version: number;
  questions_json: string;
  minimum_correct: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
interface AcknowledgementRow {
  quiz_id: string;
  terms_content_revision_id: string;
  acknowledged_at: string;
}

const unavailable = () =>
  new AppError(
    409,
    'TERMS_QUIZ_UNAVAILABLE',
    'Chưa có bài kiểm tra điều khoản hiện hành được công bố.',
  );
const staleQuiz = () =>
  new AppError(
    409,
    'TERMS_QUIZ_STALE',
    'Bài kiểm tra hoặc điều khoản đã thay đổi. Vui lòng tải lại.',
  );
const quizNotFound = () =>
  new AppError(404, 'TERMS_QUIZ_NOT_FOUND', 'Không tìm thấy bài kiểm tra.');
const contractNotFound = () =>
  new AppError(404, 'CONTRACT_NOT_FOUND', 'Không tìm thấy hồ sơ hợp đồng.');

function rootMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

function questions(row: QuizRow): QuizQuestion[] {
  const parsed = quizQuestionsSchema.safeParse(JSON.parse(row.questions_json));
  if (!parsed.success) throw new Error('Stored quiz questions are invalid.');
  return parsed.data;
}

function adminQuiz(row: QuizRow): AdminTermsQuiz {
  return {
    id: row.id,
    termsContentRevisionId: row.terms_content_revision_id,
    status: row.status,
    editVersion: row.edit_version,
    questions: questions(row),
    minimumCorrect: row.minimum_correct,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentContent(
  db: D1Database,
  kind: 'terms' | 'contract',
): Promise<ContentRow | null> {
  return db
    .prepare(
      `SELECT id, revision, title, body_text FROM content_revisions
    WHERE kind = ? AND slug = ? AND audience = 'tutor' AND status = 'published'`,
    )
    .bind(kind, kind === 'terms' ? 'tutor-responsibility' : 'tutor-class-contract')
    .first<ContentRow>();
}

async function quizById(db: D1Database, id: string): Promise<QuizRow | null> {
  return db.prepare('SELECT * FROM terms_quizzes WHERE id = ?').bind(id).first<QuizRow>();
}

async function currentQuiz(db: D1Database): Promise<{ content: ContentRow; quiz: QuizRow }> {
  const content = await currentContent(db, 'terms');
  if (!content) throw unavailable();
  const quiz = await db
    .prepare(
      `SELECT * FROM terms_quizzes
    WHERE terms_content_revision_id = ? AND status = 'published'`,
    )
    .bind(content.id)
    .first<QuizRow>();
  if (!quiz) throw unavailable();
  return { content, quiz };
}

async function acknowledgement(db: D1Database, tutorId: string, quizId: string) {
  return db
    .prepare(
      `SELECT quiz_id, terms_content_revision_id, acknowledged_at
    FROM terms_acknowledgements WHERE tutor_user_id = ? AND quiz_id = ?`,
    )
    .bind(tutorId, quizId)
    .first<AcknowledgementRow>();
}

/** Passing the published quiz and acknowledging the terms is required once, before the first class. */
export async function assertTutorTermsReady(db: D1Database, tutorId: string): Promise<void> {
  const { quiz } = await currentQuiz(db);
  if (!(await acknowledgement(db, tutorId, quiz.id))) {
    throw new AppError(
      409,
      'TERMS_ACK_REQUIRED',
      'Để nhận lớp, bạn cần hoàn thành bài test về điều khoản trách nhiệm.',
    );
  }
}

export async function listAdminQuizzes(db: D1Database): Promise<AdminTermsQuiz[]> {
  const result = await db
    .prepare('SELECT * FROM terms_quizzes ORDER BY created_at DESC LIMIT 100')
    .all<QuizRow>();
  return result.results.map(adminQuiz);
}

export async function getAdminQuiz(db: D1Database, id: string): Promise<AdminTermsQuiz> {
  const row = await quizById(db, id);
  if (!row) throw quizNotFound();
  return adminQuiz(row);
}

export async function createQuiz(
  db: D1Database,
  actorId: string,
  input: { termsContentRevisionId: string; questions: QuizQuestion[]; minimumCorrect: number },
): Promise<AdminTermsQuiz> {
  const content = await currentContent(db, 'terms');
  if (!content || content.id !== input.termsContentRevisionId) throw staleQuiz();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO terms_quizzes
        (id, terms_content_revision_id, status, edit_version, questions_json, minimum_correct, mutation_id,
         created_by, published_by, published_at, created_at, updated_at)
        VALUES (?, ?, 'draft', 1, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(
          id,
          content.id,
          JSON.stringify(input.questions),
          input.minimumCorrect,
          mutationId,
          actorId,
          now,
          now,
        ),
      audit(
        db,
        actorId,
        'terms_quiz.created',
        'terms_quiz',
        id,
        { contentRevisionId: content.id },
        now,
      ),
    ]);
  } catch (error) {
    if (rootMessage(error).includes('UNIQUE constraint failed'))
      throw new AppError(409, 'TERMS_QUIZ_EXISTS', 'Phiên bản điều khoản này đã có bài kiểm tra.');
    throw error;
  }
  return getAdminQuiz(db, id);
}

export async function editQuiz(
  db: D1Database,
  actorId: string,
  id: string,
  input: { editVersion: number; questions: QuizQuestion[]; minimumCorrect: number },
): Promise<AdminTermsQuiz> {
  const quiz = await quizById(db, id);
  if (!quiz) throw quizNotFound();
  if (quiz.status !== 'draft' || quiz.edit_version !== input.editVersion) throw staleQuiz();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const [mutation] = await db.batch([
    db
      .prepare(
        `UPDATE terms_quizzes
      SET questions_json = ?, minimum_correct = ?, edit_version = edit_version + 1,
          mutation_id = ?, updated_at = ?
      WHERE id = ? AND status = 'draft' AND edit_version = ?`,
      )
      .bind(
        JSON.stringify(input.questions),
        input.minimumCorrect,
        mutationId,
        now,
        id,
        input.editVersion,
      ),
    conditionalAudit(
      db,
      actorId,
      'terms_quiz.edited',
      'terms_quiz',
      id,
      { editVersion: input.editVersion + 1 },
      now,
      'terms_quizzes',
      mutationId,
    ),
  ]);
  if (mutation?.meta.changes !== 1) throw staleQuiz();
  return getAdminQuiz(db, id);
}

export async function publishQuiz(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
): Promise<AdminTermsQuiz> {
  const quiz = await quizById(db, id);
  if (!quiz) throw quizNotFound();
  const content = await currentContent(db, 'terms');
  if (
    quiz.status !== 'draft' ||
    quiz.edit_version !== editVersion ||
    content?.id !== quiz.terms_content_revision_id
  )
    throw staleQuiz();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE terms_quizzes
      SET status = 'published', edit_version = edit_version + 1,
          published_by = ?, published_at = ?, mutation_id = ?, updated_at = ?
      WHERE id = ? AND status = 'draft' AND edit_version = ?`,
        )
        .bind(actorId, now, mutationId, now, id, editVersion),
      conditionalAudit(
        db,
        actorId,
        'terms_quiz.published',
        'terms_quiz',
        id,
        { contentRevisionId: content.id },
        now,
        'terms_quizzes',
        mutationId,
      ),
    ]);
    if (result?.meta.changes !== 1) throw staleQuiz();
  } catch (error) {
    if (rootMessage(error).includes('TERMS_QUIZ_NOT_READY')) throw staleQuiz();
    throw error;
  }
  return getAdminQuiz(db, id);
}

export async function getTutorQuiz(db: D1Database, tutorId: string): Promise<TutorTermsQuiz> {
  const { content, quiz } = await currentQuiz(db);
  const [ack, passed] = await Promise.all([
    acknowledgement(db, tutorId, quiz.id),
    db
      .prepare(
        `SELECT id FROM terms_quiz_attempts WHERE tutor_user_id = ? AND quiz_id = ?
         AND passed = 1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .bind(tutorId, quiz.id)
      .first<{ id: string }>(),
  ]);
  return {
    quizId: quiz.id,
    termsContentRevisionId: content.id,
    termsRevision: content.revision,
    termsTitle: content.title,
    termsBodyText: content.body_text,
    questions: questions(quiz).map(({ id, prompt, choices }) => ({ id, prompt, choices })),
    minimumCorrect: quiz.minimum_correct,
    passed: !!passed,
    passedAttemptId: passed?.id ?? null,
    acknowledgedAt: ack?.acknowledged_at ?? null,
  };
}

export async function submitAttempt(
  db: D1Database,
  tutorId: string,
  input: { quizId: string; answers: { questionId: string; choiceId: string }[] },
): Promise<TutorQuizAttempt> {
  const { content, quiz } = await currentQuiz(db);
  if (quiz.id !== input.quizId) throw staleQuiz();
  const items = questions(quiz);
  const answers = new Map(input.answers.map((answer) => [answer.questionId, answer.choiceId]));
  if (
    answers.size !== items.length ||
    input.answers.length !== items.length ||
    items.some(
      (item) =>
        !answers.has(item.id) || !item.choices.some((choice) => choice.id === answers.get(item.id)),
    )
  ) {
    throw new AppError(
      422,
      'TERMS_ANSWERS_INVALID',
      'Cần chọn đúng một lựa chọn hợp lệ cho mỗi câu hỏi.',
    );
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const count = await db
    .prepare(
      `SELECT count(*) AS count FROM terms_quiz_attempts
    WHERE tutor_user_id = ? AND quiz_id = ? AND created_at >= ?`,
    )
    .bind(tutorId, quiz.id, since)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= 5)
    throw new AppError(429, 'TERMS_ATTEMPT_LIMIT', 'Đã hết lượt làm bài trong 24 giờ.');
  const correctCount = items.filter((item) => answers.get(item.id) === item.correctChoiceId).length;
  const passed = correctCount >= quiz.minimum_correct;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO terms_quiz_attempts
        (id, tutor_user_id, quiz_id, answers_json, correct_count, passed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          tutorId,
          quiz.id,
          JSON.stringify(input.answers),
          correctCount,
          passed ? 1 : 0,
          now,
        ),
      audit(
        db,
        tutorId,
        'terms_quiz.attempted',
        'terms_quiz_attempt',
        id,
        { quizId: quiz.id, contentRevisionId: content.id, passed },
        now,
      ),
    ]);
  } catch (error) {
    if (rootMessage(error).includes('TERMS_QUIZ_NOT_CURRENT')) throw staleQuiz();
    if (rootMessage(error).includes('TERMS_ATTEMPT_LIMIT'))
      throw new AppError(429, 'TERMS_ATTEMPT_LIMIT', 'Đã hết lượt làm bài trong 24 giờ.');
    throw error;
  }
  return {
    id,
    quizId: quiz.id,
    termsContentRevisionId: content.id,
    correctCount,
    questionCount: items.length,
    minimumCorrect: quiz.minimum_correct,
    passed,
    createdAt: now,
  };
}

export async function acknowledgeTerms(
  db: D1Database,
  tutorId: string,
  input: { quizId: string; attemptId: string; acknowledged: true },
): Promise<TutorTermsAcknowledgement> {
  const { content, quiz } = await currentQuiz(db);
  if (quiz.id !== input.quizId) throw staleQuiz();
  const existing = await acknowledgement(db, tutorId, quiz.id);
  if (existing)
    return {
      quizId: existing.quiz_id,
      termsContentRevisionId: existing.terms_content_revision_id,
      acknowledgedAt: existing.acknowledged_at,
    };
  const attempt = await db
    .prepare(
      `SELECT passed FROM terms_quiz_attempts
    WHERE id = ? AND tutor_user_id = ? AND quiz_id = ?`,
    )
    .bind(input.attemptId, tutorId, quiz.id)
    .first<{ passed: number }>();
  if (!attempt || attempt.passed !== 1)
    throw new AppError(
      409,
      'TERMS_PASS_REQUIRED',
      'Gia sư cần vượt qua bài kiểm tra trước khi xác nhận.',
    );
  const now = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO terms_acknowledgements
        (tutor_user_id, quiz_id, attempt_id, terms_content_revision_id, acknowledged_at)
        VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(tutorId, quiz.id, input.attemptId, content.id, now),
      audit(
        db,
        tutorId,
        'terms.acknowledged',
        'terms_quiz',
        quiz.id,
        { contentRevisionId: content.id, attemptId: input.attemptId },
        now,
      ),
    ]);
  } catch (error) {
    const concurrent = await acknowledgement(db, tutorId, quiz.id);
    if (concurrent)
      return {
        quizId: concurrent.quiz_id,
        termsContentRevisionId: concurrent.terms_content_revision_id,
        acknowledgedAt: concurrent.acknowledged_at,
      };
    if (rootMessage(error).includes('TERMS_ACK_NOT_ELIGIBLE')) throw staleQuiz();
    throw error;
  }
  return { quizId: quiz.id, termsContentRevisionId: content.id, acknowledgedAt: now };
}

interface ContractRow {
  id: string;
  assignment_id: string;
  class_id: string;
  class_code: string;
  tutor_user_id: string;
  status: 'issued' | 'acknowledged';
  version: number;
  contract_content_revision_id: string;
  contract_revision: number;
  contract_title: string;
  contract_body_text: string;
  fee_option_version_id: string;
  fee_option_key: string;
  fee_option_title: string;
  fee_policy_text: string;
  rate_basis_points: number;
  deposit_basis_points: number | null;
  agreed_tuition_per_session_minor: number | null;
  issued_at: string;
  acknowledged_at: string | null;
  learner_confirmed_at: string | null;
  placement_fee_paid_at: string | null;
  placement_fee_amount_minor: number | null;
  placement_fee_reported_at: string | null;
}
const contractSelect = `SELECT r.id, r.assignment_id, r.class_id, cl.code AS class_code,
  r.tutor_user_id, r.status, r.version, r.contract_content_revision_id,
  c.revision AS contract_revision, c.title AS contract_title, c.body_text AS contract_body_text,
  r.fee_option_version_id, f.option_key AS fee_option_key, f.title AS fee_option_title,
  f.policy_text AS fee_policy_text, f.rate_basis_points, f.deposit_basis_points,
  r.agreed_tuition_per_session_minor,
  r.issued_at, r.acknowledged_at,
  a.learner_confirmed_at, a.placement_fee_paid_at, a.placement_fee_amount_minor,
  a.placement_fee_reported_at
  FROM class_contract_records r
  JOIN class_assignments a ON a.id = r.assignment_id
  JOIN class_listings cl ON cl.id = r.class_id
  JOIN content_revisions c ON c.id = r.contract_content_revision_id
  JOIN fee_option_versions f ON f.id = r.fee_option_version_id`;

function contract(row: ContractRow): ClassContractRecord {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    classId: row.class_id,
    classCode: row.class_code,
    tutorUserId: row.tutor_user_id,
    status: row.status,
    version: row.version,
    contractContentRevisionId: row.contract_content_revision_id,
    contractRevision: row.contract_revision,
    contractTitle: row.contract_title,
    contractBodyText: row.contract_body_text,
    feeOptionVersionId: row.fee_option_version_id,
    feeOptionKey: row.fee_option_key,
    feeOptionTitle: row.fee_option_title,
    feePolicyText: row.fee_policy_text,
    rateBasisPoints: row.rate_basis_points,
    depositBasisPoints: row.deposit_basis_points,
    agreedTuitionPerSessionMinor: row.agreed_tuition_per_session_minor,
    issuedAt: row.issued_at,
    acknowledgedAt: row.acknowledged_at,
    learnerConfirmedAt: row.learner_confirmed_at,
    placementFeePaidAt: row.placement_fee_paid_at,
    placementFeeAmountMinor: row.placement_fee_amount_minor,
    placementFeeReportedAt: row.placement_fee_reported_at,
  };
}

/**
 * Moderator attests the placement fee was received offline (no payment gateway). Allowed once,
 * after the learner confirmed and the tutor acknowledged; D1 re-checks every condition.
 */
export async function recordPlacementFee(
  db: D1Database,
  moderatorId: string,
  contractId: string,
  amountMinor: number,
): Promise<ClassContractRecord> {
  const current = await getContract(db, contractId);
  if (
    current.status !== 'acknowledged' ||
    !current.learnerConfirmedAt ||
    current.placementFeePaidAt
  ) {
    throw new AppError(
      409,
      'PLACEMENT_FEE_NOT_READY',
      'Chỉ ghi nhận phí khi người học đã xác nhận thuê, gia sư đã xác nhận hợp đồng và phí chưa được ghi nhận.',
    );
  }
  const now = new Date().toISOString();
  try {
    const [updated] = await db.batch([
      db
        .prepare(
          `UPDATE class_assignments SET placement_fee_paid_at = ?, placement_fee_amount_minor = ?,
             placement_fee_recorded_by = ?, version = version + 1
           WHERE id = ? AND placement_fee_paid_at IS NULL`,
        )
        .bind(now, amountMinor, moderatorId, current.assignmentId),
      audit(
        db,
        moderatorId,
        'assignment.placement_fee_recorded',
        'class_assignment',
        current.assignmentId,
        { contractId, amountMinor },
        now,
      ),
    ]);
    if (!updated?.meta.changes)
      throw new AppError(409, 'PLACEMENT_FEE_NOT_READY', 'Phí đã được ghi nhận.');
  } catch (error) {
    if (rootMessage(error).includes('PLACEMENT_FEE_INVALID')) {
      throw new AppError(409, 'PLACEMENT_FEE_NOT_READY', 'Chưa đủ điều kiện ghi nhận phí.');
    }
    throw error;
  }
  return getContract(db, contractId);
}

export async function getContract(
  db: D1Database,
  id: string,
  tutorId?: string,
): Promise<ClassContractRecord> {
  const row = await db
    .prepare(`${contractSelect} WHERE r.id = ? ${tutorId ? 'AND r.tutor_user_id = ?' : ''}`)
    .bind(...(tutorId ? [id, tutorId] : [id]))
    .first<ContractRow>();
  if (!row) throw contractNotFound();
  return contract(row);
}

export async function listTutorContracts(
  db: D1Database,
  tutorId: string,
  page: number,
  pageSize: number,
): Promise<Page<ClassContractRecord>> {
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `${contractSelect} WHERE r.tutor_user_id = ? ORDER BY r.issued_at DESC, r.id LIMIT ? OFFSET ?`,
      )
      .bind(tutorId, pageSize, (page - 1) * pageSize)
      .all<ContractRow>(),
    db
      .prepare('SELECT count(*) AS count FROM class_contract_records WHERE tutor_user_id = ?')
      .bind(tutorId)
      .first<{ count: number }>(),
  ]);
  return { items: rows.results.map(contract), page, pageSize, total: count?.count ?? 0 };
}

export async function listAdminContracts(
  db: D1Database,
  query: { page: number; pageSize: number; assignmentId?: string },
): Promise<Page<ClassContractRecord>> {
  const condition = query.assignmentId ? 'WHERE r.assignment_id = ?' : '';
  const filter = query.assignmentId ? [query.assignmentId] : [];
  const [rows, count] = await Promise.all([
    db
      .prepare(`${contractSelect} ${condition} ORDER BY r.issued_at DESC, r.id LIMIT ? OFFSET ?`)
      .bind(...filter, query.pageSize, (query.page - 1) * query.pageSize)
      .all<ContractRow>(),
    db
      .prepare(`SELECT count(*) AS count FROM class_contract_records r ${condition}`)
      .bind(...filter)
      .first<{ count: number }>(),
  ]);
  return {
    items: rows.results.map(contract),
    page: query.page,
    pageSize: query.pageSize,
    total: count?.count ?? 0,
  };
}

export async function listAdminContractCandidates(
  db: D1Database,
  page: number,
  pageSize: number,
): Promise<Page<AdminContractCandidate>> {
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `SELECT a.id AS assignmentId, a.version AS assignmentVersion,
      a.class_id AS classId, c.code AS classCode, a.tutor_user_id AS tutorUserId,
      u.display_name AS tutorDisplayName, a.assigned_at AS assignedAt,
      r.id AS contractId
      FROM class_assignments a
      JOIN class_listings c ON c.id = a.class_id
      JOIN users u ON u.id = a.tutor_user_id
      LEFT JOIN class_contract_records r ON r.assignment_id = a.id
      WHERE a.status = 'active' AND c.status = 'active'
      ORDER BY a.assigned_at DESC, a.id LIMIT ? OFFSET ?`,
      )
      .bind(pageSize, (page - 1) * pageSize)
      .all<AdminContractCandidate>(),
    db
      .prepare(
        `SELECT count(*) AS count FROM class_assignments a
        JOIN class_listings c ON c.id = a.class_id
        WHERE a.status = 'active' AND c.status = 'active'`,
      )
      .first<{ count: number }>(),
  ]);
  return { items: rows.results, page, pageSize, total: count?.count ?? 0 };
}

export async function issueContract(
  db: D1Database,
  actorId: string,
  assignmentId: string,
  input: { assignmentVersion: number; contentRevisionId: string },
): Promise<ClassContractRecord> {
  const content = await currentContent(db, 'contract');
  if (!content || content.id !== input.contentRevisionId)
    throw new AppError(
      409,
      'CONTRACT_CONTENT_UNAVAILABLE',
      'Chưa có phiên bản hợp đồng hiện hành được công bố.',
    );
  const assignment = await db
    .prepare(
      `SELECT a.class_id, a.tutor_user_id, a.version,
    a.status, a.agreed_tuition_per_session_minor, t.fee_option_version_id
    FROM class_assignments a JOIN tutor_applications t ON t.id = a.application_id
    JOIN class_listings c ON c.id = a.class_id
    WHERE a.id = ? AND c.status = 'active'`,
    )
    .bind(assignmentId)
    .first<{
      class_id: string;
      tutor_user_id: string;
      version: number;
      status: string;
      agreed_tuition_per_session_minor: number | null;
      fee_option_version_id: string;
    }>();
  if (!assignment) throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Không tìm thấy lớp được gán.');
  if (assignment.status !== 'active' || assignment.version !== input.assignmentVersion)
    throw new AppError(409, 'ASSIGNMENT_STALE', 'Lớp được gán đã thay đổi.');
  if (assignment.agreed_tuition_per_session_minor === null)
    throw new AppError(
      409,
      'CONTRACT_TUITION_UNRECORDED',
      'Cần ghi nhận học phí đã chốt trước khi phát hành hợp đồng.',
    );
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO class_contract_records
        (id, assignment_id, class_id, tutor_user_id, fee_option_version_id,
         contract_content_revision_id, agreed_tuition_per_session_minor,
         status, version, issued_by, issued_at, acknowledged_at, mutation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', 1, ?, ?, NULL, ?)`,
        )
        .bind(
          id,
          assignmentId,
          assignment.class_id,
          assignment.tutor_user_id,
          assignment.fee_option_version_id,
          content.id,
          assignment.agreed_tuition_per_session_minor,
          actorId,
          now,
          crypto.randomUUID(),
        ),
      audit(
        db,
        actorId,
        'class_contract.issued',
        'class_contract',
        id,
        {
          assignmentId,
          contentRevisionId: content.id,
          feeOptionVersionId: assignment.fee_option_version_id,
        },
        now,
      ),
    ]);
  } catch (error) {
    if (rootMessage(error).includes('UNIQUE constraint failed'))
      throw new AppError(409, 'CONTRACT_ALREADY_ISSUED', 'Lớp này đã có hồ sơ hợp đồng.');
    if (rootMessage(error).includes('CONTRACT_NOT_ELIGIBLE'))
      throw new AppError(
        409,
        'CONTRACT_CONTENT_UNAVAILABLE',
        'Lớp hoặc phiên bản hợp đồng đã thay đổi.',
      );
    throw error;
  }
  return getContract(db, id);
}

export async function acknowledgeContract(
  db: D1Database,
  tutorId: string,
  id: string,
  input: { version: number; acknowledged: true },
): Promise<ClassContractRecord> {
  const existing = await getContract(db, id, tutorId);
  if (existing.status !== 'issued' || existing.version !== input.version)
    throw new AppError(409, 'CONTRACT_STALE', 'Hồ sơ hợp đồng đã thay đổi.');
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const result = await db.batch([
    db
      .prepare(
        `UPDATE class_contract_records
      SET status = 'acknowledged', version = version + 1,
          acknowledged_at = ?, mutation_id = ?
      WHERE id = ? AND tutor_user_id = ? AND status = 'issued' AND version = ?
        AND EXISTS (SELECT 1 FROM class_assignments a
          JOIN class_listings c ON c.id = a.class_id
          WHERE a.id = assignment_id AND a.status = 'active' AND c.status = 'active')`,
      )
      .bind(now, mutationId, id, tutorId, input.version),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
      SELECT ?, ?, 'class_contract.acknowledged', 'class_contract', ?, '{}', ?
      WHERE EXISTS (SELECT 1 FROM class_contract_records WHERE id = ? AND mutation_id = ?)`,
      )
      .bind(crypto.randomUUID(), tutorId, id, now, id, mutationId),
  ]);
  if (result[0]?.meta.changes !== 1)
    throw new AppError(409, 'CONTRACT_STALE', 'Hồ sơ hợp đồng đã thay đổi.');
  return getContract(db, id, tutorId);
}

/**
 * First-time tutors sign the class contract in person at the centre; the moderator records that
 * signature here. Same issued → acknowledged transition as the tutor's own acknowledgement.
 */
export async function recordContractSignedAtCentre(
  db: D1Database,
  moderatorId: string,
  id: string,
  version: number,
): Promise<ClassContractRecord> {
  const existing = await getContract(db, id);
  if (existing.status !== 'issued' || existing.version !== version)
    throw new AppError(409, 'CONTRACT_STALE', 'Hồ sơ hợp đồng đã thay đổi.');
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const [updated] = await db.batch([
    db
      .prepare(
        `UPDATE class_contract_records
      SET status = 'acknowledged', version = version + 1, acknowledged_at = ?, mutation_id = ?
      WHERE id = ? AND status = 'issued' AND version = ?
        AND EXISTS (SELECT 1 FROM class_assignments a
          JOIN class_listings c ON c.id = a.class_id
          WHERE a.id = assignment_id AND a.status = 'active' AND c.status = 'active')`,
      )
      .bind(now, mutationId, id, version),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
      SELECT ?, ?, 'class_contract.signed_at_centre', 'class_contract', ?, '{}', ?
      WHERE EXISTS (SELECT 1 FROM class_contract_records WHERE id = ? AND mutation_id = ?)`,
      )
      .bind(crypto.randomUUID(), moderatorId, id, now, id, mutationId),
  ]);
  if (updated?.meta.changes !== 1)
    throw new AppError(409, 'CONTRACT_STALE', 'Hồ sơ hợp đồng đã thay đổi.');
  return getContract(db, id);
}

function audit(
  db: D1Database,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorId,
      action,
      targetType,
      targetId,
      JSON.stringify(metadata),
      now,
    );
}

function conditionalAudit(
  db: D1Database,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
  now: string,
  table: 'terms_quizzes',
  mutationId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
      (SELECT 1 FROM ${table} WHERE id = ? AND mutation_id = ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorId,
      action,
      targetType,
      targetId,
      JSON.stringify(metadata),
      now,
      targetId,
      mutationId,
    );
}

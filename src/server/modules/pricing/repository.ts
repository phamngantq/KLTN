import type {
  ClassFeeGuidanceVersion,
  CreateClassFeeGuidanceInput,
  CreateTuitionPriceInput,
  LearnerPriceGuide,
  LearnerPriceItem,
  TuitionPriceVersion,
  UpdateClassFeeGuidanceInput,
  UpdateTuitionPriceInput,
} from '../../../shared/schemas/pricing';

interface TuitionRow {
  id: string;
  subject_id: string;
  subject_name: string;
  grade_label: string;
  level: TuitionPriceVersion['level'];
  mode: TuitionPriceVersion['mode'];
  price_per_session_minor: number;
  version: number;
  edit_version: number;
  status: TuitionPriceVersion['status'];
  published_at: string | null;
  created_at: string;
}

interface GuidanceRow {
  id: string;
  mode: ClassFeeGuidanceVersion['mode'];
  min_fee_minor: number;
  max_fee_minor: number;
  description: string;
  version: number;
  edit_version: number;
  status: ClassFeeGuidanceVersion['status'];
  published_at: string | null;
  created_at: string;
}

function tuition(row: TuitionRow): TuitionPriceVersion {
  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    gradeLabel: row.grade_label,
    level: row.level,
    mode: row.mode,
    pricePerSessionMinor: row.price_per_session_minor,
    version: row.version,
    editVersion: row.edit_version,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function guidance(row: GuidanceRow): ClassFeeGuidanceVersion {
  return {
    id: row.id,
    mode: row.mode,
    minFeeMinor: row.min_fee_minor,
    maxFeeMinor: row.max_fee_minor,
    description: row.description,
    version: row.version,
    editVersion: row.edit_version,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

const TUITION_SELECT = `SELECT p.id, p.subject_id, s.name AS subject_name, p.grade_label,
  p.level, p.mode, p.price_per_session_minor, p.version, p.edit_version,
  p.status, p.published_at, p.created_at
  FROM tuition_price_versions p JOIN subjects s ON s.id = p.subject_id`;
const GUIDANCE_SELECT = `SELECT id, mode, min_fee_minor, max_fee_minor, description,
  version, edit_version, status, published_at, created_at FROM class_fee_guidance_versions`;

export async function listTuition(
  db: D1Database,
  publicOnly: boolean,
): Promise<TuitionPriceVersion[]> {
  const filter = publicOnly
    ? "WHERE p.status IN ('published', 'retired') AND p.published_at <= ?"
    : '';
  const sql = `WITH ranked AS (
    SELECT p.id, p.subject_id, s.name AS subject_name, p.grade_label, p.level, p.mode,
      p.price_per_session_minor, p.version, p.edit_version, p.status, p.published_at,
      p.created_at, row_number() OVER (PARTITION BY p.subject_id, p.grade_label, p.level,
        p.mode ORDER BY p.version DESC) AS rank
    FROM tuition_price_versions p JOIN subjects s ON s.id = p.subject_id ${filter}
  ) SELECT * FROM ranked WHERE rank = 1 ${publicOnly ? "AND status = 'published'" : ''}
    ORDER BY subject_name, grade_label, level, mode LIMIT 200`;
  const statement = db.prepare(sql);
  const rows = await (
    publicOnly ? statement.bind(new Date().toISOString()) : statement
  ).all<TuitionRow>();
  return rows.results.map(tuition);
}

export async function listGuidance(
  db: D1Database,
  publicOnly: boolean,
): Promise<ClassFeeGuidanceVersion[]> {
  const filter = publicOnly ? "WHERE status IN ('published', 'retired') AND published_at <= ?" : '';
  const sql = `WITH ranked AS (
    SELECT id, mode, min_fee_minor, max_fee_minor, description, version, edit_version,
      status, published_at, created_at,
      row_number() OVER (PARTITION BY mode ORDER BY version DESC) AS rank
    FROM class_fee_guidance_versions ${filter}
  ) SELECT * FROM ranked WHERE rank = 1 ${publicOnly ? "AND status = 'published'" : ''}
    ORDER BY mode LIMIT 2`;
  const statement = db.prepare(sql);
  const rows = await (
    publicOnly ? statement.bind(new Date().toISOString()) : statement
  ).all<GuidanceRow>();
  return rows.results.map(guidance);
}

export async function getTuition(db: D1Database, id: string): Promise<TuitionPriceVersion | null> {
  const row = await db.prepare(`${TUITION_SELECT} WHERE p.id = ?`).bind(id).first<TuitionRow>();
  return row ? tuition(row) : null;
}

export async function getGuidance(
  db: D1Database,
  id: string,
): Promise<ClassFeeGuidanceVersion | null> {
  const row = await db.prepare(`${GUIDANCE_SELECT} WHERE id = ?`).bind(id).first<GuidanceRow>();
  return row ? guidance(row) : null;
}

export async function subjectExists(db: D1Database, subjectId: string): Promise<boolean> {
  return !!(await db.prepare('SELECT id FROM subjects WHERE id = ?').bind(subjectId).first());
}

export async function latestTuition(
  db: D1Database,
  input: Pick<CreateTuitionPriceInput, 'subjectId' | 'gradeLabel' | 'level' | 'mode'>,
): Promise<TuitionPriceVersion | null> {
  const row = await db
    .prepare(
      `${TUITION_SELECT} WHERE p.subject_id = ? AND p.grade_label = ? AND p.level = ? AND p.mode = ? ORDER BY p.version DESC LIMIT 1`,
    )
    .bind(input.subjectId, input.gradeLabel, input.level, input.mode)
    .first<TuitionRow>();
  return row ? tuition(row) : null;
}

export async function latestGuidance(
  db: D1Database,
  mode: string,
): Promise<ClassFeeGuidanceVersion | null> {
  const row = await db
    .prepare(`${GUIDANCE_SELECT} WHERE mode = ? ORDER BY version DESC LIMIT 1`)
    .bind(mode)
    .first<GuidanceRow>();
  return row ? guidance(row) : null;
}

function audit(
  db: D1Database,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: object,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
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

export async function insertTuition(
  db: D1Database,
  actorId: string,
  id: string,
  version: number,
  input: CreateTuitionPriceInput,
  now: string,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO tuition_price_versions
      (id, subject_id, grade_label, level, mode, price_per_session_minor, version,
       edit_version, status, approved_by, published_at, mutation_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'draft', NULL, NULL, ?, ?, ?)`,
      )
      .bind(
        id,
        input.subjectId,
        input.gradeLabel,
        input.level,
        input.mode,
        input.pricePerSessionMinor,
        version,
        crypto.randomUUID(),
        now,
        now,
      ),
    audit(
      db,
      actorId,
      'tuition_price.created',
      'tuition_price_version',
      id,
      { version, status: 'draft' },
      now,
    ),
  ]);
}

export async function insertGuidance(
  db: D1Database,
  actorId: string,
  id: string,
  version: number,
  input: CreateClassFeeGuidanceInput,
  now: string,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO class_fee_guidance_versions
      (id, mode, min_fee_minor, max_fee_minor, description, version, edit_version,
       status, approved_by, published_at, mutation_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'draft', NULL, NULL, ?, ?, ?)`,
      )
      .bind(
        id,
        input.mode,
        input.minFeeMinor,
        input.maxFeeMinor,
        input.description,
        version,
        crypto.randomUUID(),
        now,
        now,
      ),
    audit(
      db,
      actorId,
      'class_fee_guidance.created',
      'class_fee_guidance_version',
      id,
      { version, status: 'draft' },
      now,
    ),
  ]);
}

async function changed(
  db: D1Database,
  write: D1PreparedStatement,
  auditWrite: D1PreparedStatement,
): Promise<boolean> {
  const [result] = await db.batch([write, auditWrite]);
  return result?.meta.changes === 1;
}

export function updateTuition(
  db: D1Database,
  actorId: string,
  id: string,
  input: UpdateTuitionPriceInput,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const write = db
    .prepare(
      `UPDATE tuition_price_versions SET price_per_session_minor = ?,
    edit_version = edit_version + 1, mutation_id = ?, updated_at = ?
    WHERE id = ? AND status = 'draft' AND edit_version = ? AND version =
      (SELECT max(version) FROM tuition_price_versions WHERE subject_id =
        (SELECT subject_id FROM tuition_price_versions WHERE id = ?) AND grade_label =
        (SELECT grade_label FROM tuition_price_versions WHERE id = ?) AND level =
        (SELECT level FROM tuition_price_versions WHERE id = ?) AND mode =
        (SELECT mode FROM tuition_price_versions WHERE id = ?))`,
    )
    .bind(input.pricePerSessionMinor, mutationId, now, id, input.editVersion, id, id, id, id);
  const auditWrite = db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ?, ?, 'tuition_price.updated', 'tuition_price_version', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM tuition_price_versions WHERE id = ? AND mutation_id = ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorId,
      id,
      JSON.stringify({ editVersion: input.editVersion + 1 }),
      now,
      id,
      mutationId,
    );
  return changed(db, write, auditWrite);
}

export function updateGuidance(
  db: D1Database,
  actorId: string,
  id: string,
  input: UpdateClassFeeGuidanceInput,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const write = db
    .prepare(
      `UPDATE class_fee_guidance_versions SET min_fee_minor = ?,
    max_fee_minor = ?, description = ?, edit_version = edit_version + 1,
    mutation_id = ?, updated_at = ? WHERE id = ? AND status = 'draft' AND edit_version = ?
    AND version = (SELECT max(version) FROM class_fee_guidance_versions WHERE mode =
      (SELECT mode FROM class_fee_guidance_versions WHERE id = ?))`,
    )
    .bind(
      input.minFeeMinor,
      input.maxFeeMinor,
      input.description,
      mutationId,
      now,
      id,
      input.editVersion,
      id,
    );
  const auditWrite = db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ?, ?, 'class_fee_guidance.updated', 'class_fee_guidance_version', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM class_fee_guidance_versions WHERE id = ? AND mutation_id = ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorId,
      id,
      JSON.stringify({ editVersion: input.editVersion + 1 }),
      now,
      id,
      mutationId,
    );
  return changed(db, write, auditWrite);
}

export function publishTuition(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const write = db
    .prepare(
      `UPDATE tuition_price_versions SET status = 'published',
    approved_by = ?, published_at = ?, mutation_id = ?, updated_at = ?
    WHERE id = ? AND status = 'draft' AND edit_version = ? AND version =
      (SELECT max(version) FROM tuition_price_versions WHERE subject_id =
        (SELECT subject_id FROM tuition_price_versions WHERE id = ?) AND grade_label =
        (SELECT grade_label FROM tuition_price_versions WHERE id = ?) AND level =
        (SELECT level FROM tuition_price_versions WHERE id = ?) AND mode =
        (SELECT mode FROM tuition_price_versions WHERE id = ?))`,
    )
    .bind(actorId, now, mutationId, now, id, editVersion, id, id, id, id);
  const auditWrite = db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ?, ?, 'tuition_price.published', 'tuition_price_version', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM tuition_price_versions WHERE id = ? AND mutation_id = ?)`,
    )
    .bind(crypto.randomUUID(), actorId, id, JSON.stringify({ editVersion }), now, id, mutationId);
  return changed(db, write, auditWrite);
}

export function publishGuidance(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const write = db
    .prepare(
      `UPDATE class_fee_guidance_versions SET status = 'published',
    approved_by = ?, published_at = ?, mutation_id = ?, updated_at = ?
    WHERE id = ? AND status = 'draft' AND edit_version = ? AND version =
      (SELECT max(version) FROM class_fee_guidance_versions WHERE mode =
        (SELECT mode FROM class_fee_guidance_versions WHERE id = ?))`,
    )
    .bind(actorId, now, mutationId, now, id, editVersion, id);
  const auditWrite = db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ?, ?, 'class_fee_guidance.published', 'class_fee_guidance_version', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM class_fee_guidance_versions WHERE id = ? AND mutation_id = ?)`,
    )
    .bind(crypto.randomUUID(), actorId, id, JSON.stringify({ editVersion }), now, id, mutationId);
  return changed(db, write, auditWrite);
}

export async function retireTuition(
  db: D1Database,
  actorId: string,
  id: string,
  version: number,
  newId: string,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const insert = db
    .prepare(
      `INSERT INTO tuition_price_versions
    (id, subject_id, grade_label, level, mode, price_per_session_minor, version,
     edit_version, status, approved_by, published_at, mutation_id, created_at, updated_at)
    SELECT ?, subject_id, grade_label, level, mode, price_per_session_minor, version + 1,
      1, 'retired', ?, ?, ?, ?, ? FROM tuition_price_versions old
    WHERE old.id = ? AND old.status = 'published' AND old.version = ?
      AND NOT EXISTS (SELECT 1 FROM tuition_price_versions newer WHERE
        newer.subject_id = old.subject_id AND newer.grade_label = old.grade_label
        AND newer.level = old.level AND newer.mode = old.mode AND newer.version > old.version)`,
    )
    .bind(newId, actorId, now, mutationId, now, now, id, version);
  const auditWrite = db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ?, ?, 'tuition_price.retired', 'tuition_price_version', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM tuition_price_versions WHERE id = ? AND mutation_id = ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorId,
      newId,
      JSON.stringify({ previousId: id, version: version + 1 }),
      now,
      newId,
      mutationId,
    );
  return changed(db, insert, auditWrite);
}

export async function retireGuidance(
  db: D1Database,
  actorId: string,
  id: string,
  version: number,
  newId: string,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const insert = db
    .prepare(
      `INSERT INTO class_fee_guidance_versions
    (id, mode, min_fee_minor, max_fee_minor, description, version, edit_version,
     status, approved_by, published_at, mutation_id, created_at, updated_at)
    SELECT ?, mode, min_fee_minor, max_fee_minor, description, version + 1,
      1, 'retired', ?, ?, ?, ?, ? FROM class_fee_guidance_versions old
    WHERE old.id = ? AND old.status = 'published' AND old.version = ?
      AND NOT EXISTS (SELECT 1 FROM class_fee_guidance_versions newer WHERE
        newer.mode = old.mode AND newer.version > old.version)`,
    )
    .bind(newId, actorId, now, mutationId, now, now, id, version);
  const auditWrite = db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ?, ?, 'class_fee_guidance.retired', 'class_fee_guidance_version', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM class_fee_guidance_versions WHERE id = ? AND mutation_id = ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorId,
      newId,
      JSON.stringify({ previousId: id, version: version + 1 }),
      now,
      newId,
      mutationId,
    );
  return changed(db, insert, auditWrite);
}

export async function discardTuition(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
  now: string,
): Promise<boolean> {
  const auditWrite = db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ?, ?, 'tuition_price.discarded', 'tuition_price_version', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM tuition_price_versions p WHERE p.id = ?
      AND p.status = 'draft' AND p.edit_version = ? AND NOT EXISTS
      (SELECT 1 FROM tuition_price_versions newer WHERE newer.subject_id = p.subject_id
        AND newer.grade_label = p.grade_label AND newer.level = p.level AND newer.mode = p.mode
        AND newer.version > p.version))`,
    )
    .bind(crypto.randomUUID(), actorId, id, JSON.stringify({ editVersion }), now, id, editVersion);
  const deleteWrite = db
    .prepare(
      `DELETE FROM tuition_price_versions WHERE id = ?
    AND status = 'draft' AND edit_version = ? AND version =
      (SELECT max(version) FROM tuition_price_versions WHERE subject_id =
        (SELECT subject_id FROM tuition_price_versions WHERE id = ?) AND grade_label =
        (SELECT grade_label FROM tuition_price_versions WHERE id = ?) AND level =
        (SELECT level FROM tuition_price_versions WHERE id = ?) AND mode =
        (SELECT mode FROM tuition_price_versions WHERE id = ?))`,
    )
    .bind(id, editVersion, id, id, id, id);
  const [, result] = await db.batch([auditWrite, deleteWrite]);
  return result?.meta.changes === 1;
}

export async function discardGuidance(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
  now: string,
): Promise<boolean> {
  const auditWrite = db
    .prepare(
      `INSERT INTO audit_logs
    (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ?, ?, 'class_fee_guidance.discarded', 'class_fee_guidance_version', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM class_fee_guidance_versions p WHERE p.id = ?
      AND p.status = 'draft' AND p.edit_version = ? AND NOT EXISTS
      (SELECT 1 FROM class_fee_guidance_versions newer WHERE newer.mode = p.mode
        AND newer.version > p.version))`,
    )
    .bind(crypto.randomUUID(), actorId, id, JSON.stringify({ editVersion }), now, id, editVersion);
  const deleteWrite = db
    .prepare(
      `DELETE FROM class_fee_guidance_versions WHERE id = ?
    AND status = 'draft' AND edit_version = ? AND version =
      (SELECT max(version) FROM class_fee_guidance_versions WHERE mode =
        (SELECT mode FROM class_fee_guidance_versions WHERE id = ?))`,
    )
    .bind(id, editVersion, id);
  const [, result] = await db.batch([auditWrite, deleteWrite]);
  return result?.meta.changes === 1;
}

const LEVEL_ORDER =
  "CASE g.education_level WHEN 'primary' THEN 1 WHEN 'lower_secondary' THEN 2 WHEN 'upper_secondary' THEN 3 ELSE 4 END";

/** Published learner reference ranges, ordered by tutor type, subject and school stage. */
export async function listLearnerGuides(db: D1Database): Promise<LearnerPriceGuide[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.dimension, g.tutor_type AS tutorType, g.subject_id AS subjectId,
         s.name AS subjectName, g.education_level AS educationLevel,
         g.min_price_minor AS minPriceMinor, g.max_price_minor AS maxPriceMinor
       FROM learner_price_guides g
       LEFT JOIN subjects s ON s.id = g.subject_id
       WHERE g.status = 'published'
       ORDER BY g.dimension DESC,
         CASE g.tutor_type WHEN 'university_student' THEN 1 WHEN 'pedagogy_student' THEN 2 ELSE 3 END,
         s.name, ${LEVEL_ORDER}`,
    )
    .all<LearnerPriceGuide>();
  return results;
}

const GROUP_ORDER =
  "CASE group_key WHEN 'primary' THEN 1 WHEN 'lower_secondary' THEN 2 WHEN 'upper_secondary' THEN 3 WHEN 'talent' THEN 4 ELSE 5 END";

/** Published grouped reference items for the learner price list. */
export async function listLearnerItems(db: D1Database): Promise<LearnerPriceItem[]> {
  const { results } = await db
    .prepare(
      `SELECT id, group_key AS groupKey, label, min_price_minor AS minPriceMinor,
         max_price_minor AS maxPriceMinor, sort_order AS sortOrder
       FROM learner_price_items WHERE status = 'published'
       ORDER BY ${GROUP_ORDER}, sort_order, label`,
    )
    .all<LearnerPriceItem>();
  return results;
}

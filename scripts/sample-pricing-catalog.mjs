/** Validate the Figma pricing samples before they enter either local or staging D1. */
import { randomUUID } from 'node:crypto';
const SUBJECT_IDS = { Toán: 'subj_math', 'Tiếng Anh': 'subj_english' };
const LEVELS = new Set(['basic', 'advanced', 'intensive']);
const MODES = new Set(['online', 'offline']);

function sampleArray(config, key, count) {
  const raw = config[key];
  if (!raw || raw.length > 10_000) throw new Error(`Invalid ${key} in sample config.`);
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length !== count) {
    throw new Error(`${key} must contain ${count} Figma sample rows.`);
  }
  return rows;
}

function minorAmount(value, allowZero = false) {
  return Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) && value <= 100_000_000;
}

function sampleId(group, index) {
  return `00000000-0000-4000-8000-${String(group + index + 1).padStart(12, '0')}`;
}

export function parseSamplePricingCatalog(config, target) {
  if (target !== 'local' && target !== 'staging_v2') throw new Error('Unsupported sample target.');
  const tuition = sampleArray(config, 'SAMPLE_TUITION_PRICES_JSON', 6).map((source, index) => {
    const subjectId = SUBJECT_IDS[source.subject];
    if (
      !subjectId ||
      typeof source.grade !== 'string' ||
      !source.grade.trim() ||
      source.grade.length > 40 ||
      !LEVELS.has(source.level) ||
      !MODES.has(source.mode) ||
      !minorAmount(source.pricePerSessionMinor)
    ) {
      throw new Error(`Invalid tuition sample row ${index + 1}.`);
    }
    return {
      id: sampleId(target === 'local' ? 600 : 610, index),
      subjectId,
      gradeLabel: source.grade.trim(),
      level: source.level,
      mode: source.mode,
      pricePerSessionMinor: source.pricePerSessionMinor,
    };
  });
  const tuitionKeys = tuition.map(
    (row) => `${row.subjectId}:${row.gradeLabel}:${row.level}:${row.mode}`,
  );
  if (new Set(tuitionKeys).size !== tuition.length) {
    throw new Error('Duplicate tuition sample key.');
  }

  const classFees = sampleArray(config, 'SAMPLE_CLASS_FEES_JSON', 2).map((source, index) => {
    if (
      !MODES.has(source.mode) ||
      !minorAmount(source.minFeeMinor, true) ||
      !minorAmount(source.maxFeeMinor) ||
      source.minFeeMinor > source.maxFeeMinor ||
      typeof source.description !== 'string' ||
      source.description.trim().length < 10 ||
      source.description.length > 500
    ) {
      throw new Error(`Invalid class-fee sample row ${index + 1}.`);
    }
    return {
      id: sampleId(target === 'local' ? 700 : 710, index),
      mode: source.mode,
      minFeeMinor: source.minFeeMinor,
      maxFeeMinor: source.maxFeeMinor,
      description: source.description.trim(),
    };
  });
  if (new Set(classFees.map((row) => row.mode)).size !== classFees.length) {
    throw new Error('Duplicate class-fee sample mode.');
  }
  return { tuition, classFees };
}

function tuitionSelect(catalog, sql) {
  return `SELECT id, subject_id AS subjectId, grade_label AS gradeLabel, level, mode,
    price_per_session_minor AS pricePerSessionMinor, version, status, approved_by AS approvedBy
    FROM tuition_price_versions WHERE ${catalog.tuition
      .map(
        (row) =>
          `(id = ${sql(row.id)} OR (subject_id = ${sql(row.subjectId)} AND grade_label = ${sql(row.gradeLabel)} AND level = ${sql(row.level)} AND mode = ${sql(row.mode)} AND version = 1))`,
      )
      .join(' OR ')}`;
}

function classFeeSelect(catalog, sql) {
  return `SELECT id, mode, min_fee_minor AS minFeeMinor, max_fee_minor AS maxFeeMinor,
    description, version, status, approved_by AS approvedBy
    FROM class_fee_guidance_versions WHERE ${catalog.classFees
      .map((row) => `(id = ${sql(row.id)} OR (mode = ${sql(row.mode)} AND version = 1))`)
      .join(' OR ')}`;
}

export function assertSamplePricingCatalog(
  query,
  catalog,
  sql,
  { published = false, adminId } = {},
) {
  const tuition = query(tuitionSelect(catalog, sql));
  const classFees = query(classFeeSelect(catalog, sql));
  for (const [rows, expectedRows, fields] of [
    [
      tuition,
      catalog.tuition,
      ['subjectId', 'gradeLabel', 'level', 'mode', 'pricePerSessionMinor'],
    ],
    [classFees, catalog.classFees, ['mode', 'minFeeMinor', 'maxFeeMinor', 'description']],
  ]) {
    if (published && rows.length !== expectedRows.length) {
      throw new Error('Published sample pricing catalog is incomplete.');
    }
    for (const row of rows) {
      const expected = expectedRows.find((item) => item.id === row.id);
      if (
        !expected ||
        row.version !== 1 ||
        fields.some((field) => row[field] !== expected[field]) ||
        (published
          ? row.status !== 'published' || row.approvedBy !== adminId
          : !['draft', 'published'].includes(row.status) ||
            (row.status === 'published' && adminId && row.approvedBy !== adminId))
      ) {
        throw new Error('Existing pricing catalog conflicts with Figma sample config.');
      }
    }
  }
  return { tuition: tuition.length, classFees: classFees.length };
}

function auditStatement(sql, adminId, action, type, targetId, now, metadata) {
  return `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
    SELECT ${sql(randomUUID())}, ${sql(adminId)}, ${sql(action)}, ${sql(type)}, ${sql(targetId)}, ${sql(JSON.stringify(metadata))}, ${sql(now)}
    WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = ${sql(action)} AND target_type = ${sql(type)} AND target_id = ${sql(targetId)});`;
}

export function samplePricingCatalogStatements(catalog, sql, adminId, now, target) {
  const lines = [];
  for (const row of catalog.tuition) {
    lines.push(
      `INSERT INTO tuition_price_versions
       (id, subject_id, grade_label, level, mode, price_per_session_minor, version, edit_version,
        status, approved_by, published_at, mutation_id, created_at, updated_at)
       SELECT ${sql(row.id)}, ${sql(row.subjectId)}, ${sql(row.gradeLabel)}, ${sql(row.level)}, ${sql(row.mode)},
        ${sql(row.pricePerSessionMinor)}, 1, 1, 'draft', NULL, NULL, ${sql(randomUUID())}, ${sql(now)}, ${sql(now)}
       WHERE NOT EXISTS (SELECT 1 FROM tuition_price_versions WHERE id = ${sql(row.id)});`,
      `UPDATE tuition_price_versions SET status = 'published', approved_by = ${sql(adminId)},
        published_at = ${sql(now)}, updated_at = ${sql(now)}, mutation_id = ${sql(randomUUID())}
       WHERE id = ${sql(row.id)} AND status = 'draft';`,
      auditStatement(
        sql,
        adminId,
        'tuition_price.published',
        'tuition_price_version',
        row.id,
        now,
        {
          source: target,
          sample: true,
        },
      ),
    );
  }
  for (const row of catalog.classFees) {
    lines.push(
      `INSERT INTO class_fee_guidance_versions
       (id, mode, min_fee_minor, max_fee_minor, description, version, edit_version,
        status, approved_by, published_at, mutation_id, created_at, updated_at)
       SELECT ${sql(row.id)}, ${sql(row.mode)}, ${sql(row.minFeeMinor)}, ${sql(row.maxFeeMinor)},
        ${sql(row.description)}, 1, 1, 'draft', NULL, NULL, ${sql(randomUUID())}, ${sql(now)}, ${sql(now)}
       WHERE NOT EXISTS (SELECT 1 FROM class_fee_guidance_versions WHERE id = ${sql(row.id)});`,
      `UPDATE class_fee_guidance_versions SET status = 'published', approved_by = ${sql(adminId)},
        published_at = ${sql(now)}, updated_at = ${sql(now)}, mutation_id = ${sql(randomUUID())}
       WHERE id = ${sql(row.id)} AND status = 'draft';`,
      auditStatement(
        sql,
        adminId,
        'class_fee_guidance.published',
        'class_fee_guidance_version',
        row.id,
        now,
        {
          source: target,
          sample: true,
        },
      ),
    );
  }
  return lines;
}

#!/usr/bin/env node
/**
 * Demo data for the learner ("người học") area: one sample learner account, complaints in
 * every status, handbook articles with categories and the reference price guides.
 *   node scripts/seed-learner-demo.mjs --local [--persist-to .wrangler/<dir>]
 *   node scripts/seed-learner-demo.mjs --staging-v2
 * Run the matching sample seed first; it creates the sample moderator used as publisher.
 * Idempotent. Never run against production. All values are labelled sample data.
 */
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER_ROOT = join(ROOT, '.wrangler');
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const TARGETS = {
  local: {
    adminId: '00000000-0000-4000-8000-000000000201',
    learnerId: '00000000-0000-4000-8000-000000000221',
    folder: 'sample-local',
  },
  staging_v2: {
    adminId: '00000000-0000-4000-8000-000000000211',
    learnerId: '00000000-0000-4000-8000-000000000222',
    folder: 'sample-staging-v2',
  },
};
const LEARNER_EMAIL = 'nguoi-hoc-mau@example.test';
const LEARNER_NAME = 'Người học mẫu';

const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
const demoId = (group, index) =>
  `00000000-0000-4000-8000-${String(900_000 + group * 100 + index).padStart(12, '0')}`;

const COMPLAINTS = [
  {
    status: 'draft',
    title: 'Yêu cầu hủy hợp đồng do thay đổi kế hoạch',
    body: 'Gia đình có kế hoạch di chuyển, muốn hủy hợp đồng và được hoàn lại tiền đặt cọc.',
    createdDaysAgo: 2,
  },
  {
    status: 'submitted',
    title: 'Gia sư đến muộn nhiều buổi liên tiếp',
    body: 'Trong hai tuần gần đây gia sư đến muộn 20–30 phút ở ba buổi học, ảnh hưởng thời gian học của con.',
    createdDaysAgo: 5,
  },
  {
    status: 'in_review',
    title: 'Chưa được phản hồi yêu cầu đổi lịch học',
    body: 'Tôi đã đề nghị chuyển lịch học sang tối thứ Năm nhưng chưa nhận được phản hồi từ trung tâm.',
    triage: 'Trung tâm đã liên hệ gia sư để sắp xếp lại lịch, sẽ phản hồi trong 2 ngày làm việc.',
    createdDaysAgo: 9,
  },
  {
    status: 'resolved',
    title: 'Đề nghị đổi gia sư môn Toán',
    body: 'Phương pháp dạy chưa phù hợp với con, mong trung tâm hỗ trợ đổi gia sư khác cho lớp Toán.',
    triage: 'Đã tiếp nhận và trao đổi với người học về nhu cầu cụ thể.',
    resolution:
      'Trung tâm đã giới thiệu gia sư mới có kinh nghiệm dạy Toán THCS; lớp học tiếp tục từ tuần sau.',
    createdDaysAgo: 20,
  },
];

const ARTICLES = [
  {
    slug: 'phu-huynh-10-dieu-can-biet-khi-chon-gia-su',
    category: 'choosing_tutor',
    author: 'Đỗ Hằng',
    title: '10 Điều Cần Biết Khi Chọn Gia Sư',
    summary:
      'Chọn gia sư phù hợp là yếu tố quan trọng quyết định hiệu quả học tập. Cùng tìm hiểu 10 điều cần lưu ý trước khi bắt đầu.',
    days: 12,
  },
  {
    slug: 'phu-huynh-cach-tao-dong-luc-hoc-tap',
    category: 'motivation',
    author: 'Trần Minh',
    title: 'Cách Tạo Động Lực Học Tập',
    summary:
      'Động lực là chìa khóa của thành công. Tìm hiểu cách giúp người học tìm thấy niềm vui trong học tập và phát triển tự giác.',
    days: 17,
  },
  {
    slug: 'phu-huynh-phuong-phap-hoc-tai-nha-hieu-qua',
    category: 'study_methods',
    author: 'Nguyễn Linh',
    title: 'Phương Pháp Học Tại Nhà Hiệu Quả',
    summary:
      'Học tại nhà với gia sư cần phương pháp đúng đắn. Cùng khám phá các mẹo giúp tối ưu hóa hiệu quả học tập.',
    days: 22,
  },
  {
    slug: 'phu-huynh-lo-trinh-on-thi-vao-lop-10',
    category: 'exam_prep',
    author: 'Đỗ Hằng',
    title: 'Lộ Trình Ôn Thi Vào Lớp 10 Trong 3 Tháng',
    summary:
      'Gợi ý chia giai đoạn ôn tập Toán, Ngữ văn, Tiếng Anh và cách luyện đề để bước vào kỳ thi với tâm thế tự tin.',
    days: 28,
  },
  {
    slug: 'phu-huynh-giam-ap-luc-mua-thi',
    category: 'skills',
    author: 'Phạm Thu',
    title: 'Giúp Người Học Giảm Áp Lực Mùa Thi',
    summary:
      'Những dấu hiệu căng thẳng thường gặp và cách sắp xếp nghỉ ngơi, vận động, trò chuyện để giữ tinh thần ổn định.',
    days: 35,
  },
  {
    slug: 'phu-huynh-chon-hoc-online-hay-tai-nha',
    category: 'choosing_tutor',
    author: 'Trần Minh',
    title: 'Học Online Hay Học Tại Nhà: Chọn Thế Nào?',
    summary:
      'So sánh ưu nhược điểm của hai hình thức học, chi phí tham khảo và kiểu người học phù hợp với từng hình thức.',
    days: 41,
  },
];

function articleBody(article) {
  return [
    article.summary,
    'Bài viết này là dữ liệu mẫu minh họa cho trang Cẩm nang dành cho người học. Nội dung tổng hợp kinh nghiệm phổ biến, không thay thế tư vấn trực tiếp từ trung tâm.',
    'Trước hết, hãy xác định rõ mục tiêu: củng cố kiến thức nền, nâng điểm trên lớp hay chuẩn bị cho một kỳ thi cụ thể. Mục tiêu rõ ràng giúp chọn đúng gia sư, đúng lịch học và đo được tiến bộ sau mỗi tháng.',
    'Tiếp theo, trao đổi thẳng thắn với gia sư về thói quen học, điểm mạnh và điểm cần cải thiện. Một buổi học thử là cơ hội tốt để hai bên thống nhất cách dạy, cách giao bài tập và cách báo cáo kết quả.',
    'Cuối cùng, duy trì nhịp học đều đặn và ghi nhận những tiến bộ nhỏ. Khi cần điều chỉnh lịch hoặc phương pháp, hãy liên hệ trung tâm qua hotline hoặc mục Khiếu nại để được hỗ trợ kịp thời.',
  ].join('\n\n');
}

const LEVELS = ['primary', 'lower_secondary', 'upper_secondary', 'university_prep'];
const k = (value) => value * 1000;
const TUTOR_TYPE_PRICES = {
  university_student: [
    [120, 150],
    [150, 180],
    [180, 220],
    [220, 260],
  ],
  pedagogy_student: [
    [150, 180],
    [180, 220],
    [220, 260],
    [260, 300],
  ],
  teacher: [
    [200, 250],
    [250, 300],
    [300, 350],
    [350, 450],
  ],
};
const SUBJECT_PRICES = {
  subj_math: [
    [150, 250],
    [180, 280],
    [200, 320],
    [250, 400],
  ],
  subj_literature: [
    [150, 230],
    [170, 260],
    [200, 300],
    [240, 380],
  ],
  subj_english: [
    [160, 260],
    [180, 300],
    [220, 340],
    [260, 420],
  ],
  subj_physics: [null, [180, 270], [200, 320], [250, 400]],
  subj_chemistry: [null, [180, 270], [200, 320], [250, 400]],
  subj_biology: [null, [170, 250], [190, 300], [240, 380]],
  subj_history: [
    [140, 200],
    [160, 230],
    [180, 260],
    [220, 320],
  ],
  subj_geography: [
    [140, 200],
    [160, 230],
    [180, 260],
    [220, 320],
  ],
  subj_informatics: [[150, 220], [170, 250], [200, 300], null],
};

function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function audit(actor, action, type, target, metadata, at) {
  return `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-8' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  ${sql(actor)}, ${sql(action)}, ${sql(type)}, ${sql(target)}, ${sql(JSON.stringify(metadata))}, ${sql(at)}
WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = ${sql(action)} AND target_type = ${sql(type)} AND target_id = ${sql(target)});`;
}

function statements(target, passwordHash) {
  const { adminId, learnerId } = TARGETS[target];
  const now = new Date().toISOString();
  const out = [
    `INSERT OR IGNORE INTO users (id, email, email_normalized, display_name, role, status, created_at, updated_at)
VALUES (${sql(learnerId)}, ${sql(LEARNER_EMAIL)}, ${sql(LEARNER_EMAIL)}, ${sql(LEARNER_NAME)}, 'student', 'active', ${sql(now)}, ${sql(now)});`,
    `INSERT OR IGNORE INTO auth_credentials (user_id, password_hash, updated_at)
SELECT id, ${sql(passwordHash)}, ${sql(now)} FROM users WHERE id = ${sql(learnerId)} AND role = 'student';`,
    `INSERT OR IGNORE INTO parent_profiles (user_id, phone, created_at, updated_at)
VALUES (${sql(learnerId)}, '0901234567', ${sql(now)}, ${sql(now)});`,
  ];

  COMPLAINTS.forEach((item, index) => {
    const id = demoId(1, index + 1);
    const created = ago(item.createdDaysAgo);
    const sent = item.status !== 'draft';
    const handled = item.status === 'in_review' || item.status === 'resolved';
    out.push(`INSERT OR IGNORE INTO complaints (id, code, creator_user_id, class_id, title, body, status, version,
  triage_reason, resolution, handled_by, resolved_at, submitted_at, mutation_id, created_at, updated_at)
VALUES (${sql(id)}, ${sql(`KN-DEMO${String(index + 1).padStart(8, '0')}`)}, ${sql(learnerId)}, NULL,
  ${sql(item.title)}, ${sql(item.body)}, ${sql(item.status)}, 1, ${sql(item.triage ?? null)},
  ${sql(item.resolution ?? null)}, ${handled ? sql(adminId) : 'NULL'},
  ${item.status === 'resolved' ? sql(ago(item.createdDaysAgo - 3)) : 'NULL'},
  ${sent ? sql(created) : 'NULL'}, ${sql(id)}, ${sql(created)}, ${sql(created)});`);
    out.push(
      audit(
        learnerId,
        sent ? 'complaint.submitted' : 'complaint.draft_created',
        'complaint',
        id,
        {
          to: sent ? 'submitted' : 'draft',
          source: 'learner_demo',
        },
        created,
      ),
    );
  });

  ARTICLES.forEach((article, index) => {
    const id = demoId(2, index + 1);
    const at = ago(article.days);
    out.push(`INSERT OR IGNORE INTO content_revisions (id, kind, slug, audience, revision, edit_version, status,
  title, summary, body_text, category, author_name, created_by, published_by, published_at, created_at, updated_at)
SELECT ${sql(id)}, 'blog', ${sql(article.slug)}, 'public', 1, 1, 'published', ${sql(article.title)},
  ${sql(article.summary)}, ${sql(articleBody(article))}, ${sql(article.category)}, ${sql(article.author)},
  ${sql(adminId)}, ${sql(adminId)}, ${sql(at)}, ${sql(at)}, ${sql(at)}
WHERE NOT EXISTS (SELECT 1 FROM content_revisions WHERE kind = 'blog' AND slug = ${sql(article.slug)} AND audience = 'public');`);
    out.push(
      audit(adminId, 'content.published', 'content_revision', id, { source: 'learner_demo' }, at),
    );
  });

  let n = 0;
  for (const [tutorType, ranges] of Object.entries(TUTOR_TYPE_PRICES)) {
    ranges.forEach((range, level) => {
      n += 1;
      out.push(`INSERT OR IGNORE INTO learner_price_guides (id, dimension, tutor_type, subject_id, education_level,
  min_price_minor, max_price_minor, status, created_at, updated_at)
VALUES (${sql(demoId(3, n))}, 'tutor_type', ${sql(tutorType)}, NULL, ${sql(LEVELS[level])},
  ${k(range[0])}, ${k(range[1])}, 'published', ${sql(now)}, ${sql(now)});`);
    });
  }
  for (const [subjectId, ranges] of Object.entries(SUBJECT_PRICES)) {
    ranges.forEach((range, level) => {
      n += 1;
      if (!range) return;
      out.push(`INSERT OR IGNORE INTO learner_price_guides (id, dimension, tutor_type, subject_id, education_level,
  min_price_minor, max_price_minor, status, created_at, updated_at)
SELECT ${sql(demoId(3, n))}, 'subject', NULL, id, ${sql(LEVELS[level])}, ${k(range[0])}, ${k(range[1])},
  'published', ${sql(now)}, ${sql(now)} FROM subjects WHERE id = ${sql(subjectId)};`);
    });
  }
  return out;
}

function withinWrangler(path) {
  const target = resolve(ROOT, path);
  const part = relative(WRANGLER_ROOT, target);
  if (!part || part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) {
    throw new Error('Custom paths must be inside .wrangler/ in this repository.');
  }
  return target;
}

function parseArgs(args) {
  if (args[0] === '--staging-v2' && args.length === 1) return { target: 'staging_v2' };
  if (
    args[0] === '--local' &&
    (args.length === 1 || (args.length === 3 && args[1] === '--persist-to'))
  ) {
    return { target: 'local', persist: args[2] ? withinWrangler(args[2]) : null };
  }
  throw new Error(
    'Usage: node scripts/seed-learner-demo.mjs --local [--persist-to .wrangler/<dir>] | --staging-v2',
  );
}

function wrangler(args) {
  const logPath = join(WRANGLER_ROOT, 'logs');
  mkdirSync(logPath, { recursive: true });
  return execFileSync(process.execPath, [WRANGLER, ...args], {
    cwd: ROOT,
    env: { ...process.env, WRANGLER_LOG_PATH: logPath, CLOUDFLARE_ENV: '', CI: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function d1Args(options) {
  return options.target === 'local'
    ? ['--local', ...(options.persist ? ['--persist-to', options.persist] : [])]
    : ['--env', 'staging_v2', '--remote'];
}

function query(statement, options) {
  const result = JSON.parse(
    wrangler(['d1', 'execute', 'DB', ...d1Args(options), '--command', statement, '--json']),
  );
  if (!result?.[0]?.success) throw new Error('D1 query failed.');
  return result[0].results;
}

function learnerPassword(file) {
  const existing = existsSync(file)
    ? parseEnv(readFileSync(file, 'utf8')).SAMPLE_LEARNER_PASSWORD
    : '';
  if (existing) return existing;
  const generated = randomBytes(18).toString('base64url');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `SAMPLE_LEARNER_EMAIL="${LEARNER_EMAIL}"\nSAMPLE_LEARNER_PASSWORD="${generated}"\n`,
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );
  return generated;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { adminId, learnerId, folder } = TARGETS[options.target];
  const admin = query(
    `SELECT id FROM users WHERE id = ${sql(adminId)} AND role = 'admin' AND status = 'active'`,
    options,
  );
  if (!admin.length) {
    throw new Error(
      `Sample moderator missing. Run ${options.target === 'local' ? 'npm run seed:sample:local' : 'npm run seed:sample:staging:v2'} first.`,
    );
  }
  const owner = query(
    `SELECT id, role FROM users WHERE email_normalized = ${sql(LEARNER_EMAIL)}`,
    options,
  )[0];
  if (owner && (owner.id !== learnerId || owner.role !== 'student')) {
    throw new Error('Sample learner email belongs to another account. Nothing changed.');
  }
  const credentialsFile = join(WRANGLER_ROOT, folder, 'learner-credentials.vars');
  const password = learnerPassword(credentialsFile);
  const salt = randomBytes(16);
  const digest = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
  const hash = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${digest.toString('base64url')}`;

  const file = join(WRANGLER_ROOT, folder, `learner-demo-${Date.now()}.sql`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${statements(options.target, hash).join('\n')}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  try {
    wrangler(['d1', 'execute', 'DB', ...d1Args(options), '--file', file]);
  } finally {
    if (existsSync(file)) unlinkSync(file);
  }

  const [counts] = query(
    `SELECT
      (SELECT count(*) FROM auth_credentials WHERE user_id = ${sql(learnerId)}) AS credential,
      (SELECT group_concat(status) FROM (SELECT status FROM complaints WHERE creator_user_id = ${sql(learnerId)} ORDER BY status)) AS complaints,
      (SELECT count(*) FROM content_revisions WHERE kind = 'blog' AND status = 'published' AND slug LIKE 'phu-huynh-%' AND category IS NOT NULL) AS articles,
      (SELECT count(*) FROM learner_price_guides WHERE status = 'published' AND dimension = 'tutor_type') AS tutorTypeRows,
      (SELECT count(*) FROM learner_price_guides WHERE status = 'published' AND dimension = 'subject') AS subjectRows`,
    options,
  );
  if (counts.credential !== 1 || counts.articles < ARTICLES.length || counts.tutorTypeRows < 12) {
    throw new Error('Learner demo verification failed.');
  }
  if (query('PRAGMA foreign_key_check', options).length)
    throw new Error('Foreign key check failed.');
  console.log(
    `Learner demo ready (${options.target}): complaints [${counts.complaints}], ${counts.articles} categorised articles, ${counts.tutorTypeRows} tutor-type and ${counts.subjectRows} subject price rows.`,
  );
  console.log(
    `Learner login: ${LEARNER_EMAIL}; password in ${relative(ROOT, credentialsFile)} (ignored by Git).`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

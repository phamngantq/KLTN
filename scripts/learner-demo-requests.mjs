/**
 * Sample "Tìm kiếm gia sư" requests for the demo learner, walked through the same states the
 * Worker uses (submitted → open class → sourcing → selected application → assignment →
 * completion) so every D1 trigger still validates them. Assigned/fulfilled samples need a
 * tutor who passed the responsibility quiz and three published fee options; when the target
 * lacks either, those steps are skipped and only open/draft requests are created.
 * Fit-scored proposals ("Danh sách gia sư được đề xuất") use the sample tutor plus three
 * profile-only tutors without a login; scores are demo snapshots, not live matching.
 * Every statement is guarded, so re-running the seed changes nothing.
 */

import { deflateSync } from 'node:zlib';

const sampleId = (group, index) =>
  `00000000-0000-4000-8000-${String(910_000 + group * 100 + index).padStart(12, '0')}`;

export const SAMPLE_TUTOR = {
  email: 'gia-su-mau@example.test',
  name: 'Gia sư mẫu',
  slug: 'gia-su-mau-demo',
};

/** Profile-only tutors proposed alongside the sample tutor. `ref` is used by REQUESTS. */
const PROPOSAL_TUTORS = [
  {
    ref: 'B',
    id: sampleId(9, 1),
    email: 'gia-su-de-xuat-1@example.test',
    name: 'Trần Thu Trang',
    slug: 'gia-su-de-xuat-tran-thu-trang',
    type: 'teacher',
    school: 'Trường THCS Nghĩa Tân',
    specialization: 'Toán THCS, luyện thi vào lớp 10',
    years: 6,
    summary:
      'Giáo viên Toán THCS sáu năm, chủ nhiệm lớp chọn, nhiều học sinh đạt 9+ thi vào lớp 10.',
    bio: 'Giáo viên Toán đang công tác tại Hà Nội. Dạy chắc kiến thức nền, luyện đề theo cấu trúc Sở và theo dõi tiến bộ qua bài kiểm tra định kỳ.',
    subjects: ['subj_math', 'subj_physics'],
    palette: [
      [120, 30, 60],
      [160, 60, 20],
    ],
  },
  {
    ref: 'C',
    id: sampleId(9, 2),
    email: 'gia-su-de-xuat-2@example.test',
    name: 'Đỗ Quang Minh',
    slug: 'gia-su-de-xuat-do-quang-minh',
    type: 'university_student',
    school: 'Trường Đại học Bách khoa Hà Nội',
    specialization: 'Toán, Vật lý THCS',
    years: 2,
    summary: 'Hai năm dạy kèm Toán, Lý cho học sinh lớp 7–9; thủ khoa đầu vào khoa Toán - Tin.',
    bio: 'Sinh viên năm ba Bách khoa, dạy bằng ví dụ thực tế, giao bài tập vừa sức và nhắn tiến độ sau mỗi buổi.',
    subjects: ['subj_math', 'subj_physics', 'subj_english'],
    palette: [
      [20, 90, 60],
      [40, 120, 40],
    ],
  },
  {
    ref: 'D',
    id: sampleId(9, 3),
    email: 'gia-su-de-xuat-3@example.test',
    name: 'Ngô Hải Yến',
    slug: 'gia-su-de-xuat-ngo-hai-yen',
    type: 'university_student',
    school: 'Trường Đại học Ngoại ngữ - ĐHQGHN',
    specialization: 'Tiếng Anh giao tiếp, Toán tiểu học',
    years: 1,
    summary: 'Một năm kèm Tiếng Anh và Toán cho học sinh tiểu học.',
    bio: 'Sinh viên năm hai Ngoại ngữ, phù hợp học sinh nhỏ tuổi, ưu tiên học qua trò chơi.',
    subjects: ['subj_english', 'subj_math'],
    palette: [
      [90, 40, 110],
      [60, 60, 140],
    ],
  },
];

const TERMS_ID = sampleId(1, 1);
const CONTRACT_CONTENT_ID = sampleId(1, 4);
const QUIZ_ID = sampleId(1, 2);
const ATTEMPT_ID = sampleId(1, 3);
const QUESTIONS = [
  {
    id: 'q1',
    prompt: 'Khi cần nghỉ một buổi dạy, gia sư phải làm gì? (câu hỏi mẫu)',
    choices: [
      { id: 'a', text: 'Báo trước cho người học và trung tâm' },
      { id: 'b', text: 'Tự nghỉ, không cần báo' },
    ],
    correctChoiceId: 'a',
  },
];

const REQUESTS = [
  {
    key: 1,
    state: 'sourcing',
    studentName: 'Phạm Văn Bình',
    subjectId: 'subj_english',
    grade: 'Lớp 8',
    level: 'lower_secondary',
    mode: 'online',
    area: null,
    publicArea: null,
    budget: 180_000,
    sessions: 2,
    windows: [
      [2, '19:30', '21:00'],
      [6, '19:30', '21:00'],
    ],
    tutorRequirements: 'Gia sư phát âm chuẩn, kiên nhẫn.',
    studentTraits: 'Học sinh hơi rụt rè khi nói tiếng Anh.',
    days: 6,
  },
  {
    key: 2,
    state: 'sourcing',
    studentName: 'Trần Đức Anh',
    subjectId: 'subj_physics',
    grade: 'Lớp 11',
    level: 'upper_secondary',
    mode: 'offline',
    area: 'Phường Hoàng Mai, Hà Nội',
    publicArea: 'Hoàng Mai, Hà Nội',
    budget: 220_000,
    sessions: 2,
    windows: [
      [2, '17:30', '19:00'],
      [5, '17:30', '19:00'],
    ],
    tutorRequirements: 'Ưu tiên sinh viên sư phạm Vật lý.',
    studentTraits: 'Mất gốc phần điện học, cần ôn lại từ đầu.',
    days: 4,
  },
  {
    key: 3,
    state: 'assigned',
    studentName: 'Nguyễn Minh Châu',
    subjectId: 'subj_math',
    grade: 'Lớp 9',
    level: 'lower_secondary',
    mode: 'offline',
    area: 'Phường Cầu Giấy, Hà Nội',
    publicArea: 'Cầu Giấy, Hà Nội',
    budget: 200_000,
    tuition: 200_000,
    sessions: 3,
    windows: [
      [1, '19:30', '21:00'],
      [3, '19:30', '21:00'],
      [5, '19:30', '21:00'],
    ],
    tutorRequirements: 'Có kinh nghiệm ôn thi vào lớp 10.',
    studentTraits: 'Học khá, cần luyện đề nâng cao.',
    proposals: [['A', 94]],
    days: 12,
  },
  {
    key: 4,
    state: 'assigned',
    studentName: 'Lê Thu Hà',
    subjectId: 'subj_literature',
    grade: 'Lớp 7',
    level: 'lower_secondary',
    mode: 'online',
    area: null,
    publicArea: null,
    budget: 150_000,
    tuition: 160_000,
    sessions: 2,
    windows: [
      [4, '19:30', '21:00'],
      [7, '09:00', '10:30'],
    ],
    tutorRequirements: 'Gia sư nữ, hướng dẫn viết văn nghị luận.',
    learnerConfirmed: true,
    studentTraits: 'Thích đọc truyện, viết còn lan man.',
    proposals: [['A', 90, 'selected']],
    days: 15,
  },
  {
    key: 5,
    state: 'fulfilled',
    studentName: 'Hoàng Gia Huy',
    subjectId: 'subj_chemistry',
    grade: 'Lớp 12',
    level: 'upper_secondary',
    mode: 'offline',
    area: 'Phường Đống Đa, Hà Nội',
    publicArea: 'Đống Đa, Hà Nội',
    budget: 250_000,
    tuition: 250_000,
    sessions: 2,
    windows: [
      [3, '17:30', '19:00'],
      [6, '15:30', '17:00'],
    ],
    tutorRequirements: 'Kinh nghiệm luyện thi khối A.',
    studentTraits: 'Mục tiêu 8+ môn Hóa thi tốt nghiệp.',
    days: 40,
  },
  {
    key: 7,
    state: 'sourcing',
    studentName: 'Vũ Ngọc Lan',
    subjectId: 'subj_math',
    grade: 'Lớp 9',
    level: 'lower_secondary',
    mode: 'offline',
    area: 'Phường Nghĩa Đô, Hà Nội',
    publicArea: 'Nghĩa Đô, Hà Nội',
    budget: 220_000,
    sessions: 3,
    windows: [
      [1, '19:30', '21:00'],
      [3, '19:30', '21:00'],
      [6, '15:00', '16:30'],
    ],
    tutorRequirements: 'Có kinh nghiệm luyện thi vào lớp 10, kiên nhẫn.',
    studentTraits: 'Học chăm, hình học còn yếu.',
    // 96, 91, 85 are shown best first; 76 is at or below 80 and stays hidden.
    proposals: [
      ['A', 96],
      ['B', 91],
      ['C', 85],
      ['D', 76],
    ],
    days: 3,
  },
  {
    key: 8,
    state: 'sourcing',
    studentName: 'Bùi Khánh Linh',
    subjectId: 'subj_physics',
    grade: 'Lớp 8',
    level: 'lower_secondary',
    mode: 'online',
    area: null,
    publicArea: null,
    budget: 180_000,
    sessions: 2,
    windows: [
      [2, '20:00', '21:30'],
      [4, '20:00', '21:30'],
    ],
    tutorRequirements: 'Giải thích dễ hiểu, có bài tập về nhà.',
    studentTraits: 'Thích thí nghiệm, ngại làm bài tập tính toán.',
    // Already hired from the list: "Đã xác nhận" with the chosen tutor.
    proposals: [
      ['C', 93, 'selected'],
      ['B', 88],
      ['A', 84],
    ],
    days: 9,
  },
  {
    key: 9,
    state: 'sourcing',
    studentName: 'Phạm Văn Bình',
    subjectId: 'subj_chemistry',
    grade: 'Lớp 10',
    level: 'upper_secondary',
    mode: 'offline',
    area: 'Phường Hoàng Mai, Hà Nội',
    publicArea: 'Hoàng Mai, Hà Nội',
    budget: 200_000,
    sessions: 2,
    windows: [[7, '14:00', '15:30']],
    tutorRequirements: 'Gia sư chuyên Hóa, dạy cuối tuần.',
    studentTraits: 'Cần củng cố phần cân bằng phương trình.',
    // Only low scores: "Hiện chưa có gia sư phù hợp…".
    proposals: [['D', 72]],
    days: 2,
  },
  {
    key: 6,
    state: 'draft',
    studentName: 'Phạm Văn Bình',
    subjectId: 'subj_math',
    grade: 'Lớp 5',
    level: 'primary',
    mode: 'offline',
    area: 'Phường Cầu Giấy, Hà Nội',
    publicArea: null,
    budget: 120_000,
    sessions: 2,
    windows: [[7, '09:00', '10:30']],
    tutorRequirements: '',
    studentTraits: 'Ôn thi vào lớp 6.',
    days: 1,
  },
];

/** Sample avatar: a soft gradient disc on white, 256×256 PNG. */
function sampleAvatarPng(
  size = 256,
  palette = [
    [14, 47, 95],
    [30, 60, 80],
  ],
) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = [];
  const mid = size / 2;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - mid, y - mid) / mid;
      const head = Math.hypot(x - mid, y - mid * 0.8) < size * 0.18;
      const body = Math.hypot(x - mid, y - size * 0.98) < size * 0.38;
      const t = y / size;
      const [r, g, b] =
        d > 1
          ? [255, 255, 255]
          : head || body
            ? [250, 214, 120]
            : palette[0].map((base, channel) => Math.round(base + palette[1][channel] * t));
      row.set([r, g, b], 1 + x * 3);
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const hex = (n) => n.toString(16).toUpperCase().padStart(11, '0');

function tutorStatements(sql, tutorId, adminId, passwordHash, now) {
  const subjects = [...new Set(REQUESTS.map((item) => item.subjectId))];
  const termsAt = ago(180);
  const attemptAt = ago(170);
  return [
    `INSERT OR IGNORE INTO users (id, email, email_normalized, display_name, role, status, created_at, updated_at)
VALUES (${sql(tutorId)}, ${sql(SAMPLE_TUTOR.email)}, ${sql(SAMPLE_TUTOR.email)}, ${sql(SAMPLE_TUTOR.name)}, 'tutor', 'active', ${sql(now)}, ${sql(now)});`,
    `INSERT OR IGNORE INTO auth_credentials (user_id, password_hash, updated_at)
SELECT id, ${sql(passwordHash)}, ${sql(now)} FROM users WHERE id = ${sql(tutorId)} AND role = 'tutor';`,
    `INSERT OR IGNORE INTO tutor_profiles (user_id, slug, bio, currency, teaches_online, teaches_offline,
  approval_status, visibility, created_at, updated_at)
VALUES (${sql(tutorId)}, ${sql(SAMPLE_TUTOR.slug)}, 'Hồ sơ gia sư mẫu dùng để minh họa lớp đã gán.', 'VND', 1, 1,
  'approved', 'private', ${sql(now)}, ${sql(now)});`,
    // Learner-facing profile facts and the preferences the fit score compares against.
    `UPDATE tutor_profiles SET tutor_type = 'pedagogy_student', school = 'Trường Đại học Sư phạm Hà Nội',
  specialization = 'Toán, Vật lý, Hóa học THCS - THPT', experience_years = 3,
  experience_summary = 'Ba năm kèm học sinh THCS, THPT; từng ôn thi vào lớp 10 và tốt nghiệp THPT cho nhiều học sinh.',
  bio = 'Sinh viên năm cuối Sư phạm, dạy kèm từ năm 2023. Ưu tiên phương pháp hệ thống kiến thức, giao bài tập theo năng lực và báo cáo tiến bộ hằng tháng cho gia đình.'
WHERE user_id = ${sql(tutorId)} AND school IS NULL;`,
    (() => {
      const png = sampleAvatarPng();
      return `INSERT OR IGNORE INTO profile_photos (user_id, content_type, size_bytes, data, updated_at)
VALUES (${sql(tutorId)}, 'image/png', ${png.length}, X'${png.toString('hex')}', ${sql(now)});`;
    })(),
    // Sample class contract template, only when the target has none published.
    `INSERT INTO content_revisions (id, kind, slug, audience, revision, edit_version, status, title, summary,
  body_text, created_by, published_by, published_at, created_at, updated_at)
SELECT ${sql(CONTRACT_CONTENT_ID)}, 'contract', 'tutor-class-contract', 'tutor',
  1 + COALESCE((SELECT max(revision) FROM content_revisions WHERE kind = 'contract' AND slug = 'tutor-class-contract' AND audience = 'tutor'), 0),
  1, 'published', 'Hợp đồng nhận lớp (mẫu)', 'Bản mẫu cho môi trường thử nghiệm.',
  'Đây là hợp đồng mẫu minh họa luồng nhận lớp. Gia sư dạy đúng lịch đã thống nhất, giữ bí mật thông tin người học và thanh toán phí môi giới theo phương án đã chọn trước khi nhận liên hệ của người học.',
  ${sql(adminId)}, ${sql(adminId)}, ${sql(termsAt)}, ${sql(termsAt)}, ${sql(termsAt)}
WHERE NOT EXISTS (SELECT 1 FROM content_revisions WHERE id = ${sql(CONTRACT_CONTENT_ID)})
  AND NOT EXISTS (SELECT 1 FROM content_revisions WHERE kind = 'contract' AND slug = 'tutor-class-contract' AND audience = 'tutor' AND status = 'published');`,
    ...['Lớp 7', 'Lớp 8', 'Lớp 9', 'Lớp 12'].map(
      (grade) =>
        `INSERT OR IGNORE INTO tutor_preference_grades (tutor_id, grade) VALUES (${sql(tutorId)}, ${sql(grade)});`,
    ),
    ...['Cầu Giấy', 'Đống Đa'].map(
      (area) =>
        `INSERT OR IGNORE INTO tutor_preference_areas (tutor_id, area) VALUES (${sql(tutorId)}, ${sql(area)});`,
    ),
    ...[
      [1, '19:00', '21:30'],
      [3, '17:00', '21:30'],
      [4, '19:00', '21:30'],
      [5, '19:00', '21:30'],
      [6, '15:00', '19:00'],
      [7, '08:00', '11:00'],
    ].map(
      ([weekday, start, end], index) =>
        `INSERT OR IGNORE INTO availability_rules (id, tutor_id, weekday, start_local, end_local, timezone, created_at)
VALUES (${sql(sampleId(7, index + 1))}, ${sql(tutorId)}, ${weekday}, ${sql(start)}, ${sql(end)}, 'Asia/Ho_Chi_Minh', ${sql(now)});`,
    ),
    ...subjects.map(
      (subjectId) =>
        `INSERT OR IGNORE INTO tutor_subjects (tutor_id, subject_id) VALUES (${sql(tutorId)}, ${sql(subjectId)});`,
    ),
    // Sample responsibility terms + quiz only when the target has none published yet.
    `INSERT INTO content_revisions (id, kind, slug, audience, revision, edit_version, status, title, summary,
  body_text, created_by, published_by, published_at, created_at, updated_at)
SELECT ${sql(TERMS_ID)}, 'terms', 'tutor-responsibility', 'tutor',
  1 + COALESCE((SELECT max(revision) FROM content_revisions WHERE kind = 'terms' AND slug = 'tutor-responsibility' AND audience = 'tutor'), 0),
  1, 'published', 'Điều khoản trách nhiệm gia sư (mẫu)', 'Bản mẫu cho môi trường thử nghiệm.',
  'Đây là điều khoản mẫu dùng để minh họa luồng nhận lớp trên môi trường thử nghiệm. Gia sư báo trước khi nghỉ, giữ bí mật thông tin người học và tuân thủ lịch đã thống nhất.',
  ${sql(adminId)}, ${sql(adminId)}, ${sql(termsAt)}, ${sql(termsAt)}, ${sql(termsAt)}
WHERE NOT EXISTS (SELECT 1 FROM content_revisions WHERE id = ${sql(TERMS_ID)})
  AND NOT EXISTS (SELECT 1 FROM content_revisions WHERE kind = 'terms' AND slug = 'tutor-responsibility' AND audience = 'tutor' AND status = 'published');`,
    `INSERT INTO terms_quizzes (id, terms_content_revision_id, status, edit_version, questions_json, minimum_correct,
  mutation_id, created_by, created_at, updated_at)
SELECT ${sql(QUIZ_ID)}, ${sql(TERMS_ID)}, 'draft', 1, ${sql(JSON.stringify(QUESTIONS))}, 1, ${sql(QUIZ_ID)},
  ${sql(adminId)}, ${sql(termsAt)}, ${sql(termsAt)}
WHERE EXISTS (SELECT 1 FROM content_revisions WHERE id = ${sql(TERMS_ID)} AND status = 'published')
  AND NOT EXISTS (SELECT 1 FROM terms_quizzes WHERE id = ${sql(QUIZ_ID)});`,
    `UPDATE terms_quizzes SET status = 'published', published_by = ${sql(adminId)}, published_at = ${sql(termsAt)},
  updated_at = ${sql(termsAt)} WHERE id = ${sql(QUIZ_ID)} AND status = 'draft';`,
    `INSERT INTO terms_quiz_attempts (id, tutor_user_id, quiz_id, answers_json, correct_count, passed, created_at)
SELECT ${sql(ATTEMPT_ID)}, ${sql(tutorId)}, ${sql(QUIZ_ID)}, ${sql(JSON.stringify([{ questionId: 'q1', choiceId: 'a' }]))}, 1, 1, ${sql(attemptAt)}
WHERE EXISTS (SELECT 1 FROM terms_quizzes WHERE id = ${sql(QUIZ_ID)} AND status = 'published')
  AND NOT EXISTS (SELECT 1 FROM terms_quiz_attempts WHERE id = ${sql(ATTEMPT_ID)});`,
    `INSERT INTO terms_acknowledgements (tutor_user_id, quiz_id, attempt_id, terms_content_revision_id, acknowledged_at)
SELECT ${sql(tutorId)}, ${sql(QUIZ_ID)}, ${sql(ATTEMPT_ID)}, ${sql(TERMS_ID)}, ${sql(attemptAt)}
WHERE EXISTS (SELECT 1 FROM terms_quiz_attempts WHERE id = ${sql(ATTEMPT_ID)})
  AND NOT EXISTS (SELECT 1 FROM terms_acknowledgements WHERE attempt_id = ${sql(ATTEMPT_ID)});`,
  ];
}

function proposalTutorStatements(sql, now) {
  return PROPOSAL_TUTORS.flatMap((tutor) => {
    const png = sampleAvatarPng(256, tutor.palette);
    return [
      `INSERT OR IGNORE INTO users (id, email, email_normalized, display_name, role, status, created_at, updated_at)
VALUES (${sql(tutor.id)}, ${sql(tutor.email)}, ${sql(tutor.email)}, ${sql(tutor.name)}, 'tutor', 'active', ${sql(now)}, ${sql(now)});`,
      `INSERT OR IGNORE INTO tutor_profiles (user_id, slug, bio, currency, teaches_online, teaches_offline,
  approval_status, visibility, created_at, updated_at, tutor_type, school, specialization, experience_years, experience_summary)
SELECT id, ${sql(tutor.slug)}, ${sql(tutor.bio)}, 'VND', 1, 1, 'approved', 'private', ${sql(now)}, ${sql(now)},
  ${sql(tutor.type)}, ${sql(tutor.school)}, ${sql(tutor.specialization)}, ${tutor.years}, ${sql(tutor.summary)}
FROM users WHERE id = ${sql(tutor.id)} AND role = 'tutor';`,
      `INSERT OR IGNORE INTO profile_photos (user_id, content_type, size_bytes, data, updated_at)
SELECT id, 'image/png', ${png.length}, X'${png.toString('hex')}', ${sql(now)} FROM users WHERE id = ${sql(tutor.id)} AND role = 'tutor';`,
      ...tutor.subjects.map(
        (subjectId) =>
          `INSERT OR IGNORE INTO tutor_subjects (tutor_id, subject_id)
SELECT ${sql(tutor.id)}, ${sql(subjectId)} WHERE EXISTS (SELECT 1 FROM tutor_profiles WHERE user_id = ${sql(tutor.id)});`,
      ),
    ];
  });
}

/** Proposals for one request; a selected one is recorded through the proposed → selected path. */
function proposalStatements(sql, item, requestId, tutorIds, adminId) {
  if (!item.proposals) return [];
  const out = [];
  const selectedAt = ago(item.days * 1440 - 600);
  item.proposals.forEach(([ref, score], index) => {
    const id = sampleId(10, item.key * 10 + index);
    out.push(`INSERT INTO request_tutor_proposals (id, request_id, tutor_user_id, fit_score, proposed_by, created_at)
SELECT ${sql(id)}, ${sql(requestId)}, ${sql(tutorIds[ref])}, ${score}, ${sql(adminId)}, ${sql(ago(item.days * 1440 - 300))}
WHERE NOT EXISTS (SELECT 1 FROM request_tutor_proposals WHERE id = ${sql(id)}
    OR (request_id = ${sql(requestId)} AND tutor_user_id = ${sql(tutorIds[ref])}))
  AND EXISTS (SELECT 1 FROM parent_requests WHERE id = ${sql(requestId)} AND status IN ('sourcing', 'assigned'))
  AND EXISTS (SELECT 1 FROM tutor_profiles WHERE user_id = ${sql(tutorIds[ref])});`);
  });
  item.proposals.forEach(([, , state], index) => {
    if (state !== 'selected') return;
    const id = sampleId(10, item.key * 10 + index);
    out.push(`UPDATE request_tutor_proposals SET status = 'selected', selected_at = ${sql(selectedAt)}
WHERE id = ${sql(id)} AND status = 'proposed'
  AND NOT EXISTS (SELECT 1 FROM request_tutor_proposals WHERE request_id = ${sql(requestId)} AND status = 'selected');`);
    out.push(`UPDATE request_tutor_proposals SET status = 'declined'
WHERE request_id = ${sql(requestId)} AND status = 'proposed'
  AND EXISTS (SELECT 1 FROM request_tutor_proposals WHERE id = ${sql(id)} AND status = 'selected');`);
  });
  return out;
}

export function learnerRequestStatements({ sql, adminId, learnerId, tutorId, tutorPasswordHash }) {
  const now = new Date().toISOString();
  const out = [
    ...tutorStatements(sql, tutorId, adminId, tutorPasswordHash, now),
    ...proposalTutorStatements(sql, now),
  ];
  const tutorIds = {
    A: tutorId,
    ...Object.fromEntries(PROPOSAL_TUTORS.map((tutor) => [tutor.ref, tutor.id])),
  };
  const tutorReady = `EXISTS (SELECT 1 FROM terms_acknowledgements WHERE tutor_user_id = ${sql(tutorId)})
  AND (SELECT count(DISTINCT option_key) FROM fee_option_versions WHERE status = 'published' AND published_at <= ${sql(now)}) = 3`;

  for (const item of REQUESTS) {
    const requestId = sampleId(2, item.key);
    const classId = sampleId(3, item.key);
    const applicationId = sampleId(4, item.key);
    const assignmentId = sampleId(5, item.key);
    const completion = sampleId(6, item.key);
    const created = ago(item.days * 1440);
    const draft = item.state === 'draft';
    out.push(`INSERT OR IGNORE INTO parent_requests (id, code, parent_user_id, subject_id, grade, mode, area,
  expected_budget_minor, description, status, version, mutation_id, timezone, discuss_later, created_at, updated_at,
  education_level, sessions_per_week, tutor_requirements, student_traits)
VALUES (${sql(requestId)}, ${sql(`YC-D${hex(item.key)}`)}, ${sql(learnerId)}, ${sql(item.subjectId)}, ${sql(item.grade)},
  ${sql(item.mode)}, ${sql(item.area)}, ${item.budget}, '', ${draft ? "'draft'" : "'submitted'"}, ${draft ? 1 : 2},
  ${sql(requestId)}, 'Asia/Ho_Chi_Minh', 0, ${sql(created)}, ${sql(created)}, ${sql(item.level)}, ${item.sessions},
  ${sql(item.tutorRequirements)}, ${sql(item.studentTraits)});`);
    out.push(`INSERT OR IGNORE INTO parent_request_private (request_id, contact_phone, contact_address,
  contact_consent_at, contact_consent_version, student_name)
VALUES (${sql(requestId)}, '0901234567', ${item.mode === 'offline' ? "'Số 12, ngõ 34 (địa chỉ mẫu)'" : 'NULL'},
  ${draft ? 'NULL' : sql(created)}, ${draft ? 'NULL' : "'2026-10-12-v3'"}, ${sql(item.studentName)});`);
    for (const [weekday, start, end] of item.windows) {
      // The overlap trigger runs before OR IGNORE could skip a duplicate, so guard explicitly.
      out.push(`INSERT INTO request_schedule_windows (request_id, weekday, start_local, end_local, timezone)
SELECT ${sql(requestId)}, ${weekday}, ${sql(start)}, ${sql(end)}, 'Asia/Ho_Chi_Minh'
WHERE NOT EXISTS (SELECT 1 FROM request_schedule_windows
  WHERE request_id = ${sql(requestId)} AND weekday = ${weekday} AND start_local = ${sql(start)});`);
    }
    if (draft) continue;

    // Publish: the class trigger checks the request is still the submitted version 2.
    out.push(`INSERT INTO class_listings (id, code, source_request_id, source_request_version, parent_user_id, subject_id,
  grade, mode, public_area, expected_budget_minor, status, version, mutation_id, published_at, created_at, updated_at)
SELECT ${sql(classId)}, ${sql(`LH-D${hex(item.key)}`)}, ${sql(requestId)}, 2, ${sql(learnerId)}, ${sql(item.subjectId)},
  ${sql(item.grade)}, ${sql(item.mode)}, ${sql(item.publicArea)}, ${item.budget}, 'open', 1, ${sql(classId)},
  ${sql(created)}, ${sql(created)}, ${sql(created)}
WHERE NOT EXISTS (SELECT 1 FROM class_listings WHERE id = ${sql(classId)})
  AND EXISTS (SELECT 1 FROM parent_requests WHERE id = ${sql(requestId)} AND status = 'submitted' AND version = 2);`);
    out.push(`UPDATE parent_requests SET status = 'sourcing', version = 3, updated_at = ${sql(created)}
WHERE id = ${sql(requestId)} AND status = 'submitted'
  AND EXISTS (SELECT 1 FROM class_listings WHERE id = ${sql(classId)} AND status = 'open');`);
    const proposals = proposalStatements(sql, item, requestId, tutorIds, adminId);
    if (item.state === 'sourcing') {
      out.push(...proposals);
      continue;
    }

    const appliedAt = ago(120 - item.key);
    const assignedAt = ago(90 - item.key);
    out.push(`INSERT INTO tutor_applications (id, class_id, tutor_user_id, fee_option_version_id, status, version,
  mutation_id, created_at, updated_at, match_snapshot_json)
SELECT ${sql(applicationId)}, ${sql(classId)}, ${sql(tutorId)},
  (SELECT id FROM fee_option_versions WHERE option_key = 'first_lesson_percent' AND status = 'published'
     AND scope_subject_id IS NULL AND scope_mode IS NULL ORDER BY version DESC LIMIT 1),
  'submitted', 1, ${sql(applicationId)}, ${sql(appliedAt)}, ${sql(appliedAt)}, '{}'
WHERE NOT EXISTS (SELECT 1 FROM tutor_applications WHERE id = ${sql(applicationId)})
  AND EXISTS (SELECT 1 FROM class_listings WHERE id = ${sql(classId)} AND status = 'open')
  AND ${tutorReady};`);
    out.push(`UPDATE tutor_applications SET status = 'selected', version = 2, updated_at = ${sql(assignedAt)}
WHERE id = ${sql(applicationId)} AND status = 'submitted';`);
    out.push(`UPDATE class_listings SET status = 'active', version = 2, updated_at = ${sql(assignedAt)}
WHERE id = ${sql(classId)} AND status = 'open'
  AND EXISTS (SELECT 1 FROM tutor_applications WHERE id = ${sql(applicationId)} AND status = 'selected');`);
    out.push(`UPDATE parent_requests SET status = 'assigned', version = 4, updated_at = ${sql(assignedAt)}
WHERE id = ${sql(requestId)} AND status = 'sourcing'
  AND EXISTS (SELECT 1 FROM class_listings WHERE id = ${sql(classId)} AND status = 'active');`);
    out.push(`INSERT INTO class_assignments (id, class_id, application_id, tutor_user_id, assigned_by, status, version,
  mutation_id, assigned_at, agreed_tuition_per_session_minor, tuition_recorded_by, tuition_recorded_at)
SELECT ${sql(assignmentId)}, ${sql(classId)}, ${sql(applicationId)}, ${sql(tutorId)}, ${sql(adminId)}, 'active', 1,
  ${sql(assignmentId)}, ${sql(assignedAt)}, ${item.tuition}, ${sql(adminId)}, ${sql(assignedAt)}
WHERE NOT EXISTS (SELECT 1 FROM class_assignments WHERE id = ${sql(assignmentId)})
  AND EXISTS (SELECT 1 FROM parent_requests WHERE id = ${sql(requestId)} AND status = 'assigned');`);
    if (item.learnerConfirmed) {
      // The learner accepted the proposed tutor ("Đã xác nhận"); D1 checks the confirmer.
      out.push(`UPDATE class_assignments SET learner_confirmed_at = ${sql(ago(60 - item.key))},
  learner_confirmed_by = ${sql(learnerId)}
WHERE id = ${sql(assignmentId)} AND learner_confirmed_at IS NULL
  AND EXISTS (SELECT 1 FROM parent_requests WHERE id = ${sql(requestId)} AND status = 'assigned');`);
      // Then the tutor acknowledges the contract and the centre records the placement fee,
      // which opens the learner's contact to the tutor.
      const contractId = sampleId(8, item.key);
      out.push(`INSERT INTO class_contract_records (id, assignment_id, class_id, tutor_user_id, fee_option_version_id,
  contract_content_revision_id, status, version, issued_by, issued_at, mutation_id, agreed_tuition_per_session_minor)
SELECT ${sql(contractId)}, a.id, a.class_id, a.tutor_user_id, t.fee_option_version_id,
  (SELECT id FROM content_revisions WHERE kind = 'contract' AND slug = 'tutor-class-contract'
     AND audience = 'tutor' AND status = 'published'),
  'issued', 1, ${sql(adminId)}, ${sql(ago(50))}, ${sql(contractId)}, a.agreed_tuition_per_session_minor
FROM class_assignments a JOIN tutor_applications t ON t.id = a.application_id
WHERE a.id = ${sql(assignmentId)} AND a.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM class_contract_records WHERE assignment_id = ${sql(assignmentId)});`);
      out.push(`UPDATE class_contract_records SET status = 'acknowledged', acknowledged_at = ${sql(ago(45))}, version = 2
WHERE id = ${sql(contractId)} AND status = 'issued';`);
      out.push(`UPDATE class_assignments SET placement_fee_paid_at = ${sql(ago(40))},
  placement_fee_amount_minor = ${Math.round(item.tuition / 2)}, placement_fee_recorded_by = ${sql(adminId)}
WHERE id = ${sql(assignmentId)} AND placement_fee_paid_at IS NULL
  AND EXISTS (SELECT 1 FROM class_contract_records WHERE id = ${sql(contractId)} AND status = 'acknowledged');`);
    }
    if (item.state === 'assigned') {
      // Proposals of an assigned request name its assigned tutor, added once assigned.
      out.push(...proposals);
      continue;
    }

    // Completion: class, request and assignment share one mutation ID with the lifecycle event.
    const doneAt = ago(30);
    out.push(`UPDATE class_assignments SET mutation_id = ${sql(completion)}
WHERE id = ${sql(assignmentId)} AND status = 'active'
  AND EXISTS (SELECT 1 FROM class_listings WHERE id = ${sql(classId)} AND status = 'active');`);
    out.push(`UPDATE class_listings SET status = 'completed', version = 3, mutation_id = ${sql(completion)},
  updated_at = ${sql(doneAt)} WHERE id = ${sql(classId)} AND status = 'active'
  AND EXISTS (SELECT 1 FROM class_assignments WHERE id = ${sql(assignmentId)} AND mutation_id = ${sql(completion)});`);
    out.push(`UPDATE parent_requests SET status = 'fulfilled', version = 5, mutation_id = ${sql(completion)},
  updated_at = ${sql(doneAt)} WHERE id = ${sql(requestId)} AND status = 'assigned'
  AND EXISTS (SELECT 1 FROM class_listings WHERE id = ${sql(classId)} AND status = 'completed');`);
    out.push(`INSERT INTO class_lifecycle_events (id, class_id, assignment_id, event_type, actor_id, reason, mutation_id, created_at)
SELECT ${sql(completion)}, ${sql(classId)}, ${sql(assignmentId)}, 'completed', ${sql(adminId)},
  'Hoàn tất khóa học mẫu theo thỏa thuận.', ${sql(completion)}, ${sql(doneAt)}
WHERE NOT EXISTS (SELECT 1 FROM class_lifecycle_events WHERE assignment_id = ${sql(assignmentId)})
  AND EXISTS (SELECT 1 FROM parent_requests WHERE id = ${sql(requestId)} AND status = 'fulfilled');`);
  }
  return out;
}

export const SAMPLE_REQUEST_COUNT = REQUESTS.length;

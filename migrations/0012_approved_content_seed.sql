-- Initial published copy approved by the product owner on 2026-10-11.
-- System-authored seed rows have nullable author IDs; moderators can create later revisions.
-- No terms, contract, fee amount, testimonials, imagery or unverified service guarantees are seeded.

-- Figma AboutPage.tsx:24,40-41; neutral workflow text follows the implemented parent/class flow.
INSERT INTO content_revisions
  (id, kind, slug, audience, revision, edit_version, status, title, summary,
   body_text, created_by, published_by, published_at, created_at, updated_at)
VALUES
  ('0199a01a-0000-4000-8000-000000000001', 'page', 'about', 'public', 1, 2,
   'published', 'Về Chúng Tôi',
   'Kết nối phụ huynh và gia sư cho nhu cầu học tại nhà hoặc trực tuyến.',
   'Phụ huynh gửi yêu cầu tìm gia sư theo môn, lớp, hình thức và lịch học. Gia sư xem lớp đã công bố và ứng tuyển. Kiểm duyệt viên xem xét và điều phối lớp học.',
   NULL, NULL, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z');

-- Figma ContactPage.tsx:31,47,56-91 and PublicLayout.tsx:211-213;
-- the user approved the Hanoi contact set. Working hours conflict across those files and are omitted.
INSERT INTO content_revisions
  (id, kind, slug, audience, revision, edit_version, status, title, summary,
   body_text, created_by, published_by, published_at, created_at, updated_at)
VALUES
  ('0199a01a-0000-4000-8000-000000000002', 'page', 'contact', 'public', 1, 2,
   'published', 'Liên Hệ Với Chúng Tôi', 'Thông tin liên hệ',
   'Địa chỉ: Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội' || char(10) ||
   'Hotline: 0394 618 480' || char(10) ||
   'Zalo: 0394 618 480' || char(10) ||
   'Email: tuyendunggiasugio@gmail.com',
   NULL, NULL, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z');

-- Figma PricingPage.tsx:105,116; parent-free and moderator-published tutor fee options
-- were explicitly approved by the product owner. The Figma 50% sample is not used.
INSERT INTO content_revisions
  (id, kind, slug, audience, revision, edit_version, status, title, summary,
   body_text, created_by, published_by, published_at, created_at, updated_at)
VALUES
  ('0199a01a-0000-4000-8000-000000000003', 'page', 'pricing', 'public', 1, 2,
   'published', 'Bảng Giá Gia Sư',
   'Phụ huynh miễn phí dịch vụ tìm gia sư. Gia sư chọn phương án phí đã được kiểm duyệt viên công bố khi ứng tuyển lớp.',
   'Các phương án phí và mức áp dụng được hiển thị theo phiên bản hiện hành do kiểm duyệt viên công bố.',
   NULL, NULL, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z');

-- Figma ServicesPage.tsx:23-26; description is limited to implemented discovery and request flow.
INSERT INTO content_revisions
  (id, kind, slug, audience, revision, edit_version, status, title, summary,
   body_text, created_by, published_by, published_at, created_at, updated_at)
VALUES
  ('0199a01a-0000-4000-8000-000000000004', 'service', 'tim-gia-su', 'public', 1, 2,
   'published', 'Tìm kiếm gia sư', 'Tìm gia sư theo môn học và cấp học.',
   'Phụ huynh xem hồ sơ gia sư công khai hoặc gửi yêu cầu tìm gia sư. Kiểm duyệt viên xem xét yêu cầu trước khi công bố lớp.',
   NULL, NULL, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z');

-- Figma PricingPage.tsx:241,248-249; only the user-approved parent-free clause is retained.
INSERT INTO content_revisions
  (id, kind, slug, audience, revision, edit_version, status, title, summary,
   body_text, created_by, published_by, published_at, created_at, updated_at)
VALUES
  ('0199a01a-0000-4000-8000-000000000005', 'faq', 'phu-huynh-co-mat-phi', 'public', 1, 2,
   'published', 'Tôi có phải trả phí môi giới không?', '',
   'Phụ huynh không trả phí dịch vụ tìm gia sư.',
   NULL, NULL, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z');

-- Figma ServicesPage.tsx:243; consent and contact visibility follow the owner's DEC-010 decision.
INSERT INTO content_revisions
  (id, kind, slug, audience, revision, edit_version, status, title, summary,
   body_text, created_by, published_by, published_at, created_at, updated_at)
VALUES
  ('0199a01a-0000-4000-8000-000000000006', 'guide', 'gui-yeu-cau', 'parent', 1, 2,
   'published', 'Gửi yêu cầu tìm gia sư', '',
   'Chọn môn học, lớp, hình thức, lịch học và nhập thông tin liên hệ. Xác nhận đồng ý cho gia sư được gán xem thông tin liên hệ trước khi gửi yêu cầu.',
   NULL, NULL, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z');

# PLAN — Tutor Matching Platform trên Cloudflare

> Version: 0.1 — 2026-10-11  
> Trạng thái: **provisional / chờ đối chiếu Figma Make**  
> Design source: https://www.figma.com/make/nhljatxXx9lap98Zx7s4AU/Tutor-Matching-Platform  
> Stack bắt buộc: Cloudflare Workers + Wrangler + Cloudflare D1

## 0. Phạm vi xác minh và giả định

### Đã biết
- Tên dự án theo URL là **Tutor Matching Platform**.
- Mục tiêu là build hệ thống từ bản thiết kế Figma, triển khai trên Cloudflare Workers bằng Wrangler và D1.
- Link Figma Make chưa truy xuất được trong phiên nghiên cứu này: **không thể xác nhận số màn hình, màu sắc, typography, component, nội dung hay nghiệp vụ cụ thể**.

### Giả định để thiết kế kiến trúc (phải review trước khi triển khai UI)
- Có 3 nhóm actor: **Student/Parent**, **Tutor**, **Admin**.
- Luồng MVP được đề xuất: duyệt/tìm gia sư -> xem hồ sơ -> xem lịch trống -> gửi yêu cầu đặt lịch -> gia sư xác nhận/từ chối -> quản lý buổi học.
- Gia sư có khả năng đăng ký lịch trống cố định theo thứ trong tuần, và chỉnh các ngày ngoại lệ.
- Thanh toán online, chat realtime, video call, thuật toán matching tự động phức tạp: **chưa xem là phạm vi MVP** nếu Figma không thể hiện hoặc chưa có yêu cầu rõ ràng.

**Quy tắc:** Không gán nhãn 'theo Figma' cho nội dung chưa được xác minh. Bất kỳ điểm không xác định nào đều đưa vào `FIGMA_GAP_LOG` và ưu tiên quyết định bảo thủ.

## 1. Kiến trúc mục tiêu

**Kiến trúc:** Cloudflare-native modular monolith, 1 repository, 1 Worker phục vụ API và static frontend assets.

```text
Browser (React + Vite + TypeScript + Tailwind + shadcn/ui)
              |
           HTTPS
              |
Cloudflare Worker (Hono, TypeScript)
  |-- /api/v1/auth                authentication/session
  |-- /api/v1/tutors              discovery/profiles
  |-- /api/v1/availability        recurring schedule & exceptions
  |-- /api/v1/bookings            bookings/state machine
  |-- /api/v1/admin               moderation
  |-- scheduled()                 expiration/cleanup (chỉ khi cần)
  |
  +-- D1: relational data, constraints, indexes
  +-- R2: avatar/credentials (optional, không lưu blob lớn trong D1)
  +-- Turnstile: verification của public write forms
```

### Quyết định kỹ thuật

| Domain | Chọn | Lý do / ranh giới |
|---|---|---|
| Frontend | React + Vite + TypeScript | phù hợp app đặt lịch và component tương tác |
| UI | Tailwind CSS + shadcn/ui | có thể token hóa theo Figma, dễ accessibility |
| API | Hono trên Cloudflare Workers | route/middleware gọn, chạy Workers runtime |
| DB | D1 (SQLite) + Drizzle ORM | quan hệ, migration, typed queries |
| Input validation | Zod | kiểm tra ở backend, không tin client |
| Auth | session cookie + server-side session storage; OIDC/email flow chọn tại phase 1 | không giả định password login khi chưa có thiết kế |
| Storage | R2, optional | ảnh hồ sơ/file giấy tờ |
| Security | role guards + ownership checks + Turnstile + rate limiting | ngăn truy cập chéo và abuse |
| Observability | Workers logs + request ID + error tracking | debug và vận hành |
| Deploy | Wrangler v4, dev/staging/prod tách biệt | migration an toàn |

Không thêm microservice, Redis, Queue hay Durable Objects ở MVP nếu chưa có bằng chứng nhu cầu. D1 không tự giải quyết streaming realtime; nếu Figma thực sự có chat realtime, đánh giá lại sau khi audit.

## 2. Screen inventory — danh mục dự kiến, CHƯA xác thực trên Figma

| Route đề xuất | Actor | Chức năng | Ưu tiên | Nguồn |
|---|---|---|---|---|
| `/` | Guest | landing/search entry | P0 | giả định |
| `/tutors` | Guest/Student | danh sách gia sư, lọc/sắp xếp | P0 | giả định |
| `/tutors/:slug` | Guest/Student | hồ sơ chi tiết, lịch trống | P0 | giả định |
| `/sign-in`, `/sign-up` | Guest | đăng nhập/đăng ký | P0 | giả định |
| `/student/bookings` | Student | lịch học, trạng thái yêu cầu | P0 | giả định |
| `/tutor/onboarding` | Tutor | tạo hồ sơ, môn, mức giá | P0 | giả định |
| `/tutor/availability` | Tutor | đăng ký lịch dạy theo tuần | P0 | theo nhu cầu nghiệp vụ đã nêu, chưa xác nhận frame |
| `/tutor/bookings` | Tutor | xác nhận/từ chối/yêu cầu lịch | P0 | giả định |
| `/admin/tutors` | Admin | duyệt, ẩn/khóa hồ sơ | P1 | giả định |
| `/admin/reports` | Admin | quản trị và audit cơ bản | P1 | giả định |
| `/messages`, `/payments`, `/reviews` | Various | chat/payment/review | P2 | tùy thuộc Figma / yêu cầu tiếp theo |

Khi có Figma export/connect, tạo `FIGMA_INVENTORY.md` với: frame ID, route, actor, CTA, component, trạng thái UI, breakpoint, luồng navigation, API dependency, trạng thái đã implement; loại bỏ màn hình giả định không xuất hiện trong scope đã duyệt.

## 3. Nghiệp vụ lõi và quy tắc

### 3.1 User / Tutor
1. User có `id`, `role`, `status`; không cho client tự đặt `role=admin`.
2. Tutor có profile riêng với `visibility`, `approval_status`, `subjects`, `price`, `bio`, `teaching_modes`; chỉ hồ sơ `approved + public` xuất hiện trong search.
3. Student/Parent không tự sửa thông tin Tutor; ownership check theo actor thực tế.
4. Với trẻ vị thành niên, tài khoản phụ huynh/giám hộ phải được thiết kế rõ khi cần; hạn chế thu thập dữ liệu của trẻ.

### 3.2 Weekly tutor availability — mô hình lịch
1. Mỗi rule có `weekday` (1 = Monday .. 7 = Sunday), `start_local_time`, `end_local_time`, `timezone` (mặc định `Asia/Ho_Chi_Minh`), `effective_from`, `effective_to`.
2. UI hiển thị local time, backend chuyển instance ngày giờ cụ thể sang UTC khi tạo slot/booking.
3. Trong MVP, dùng granularity **30 phút**; giờ bắt đầu và độ dài buổi học phải là bội số 30 phút. Đây là quyết định kỹ thuật tạm thời, cần xác nhận theo Figma và nghiệp vụ.
4. Rules trong ngày không được trùng giờ; không tạo window xuyên nửa đêm (nếu cần, tách thành 2 rules).
5. Có `availability_exceptions` cho nghỉ lễ, nghỉ đột xuất hoặc thời gian mở bổ sung.
6. Buổi đã đặt không biến mất khi gia sư sửa recurring availability; trường hợp ảnh hưởng booking hiện hữu phải có flow hủy/dời lịch rõ ràng.
7. Sinh các slot có thể đặt từ rules + exceptions + bookings/claims, chỉ trong horizon do hệ thống cấu hình (ví dụ 30–60 ngày).

### 3.3 Booking và chống trùng lịch

```text
Student chọn tutor + khung giờ
      |
Backend xác minh auth + role + thời gian + availability
      |
DB tạo booking PENDING và ghi các slot claims bằng transaction
      |
Claim lỗi UNIQUE? -> rollback tất cả -> HTTP 409 SLOT_UNAVAILABLE
      |
Tutor CONFIRM / REJECT; Student CANCEL theo chính sách
      |
Release claims khi booking trở thành REJECTED/CANCELLED/EXPIRED
```

- **Không dùng** `SELECT slot empty` rồi `INSERT booking` riêng lẻ không có ràng buộc cạnh tranh; 2 request đồng thời có thể cùng thấy rỗng.
- Đề xuất `booking_slot_claims (tutor_id, slot_start_utc, booking_id)` với **UNIQUE(tutor_id, slot_start_utc)**. Buổi 90 phút tạo ba claim 30 phút; mọi claim và booking được ghi trong **một D1 `batch()` transaction**; xung đột phải rollback toàn bộ.
- Không lưu claim hoạt động của booking đã bị reject/cancel/expire. Việc đổi trạng thái và xóa claim cùng transaction.
- Nếu tồn tại nhiều requests từ một click/network retry, yêu cầu `Idempotency-Key`; cùng user/key/payload trả cùng booking; payload khác cùng key phải trả conflict.
- API không tin giá tiền, tutor ownership, student_id hay trạng thái booking do frontend gửi; backend tính và xác minh.

### 3.4 Booking state machine

```text
PENDING -> CONFIRMED -> COMPLETED
   |            |
   |            +-> CANCELLED (theo chính sách)
   +-> REJECTED
   +-> CANCELLED
   +-> EXPIRED
```

Mọi transition phải được kiểm tra bằng `(actor, current_state, transition)` và `UPDATE ... WHERE status = ?` để xử lý race. Những policy như cut-off hủy, expiry, completion phải chốt nghiệp vụ trước khi triển khai.

## 4. D1 — model dữ liệu đề xuất

**Các bảng tối thiểu** (tên final có thể đổi sau audit):

| Table | Cột chính | Constraint/index quan trọng |
|---|---|---|
| `users` | id, email, display_name, role, status, created_at | UNIQUE(normalized_email) |
| `auth_sessions` | id, user_id, token_hash, expires_at, revoked_at | INDEX(user_id, expires_at) |
| `tutor_profiles` | user_id, slug, bio, hourly_rate_minor, approval_status, visibility | PK(user_id), UNIQUE(slug) |
| `subjects` | id, name, slug | UNIQUE(slug) |
| `tutor_subjects` | tutor_id, subject_id | PK(tutor_id, subject_id) |
| `availability_rules` | id, tutor_id, weekday, local_start, local_end, timezone, effective_from/to | INDEX(tutor_id, weekday) |
| `availability_exceptions` | id, tutor_id, date_local, start/end, kind | INDEX(tutor_id, date_local) |
| `bookings` | id, tutor_id, student_id, starts_at_utc, ends_at_utc, status, requested_rate_minor | INDEX(tutor_id, starts_at_utc), INDEX(student_id, starts_at_utc) |
| `booking_slot_claims` | booking_id, tutor_id, slot_start_utc | UNIQUE(tutor_id, slot_start_utc), FK(booking_id) |
| `idempotency_keys` | actor_id, endpoint, key, request_hash, result_ref, expires_at | UNIQUE(actor_id, endpoint, key) |
| `audit_logs` | id, actor_id, action, target_type/id, metadata, created_at | INDEX(target_type, target_id, created_at) |

**Optional:** `reviews`, `notifications`, `notification_deliveries`, `media_assets`, `student_profiles`, `payments`/`payment_events`. Không tạo các bảng optional chỉ vì muốn chuẩn bị tương lai.

#### Quy tắc lưu trữ
- D1 là SQLite: khóa ngoại bật/đảm bảo khi migration; dùng `CHECK`, `NOT NULL`, `UNIQUE`, `FOREIGN KEY` ở DB, không chỉ validate tại UI.
- Monetary amount lưu số nguyên đơn vị nhỏ nhất theo loại tiền và `currency` (VND không có phần thập phân); không dùng JS floating point cho tiền.
- Date-time instance lưu **UTC ISO 8601** hoặc epoch nhất quán; recurring time lưu local time + timezone.
- Không lưu ảnh/pdf base64 trong D1; dùng R2 object key và quyền truy cập tương ứng.
- Không dùng `SELECT *` trong hot path; thêm index dựa trên `EXPLAIN QUERY PLAN`, phân trang và giới hạn kích thước response.
- Migration forward-only, backup/checkpoint trước production migration, không thay schema trực tiếp qua dashboard rồi bỏ quên SQL file.
- D1 read replication là optional cho public read traffic; khi cần read-after-write consistency dùng Sessions API/bookmarks hoặc first-primary. Không dùng replica-stale reads để quyết định khả dụng của slot.

## 5. API contract draft (`/api/v1`)

| Method + Path | Access | Result |
|---|---|---|
| `GET /health` | public | health (không lộ secrets) |
| `GET /subjects` | public | subject catalog |
| `GET /tutors?subject=&mode=&page=` | public | paginated, approved tutor profiles |
| `GET /tutors/:slug` | public | tutor profile |
| `GET /tutors/:id/slots?from=&to=` | public | computed available slots |
| `GET /me` | authenticated | current actor |
| `GET /tutor/profile` | tutor | own profile |
| `PATCH /tutor/profile` | tutor | update allowed profile fields |
| `GET/PUT /tutor/availability` | tutor | weekly recurrence |
| `POST /tutor/availability/exceptions` | tutor | holiday/override |
| `GET /bookings` | student/tutor | own bookings only |
| `POST /bookings` | student | create pending booking + claims |
| `POST /bookings/:id/confirm` | owning tutor | state transition |
| `POST /bookings/:id/reject` | owning tutor | transition + release |
| `POST /bookings/:id/cancel` | authorized owner | transition + release |
| `GET /admin/tutors` | admin | moderation list |
| `POST /admin/tutors/:id/approve` | admin | approve profile + audit |

Authentication endpoints được chốt theo OIDC/email-link/password strategy được duyệt trong Phase 1. Không tự tạo endpoint login dùng password trước khi có lựa chọn auth và threat model.

**API response:**

```json
{
  "data": { "id": "book_...", "status": "PENDING" },
  "meta": { "requestId": "req_..." }
}
```

**Error response:**

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "Khung giờ này vừa được đặt. Vui lòng chọn giờ khác."
  },
  "meta": { "requestId": "req_..." }
}
```

Dùng status 400/401/403/404/409/422/429/500 nhất quán, không leak internal stack trace.

## 6. Cấu trúc repository

```text
tutor-matching-platform/
├── src/
│   ├── client/
│   │   ├── app/               # router, providers
│   │   ├── pages/             # route screens
│   │   ├── components/
│   │   │   ├── ui/            # design primitives
│   │   │   └── domain/        # TutorCard, WeeklySchedule, BookingStatus
│   │   ├── features/          # tutor-search, onboarding, availability, booking
│   │   ├── styles/            # tokens.css, globals.css
│   │   └── lib/               # typed API client
│   ├── server/
│   │   ├── index.ts           # Hono Worker entrypoint
│   │   ├── middleware/        # session, role, error, rate limit
│   │   ├── modules/
│   │   │   ├── users/
│   │   │   ├── tutors/
│   │   │   ├── availability/
│   │   │   ├── bookings/
│   │   │   └── admin/
│   │   ├── db/                # Drizzle schema + D1 adapter
│   │   └── jobs/              # optional Cron cleanup
│   └── shared/                # types, schemas, constants
├── migrations/                # Wrangler D1 SQL migrations
├── tests/                     # unit, integration, e2e
├── public/
├── DESIGN_RULES.md
├── AGENTS.md
├── PLAN.md
├── wrangler.jsonc
├── vite.config.ts
└── package.json
```

### Nguyên tắc module
- Route = HTTP translation. Service = business rules. Repository = DB access.
- Không gọi D1 trực tiếp từ React; không nhét SQL vào route handler UI.
- `src/shared` chứa schema/DTO dùng chung, tuyệt đối không import server secret vào client bundle.
- Không dùng Node-only APIs trong Worker nếu không có kiểm chứng hỗ trợ runtime.

## 7. Phase / backlog và Definition of Done

### Phase 0 — Audit Figma (gating)
- [ ] Có quyền xem toàn bộ design, frame IDs và assets.
- [ ] Lập inventory **tất cả** screens, navigations, overlays, forms, breakpoints.
- [ ] Chụp/export screenshots cho desktop + mobile, trạng thái normal/loading/error/empty/success.
- [ ] Trích xuất Figma design tokens (typography, colors, radii, spacing, icons) và lập mapping component.
- [ ] Đối chiếu chức năng P0/P1/P2 với bản design, quyết định scope MVP.
- [ ] Chốt lịch đặt: granularity, time zone, booking status, max/min duration, policy hủy.

**DoD:** Không còn screen P0 'chưa hiểu luồng'; `FIGMA_GAP_LOG` ghi rõ những vấn đề mở.

### Phase 1 — Bootstrap & foundations
- [ ] Scaffold React/Vite/TypeScript với Cloudflare Vite plugin và Worker + Hono.
- [ ] Setup Wrangler v4, local/staging/prod bindings riêng.
- [ ] Setup D1 + Drizzle + migration 0001; seed data test.
- [ ] Setup Tailwind/shadcn, CSS tokens, router, typed API client.
- [ ] Setup ESLint, Prettier, typecheck, Vitest, Playwright CI.
- [ ] Chọn và triển khai auth/session, CSRF & RBAC guard, `/api/v1/me`.

**DoD:** một `npm run dev` chạy được client/API/D1 local, một pipeline kiểm tra tự động chạy xanh.

### Phase 2 — Public experience & tutor profiles
- [ ] Implement layout và page P0 từ Figma theo route inventory.
- [ ] Build TutorCard, tutor detail, filtering/search, pagination.
- [ ] Tutor onboarding/profile edit, subject catalog, avatar nếu cần.
- [ ] Admin approval nếu Figma có duyệt profile trước public.
- [ ] Responsive + accessibility + URL state.

**DoD:** chỉ tutor approved xuất hiện public, filter kết quả và UI states có test.

### Phase 3 — Weekly availability & booking (critical path)
- [ ] WeeklySchedule UI theo screenshot Figma.
- [ ] Recurrence rules; exceptions; timezone/UTC conversion.
- [ ] Slot projection API; validate quy tắc input ở server.
- [ ] Booking state machine & slot claims transactional.
- [ ] Idempotency cho create booking và critical mutation.
- [ ] Student/Tutor dashboards với status, cancel/reject/confirm.
- [ ] Concurrent race tests (2 requests cùng slot, chỉ 1 thành công).

**DoD:** không double-book, không cross-user data leak, slot/bookings nhất quán.

### Phase 4 — Admin, hardening & release
- [ ] Moderation/logs/notifications theo scope.
- [ ] Turnstile cho public forms có nguy cơ bot và server-side verification.
- [ ] Rate limiting, request size caps, security headers, sensitive logging policy.
- [ ] Test accessibility WCAG 2.2 AA, responsive, keyboard/mobile.
- [ ] Load test search/booking, `EXPLAIN QUERY PLAN` và indexes.
- [ ] Production DB tách biệt, migration review + backup/rollback playbook.
- [ ] Domain, observability, runbook, smoke tests và deploy.

**DoD:** pass E2E critical flows; checklist release đã ký duyệt.

### Phase 5 — Không thuộc MVP nếu chưa duyệt
- [ ] Payment gateway, payment webhook/idempotency/refunds.
- [ ] Realtime chat/notifications.
- [ ] Reviews/ratings; report/abuse moderation.
- [ ] Smart matching/ranking nâng cao.
- [ ] Calendar integration, email/SMS, video classroom.

## 8. Test cases tối thiểu

| Case | Expected |
|---|---|
| 2 student đặt đồng thời tutor X cùng khung 18:00–19:00 | 1 success, 1 HTTP 409; không có overlap claims |
| Booking 18:00–19:30 và 19:00–20:00 | reject overlap |
| Student A đọc booking của B | 403 hoặc 404, không rò PII |
| Tutor A xác nhận booking của Tutor B | forbidden |
| Tutor edit weekly rule chạm confirmed booking | booking vẫn tồn tại; yêu cầu explicit reschedule/cancel |
| Student double-click nút Book | không tạo duplicate nếu cùng idempotency key |
| Hủy booking rồi đặt lại slot | slot được giải phóng sau transition thành công |
| Local timezone -> UTC -> display | giờ hiển thị không bị lệch |
| Public profile unapproved | không có trong search và không public chi tiết |
| D1 migration local/staging/prod | không ghi nhầm DB |
| Browser keyboard-only + 320 px viewport | flow hoàn tất được |
| Turnstile token missing/expired/replayed | server reject |

## 9. Local development / release steps

> Các lệnh dưới đây là định hướng chạy dự án sau scaffold, không phải lệnh đã thực thi trên Cloudflare account của người dùng.

```bash
# 1) Khởi tạo ứng dụng React/Cloudflare từ template tương thích
npm create cloudflare@latest

# 2) Cài các module backend/db (chọn phiên bản phù hợp)
npm i hono drizzle-orm zod
npm i -D wrangler@4 drizzle-kit

# 3) Đăng nhập và tạo D1 trên Cloudflare
npx wrangler login
npx wrangler d1 create tutor-matching-dev

# 4) Điền database_id vào wrangler.jsonc; tạo migration
npx wrangler d1 migrations create tutor-matching-dev init

# 5) Apply tại local D1 (an toàn cho dev)
npx wrangler d1 migrations apply tutor-matching-dev --local

# 6) Run và kiểm tra theo script của template
npm run dev
npm run typecheck
npm test

# 7) Chỉ sau khi review migrations và đúng environment
npx wrangler d1 migrations apply tutor-matching-dev --remote
npx wrangler deploy
```

**Lưu ý:** Ở project dùng Cloudflare Vite plugin, `npm run dev` thường chạy Vite/workerd, `wrangler` đảm nhiệm D1, secrets, deployment. Tách database `-dev`, `-staging`, `-prod`, không dùng chung `database_id`.

Config ví dụ (phải thay UUID thật):

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "tutor-matching-dev",
  "compatibility_date": "2026-10-11",
  "assets": { "not_found_handling": "single-page-application" },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "tutor-matching-dev",
    "database_id": "REPLACE_WITH_REAL_D1_DATABASE_UUID",
    "migrations_dir": "migrations"
  }],
  "observability": { "enabled": true }
}
```

Nếu cần avatar/file:
```bash
npx wrangler r2 bucket create tutor-matching-media-dev
```
Chỉ thêm `r2_buckets` vào Wrangler sau khi đã tạo bucket; không giả sử R2 đã được bật.

## 10. Open questions — những gì cần quyết định từ Figma và product

1. Có đúng các nhóm Tutor, Student/Parent, Admin không? Login bằng email/magic-link, SSO hay password?
2. Figma có các màn hình nào (frame IDs), navigation nào, component states nào?
3. Booking là yêu cầu chờ gia sư duyệt hay xác nhận tức thì? Có thu phí hay chỉ matching?
4. Lịch dạy có giới hạn số buổi/tuần; timezone đa khu vực; buổi 45/60/90/120 phút không?
5. Có hệ thống gia sư offline/online, nhiều chi nhánh, khu vực phục vụ, ngôn ngữ, giá theo môn không?
6. Chính sách hủy/dời buổi, xác minh gia sư, lưu PII và quản lý học viên nhỏ tuổi thế nào?
7. UI có mobile Figma frames và design tokens hay chỉ desktop render?

## 11. Tài liệu kỹ thuật được đối chiếu

- Cloudflare React/Vite Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- Cloudflare Vite plugin: https://developers.cloudflare.com/workers/local-development/vite-plugin/
- D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- D1 batch transactions: https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 read replication / Sessions: https://developers.cloudflare.com/d1/best-practices/read-replication/
- Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Turnstile server validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Workers Cron: https://developers.cloudflare.com/workers/configuration/cron-triggers/

---

**Release principle:** Design fidelity -> correctness of booking -> security/authorization -> observability -> deployment. Không đánh đổi tính đúng đắn của lịch dạy để làm UI nhanh hơn.

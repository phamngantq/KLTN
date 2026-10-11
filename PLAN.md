# PLAN — Tutor Matching Platform trên Cloudflare

> Version: 0.2 — 2026-10-11
> Trạng thái: **đã ánh xạ code export `./figma` / chờ đối chiếu frame Figma Make**
> Design source cho toàn bộ project: [Tutor Matching Platform trên Figma Make](https://www.figma.com/make/nhljatxXx9lap98Zx7s4AU/Tutor-Matching-Platform?p=f&t=F5iHIZDcvYVKK1to-0&fullscreen=1)
> Stack bắt buộc: Cloudflare Workers + Wrangler + Cloudflare D1

> **Cập nhật mục tiêu 2026-10-11:** Bản code người dùng đặt tại `./figma` **thay thế hoàn toàn** mục tiêu sản phẩm đặt lịch trực tiếp của TASK-01–18. Các mục 0–12 dưới đây là kế hoạch/lịch sử của MVP cũ; dùng mục 13, `FIGMA_INVENTORY.md`, `FIGMA_GAP_LOG.md` và queue mới trong `TASKS.md` cho công việc tiếp theo. Không coi mã export là backend hoặc bằng chứng đã kiểm thử Figma frame.

## 0. Phạm vi xác minh và giả định

### Đã biết
- Tên dự án theo URL là **Tutor Matching Platform**.
- Người dùng xác nhận Figma Make ở trên là nguồn thiết kế cho toàn bộ project.
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

**Release principle của MVP cũ:** Design fidelity -> correctness of booking -> security/authorization -> observability -> deployment. Với mục tiêu `./figma`, áp dụng domain/quality gates ở mục 13 và TASK-19–30.


## 12. Deterministic execution queue — AI Coding Agent

`TASKS.md` là **nguồn duy nhất cho thứ tự và trạng thái `[ ]`/`[x]`**. TASK-01–18 ghi lịch sử MVP cũ; queue từ TASK-19 dành cho mục tiêu `./figma`. Các checklist phase trong mục 7 chỉ là roadmap lịch sử, **không dùng** để agent tự suy ra task tiếp theo.

- User gửi **“Tiếp tục thực hiện”** -> coding agent đọc `AGENTS.md` và làm đúng task `[ ]` đầu tiên của `TASKS.md`.
- 01 prompt = tối đa 01 task = 01 commit local hoàn chỉnh. Commit bao gồm code/tests + tick task + `TASK_LOG.md`.
- Không push GitHub, không deploy Cloudflare, không remote D1 migration khi chỉ được yêu cầu “Tiếp tục thực hiện”.
- Nếu task trước đã có code nhưng chưa được đánh dấu, validate lại DoD trước khi tick; ở TASK-19 dùng export `./figma` để kiểm chứng source và ghi rõ phần frame Figma Make chưa kiểm chứng, không bịa design.
- Xem `CONTINUE_PROMPT.md` cho hướng dẫn khởi động lần đầu.

## 13. Mục tiêu thay thế từ bản code `./figma`

### 13.1. Nguồn và giới hạn bằng chứng

- `./figma/src/app/routes.tsx` và các trang trong `./figma/src/app/pages/` là nguồn tham chiếu **màn hình, điều hướng, nội dung mẫu và trạng thái UI**. `FIGMA_INVENTORY.md` ánh xạ các route này sang app hiện tại. Code export không chứa frame ID/Auto Layout/ảnh chụp Figma gốc, nên pixel fidelity vẫn cần kiểm tra riêng.
- `./figma/src/styles/` và JSX cho biết màu, typography, breakpoint và component đã dùng trong export; `docs/FIGMA_COMPONENT_MAP.md` ghi phần có bằng chứng và phần còn cần xác nhận. Không tự xem theme mặc định là brand token.
- Export dùng mock data, mutation bằng React state/alert/toast và xác thực `localStorage` với role do client chọn. Chỉ lấy UI/luồng làm tham chiếu; API, dữ liệu, phân quyền, trạng thái và giao dịch phải do Worker/D1 quản lý. Không port demo login, dữ liệu cá nhân mẫu hay thông báo thành công giả vào app chính.
- Giữ React/Vite + Hono Worker + D1/Drizzle + Wrangler và các yêu cầu bảo mật đã có. D1 migrations mới là additive/forward-only, kiểm tra dữ liệu staging trước khi thay route hoặc schema cũ; không tự migrate remote hay deploy production.

### 13.2. Target product và ánh xạ hiện trạng

| Miền | Bằng chứng trong export | Hiện trạng app chính | Hướng triển khai |
|---|---|---|---|
| Public | Trang chủ, giới thiệu, dịch vụ, bảng giá, danh sách lớp, blog, liên hệ | Trang chủ + tìm hồ sơ gia sư | Dựng shell/route theo export, dữ liệu xuất bản do backend cung cấp; không hiển thị số liệu/ảnh/địa chỉ mẫu như dữ liệu thật. |
| Tài khoản | Export có `parent`, `tutor`, `admin`; sản phẩm dùng **parent/tutor/moderator** | D1 có `student/tutor/admin` với session cookie | DEC-009: server map `student → parent`, `admin → moderator`; giữ user IDs, session, FK và lịch sử. Moderator không self-register; không dùng mock `localStorage`. |
| Phụ huynh | Yêu cầu tìm gia sư, lịch tuần, hồ sơ, khiếu nại | Student đặt lịch trực tiếp theo slot | Tạo domain yêu cầu gia sư; chỉ thu dữ liệu parent/student tối thiểu và kiểm tra ownership phía server. |
| Gia sư | Danh sách lớp, đăng ký nhận lớp, lớp được gán, điều khoản/test, hợp đồng, hồ sơ | Hồ sơ, lịch rảnh và booking | Tutor chọn phiên bản option phí do moderator công bố khi ứng tuyển; moderator “đề xuất/gán” trong một transaction làm lớp active và mở điện thoại/địa chỉ parent/student cho đúng tutor được chọn. Hoãn upload giấy tờ và điều khoản chưa chốt. |
| Moderator | Trang `admin` của export: user, yêu cầu, lớp, gán gia sư, nội dung, dịch vụ, giá/phí, khiếu nại, báo cáo | Duyệt hồ sơ gia sư qua DB role `admin` | Moderator kiểm soát/công bố các phiên bản phương án phí; API có audit, transition và kiểm tra dữ liệu; báo cáo từ dữ liệu thật. |
| Phí/chi trả | UI có phí nhận lớp và thông báo thanh toán thành công | Không có thanh toán | Tutor chỉ **chọn option phí** khi ứng tuyển; staging giữ ứng tuyển unavailable đến khi option có số liệu/điều khoản được duyệt và published. Lựa chọn không phải giao dịch/`paid`; không báo thành công giả. |

### 13.3. Domain và quy tắc tích hợp

1. `parent_request` lưu người tạo từ session, môn/lớp/khu vực/hình thức, lịch mong muốn, mức chi dự kiến và thông tin parent/student **tối thiểu cần cho yêu cầu**; chỉ owner/moderator đọc private data trước gán. Hoãn toàn bộ upload CCCD/bằng cấp/đính kèm; retention/consent chi tiết vẫn cần policy. Lịch tuần trong export là khung tham khảo, không tự sinh booking/claim cũ.
2. `class_listing` do moderator xuất bản từ yêu cầu hợp lệ hoặc tạo có audit; chỉ thông tin công khai được đưa vào danh sách lớp. `tutor_application` gắn tutor từ session và `fee_option_version_id` được server xác minh đã publish, còn hiệu lực và được phép cho lớp đó. Moderator “đề xuất” và “gán” là cùng action `assign_tutor`: cập nhật request, application, assignment và class **active ngay** trong một transaction; không có bước tutor accept. Đúng tutor được chọn thấy điện thoại/địa chỉ parent/student ngay sau commit, từng lần đọc đều kiểm tra quyền.
3. Hồ sơ gia sư, môn, thông tin xác thực và các quyền duyệt hiện có có thể tái dùng sau khi đối chiếu trường dữ liệu. Role D1 `student/tutor/admin` giữ nguyên và được map thành product `parent/tutor/moderator` (DEC-009), không đổi user ID hay booking/student FK. Bản mới chặn tạo booking cũ trên server nhưng vẫn cho participant xem và xử lý booking `PENDING/CONFIRMED` theo action legacy hợp lệ; không tự chuyển booking sang class hay xóa lịch sử.
4. Moderator kiểm soát và publish phiên bản phương án phí bất biến; tutor chọn một phiên bản trong lúc ứng tuyển, backend xác minh và lưu version. Giá trị/công thức phí G3 chưa được duyệt nên staging **không mở ứng tuyển** cho đến khi có option thật. Nội dung/version điều khoản G4, khiếu nại và doanh thu cần policy + schema riêng trước mutation tương ứng. Mọi giá/fee/status/role từ client chỉ là input yêu cầu; server quyết định giá và transition. Chọn option không xác nhận đã thanh toán. Payment success, email sent, match score, rating và báo cáo doanh thu chỉ hiển thị khi có bằng chứng backend thật.
5. Các route export có alias, placeholder và lỗi cấu hình; route chính thức được chọn trong từng task. Không copy cả `routes.tsx` hoặc `package.json` của export vào app chính. Cần loading/empty/error/403/404, mobile/keyboard và test E2E cho mỗi luồng.

### 13.4. Cổng quyết định trước khi phát hành

- G2 đã chốt “đề xuất/gán” là một action `assign_tutor` làm lớp active và mở contact tại cùng commit; còn cần policy hủy, thu hồi/gán lại, hoàn thành. G7 đã chốt giữ booking `PENDING/CONFIRMED` xem/action được và chặn tạo mới khi cutover; còn cần URL lịch sử và kế hoạch production.
- DEC-009 đã chốt người công bố/chọn phương án phí; G3 vẫn cần giá trị/công thức, thu/hoàn tiền và chứng từ trước khi publish option hoặc mở ứng tuyển staging. G4 cần nội dung/version điều khoản và chứng cứ đồng ý. Không thêm gateway hay tự ghi `paid` khi chưa có quyết định này.
- G5 đã chốt dữ liệu parent/student tối thiểu, không upload giấy tờ, và lộ điện thoại/địa chỉ chỉ cho tutor được moderator gán ngay sau commit; còn cần consent, retention, quan hệ nhiều học sinh và quyền sau thu hồi.
- Chốt ảnh và nội dung CMS; thay mock data/public stock content bằng dữ liệu được duyệt.
- Đối chiếu visual với bản Figma mở được hoặc ảnh export và chạy quality gates/QA trên staging mới trước khi thay thế bản staging hiện tại.

### 13.5. Contract triển khai đề xuất

[PRODUCT_DOMAIN.md](docs/PRODUCT_DOMAIN.md) là bản thiết kế **đề xuất** cho entity, API, quyền đọc/ghi, chuyển trạng thái, chống tranh chấp và migration D1 của sản phẩm thay thế. DEC-009 đã chốt actor parent/tutor/moderator, ánh xạ role giữ ID/lịch sử, option phí có version, gán lớp active ngay, mở liên hệ cho đúng tutor và giữ action booking cũ. Các tên trạng thái trong export khác nhau giữa trang phụ huynh và admin; tài liệu không coi chúng là trạng thái backend đã được duyệt. Phần còn mở của G2/G5/G7, G4 và giá trị/công thức G3 tiếp tục chặn mutation/release tương ứng. TASK-19–30 vẫn ở trạng thái theo `TASKS.md`; việc viết contract không đánh dấu hoàn thành task.

# TASKS — Execution Queue / Tutor Matching Platform

> Version: 2.0 — 2026-10-11
> **ĐÂY LÀ SOURCE OF TRUTH CHO THỨ TỰ TASK VÀ TRẠNG THÁI.** `PLAN.md` mô tả kiến trúc/roadmap cấp cao; `DESIGN_RULES.md` mô tả UI; `AGENTS.md` mô tả cách agent thực thi.  
> Kích hoạt bằng đúng câu **“Tiếp tục thực hiện”** trong coding agent chạy tại thư mục gốc repository.  
> Mặc định **01 lần gọi = tối đa 01 task = 01 commit local, không push, không deploy**.

> **DEC-007:** `./figma` là code export của mục tiêu sản phẩm thay thế toàn bộ MVP đặt lịch trực tiếp trước đây. TASK-01–18 bên dưới ghi lịch sử đã hoàn thành cho MVP cũ; TASK-19 trở đi xây dựng hệ thống theo export. Không coi checkbox cũ là bằng chứng sản phẩm mới đã triển khai.

## A. Chính sách cố định (đã quyết định để agent không phải hỏi lại)

1. **Stack:** TypeScript strict, React + Vite + Cloudflare Vite plugin, Tailwind CSS và accessible UI primitives (tham chiếu shadcn/Radix từ export khi phù hợp), Hono on Workers, Drizzle + D1, Zod, Wrangler. Giữ npm/package-lock của app chính; không thay bằng `figma/package.json` hoặc chuyển package manager chỉ vì export.
2. **Runtime:** Single Worker phục vụ API `/api/v1/*` và React SPA static assets. Có thể tổ chức modules nội bộ; không tách microservices.
3. **Role:** App MVP lưu `student`, `tutor`, `admin`; actor sản phẩm mới là `parent`, `tutor`, `moderator` theo DEC-009. TASK-22 triển khai ánh xạ server `student → parent`, `admin → moderator` mà vẫn giữ ID/FK/lịch sử. Trong mọi giai đoạn, self-registration chỉ tạo role người dùng hợp lệ do server quyết định; moderator được cấp qua thao tác server-side đã kiểm soát.
4. **Auth strategy cho phiên bản đầu:** email + password; credentials lưu password **hash chậm kèm salt riêng, có phiên bản thuật toán/chi phí, tương thích Workers và đã được kiểm thử**, không lưu plaintext/reversible secret. Ưu tiên Argon2id nếu chạy được an toàn trong Workers; nếu dùng phương án fallback bảo mật phù hợp phải ghi ADR giải thích. Session token random, lưu **hash** ở D1, cookie HttpOnly/Secure/SameSite và bảo vệ CSRF. Email verification/reset có thể cần email delivery integration; không được giả vờ email đã gửi.
5. **Legacy booking TASK-01–18:** 30 phút/claim; lịch lặp theo `Asia/Ho_Chi_Minh`, booking instant lưu UTC, PENDING chiếm slot. Đây là nghiệp vụ MVP cũ cần bảo toàn dữ liệu/migration, không dùng để định nghĩa lịch lớp trong mục tiêu `./figma`.
6. **Legacy booking status TASK-01–18:** PENDING → CONFIRMED → COMPLETED; PENDING → REJECTED/CANCELLED/EXPIRED; CONFIRMED → CANCELLED. Không tự chuyển booking cũ thành yêu cầu/lớp mới. Luồng mới cần state machine riêng theo PLAN §13 và FIG-013/014.
7. **Figma:** `./figma` cung cấp bằng chứng code về route/UI/luồng cho toàn project; Make live/frame ID vẫn chưa xác minh. `FIGMA_INVENTORY.md`/`FIGMA_GAP_LOG.md` ghi phần đã quan sát và phần còn mở. Không gán nhãn pixel-perfect, không tự tạo frame ID. TASK-05 và DEC-001 ghi lịch sử trước khi có export.
8. **Git:** chỉ local commit trên branch hiện tại nếu không phải `main`/`master`; trên protected/default branch, tạo branch `feat/tutor-platform-task-queue` từ HEAD sau khi kiểm tra sạch/sự thay đổi sẵn có. Không tự tạo GitHub repo, đổi remote, push, PR, merge hay deploy. Cần xác minh `git remote -v` và identity; `gh auth status` thất bại không được chặn local commit nếu Git identity đã có.
9. **Database:** test/local `wrangler d1 migrations apply <db> --local` hoặc script chuẩn của repo. Không dùng `--remote`, không động đến D1 production, không tạo resource trong tài khoản người dùng nếu chưa có yêu cầu riêng.
10. **External services:** export có UI ảnh, email, phí nhận lớp, rating và matching; chưa có bằng chứng các dịch vụ vận hành. R2/email/payment gateway/chat/calendar/reviews/AI matching chỉ tích hợp khi task/policy tương ứng được duyệt. UI không được báo đã trả tiền, gửi email hay ghép lớp nếu backend chưa xác nhận.
11. **Quy tắc precedence:** bảo mật + integrity > nội dung Figma đã xác minh > `PLAN.md`/`DESIGN_RULES.md` > `TASKS.md` > library default. Khi các quy tắc khác nhau, ghi vào `TASK_DECISIONS.md`, chọn cách chặn thay vì âm thầm đổi nghiệp vụ.

## B. State machine của task

- `[ ]` = PENDING (chưa hoàn thành); `[x]` = DONE (đã verify, có commit); không sửa dấu checkbox chỉ vì source code có tên giống task.
- Trong **mỗi lần** nhận “Tiếp tục thực hiện”, agent chọn **task đầu tiên `[ ]` theo thứ tự ID trong file này**.
- Agent kiểm tra dependencies và code thực tế, làm đúng task đó, thêm test, chạy quality gates. Khi pass thì tick `[x]` và ghi một dòng vào `TASK_LOG.md` trong **cùng commit** với code.
- Nếu chưa có thư mục `src` hoặc file tham khảo thì khởi tạo **chỉ trong scope task hiện tại**. Không áp dụng nhiệm vụ phía sau.
- Nếu code feature đã tồn tại từ trước: kiểm tra acceptance criteria, bổ sung test/sửa thiếu; nếu hoàn toàn đạt và chưa được tick, chỉ cập nhật checklist + verification log rồi commit `docs(tasks): verify TASK-XX` (không tạo empty commit).
- Nếu lỗi kiểm thử **không giải quyết được trong phạm vi task**, đánh dấu `BLOCKED` trong báo cáo chat, **không tick**, **không commit**, không nhảy task; giữ các thay đổi để lần “Tiếp tục thực hiện” sau tiếp tục cùng task và mô tả dirty files.
- Task cần bằng chứng Figma trực tiếp mà export không chứa (frame ID, screenshot gốc) = `BLOCKED_EXTERNAL` cho tiêu chí đó; không thay bằng thiết kế tưởng tượng. Các task chỉ cần code export có thể dùng `./figma` với nguồn và giới hạn ghi rõ.
- `TASK_LOG.md` mỗi dòng ghi: `TaskID | YYYY-MM-DD | tests thực chạy | commit message | status`; **không ghi commit hash vào cùng commit** (self-referential). Báo hash từ `git rev-parse --short HEAD` sau commit.

## C. Quality gates mặc định

- Bắt buộc khi script tồn tại: `npm run lint`, `npm run typecheck`, `npm run test -- --run` (hoặc lệnh tương đương), `npm run build`; không tuyên bố pass nếu không chạy.
- TASK-01 phải cung cấp các npm scripts nhất quán; các task sau không được bỏ qua typecheck/test/build vì chưa có scripts.
- Với database/schema: migration chạy được ở **D1 local**, test FK/UNIQUE/CHECK; ghi kết quả thực.
- Với route/API: tests 401/403/404/409 phù hợp; input Zod, auth/ownership và request/response contract.
- Với UI: kiểm thử responsive, keyboard/focus và loading/empty/error; pixel-match chỉ khi Figma đã xác minh.
- Check `git diff --check`, staged diff và secret scan trước commit; stage **đích danh** các file task (không chạy `git add .` nếu có thay đổi ngoài scope).
- Nếu project chưa có E2E framework ở task sớm, unit/integration tests tương ứng đủ để pass; E2E tổng thể ở TASK-17.

## D. TASK QUEUE — KHÔNG TỰ ĐỔI THỨ TỰ

### [x] TASK-01 — Scaffold Cloudflare full-stack workspace
**Dependency:** Không.  
**Scope:** Khởi tạo project chạy local được, không tạo resource remote.  
**Deliverables:** `package.json`, lockfile, `vite.config.ts`, `wrangler.jsonc`, `tsconfig*.json`, `index.html`, `src/client/main.tsx`, `src/server/index.ts`, `src/shared/`, `.gitignore`, `README.md`, `src/client/App.tsx` đơn giản, Hono `/api/v1/health`.  
**Implementation:** React + TS strict + Vite Cloudflare plugin; static SPA served by Worker; lint, format, typecheck, test scripts; `wrangler types` nếu phù hợp. Không hardcode Cloudflare DB IDs.  
**Acceptance tests:** `/api/v1/health` trả `{data:{status:"ok"}}` và 200; UI bootstrap render; local start, typecheck, lint, tests, production build đều pass; `.dev.vars` và credentials bị ignore.  
**Commit:** `chore(setup): initialize cloudflare fullstack app`.

### [x] TASK-02 — D1 schema, migrations, local DB setup
**Dependency:** TASK-01.  
**Scope:** Model quan hệ cốt lõi theo `PLAN.md` mà chưa có tính năng API.  
**Deliverables:** `src/server/db/schema.ts`, `src/server/db/client.ts`, `migrations/0001_initial.sql`, D1 binding `DB`, `src/server/db/seed.dev.ts` (test/dev only), local migration commands trong README, test schema/constraints.  
**Entities:** `users`, `auth_credentials`, `auth_sessions`, `tutor_profiles`, `subjects`, `tutor_subjects`, `availability_rules`, `availability_exceptions`, `bookings`, `booking_slot_claims`, `idempotency_keys`, `audit_logs`. Bảng chỉ thêm field cần thiết, constraints/index rõ ràng.  
**Acceptance tests:** Migrate từ D1 local rỗng, migrate rerun idempotent, foreign keys và UNIQUE quan trọng hoạt động; seed test không chạy production; không tạo DB remote; `drizzle` schema khớp SQL.  
**Commit:** `feat(database): establish d1 schema and migrations`.

### [x] TASK-03 — Authentication, sessions, RBAC and CSRF foundation
**Dependency:** TASK-02.  
**Scope:** Authentication MVP độc lập email/password, session và role guards.  
**Deliverables:** auth service/routes/middleware/schema, endpoints `POST /api/v1/auth/register`, `/login`, `/logout`, `GET /api/v1/me`, unit/integration tests và `docs/ADR_AUTH.md`.  
**Implementation:** Register student/tutor only; normalized unique email; password hash+salt/version; session random token, hash persisted, secure cookie, signout revocation, CSRF for unsafe methods, uniform error responses; no self-promoted admin. Do not promise verification email yet.  
**Acceptance tests:** register/login/me/logout, unauthorized 401, forbidden 403, duplicate email 409, wrong password, expired/revoked session, CSRF invalid, role escalation rejected; secrets never logged.  
**Commit:** `feat(auth): add worker sessions and role guards`.

### [x] TASK-04 — Weekly tutor availability (backend first)
**Dependency:** TASK-03.  
**Scope:** Lịch lặp hằng tuần chưa phụ thuộc Figma UI.  
**Deliverables:** `src/server/modules/availability/*`, Zod DTO, `GET/PUT /api/v1/tutor/availability`, tests rule ownership/overlap/timezones.  
**Implementation:** weekday 1-7, local HH:mm, timezone, effective date range; validate 30-minute multiples, no crossing midnight, nonoverlap windows, tutor ownership; write replacement atomic; do not mutate confirmed bookings.  
**Acceptance tests:** 60m valid window, overlaps rejected 422, invalid time/weekday/timezone rejected, student access 403, tutor A cannot mutate tutor B, local integration tests pass.  
**Commit:** `feat(schedule): add weekly tutor availability api`.

### [x] TASK-05 — Figma discovery, screen inventory and design tokens
**Dependency:** TASK-04.  
**Scope:** Read actual Figma Make design or explicitly exported equivalent, *không dùng suy đoán*.  
**Deliverables:** `FIGMA_INVENTORY.md` (frame IDs/name, role, route, variants, links, CTA), `FIGMA_GAP_LOG.md`, `src/client/styles/tokens.css`, `docs/FIGMA_COMPONENT_MAP.md`, audit assets source.  
**Implementation:** Verify source access; record real tokens and screenshot references; map routes and breakpoints; list missing/unknown details. If inaccessible, **BLOCKED_EXTERNAL**, do not mark done, do not create faux tokens as 'from Figma'.  
**Acceptance tests:** Có screen inventory đầy đủ cho MVP với reference có thể kiểm tra, token mapping có nguồn, không ghi claim pixel-perfect nếu không có image; tokens CSS build/lint pass.  
**Commit:** `docs(design): audit figma screens and extract tokens`.

### [x] TASK-06 — Routing, shared UI primitives and typed API client
**Dependency:** TASK-05.  
**Scope:** Frontend foundation đúng inventory, không làm các feature domain.  
**Deliverables:** `src/client/app/router.tsx`, layouts, UI primitives (button/input/select/dialog/state), `src/client/lib/api-client.ts`, route/error boundaries, tests.  
**Implementation:** Protected routes theo role, 401 redirect/login, 403 forbidden; accessible keyboard focus, mobile breakpoints; client types không chứa env secrets.  
**Acceptance tests:** routes theo verified Figma; layout stable ở 320/768/1280 px; known API errors render; aria labels/focus test; no inert nav/CTA.  
**Commit:** `feat(ui): build app shell and typed api client`.

### [x] TASK-07 — Tutor profile CRUD and subject catalog
**Dependency:** TASK-06.  
**Scope:** Tutor onboarding/profile, API và UI theo Figma; không public profile chưa approved.  
**Deliverables:** `GET /api/v1/subjects`, `GET/PATCH /api/v1/tutor/profile`, profile form, Zod validators, subject relation queries, tests.  
**Implementation:** Fields: display name, bio, subject IDs, hourly rate integer VND, teaching modes; visibility=private until approved; reject arbitrary extra fields; tutor ownership.  
**Acceptance tests:** tutor edit own only; student cannot; invalid rate/subject rejected; subject catalog paginated if needed; unapproved hidden; UI save/error states; DB indexes.  
**Commit:** `feat(tutors): implement profile and subject management`.

### [x] TASK-08 — Public tutor search, filters and detail page
**Dependency:** TASK-07.  
**Scope:** Public browse with querystring state, no ranking algorithm beyond explicit sort.  
**Deliverables:** `GET /api/v1/tutors`, `GET /api/v1/tutors/:slug`, TutorCard/TutorList/TutorDetail components, filter/pagination tests.  
**Implementation:** Filter subject/mode/price; safe parameterized queries; approved+public only; pagination fixed default 12, max 48; deep-link filter URL.  
**Acceptance tests:** unapproved/private tutor never leaks details; filters deterministic; bad query 422; empty/loading/error; reload retains URL filters; useful D1 indexes.  
**Commit:** `feat(discovery): add tutor listing search and details`.

### [x] TASK-09 — Availability exceptions and weekly schedule UI
**Dependency:** TASK-08.  
**Scope:** Tutor overrides + weekly editor UI, không sửa booking.  
**Deliverables:** `GET/POST/PATCH/DELETE /api/v1/tutor/availability/exceptions`, weekly schedule editor/toggle UI, validation/tests.  
**Implementation:** Local dates, `closed` or `extra` windows; no overlapping exceptions unless deterministic precedence explicitly handled; preserve existing confirmed bookings; prompt warning for affected periods.  
**Acceptance tests:** add closure on holiday; one-off extra window; invalid date/window rejected; ownership; form edits round-trip persisted; responsive/keyboard.  
**Commit:** `feat(schedule): add exceptions and weekly schedule editor`.

### [x] TASK-10 — Available slot projection API + public picker
**Dependency:** TASK-09.  
**Scope:** Read-only slot generation.  
**Deliverables:** `GET /api/v1/tutors/:id/slots?from=...&to=...&duration=...`, slot service, client picker with timezone text, tests.  
**Implementation:** recurring rules + exceptions − active claims; 30m grid, permitted duration 30/60/90/120; max horizon 30 days; UTC instances; no mutation; avoid past and timezone mistakes.  
**Acceptance tests:** regular slot visible, closure removes, extra adds, booked claims hide, 90m requires 3 free consecutive claims, invalid date/range 422, no unapproved profile leak.  
**Commit:** `feat(schedule): expose available slots and picker`.

### [x] TASK-11 — Atomic booking create and double-book protection
**Dependency:** TASK-10.  
**Scope:** `POST /api/v1/bookings` plus DB claims; do not add idempotency policy until TASK-12.  
**Deliverables:** booking API/service/repository, D1 `batch` transaction, Zod, tests covering races.  
**Implementation:** Server derives student identity and tutor rate; validates active availability, time, amount, role; inserts PENDING + all 30m claims in one atomic batch; UNIQUE(tutor_id,slot_start_utc) prevents conflict; respond 409 SLOT_UNAVAILABLE; guard full-duration overlap.  
**Acceptance tests:** two concurrent students booking same start: exactly one success and other 409; zero orphan bookings on partial failure; 60 vs 90m overlap rejected; no client-supplied price/role override; no booking in past.  
**Commit:** `feat(booking): create bookings with atomic slot claims`.

### [x] TASK-12 — Booking idempotency and retry safety
**Dependency:** TASK-11.  
**Scope:** `Idempotency-Key` for booking-create only.  
**Deliverables:** idempotency middleware/service using existing table, tests for repeated/concurrent requests.  
**Implementation:** Scope by actor + endpoint + key; hash canonical validated payload; same key/payload returns same booking result; different payload 409; persistence and result consistent atomically; avoid indefinite stuck 'processing' keys.  
**Acceptance tests:** rapid double-click returns one booking; 2 concurrent identical requests create one; replay different payload 409; retries after response-loss safe; different user may reuse key.  
**Commit:** `feat(booking): make booking creation idempotent`.

### [x] TASK-13 — Booking state machine, cancellation and claim release
**Dependency:** TASK-12.  
**Scope:** Confirm/reject/cancel/complete transitions and ownership enforcement.  
**Deliverables:** `GET /api/v1/bookings`, `POST /api/v1/bookings/:id/{confirm,reject,cancel,complete}`, audit logs, tests.  
**Implementation:** server-enforced `(actor,current_state,action)` checks; atomic state change + slot release for rejected/cancelled/expired; no client-set status; stale update returns 409; completion must never release claims ahead of session.  
**Acceptance tests:** tutor A cannot confirm tutor B; student A cannot read B; invalid transitions 409; cancelling frees slot exactly once; parallel cancel/confirm preserves integrity; audit actor exists.  
**Commit:** `feat(booking): enforce booking lifecycle transitions`.

### [x] TASK-14 — Student and tutor booking dashboards
**Dependency:** TASK-13.  
**Scope:** Role-specific booking list/details/actions, from verified Figma.  
**Deliverables:** StudentBookings/TutorBookings pages, BookingCard/StatusBadge/BookingActions, query/load/error handling, UI tests.  
**Implementation:** list current user only; pagination and states; responsive; confirm/reject/cancel buttons call actual API; disable while submitting; optimistic updates only with rollback.  
**Acceptance tests:** student sees own only, tutor sees own, statuses update after server response, actions obey permissions, no cross-account data leaks, mobile tests.  
**Commit:** `feat(dashboard): add tutor and student booking views`.

### [x] TASK-15 — Admin tutor approval and audit UI
**Dependency:** TASK-14.  
**Scope:** Admin approval queue and server authorization.  
**Deliverables:** `GET /api/v1/admin/tutors`, `POST /api/v1/admin/tutors/:id/{approve,reject,hide}`, admin UI, audit tests.  
**Implementation:** Admin identity must be provisioned via documented controlled operator step, not client or seed production; hide unapproved from public; only admin actions; record reason.  
**Acceptance tests:** non-admin always 403; approved profile appears public only after approval; rejected/hidden disappears; audit record with actor and target; pagination.  
**Commit:** `feat(admin): implement tutor moderation queue`.

### [x] TASK-16 — Security, privacy and operational hardening
**Dependency:** TASK-15.  
**Scope:** Audit and fix concrete risks; no feature creep.  
**Deliverables:** `docs/SECURITY_CHECKLIST.md`, hardening patches, tests, security headers/CSRF/rate limit setup; Turnstile only where design/flow requires it.  
**Implementation:** ownership matrix across all endpoints, input length/request caps, error redaction, safe logging, injection tests, cookie/CORS/CSRF; documented password/verification limitations; avoid introducing new paid services.  
**Acceptance tests:** no high-severity open issue; negative auth/role tests pass; secrets absent from tracked files; browser unsafe requests have CSRF protection; anti-bot server verification if enabled.  
**Commit:** `fix(security): harden auth api and data access`.

### [x] TASK-17 — Full E2E flow and GitHub Actions CI
**Dependency:** TASK-16.  
**Scope:** Reliable E2E against local Worker/D1 and CI on PR.  
**Deliverables:** Playwright config/tests, `.github/workflows/ci.yml`, README testing, test fixtures.  
**Implementation:** register/login, tutor onboarding/moderation, availability, student booking, tutor confirmation, cancellation, search and filtering; CI no production credentials and no auto deploy.  
**Acceptance tests:** E2E tests run locally; CI checks lint/typecheck/tests/build; isolated D1 fixtures; no production credentials in CI; mobile viewport smoke.  
**Commit:** `test(e2e): verify core tutor matching journeys`.

### [x] TASK-18 — Release readiness and deployment runbook (NO DEPLOY)
**Dependency:** TASK-17.  
**Scope:** Prepare dev/staging/prod release artifacts, NOT production operations.  
**Deliverables:** `docs/DEPLOYMENT.md`, `docs/ROLLBACK.md`, `docs/OPERATIONS.md`, `docs/RELEASE_CHECKLIST.md`, safe `wrangler` config review, build smoke tests.  
**Implementation:** Separate D1 IDs/bindings/secrets per env; document `wrangler login` vs CI secrets; production migration backup/runbook, observability, app health and D1 migration checklist; no remote resource creation/`wrangler deploy`/`--remote`.  
**Acceptance tests:** `npm run build` and local smoke pass; docs contain explicit manual review gates and rollback; no secret or account-specific identifiers in Git; no production changes.  
**Commit:** `docs(release): prepare cloudflare deployment runbook`.

## E. TASK-01–18 là lịch sử MVP đặt lịch

Các checkbox `[x]` ở TASK-01–18 xác nhận phạm vi MVP cũ đã hoàn thành. Người dùng đã cung cấp `./figma` và xác nhận nó **thay thế hoàn toàn** mục tiêu sản phẩm đó (DEC-007); không dùng trạng thái cũ để tuyên bố hệ thống mới đã hoàn thành. Queue mới dưới đây được thêm theo yêu cầu ánh xạ export để xây dựng hệ thống. Mỗi lần “Tiếp tục thực hiện” vẫn chỉ chọn **một** task `[ ]` đầu tiên; không tự chạy hết queue. Khi không còn `[ ]`, báo `ALL_TASKS_COMPLETE`, không tạo commit rỗng.

## F. TASK QUEUE — chuyển đổi sang mục tiêu `./figma`

Nguồn cho các task: `PLAN.md` §13, `DESIGN_RULES.md`, `FIGMA_INVENTORY.md`, `FIGMA_GAP_LOG.md`, `docs/FIGMA_COMPONENT_MAP.md` và code export trong `./figma`. Code export chỉ là tham chiếu UI/luồng; các mutation phải dùng API, D1, auth/RBAC/ownership thật. Mỗi task mới có test/quality gates phù hợp; migration chỉ chạy local trừ khi user yêu cầu remote riêng. Không copy mock PII, role do client chọn hoặc thông báo trả phí/gửi email thành công giả.

### [x] TASK-19 — Baseline and verify the Figma code export
**Dependency:** TASK-18.

**Scope:** Khóa nguồn tham chiếu `./figma`, rà route/page/action/component/asset và kiểm tra khả năng render của code export trước khi port.

**Deliverables:** `FIGMA_INVENTORY.md`, `FIGMA_GAP_LOG.md`, `docs/FIGMA_COMPONENT_MAP.md`, nguồn/provenance có thể tái kiểm; nếu đưa export vào Git phải rà secret, PII mẫu, license và kích thước trước khi stage.

**Implementation:** Xác minh 59 route cụ thể, wildcard, alias, placeholder, page không mounted, style thực dùng, mock/localStorage, lỗi router/đăng ký. Không sửa hoặc chạy code export như backend production.

**Acceptance tests:** Source map đầy đủ public/parent/tutor/admin và trạng thái `CODE_EXPORTED` khác frame VERIFIED; render/screenshot local ở các viewport khi môi trường cho phép hoặc ghi blocker thật; `git diff --check`, Markdown links/provenance kiểm được; không stage source nhạy cảm.

**Commit:** `docs(figma): baseline exported product screens`.

### [x] TASK-20 — Define the replacement domain and migration contract
**Dependency:** TASK-19.

**Scope:** Chốt actor, dữ liệu và state machine cho yêu cầu phụ huynh → lớp → ứng tuyển/gán → nhận lớp; lập cách ngừng hiển thị booking cũ mà vẫn giữ dữ liệu lịch sử.

**Deliverables:** `PLAN.md` §13, `TASK_DECISIONS.md`, API/ownership/transition matrix, kế hoạch D1 forward migration và URL compatibility.

**Implementation:** Định nghĩa `parent` tương ứng user `student` cũ thế nào, quyền xem thông tin học sinh/liên hệ, lịch tuần/timezone, trạng thái hủy/rút/duyệt và idempotency/concurrency. Các công thức phí mâu thuẫn trong export phải được ghi gap/chờ quyết định, không chọn ngầm.

**Acceptance tests:** Matrix có actor/action/from→to/ownership/PII, migration không xóa dữ liệu cũ, không self-register admin; những chính sách chưa đủ bằng chứng phải được user quyết định trước khi triển khai mutation liên quan.

**Commit:** `docs(domain): define figma product migration contract`.

### [x] TASK-21 — Build target navigation and design foundation
**Dependency:** TASK-20.

**Scope:** Tích hợp brand values có bằng chứng, shared public/parent/tutor/admin shells, route table và guards vào React app hiện tại.

**Deliverables:** tokens/components/layouts, route mapping/aliases, trang home/404 và test navigation/responsive/keyboard.

**Implementation:** Dùng `./figma` làm tham chiếu hiển thị; bỏ object route rỗng, redirect sai và placeholder giả; CTA trỏ route thật hoặc thể hiện trạng thái chưa sẵn sàng. Không import auth mock/package export nguyên khối.

**Acceptance tests:** Route/role matrix hoạt động ở 320/768/1280 px, không dead CTA hoặc horizontal overflow; WCAG labels/focus, CSP, lint/typecheck/test/build PASS.

**Commit:** `feat(ui): establish figma product shells and routes`.

### [x] TASK-22 — Migrate parent accounts and profile data
**Dependency:** TASK-21.

**Scope:** Mô hình role `parent`, profile phụ huynh và các trường gia sư/sở thích cần cho nhận lớp.

**Deliverables:** D1 migration local, Zod DTO, API/session/RBAC, UI đăng nhập/đăng ký/profile, tests.

**Implementation:** Giữ session cookie hash/CSRF, lấy role/id từ server; bảo toàn user `student` cũ theo contract TASK-20. Hồ sơ xác minh CCCD/bằng cấp chỉ có upload sau khi storage/retention được chốt.

**Acceptance tests:** Parent/tutor/admin không leo quyền; admin không tự đăng ký; owner-only read/write, input quota, migration local và lint/typecheck/test/build PASS.

**Commit:** `feat(accounts): add parent roles and profiles`.

### [x] TASK-23 — Implement parent find-tutor requests
**Dependency:** TASK-22.

**Scope:** Form, danh sách, lọc, chi tiết và trạng thái yêu cầu tìm gia sư của phụ huynh.

**Deliverables:** D1 tables/migration, API create/list/detail/update theo matrix TASK-20, UI `/parent` và `/parent/request`, tests.

**Implementation:** Server đặt owner/status/code, validate môn/lớp/khu vực/lịch mong muốn/giá dự kiến, timezone và PII; lưu thật, audit transitions, không đồng nhất với booking slot cũ.

**Acceptance tests:** Owner-only, 401/403/404/409/422, idempotency và quota, lỗi form không báo thành công; D1 local migration + lint/typecheck/test/build PASS.

**Commit:** `feat(requests): add parent tutor requests`.

### [ ] TASK-24 — Publish class listings and accept tutor applications
**Dependency:** TASK-23.

**Scope:** Lớp công khai/lớp mới, filter/detail, tutor đăng ký/thu hồi ứng tuyển, sở thích lớp phù hợp.

**Deliverables:** Class/application schema, admin create/publish API tối thiểu, public `/lop-hoc`, tutor `/tutor/new-classes` và `/tutor/matched-classes`, tests.

**Implementation:** Class chỉ xuất bản từ dữ liệu admin hợp lệ; che liên hệ/PII học sinh trước khi đủ quyền. Một tutor không có hai ứng tuyển còn hiệu lực cùng lớp; filter/sort deterministic, pagination. Không hiện matchScore/rating mẫu như dữ liệu thật.

**Acceptance tests:** Approved tutor/application RBAC, duplicate/race → 409 không orphan, public DTO không PII, loading/empty/error và lint/typecheck/test/build/D1 local PASS.

**Commit:** `feat(classes): publish classes and tutor applications`.

### [ ] TASK-25 — Build admin matching and class assignment
**Dependency:** TASK-24.

**Scope:** Admin xem yêu cầu, tạo/xuất bản lớp, duyệt ứng tuyển, gán/rút gán gia sư và quản lý trạng thái lớp.

**Deliverables:** Admin APIs/UI cho users/requests/classes/accept-class, audit và tests; reuse tutor moderation cũ khi đúng domain.

**Implementation:** Server enforce from→to, một assignment active mỗi lớp, optimistic concurrency/atomic D1 batch, lý do từ chối/hủy, thông tin liên hệ chỉ lộ sau transition được duyệt. Không tuyên bố đã gửi notification khi chưa có dịch vụ.

**Acceptance tests:** Ma trận auth/ownership, concurrent assignment, stale action 409, audit actor/reason, không lộ PII, local D1 migration + lint/typecheck/test/build PASS.

**Commit:** `feat(admin): manage class assignment workflow`.

### [ ] TASK-26 — Complete tutor class lifecycle and terms
**Dependency:** TASK-25.

**Scope:** Dashboard/lịch sử/đã nhận lớp, bài kiểm tra điều khoản, chấp nhận/từ chối lớp và hợp đồng theo version.

**Deliverables:** Tutor class APIs/UI, server-side terms result/acknowledgement, contract records, lifecycle tests.

**Implementation:** Không tin `termsTestPassed`/`pendingClassAccept` trong localStorage; trạng thái, quyền đọc thông tin phụ huynh và version điều khoản được lưu/audit phía server. Phần thu phí chỉ mở khi có policy TASK-20/FIG-016 được phê duyệt.

**Acceptance tests:** Role/ownership/terms gating, idempotent action, stale 409, không báo thanh toán/email thành công giả; lint/typecheck/test/build PASS.

**Commit:** `feat(tutors): manage accepted classes and terms`.

### [ ] TASK-27 — Add approved content, services and fee presentation
**Dependency:** TASK-26.

**Scope:** Public/parent/tutor pages giới thiệu, dịch vụ, blog, liên hệ, FAQ/hướng dẫn và admin content/pricing management.

**Deliverables:** Content/service/fee schema và API, draft/publish UI, ảnh dùng hợp lệ, public pages theo export, tests.

**Implementation:** Chỉ công bố copy/địa chỉ/hotline/bảng giá đã duyệt; phí do server tính từ policy, giá đã công bố có version/effective date. CTA trả tiền chỉ hoạt động với chính sách/đối tác/xác nhận giao dịch được duyệt; nếu chưa có, phải được product owner chấp thuận ẩn/hoãn CTA và hiển thị tình trạng trung thực. Không tự thêm gateway.

**Acceptance tests:** Không có CRUD chỉ đổi `useState`/toast; admin-only mutation, public chỉ thấy published, input/upload validation, không có giá hoặc bank info mẫu trong production; lint/typecheck/test/build PASS.

**Commit:** `feat(content): publish service and pricing content`.

### [ ] TASK-28 — Implement complaints and sensitive-data controls
**Dependency:** TASK-27.

**Scope:** Khiếu nại parent/tutor/admin, xóa tài khoản và contact riêng theo DEC-010, file đính kèm nếu storage/policy được duyệt, hồ sơ xác minh gia sư nếu cần.

**Deliverables:** Complaint state machine/API/UI, audit, account deletion và PII purge giữ lịch sử không PII, access/retention controls, tests.

**Implementation:** Thống nhất status giữa page user/admin; xóa contact riêng, PII hồ sơ và vô hiệu hóa session khi xóa tài khoản, xử lý FK để giữ lịch sử nghiệp vụ không PII. Che PII và tài liệu học sinh/CCCD theo role, kiểm file size/type, không public raw upload. Không tạo storage remote khi chưa được phép.

**Acceptance tests:** Owner/admin access, transition 409, account deletion xóa contact/PII/session nhưng giữ lịch sử không PII, file authorization nếu có, retention/empty/error states và lint/typecheck/test/build PASS.

**Commit:** `feat(support): add complaint workflow and privacy controls`.

### [ ] TASK-29 — Back dashboards and reports with real data
**Dependency:** TASK-28.

**Scope:** Parent/tutor/admin dashboard và báo cáo conversion, lớp thiếu gia sư, doanh thu theo dữ liệu được phép.

**Deliverables:** Report definitions/API, UI/PDF export, date/timezone/role tests.

**Implementation:** Chỉ đếm event/fee có nguồn D1 thật; nếu chưa có nguồn thu hợp lệ thì revenue hiển thị empty/unavailable, không số mẫu. Không xuất PII trái quyền.

**Acceptance tests:** KPI formula có nguồn, pagination/timezone, auth, PDF số liệu kiểm được, zero-data states và lint/typecheck/test/build PASS.

**Commit:** `feat(reports): add verified product dashboards`.

### [ ] TASK-30 — Verify complete Figma-target journeys and release readiness
**Dependency:** TASK-29.

**Scope:** E2E parent→admin→tutor→class, security/privacy, responsive/a11y/visual QA và cập nhật runbook cho sản phẩm mới.

**Deliverables:** Playwright journey, local D1 migration/smoke, release checklist/rollback/operations docs; khác biệt visual/frame ghi gap.

**Implementation:** Test mọi CTA P0 với dữ liệu thật; kiểm route alias/placeholder, race, CSRF/RBAC/ownership, no mock PII/payment success, ảnh và bundles. Staging/prod deploy là hành động riêng cần user cho phép trong lượt tương ứng.

**Acceptance tests:** secret-scan/format/lint/typecheck/unit/integration/build/E2E/local migration PASS; mobile/keyboard và dữ liệu ba vai trò đồng nhất; không claim pixel fidelity khi chưa xem frame Figma gốc.

**Commit:** `test(e2e): verify figma product journeys`.

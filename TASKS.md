# TASKS — Execution Queue / Tutor Matching Platform

> Version: 1.0 — 2026-10-11  
> **ĐÂY LÀ SOURCE OF TRUTH CHO THỨ TỰ TASK VÀ TRẠNG THÁI.** `PLAN.md` mô tả kiến trúc/roadmap cấp cao; `DESIGN_RULES.md` mô tả UI; `AGENTS.md` mô tả cách agent thực thi.  
> Kích hoạt bằng đúng câu **“Tiếp tục thực hiện”** trong coding agent chạy tại thư mục gốc repository.  
> Mặc định **01 lần gọi = tối đa 01 task = 01 commit local, không push, không deploy**.

## A. Chính sách cố định (đã quyết định để agent không phải hỏi lại)

1. **Stack:** TypeScript strict, React + Vite + Cloudflare Vite plugin, Tailwind/shadcn/ui, Hono on Workers, Drizzle + D1, Zod, Wrangler. Sử dụng npm trừ khi repo hiện có lockfile của package manager khác; giữ nguyên package manager đã được chọn.
2. **Runtime:** Single Worker phục vụ API `/api/v1/*` và React SPA static assets. Có thể tổ chức modules nội bộ; không tách microservices.
3. **Role:** `student`, `tutor`, `admin`. Self-registration chỉ tạo `student` hoặc `tutor`; admin được cấp qua thao tác server-side đã kiểm soát.
4. **Auth strategy cho phiên bản đầu:** email + password; credentials lưu password **hash chậm kèm salt riêng, có phiên bản thuật toán/chi phí, tương thích Workers và đã được kiểm thử**, không lưu plaintext/reversible secret. Ưu tiên Argon2id nếu chạy được an toàn trong Workers; nếu dùng phương án fallback bảo mật phù hợp phải ghi ADR giải thích. Session token random, lưu **hash** ở D1, cookie HttpOnly/Secure/SameSite và bảo vệ CSRF. Email verification/reset có thể cần email delivery integration; không được giả vờ email đã gửi.
5. **MVP booking:** 30 phút/claim; lịch lặp theo `Asia/Ho_Chi_Minh` nhưng có trường timezone; booking instant lưu UTC; độ dài mặc định 60 phút, tùy chọn 30/60/90/120 phút nếu nằm trong availability; horizon tìm slot tối đa 30 ngày; booking **PENDING chiếm slot**.
6. **Booking status:** PENDING → CONFIRMED → COMPLETED; PENDING → REJECTED/CANCELLED/EXPIRED; CONFIRMED → CANCELLED. Không tự động thanh toán hoặc hoàn tiền; lịch cũ chỉ thay đổi qua explicit transition. Chưa chốt chính sách tự động hết hạn → chỉ tạo thủ công/logic có test, không bật Cron làm thay đổi booking thật.
7. **Figma:** Chưa xác minh trực tiếp. `FIGMA_INVENTORY.md`/`FIGMA_GAP_LOG.md` ghi thực tế. **Không được đánh dấu task fidelity hoàn thành nếu chưa có access/export thiết kế.** Nếu Figma chưa truy cập được tại TASK-05, trả trạng thái BLOCKED; không tự sáng tác màn hình và không nhảy đến task sau.
8. **Git:** chỉ local commit trên branch hiện tại nếu không phải `main`/`master`; trên protected/default branch, tạo branch `feat/tutor-platform-task-queue` từ HEAD sau khi kiểm tra sạch/sự thay đổi sẵn có. Không tự tạo GitHub repo, đổi remote, push, PR, merge hay deploy. Cần xác minh `git remote -v` và identity; `gh auth status` thất bại không được chặn local commit nếu Git identity đã có.
9. **Database:** test/local `wrangler d1 migrations apply <db> --local` hoặc script chuẩn của repo. Không dùng `--remote`, không động đến D1 production, không tạo resource trong tài khoản người dùng nếu chưa có yêu cầu riêng.
10. **External services:** ảnh/avatar R2, email, thanh toán, chat, calendar sync, reviews, AI matching = ngoài scope nếu chưa duyệt. UI cần ảnh có thể dùng placeholder local hợp lệ, không giả dữ liệu thật trong production.
11. **Quy tắc precedence:** bảo mật + integrity > nội dung Figma đã xác minh > `PLAN.md`/`DESIGN_RULES.md` > `TASKS.md` > library default. Khi các quy tắc khác nhau, ghi vào `TASK_DECISIONS.md`, chọn cách chặn thay vì âm thầm đổi nghiệp vụ.

## B. State machine của task

- `[ ]` = PENDING (chưa hoàn thành); `[x]` = DONE (đã verify, có commit); không sửa dấu checkbox chỉ vì source code có tên giống task.
- Trong **mỗi lần** nhận “Tiếp tục thực hiện”, agent chọn **task đầu tiên `[ ]` từ TASK-01 đến TASK-18**.
- Agent kiểm tra dependencies và code thực tế, làm đúng task đó, thêm test, chạy quality gates. Khi pass thì tick `[x]` và ghi một dòng vào `TASK_LOG.md` trong **cùng commit** với code.
- Nếu chưa có thư mục `src` hoặc file tham khảo thì khởi tạo **chỉ trong scope task hiện tại**. Không áp dụng nhiệm vụ phía sau.
- Nếu code feature đã tồn tại từ trước: kiểm tra acceptance criteria, bổ sung test/sửa thiếu; nếu hoàn toàn đạt và chưa được tick, chỉ cập nhật checklist + verification log rồi commit `docs(tasks): verify TASK-XX` (không tạo empty commit).
- Nếu lỗi kiểm thử **không giải quyết được trong phạm vi task**, đánh dấu `BLOCKED` trong báo cáo chat, **không tick**, **không commit**, không nhảy task; giữ các thay đổi để lần “Tiếp tục thực hiện” sau tiếp tục cùng task và mô tả dirty files.
- Task Figma cần asset/export nhưng thiếu quyền = `BLOCKED_EXTERNAL`; không thay bằng thiết kế tưởng tượng. Không tự skip.
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

### [ ] TASK-03 — Authentication, sessions, RBAC and CSRF foundation
**Dependency:** TASK-02.  
**Scope:** Authentication MVP độc lập email/password, session và role guards.  
**Deliverables:** auth service/routes/middleware/schema, endpoints `POST /api/v1/auth/register`, `/login`, `/logout`, `GET /api/v1/me`, unit/integration tests và `docs/ADR_AUTH.md`.  
**Implementation:** Register student/tutor only; normalized unique email; password hash+salt/version; session random token, hash persisted, secure cookie, signout revocation, CSRF for unsafe methods, uniform error responses; no self-promoted admin. Do not promise verification email yet.  
**Acceptance tests:** register/login/me/logout, unauthorized 401, forbidden 403, duplicate email 409, wrong password, expired/revoked session, CSRF invalid, role escalation rejected; secrets never logged.  
**Commit:** `feat(auth): add worker sessions and role guards`.

### [ ] TASK-04 — Weekly tutor availability (backend first)
**Dependency:** TASK-03.  
**Scope:** Lịch lặp hằng tuần chưa phụ thuộc Figma UI.  
**Deliverables:** `src/server/modules/availability/*`, Zod DTO, `GET/PUT /api/v1/tutor/availability`, tests rule ownership/overlap/timezones.  
**Implementation:** weekday 1-7, local HH:mm, timezone, effective date range; validate 30-minute multiples, no crossing midnight, nonoverlap windows, tutor ownership; write replacement atomic; do not mutate confirmed bookings.  
**Acceptance tests:** 60m valid window, overlaps rejected 422, invalid time/weekday/timezone rejected, student access 403, tutor A cannot mutate tutor B, local integration tests pass.  
**Commit:** `feat(schedule): add weekly tutor availability api`.

### [ ] TASK-05 — Figma discovery, screen inventory and design tokens
**Dependency:** TASK-04.  
**Scope:** Read actual Figma Make design or explicitly exported equivalent, *không dùng suy đoán*.  
**Deliverables:** `FIGMA_INVENTORY.md` (frame IDs/name, role, route, variants, links, CTA), `FIGMA_GAP_LOG.md`, `src/client/styles/tokens.css`, `docs/FIGMA_COMPONENT_MAP.md`, audit assets source.  
**Implementation:** Verify source access; record real tokens and screenshot references; map routes and breakpoints; list missing/unknown details. If inaccessible, **BLOCKED_EXTERNAL**, do not mark done, do not create faux tokens as 'from Figma'.  
**Acceptance tests:** Có screen inventory đầy đủ cho MVP với reference có thể kiểm tra, token mapping có nguồn, không ghi claim pixel-perfect nếu không có image; tokens CSS build/lint pass.  
**Commit:** `docs(design): audit figma screens and extract tokens`.

### [ ] TASK-06 — Routing, shared UI primitives and typed API client
**Dependency:** TASK-05.  
**Scope:** Frontend foundation đúng inventory, không làm các feature domain.  
**Deliverables:** `src/client/app/router.tsx`, layouts, UI primitives (button/input/select/dialog/state), `src/client/lib/api-client.ts`, route/error boundaries, tests.  
**Implementation:** Protected routes theo role, 401 redirect/login, 403 forbidden; accessible keyboard focus, mobile breakpoints; client types không chứa env secrets.  
**Acceptance tests:** routes theo verified Figma; layout stable ở 320/768/1280 px; known API errors render; aria labels/focus test; no inert nav/CTA.  
**Commit:** `feat(ui): build app shell and typed api client`.

### [ ] TASK-07 — Tutor profile CRUD and subject catalog
**Dependency:** TASK-06.  
**Scope:** Tutor onboarding/profile, API và UI theo Figma; không public profile chưa approved.  
**Deliverables:** `GET /api/v1/subjects`, `GET/PATCH /api/v1/tutor/profile`, profile form, Zod validators, subject relation queries, tests.  
**Implementation:** Fields: display name, bio, subject IDs, hourly rate integer VND, teaching modes; visibility=private until approved; reject arbitrary extra fields; tutor ownership.  
**Acceptance tests:** tutor edit own only; student cannot; invalid rate/subject rejected; subject catalog paginated if needed; unapproved hidden; UI save/error states; DB indexes.  
**Commit:** `feat(tutors): implement profile and subject management`.

### [ ] TASK-08 — Public tutor search, filters and detail page
**Dependency:** TASK-07.  
**Scope:** Public browse with querystring state, no ranking algorithm beyond explicit sort.  
**Deliverables:** `GET /api/v1/tutors`, `GET /api/v1/tutors/:slug`, TutorCard/TutorList/TutorDetail components, filter/pagination tests.  
**Implementation:** Filter subject/mode/price; safe parameterized queries; approved+public only; pagination fixed default 12, max 48; deep-link filter URL.  
**Acceptance tests:** unapproved/private tutor never leaks details; filters deterministic; bad query 422; empty/loading/error; reload retains URL filters; useful D1 indexes.  
**Commit:** `feat(discovery): add tutor listing search and details`.

### [ ] TASK-09 — Availability exceptions and weekly schedule UI
**Dependency:** TASK-08.  
**Scope:** Tutor overrides + weekly editor UI, không sửa booking.  
**Deliverables:** `GET/POST/PATCH/DELETE /api/v1/tutor/availability/exceptions`, weekly schedule editor/toggle UI, validation/tests.  
**Implementation:** Local dates, `closed` or `extra` windows; no overlapping exceptions unless deterministic precedence explicitly handled; preserve existing confirmed bookings; prompt warning for affected periods.  
**Acceptance tests:** add closure on holiday; one-off extra window; invalid date/window rejected; ownership; form edits round-trip persisted; responsive/keyboard.  
**Commit:** `feat(schedule): add exceptions and weekly schedule editor`.

### [ ] TASK-10 — Available slot projection API + public picker
**Dependency:** TASK-09.  
**Scope:** Read-only slot generation.  
**Deliverables:** `GET /api/v1/tutors/:id/slots?from=...&to=...&duration=...`, slot service, client picker with timezone text, tests.  
**Implementation:** recurring rules + exceptions − active claims; 30m grid, permitted duration 30/60/90/120; max horizon 30 days; UTC instances; no mutation; avoid past and timezone mistakes.  
**Acceptance tests:** regular slot visible, closure removes, extra adds, booked claims hide, 90m requires 3 free consecutive claims, invalid date/range 422, no unapproved profile leak.  
**Commit:** `feat(schedule): expose available slots and picker`.

### [ ] TASK-11 — Atomic booking create and double-book protection
**Dependency:** TASK-10.  
**Scope:** `POST /api/v1/bookings` plus DB claims; do not add idempotency policy until TASK-12.  
**Deliverables:** booking API/service/repository, D1 `batch` transaction, Zod, tests covering races.  
**Implementation:** Server derives student identity and tutor rate; validates active availability, time, amount, role; inserts PENDING + all 30m claims in one atomic batch; UNIQUE(tutor_id,slot_start_utc) prevents conflict; respond 409 SLOT_UNAVAILABLE; guard full-duration overlap.  
**Acceptance tests:** two concurrent students booking same start: exactly one success and other 409; zero orphan bookings on partial failure; 60 vs 90m overlap rejected; no client-supplied price/role override; no booking in past.  
**Commit:** `feat(booking): create bookings with atomic slot claims`.

### [ ] TASK-12 — Booking idempotency and retry safety
**Dependency:** TASK-11.  
**Scope:** `Idempotency-Key` for booking-create only.  
**Deliverables:** idempotency middleware/service using existing table, tests for repeated/concurrent requests.  
**Implementation:** Scope by actor + endpoint + key; hash canonical validated payload; same key/payload returns same booking result; different payload 409; persistence and result consistent atomically; avoid indefinite stuck 'processing' keys.  
**Acceptance tests:** rapid double-click returns one booking; 2 concurrent identical requests create one; replay different payload 409; retries after response-loss safe; different user may reuse key.  
**Commit:** `feat(booking): make booking creation idempotent`.

### [ ] TASK-13 — Booking state machine, cancellation and claim release
**Dependency:** TASK-12.  
**Scope:** Confirm/reject/cancel/complete transitions and ownership enforcement.  
**Deliverables:** `GET /api/v1/bookings`, `POST /api/v1/bookings/:id/{confirm,reject,cancel,complete}`, audit logs, tests.  
**Implementation:** server-enforced `(actor,current_state,action)` checks; atomic state change + slot release for rejected/cancelled/expired; no client-set status; stale update returns 409; completion must never release claims ahead of session.  
**Acceptance tests:** tutor A cannot confirm tutor B; student A cannot read B; invalid transitions 409; cancelling frees slot exactly once; parallel cancel/confirm preserves integrity; audit actor exists.  
**Commit:** `feat(booking): enforce booking lifecycle transitions`.

### [ ] TASK-14 — Student and tutor booking dashboards
**Dependency:** TASK-13.  
**Scope:** Role-specific booking list/details/actions, from verified Figma.  
**Deliverables:** StudentBookings/TutorBookings pages, BookingCard/StatusBadge/BookingActions, query/load/error handling, UI tests.  
**Implementation:** list current user only; pagination and states; responsive; confirm/reject/cancel buttons call actual API; disable while submitting; optimistic updates only with rollback.  
**Acceptance tests:** student sees own only, tutor sees own, statuses update after server response, actions obey permissions, no cross-account data leaks, mobile tests.  
**Commit:** `feat(dashboard): add tutor and student booking views`.

### [ ] TASK-15 — Admin tutor approval and audit UI
**Dependency:** TASK-14.  
**Scope:** Admin approval queue and server authorization.  
**Deliverables:** `GET /api/v1/admin/tutors`, `POST /api/v1/admin/tutors/:id/{approve,reject,hide}`, admin UI, audit tests.  
**Implementation:** Admin identity must be provisioned via documented controlled operator step, not client or seed production; hide unapproved from public; only admin actions; record reason.  
**Acceptance tests:** non-admin always 403; approved profile appears public only after approval; rejected/hidden disappears; audit record with actor and target; pagination.  
**Commit:** `feat(admin): implement tutor moderation queue`.

### [ ] TASK-16 — Security, privacy and operational hardening
**Dependency:** TASK-15.  
**Scope:** Audit and fix concrete risks; no feature creep.  
**Deliverables:** `docs/SECURITY_CHECKLIST.md`, hardening patches, tests, security headers/CSRF/rate limit setup; Turnstile only where design/flow requires it.  
**Implementation:** ownership matrix across all endpoints, input length/request caps, error redaction, safe logging, injection tests, cookie/CORS/CSRF; documented password/verification limitations; avoid introducing new paid services.  
**Acceptance tests:** no high-severity open issue; negative auth/role tests pass; secrets absent from tracked files; browser unsafe requests have CSRF protection; anti-bot server verification if enabled.  
**Commit:** `fix(security): harden auth api and data access`.

### [ ] TASK-17 — Full E2E flow and GitHub Actions CI
**Dependency:** TASK-16.  
**Scope:** Reliable E2E against local Worker/D1 and CI on PR.  
**Deliverables:** Playwright config/tests, `.github/workflows/ci.yml`, README testing, test fixtures.  
**Implementation:** register/login, tutor onboarding/moderation, availability, student booking, tutor confirmation, cancellation, search and filtering; CI no production credentials and no auto deploy.  
**Acceptance tests:** E2E tests run locally; CI checks lint/typecheck/tests/build; isolated D1 fixtures; no production credentials in CI; mobile viewport smoke.  
**Commit:** `test(e2e): verify core tutor matching journeys`.

### [ ] TASK-18 — Release readiness and deployment runbook (NO DEPLOY)
**Dependency:** TASK-17.  
**Scope:** Prepare dev/staging/prod release artifacts, NOT production operations.  
**Deliverables:** `docs/DEPLOYMENT.md`, `docs/ROLLBACK.md`, `docs/OPERATIONS.md`, `docs/RELEASE_CHECKLIST.md`, safe `wrangler` config review, build smoke tests.  
**Implementation:** Separate D1 IDs/bindings/secrets per env; document `wrangler login` vs CI secrets; production migration backup/runbook, observability, app health and D1 migration checklist; no remote resource creation/`wrangler deploy`/`--remote`.  
**Acceptance tests:** `npm run build` and local smoke pass; docs contain explicit manual review gates and rollback; no secret or account-specific identifiers in Git; no production changes.  
**Commit:** `docs(release): prepare cloudflare deployment runbook`.

## E. Sau TASK-18

Khi tất cả checkbox `[x]`, lần nhận “Tiếp tục thực hiện” tiếp theo **không được tạo task mới, không tạo commit rỗng**. Chỉ báo `ALL_TASKS_COMPLETE` với thống kê kiểm thử và commit cuối. Thanh toán, chat, đánh giá, tự động matching, notification là **backlog ngoài MVP**; thêm task ID mới chỉ khi user phê duyệt riêng.

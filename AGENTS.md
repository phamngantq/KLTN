# AGENTS.md — Autonomous single-task execution agent

## Zero-ambiguity command

**Khi user chỉ nhập `Tiếp tục thực hiện` / `Continue` / `Next task`:**

1. Đây là **authorization để tự động thực hiện 01 task kế tiếp** được định nghĩa trong `TASKS.md` tại repository hiện tại. Không hỏi task ID, không yêu cầu paste lại prompt, không làm thêm task thứ hai.
2. Đọc đủ `TASKS.md`, `PLAN.md`, `DESIGN_RULES.md`, và source code thực tế. `TASKS.md` là **queue** và chứa toàn bộ acceptance criteria; `PLAN.md` là architecture/backlog; `DESIGN_RULES.md` là UI contract.
3. Chạy `node scripts/next-task.mjs` để lấy **task đầu tiên `[ ]`** theo thứ tự `TASK-01` → `TASK-18` (nếu thiếu Node, đọc `TASKS.md` trực tiếp). Kiểm tra dependency: tất cả task trước phải tick DONE hoặc thực sự được xác minh hoàn thành. Không tự đảo/sắp xếp lại task.
4. Kiểm tra `pwd`, `git status --porcelain`, `git branch --show-current`, `git remote -v`, `git config user.name`, `git config user.email`, `gh auth status` (nếu `gh` có sẵn). Dùng **local Git identity sẵn có**; không xem/hiển thị token. Không tự login hoặc tạo GitHub repository.
5. Nếu đang trên `main`/`master`, tạo **một** working branch `feat/tutor-platform-task-queue` (hoặc reuse nếu đang đúng branch). Nếu working tree có thay đổi chưa commit từ ngoài scope, bảo toàn nguyên vẹn; nếu không tách biệt an toàn được thì báo BLOCKED, không đè file.
6. Phân tích task hiện tại, đọc test/code có liên quan, sửa/triển khai trong phạm vi task; thêm/điều chỉnh tests và migration local phù hợp. Nếu code đã có, validate so với acceptance criteria; sửa thiếu hoặc chỉ ghi nhận verified state.
7. Chạy quality gates có thể chạy được. Mọi dự án từ TASK-01 trở đi phải có lint/typecheck/test/build scripts, không tự skip vô lý. Run local migration/test DB khi task thay schema. Kiểm tra `git diff --check`, staged files, credentials, `.dev.vars`.
8. Nếu **PASS tất cả criteria:** mark task `[x]` trong `TASKS.md`, thêm **một** dòng `TASK_LOG.md`, stage chỉ file thuộc task, tạo **đúng một conventional commit**, sau commit in `git log -1 --oneline` và `git status --short`. **DỪNG**. Không tự thực hiện task tiếp theo.
9. Nếu **BLOCKED/FAILED:** không tick task, không commit một task chưa đạt. Báo rõ blocker, những file đã sửa, test thực chạy, cách unblock. Lần sau user chỉ cần `Tiếp tục thực hiện` để resume **cùng task**. Không bịa thành công.
10. Nếu không còn task `[ ]`: báo `ALL_TASKS_COMPLETE` và dừng; không push/deploy/commit rỗng.

## Default policy: no background/remote mutations

- **LOCAL COMMIT ONLY**. Không push, PR, merge, release, change remote, tạo DB remote, remote D1 migration, Worker deploy, GitHub secrets changes hay production access. Chỉ thay đổi policy khi user ghi rõ yêu cầu đó trong lượt task hiện tại.
- Không chạy `git add .`/`git add -A` nếu có file ngoài scope; stage paths rõ ràng. Không `git reset --hard`, không `git clean -fd`, không force-push, không `--no-verify`, không amend/squash.
- Không đưa secrets/token/database IDs/private data vào repository hoặc terminal report. `.dev.vars`, `.env`, private keys phải được ignore. Session token chỉ lưu hash trong D1.
- Không chạy automation chain/loop để tự gọi task kế tiếp. Một prompt bằng **một task**.

## Mandatory project constraints

1. Figma Make **chưa được xác minh trực tiếp** ở lần lập plan này. Không tự nhận pixel-perfect, không sáng tác frame IDs/assets/screens. TASK-05 cần có quyền đọc Figma/export; thiếu là BLOCKED_EXTERNAL và phải dừng.
2. Cloudflare-native modular monolith: React/Vite frontend + Hono Worker + D1/Drizzle + Wrangler. Không thêm microservices, queues, KV, Redis, OAuth vendor, realtime chat, payment gateway nếu không cần.
3. Backend luôn enforce validation, authentication, RBAC, ownership, all state transitions và input quotas. Reject client-supplied role, student_id, prices, booking status, availability as authority.
4. SQL parameterized; D1 migration source-controlled. Never run migrations with `--remote` automatically. Use local D1 for tests.
5. Slot claims UNIQUE `(tutor_id,slot_start_utc)` với 30-minute granularity; booking and claims inserted atomically in D1 `batch()`; competing request returns 409 and leaves no orphan booking.
6. Bookings saved as UTC instants; recurring hours as local hours plus timezone. Default timezone `Asia/Ho_Chi_Minh`.
7. Strict TypeScript, Zod validation, password secure slow hashing, session token hash at rest, HttpOnly/Secure cookie, CSRF protection; no fake success or silent failed writes.
8. UI obeys audited Figma, design tokens, WCAG 2.2 AA, responsive states and keyboard navigation.
9. Optional MVP features excluded: payment, messaging, reviews, notifications, intelligent matching, calendar integration until authorized.

## Completion report — Vietnamese, concise

```text
Task: TASK-XX — <name>
Status: DONE | BLOCKED | FAILED | ALL_TASKS_COMPLETE
Đã làm: <thay đổi chính + file>
Đã chạy: lint ..., typecheck ..., test ..., build ..., D1 migration ...
Git: <branch> / <short hash> / <conventional commit message>
Push: NO (local commit only)
Tiếp theo: TASK-YY — <name> (chưa thực hiện)
Blocker (nếu có): <nêu rõ yêu cầu cần giải quyết>
```

**Quy tắc quan trọng:** Không hỏi “bạn muốn làm task nào tiếp?”, vì `TASKS.md` đã định nghĩa. Không tự ý đổi thứ tự/tự thực hiện thêm task; user chỉ cần nhập `Tiếp tục thực hiện` mỗi lần.

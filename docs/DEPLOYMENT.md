# Deployment runbook — Cloudflare Workers + D1

> **Trạng thái sản phẩm:** Các lần deploy staging ghi bên dưới là MVP đặt lịch TASK-01–18. Mục tiêu `./figma` theo DEC-007 chưa được tích hợp/deploy; không dùng smoke test của MVP cũ làm bằng chứng hoàn thành sản phẩm mới.

Một Worker phục vụ cả API (`/api/v1/*`) và SPA (Workers Static Assets). Mỗi môi trường có Worker, D1 và namespace rate-limit **riêng**. Không commit `database_id`/`account_id` (Wrangler tìm D1 theo `database_name`; `npm run secret-scan` chặn việc commit ID).

| Môi trường | Worker | D1 | Rate-limit ns | Trạng thái |
|---|---|---|---|---|
| development (local) | — (`npm run dev`) | `tutor-matching-dev` (Miniflare, `.wrangler/state`) | 1001/1002 | chạy local |
| staging | `tutor-matching-staging` | `tutor-matching-staging` (APAC) | 1101/1102 | **đã triển khai** — https://tutor-matching-staging.tutor-matching-platform.workers.dev |
| production | `tutor-matching` | `tutor-matching-prod` | 1201/1202 | **chưa tạo** — cần phê duyệt riêng (TASK_DECISIONS DEC-002) |

## 0. Điều kiện tiên quyết

- Node 22+, `npm ci`.
- Quyền Cloudflare: người deploy chạy `npx wrangler login` (OAuth, lưu trên máy) — **hoặc** CI dùng `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` lưu trong secret của CI (quyền tối thiểu: Workers Scripts:Edit, D1:Edit). Không bao giờ commit token. CI hiện tại **không** deploy.
- Kiểm tra tài khoản đúng: `npx wrangler whoami`.

## 1. Tạo tài nguyên lần đầu (mỗi môi trường, một lần)

```bash
npx wrangler d1 create tutor-matching-<env> --location apac
# KHÔNG thêm database_id vào wrangler.jsonc — binding đã khai báo theo database_name.
```

Không có secret nào bắt buộc ở bản hiện tại. Khi cần (ví dụ Turnstile): `npx wrangler secret put TURNSTILE_SECRET --env <env>`.

## 2. Cổng chất lượng trước mỗi lần phát hành (bắt buộc)

```bash
npm ci
npm run secret-scan && npm run format:check && npm run lint && npm run typecheck
npm run test -- --run
npm run e2e
```

Tất cả phải xanh. Xem thêm [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## 3. Review migration (gate thủ công)

```bash
npx wrangler d1 migrations list DB --env <env> --remote   # liệt kê migration sẽ chạy
```

- Đọc từng file SQL mới trong `migrations/`. Chỉ chấp nhận thay đổi **tương thích ngược** (thêm bảng/cột có default, thêm index). Xóa/đổi tên cột phải tách thành nhiều bản phát hành (expand → migrate → contract).
- Không sửa migration đã chạy ở bất kỳ môi trường nào; sửa bằng migration mới.
- D1 giới hạn pattern `GLOB` dài trong `CHECK` — dùng `date()`/`strftime()`.

## 4. Sao lưu điểm khôi phục (production bắt buộc, staging khuyến nghị)

```bash
npx wrangler d1 time-travel info DB --env <env>
# Ghi lại bookmark in ra vào release log (dùng cho ROLLBACK.md).
# Tùy chọn: bản export đầy đủ
npx wrangler d1 export DB --env <env> --remote --output backup-<env>-<yyyymmdd-hhmm>.sql
```

File export chứa dữ liệu người dùng (email, hash mật khẩu): lưu ở nơi có kiểm soát truy cập, **không** commit, xóa theo chính sách lưu trữ.

## 5. Áp dụng migration (trước khi deploy code)

```bash
npm run db:migrate:staging      # hoặc db:migrate:production
```

Code mới luôn được viết để chạy được với schema cũ + mới trong khoảng thời gian giữa bước 5 và 6.

## 6. Build & deploy

```bash
npm run deploy:staging          # = build:staging (CLOUDFLARE_ENV=staging) + wrangler deploy
npm run deploy:production       # chỉ sau khi staging đã smoke test xanh
```

Lưu ý: `npm run build` (không có `:env`) tạo cấu hình **development**. Luôn dùng script có tên môi trường trước khi `wrangler deploy`. Kiểm tra output Wrangler liệt kê đúng bindings: `env.DB (tutor-matching-<env>)`, `AUTH_LIMITER`, `BOOKING_LIMITER`, `APP_ENV`.

Lần deploy đầu lên một subdomain workers.dev mới có thể cần vài phút để DNS/TLS sẵn sàng (lỗi TLS `curl (35)` trong lúc chờ là bình thường).

## 7. Smoke test sau deploy

```bash
npm run smoke -- https://<worker>.<subdomain>.workers.dev
# Luồng đầy đủ (đặt lịch, xác nhận, hủy) cần một tài khoản admin:
npm run smoke -- https://<url> --admin-email <admin> --admin-password <pw>
```

Script in lệnh SQL dọn tài khoản `smoke-*`; chạy nó bằng `npx wrangler d1 execute DB --env <env> --remote --command "<sql>"`. Không chạy smoke có ghi dữ liệu trên production khi đang có người dùng thật nếu chưa được phép — dùng chế độ không admin (chỉ đọc + tạo tài khoản smoke rồi xóa).

## 8. Cấp quyền admin

Xem [ADMIN_PROVISIONING.md](ADMIN_PROVISIONING.md) (`node scripts/grant-admin.mjs --email … --env <env>`).

## 9. Lịch sử triển khai staging thực tế

| Ngày | Nội dung | Kết quả |
|---|---|---|
| 2026-10-11 | Tạo D1 `tutor-matching-staging` (APAC); migration 0001; deploy bản backend (auth + availability) | smoke auth/CSRF/PBKDF2 OK |
| 2026-10-11 | Migration 0002–0004; deploy toàn bộ tính năng (TASK-01→16) | `scripts/smoke.mjs` 24/24 PASS; dữ liệu smoke đã xóa |
| 2026-10-11 | Theo runbook: không có migration mới; bookmark khôi phục lưu riêng ngoài Git; `npm run deploy:staging` (route splitting, rate-limit ns 1101/1102) | smoke 24/24 PASS; Chromium headless: `/`, `/tutors`, `/sign-in` render, không lỗi CSP; dữ liệu smoke đã xóa (0 user/booking/claim) |

## 10. Phát hành staging cho mục tiêu `./figma`

Mục này áp dụng cho **bản sản phẩm mới** theo DEC-007. Các lệnh ở §5–7 hiện kiểm tra luồng booking cũ; chỉ dùng chúng cho bản mới sau khi TASK-19–30 đã thay thế luồng, migration và smoke/E2E tương ứng. Không triển khai nguyên gói `./figma`: export chứa dữ liệu mẫu và auth/role phía client, chưa phải ứng dụng Worker có API/D1 thật.

### 10.1. Xác nhận tài khoản và dữ liệu staging trước mọi thay đổi

```bash
npx wrangler whoami
npx wrangler deployments list --name tutor-matching-staging --json
npx wrangler d1 list --json
npx wrangler d1 migrations list DB --env staging --remote
```

- Xác nhận **cùng một tài khoản** nhìn thấy Worker `tutor-matching-staging` và D1 `tutor-matching-staging` đã ghi trong runbook. Không tạo Worker/D1 trùng tên ở tài khoản khác để vượt qua lỗi truy cập.
- Chỉ sau khi xác nhận đúng D1, truy vấn **số lượng** bản ghi `users`, `bookings`, `booking_slot_claims`, `tutor_profiles`, `audit_logs` và các bảng mới theo TASK-20; không xuất PII vào log. Ghi số lượng và kết quả đối chiếu vào release record riêng. Dữ liệu cũ phải được giữ khi đổi sản phẩm.
- Lấy điểm khôi phục Time Travel, kiểm tra khả năng khôi phục; lưu bookmark ngoài Git. Nếu có dữ liệu người dùng, tạo bản export được bảo vệ trước migration. Không chạy migration/deploy khi chưa biết dữ liệu hiện có hoặc không có đường khôi phục.

**Kiểm tra chỉ đọc ngày 2026-10-11:** URL công khai `/api/v1/health` của staging trả HTTP 200. Wrangler trong phiên kiểm tra xác thực được, nhưng không tìm thấy Worker staging hoặc D1 staging trong tài khoản đang chọn. Vì vậy **chưa xác minh được số bản ghi hiện có**; kết quả “0 user/booking/claim” trong lịch sử §9 không còn là bằng chứng cho trạng thái hiện tại. Cần chọn tài khoản có quyền đối với tài nguyên đang chạy rồi lặp lại kiểm tra trước mọi thao tác ghi.

### 10.2. Cổng sản phẩm và kỹ thuật

- TASK-19–30 đạt acceptance criteria trong `TASKS.md`; UI/luồng từ export đã được tích hợp vào `src/client`, API và D1 thật trong `src/server`/`migrations`. Chốt các gap FIG-013–020, quyền xem PII, trạng thái request/lớp/ứng tuyển/gán lớp, và chính sách phí/hợp đồng. Không có mock auth, role do client chọn, số liệu mẫu hay thông báo thanh toán/email thành công giả trong hành trình phát hành.
- Chạy `npm ci`, `npm run secret-scan`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test -- --run`, `npm run build:staging`, `npm run e2e`; thử migration trên D1 local. E2E phải phủ public → phụ huynh → admin → gia sư → lớp, phân quyền/ownership, cạnh tranh/idempotency, responsive/keyboard; script smoke staging phải kiểm tra **luồng mới** trước khi dùng làm gate.
- Rà từng migration mới để bảo toàn booking và dữ liệu cũ; so với danh sách migration remote; chuẩn bị rollback code và phương án phục hồi D1. Chỉ áp dụng remote migration sau khi đã qua các gate và có quyền triển khai cho môi trường đó.

### 10.3. Rollout và xác minh

1. Chốt commit phát hành, kiểm tra `git diff --check`, staged files, secret scan và provenance/license/PII của các file lấy từ `./figma`; push nhánh đã review, không force-push.
2. Xác nhận lại tài khoản/tài nguyên ở §10.1, dữ liệu và backup; áp dụng migration đã review theo §5, rồi `npm run deploy:staging` theo §6. Kiểm tra bindings và phiên bản Worker, không dùng `npm run deploy` mặc định.
3. Chạy smoke/E2E mục tiêu mới trên URL staging và đối chiếu số lượng dữ liệu trước/sau. Kiểm tra auth/CSRF/RBAC, quyền sở hữu PII, request → ứng tuyển → gán/nhận lớp, lỗi 409 khi cạnh tranh, giao diện ở các viewport và log 5xx. Dọn dữ liệu thử theo kế hoạch; không xóa dữ liệu người dùng.
4. Nếu gate sau deploy không đạt, quay về bản Worker trước theo [ROLLBACK.md](ROLLBACK.md); phục hồi D1 chỉ khi xác định migration gây hỏng dữ liệu và theo bookmark/backup riêng. Ghi kết quả thực tế vào release record.

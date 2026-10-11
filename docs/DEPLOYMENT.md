# Deployment runbook — Cloudflare Workers + D1

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
| 2026-10-11 | Theo runbook: không có migration mới; bookmark `00000005-00000000-00005101-4d00e11e0cc6c5c75ca205e4e70ebdb7`; `npm run deploy:staging` (route splitting, rate-limit ns 1101/1102) | smoke 24/24 PASS; Chromium headless: `/`, `/tutors`, `/sign-in` render, không lỗi CSP; dữ liệu smoke đã xóa (0 user/booking/claim) |

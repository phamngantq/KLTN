# Security checklist (TASK-16)

> Các dấu `[x]` xác nhận bảo mật của MVP đặt lịch TASK-01–18, không xác nhận API/role/request/lớp theo `./figma`. TASK-20–30 phải bổ sung ma trận quyền, PII và tests cho sản phẩm thay thế trước release (DEC-007).

Trạng thái: rà soát 2026-10-11. Mỗi mục liên kết tới bằng chứng (code hoặc test) — không đánh dấu nếu chưa có test.

## 1. Xác thực & phiên — [ADR_AUTH.md](ADR_AUTH.md)

- [x] Mật khẩu PBKDF2-SHA256 100k vòng, salt 16 byte, định dạng có version — `src/server/modules/auth/password.ts`, test `auth.test.ts`.
- [x] Token phiên 256-bit, D1 chỉ lưu SHA-256; hết hạn 7 ngày; logout thu hồi; user bị khóa mất phiên — `auth.test.ts`.
- [x] Cookie `HttpOnly; SameSite=Lax`, `Secure` + `__Host-` trên HTTPS — `auth.test.ts` ("uses a Secure __Host- cookie").
- [x] Không thể tự đăng ký admin; field lạ bị 422 — `auth.test.ts`, [ADMIN_PROVISIONING.md](ADMIN_PROVISIONING.md).
- [x] Sai mật khẩu/không tồn tại cùng một 401, có verify giả để cân bằng thời gian.

## 2. CSRF / CORS

- [x] Unsafe method: chặn `Origin` khác origin và `Sec-Fetch-Site: cross-site`; khi có phiên bắt buộc `X-CSRF-Token` gắn với phiên — `middleware/csrf.ts`, `auth.test.ts`, `availability.test.ts`, `bookings-*.test.ts`.
- [x] Chỉ nhận `application/json` (415) → request cross-site bắt buộc preflight.
- [x] Không bật CORS (không `Access-Control-Allow-*`) — `security.test.ts`.

## 3. Phân quyền & ownership — ma trận (test `security.test.ts › authorization matrix`)

| Endpoint | anon | student | tutor | admin |
|---|---|---|---|---|
| `GET /me` | 401 | 200 | 200 | 200 |
| `GET/PATCH /tutor/profile`, `POST /tutor/profile/submit` | 401 | 403 | chủ hồ sơ | 403 |
| `GET/PUT /tutor/availability`, `…/exceptions` | 401 | 403 | chủ lịch | 403 |
| `GET /bookings` | 401 | booking của mình | booking của mình | 403 |
| `POST /bookings` | 401 | ✔ (giá/role do server) | 403 | 403 |
| `POST /bookings/:id/{action}` | 401 | người tham gia (404 nếu không) | người tham gia | 403 |
| `GET /admin/tutors`, `POST /admin/tutors/:id/*` | 401 | 403 | 403 | ✔ |
| `GET /subjects`, `/tutors`, `/tutors/:slug`, `/tutors/:id/slots` | public (chỉ hồ sơ approved + public + active) | | | |

- Người không tham gia booking nhận **404** (không lộ sự tồn tại); người tham gia sai vai trò nhận 403 — `bookings-lifecycle.test.ts`.
- `tutor_id`/`student_id` luôn lấy từ phiên, không bao giờ từ body.

## 4. Toàn vẹn dữ liệu đặt lịch

- [x] Claim 30 phút với PK `(tutor_id, slot_start_utc)` + booking + audit trong một D1 batch; tranh chấp → 409, không booking mồ côi — `bookings-create.test.ts` (2 request đồng thời).
- [x] Idempotency-Key cho tạo booking, hoàn tất trong cùng batch — `bookings-idempotency.test.ts`.
- [x] Chuyển trạng thái CAS (`status` + `version`), giải phóng claim + audit đúng một lần — `bookings-lifecycle.test.ts` (cancel/confirm song song).

## 5. Đầu vào, lỗi, log

- [x] Zod cho mọi body/query; `strictObject` cho mutation; giới hạn độ dài chuỗi; body tối đa 64 KB (413).
- [x] Truy vấn qua Drizzle/`sql` tham số hóa; không nối chuỗi SQL từ input — `security.test.ts` (payload SQL lưu nguyên văn).
- [x] Lỗi thống nhất, không stack trace; log chỉ `safeErrorSummary` (không params SQL) — `security.test.ts`, `auth.test.ts` (không log mật khẩu/token).

## 6. Header & trình duyệt

- [x] API: CSP `default-src 'none'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, HSTS, `Cache-Control: no-store` — `security.test.ts`.
- [x] SPA (`public/_headers`): CSP `self` không `unsafe-inline/eval`, chống framing, HSTS, Permissions-Policy — `static-headers.test.ts`.
- [x] Không có open redirect sau đăng nhập (`safeNextPath`) — `tests/client/App.test.tsx`.

## 7. Chống lạm dụng

- [x] Workers Rate Limiting: đăng nhập/đăng ký 10/phút/IP/endpoint; tạo booking 20/phút/học viên; 429 + `Retry-After` — `security.test.ts`.
- [ ] Turnstile: **chưa bật** — không có thiết kế/yêu cầu captcha (Figma chưa xác minh). Rate limit là lớp bảo vệ hiện tại. Bật khi có yêu cầu: cần secret `TURNSTILE_SECRET` (Workers secret) + verify server-side.

## 8. Bí mật & cấu hình

- [x] Không commit `.dev.vars`, `.env`, database/account ID — `npm run secret-scan` (`scripts/secret-scan.mjs`), `.gitignore`.
- [x] Không có biến `VITE_*` chứa bí mật; client chỉ giữ CSRF token trong bộ nhớ.
- [x] Dev/staging tách DB (`tutor-matching-dev` local, `tutor-matching-staging` remote); production chưa tạo (TASK-18).

## Hạn chế đã biết (không phải lỗ hổng mức cao)

1. PBKDF2 giới hạn 100k vòng (Workers) — thấp hơn khuyến nghị OWASP; bù bằng rate limit, có version để nâng cấp.
2. Chưa có xác minh email / quên mật khẩu (cần dịch vụ email).
3. Rate limit của Cloudflare là best-effort theo từng location.
4. Kiểm tra chồng lấn ngoại lệ lịch là check-then-insert (không có ràng buộc DB); trường hợp hiếm hai request đồng thời vẫn được engine xử lý xác định (closed thắng).
5. Audit của thao tác admin có thể ghi trùng nếu hai admin thao tác cùng một hồ sơ trong cùng mili-giây.

**Kết luận:** không còn vấn đề mức cao đang mở.

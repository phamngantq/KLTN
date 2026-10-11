# ADR: Authentication, sessions, RBAC và CSRF (MVP)

> TASK-22 mở rộng auth cho sản phẩm `./figma`: đăng ký nhận `parent|tutor`, D1 tiếp tục lưu `student|tutor|admin` để giữ ID, FK, session và booking lịch sử. `/me` trả thêm `productRole: parent|tutor|moderator` suy ra từ session; `role` lưu trữ còn dùng cho route/API cũ. Xác thực, session và CSRF vẫn ở server; không dùng `AuthContext.tsx` mock của export làm nguồn quyền.

- Trạng thái: Accepted — 2026-10-11 (TASK-03)
- Phạm vi: `POST /api/v1/auth/register`, `/auth/login`, `/auth/logout`, `GET /api/v1/me`

## Bối cảnh

`TASKS.md` §A.4 chốt email + password cho bản đầu, yêu cầu hash chậm có salt riêng và có version, ưu tiên Argon2id **nếu chạy an toàn trong Workers**; nếu dùng phương án khác phải ghi ADR.

## Quyết định

### 1. Hash mật khẩu: PBKDF2-HMAC-SHA256 (WebCrypto native), 100 000 vòng — fallback có chủ đích

- Định dạng lưu (tự mô tả, có version): `pbkdf2-sha256$<iterations>$<salt b64url 16 bytes>$<hash b64url 32 bytes>`.
- **Vì sao không Argon2id:** Workers không có Argon2 native; bản WASM với tham số OWASP (≥19 MiB, t=2) tiêu tốn hàng chục–hàng trăm ms CPU mỗi lần, dễ vượt giới hạn CPU (đặc biệt gói Free) và tăng bundle. PBKDF2 chạy native trong WebCrypto, đã được kiểm thử trong Workers runtime (`tests/server/auth.test.ts`).
- **Giới hạn đã biết:** WebCrypto của Workers từ chối PBKDF2 > 100 000 vòng, thấp hơn khuyến nghị OWASP (600 000 cho PBKDF2-SHA256). Bù đắp: mật khẩu tối thiểu 8 ký tự / tối đa 128, rate-limit đăng nhập (TASK-16), và định dạng có version để **nâng cấp thuật toán khi đăng nhập thành công** (rehash) khi có lựa chọn tốt hơn.
- So sánh hash bằng `crypto.subtle.timingSafeEqual`. Email không tồn tại vẫn chạy một lần verify giả để giảm khác biệt thời gian (hạn chế dò tài khoản).

### 2. Session

- Token ngẫu nhiên 256-bit (base64url) chỉ nằm trong cookie; D1 lưu **SHA-256 hex** (`auth_sessions.token_hash`, UNIQUE). Lộ DB không lộ token dùng được.
- TTL 7 ngày (`expires_at`); logout đặt `revoked_at`. Session của user `suspended` bị coi như không tồn tại.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`. Khi request là HTTPS (staging/production): `Secure` + tiền tố `__Host-` (`__Host-tm_session`). HTTP local dùng `tm_session` không Secure để dev được.
- Mọi response `/api/*` có `Cache-Control: no-store`.

### 3. CSRF (cookie-auth)

Áp dụng cho method không an toàn (POST/PUT/PATCH/DELETE):

1. `Origin` khác origin của chính API → 403 `CSRF_FAILED`; `Sec-Fetch-Site: cross-site` → 403.
2. Nếu có session: bắt buộc header `X-CSRF-Token` = `base64url(SHA-256("csrf:" + sessionToken))`. Kẻ tấn công cross-site không đọc được cookie HttpOnly nên không tính được token; server không cần lưu thêm hay giữ secret. Client nhận token từ response register/login/`GET /me`.
3. Body chỉ nhận `application/json` (415 nếu khác) → request cross-site buộc phải qua CORS preflight (không bật CORS).

### 4. RBAC

- Role D1: `student`, `tutor`, `admin`; actor sản phẩm: `parent`, `tutor`, `moderator`. Đăng ký chỉ nhận `parent|tutor` (Zod `strictObject` — field lạ như `status`, `isAdmin` → 422); `parent` lưu D1 `student`, `/me` trả product role từ server.
- **Admin chỉ được cấp bằng thao tác operator có kiểm soát phía server** (TASK-15 sẽ tài liệu hóa); không có endpoint/seed production nào tạo admin.
- `requireAuth` → 401, `requireRole(...)` → 403. Kiểm tra ownership tài nguyên nằm ở service từng module, không ở guard.

### 5. Lỗi và log

- Envelope lỗi thống nhất `{ error: { code, message, details? }, meta: { requestId } }`.
- Log server chỉ ghi `safeErrorSummary` (tên lỗi + nguyên nhân gốc), **không** ghi params SQL (có thể chứa hash/token), không ghi body request. Có test kiểm tra password/token không xuất hiện trong log.

## Chưa làm (có chủ đích)

- Xác minh email / quên mật khẩu: cần dịch vụ gửi email — chưa tích hợp; UI không được nói "đã gửi email".
- Rate limiting và Turnstile: TASK-16.
- Rehash tự động khi tăng tham số: khi có thuật toán/tham số mới.

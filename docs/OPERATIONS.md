# Operations

> Runbook hiện mô tả Worker/D1 của MVP đặt lịch TASK-01–18. Khi triển khai mục tiêu `./figma`, bổ sung chỉ số request/lớp/ứng tuyển/gán lớp và truy vấn toàn vẹn theo TASK-20–30; không coi số liệu booking là trạng thái vận hành của sản phẩm mới.

## Health & giám sát

- Health: `GET /api/v1/health` → `{"data":{"status":"ok"}}` (không lộ cấu hình/secret).
- Mọi response có `X-Request-Id` (`req_<uuid>`); lỗi trả cùng `meta.requestId` — dùng để tra log.
- Log runtime: `npx wrangler tail --env <env>` (live) hoặc Workers Observability trên dashboard (`observability.enabled = true`).
- Log lỗi 5xx có dạng JSON `{"requestId", "error"}`; `error` chỉ gồm tên lỗi + nguyên nhân gốc, **không** chứa tham số SQL, body request, mật khẩu, token.
- Theo dõi: tỉ lệ 5xx, số 409 `SLOT_UNAVAILABLE` (tranh chấp lịch bình thường), số 429 `RATE_LIMITED` (lạm dụng/bot), độ trễ `POST /api/v1/bookings`.

## Truy vấn vận hành hữu ích (chỉ đọc)

```bash
npx wrangler d1 execute DB --env <env> --remote --command "<SQL>"
```

| Mục đích | SQL |
|---|---|
| Hàng đợi duyệt | `SELECT count(*) FROM tutor_profiles WHERE approval_status = 'pending';` |
| Booking theo trạng thái | `SELECT status, count(*) FROM bookings GROUP BY status;` |
| Claim mồ côi (phải 0) | `SELECT count(*) FROM booking_slot_claims c LEFT JOIN bookings b ON b.id = c.booking_id WHERE b.id IS NULL;` |
| Claim của booking đã đóng (phải 0) | `SELECT count(*) FROM booking_slot_claims c JOIN bookings b ON b.id = c.booking_id WHERE b.status IN ('REJECTED','CANCELLED','EXPIRED');` |
| Thao tác kiểm duyệt gần đây | `SELECT action, actor_id, target_id, created_at FROM audit_logs WHERE action LIKE 'tutor.%' ORDER BY created_at DESC LIMIT 20;` |
| Phiên hết hạn tồn đọng | `SELECT count(*) FROM auth_sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now');` |

## Dọn dẹp định kỳ (thủ công, chưa có Cron — TASKS §A.6)

```sql
DELETE FROM auth_sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') OR revoked_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days');
DELETE FROM idempotency_keys WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now');
```

Booking `PENDING` quá giờ bắt đầu **không** tự hết hạn (chưa có chính sách — DEC-005); gia sư có thể từ chối.

## Sự cố thường gặp

| Triệu chứng | Kiểm tra / xử lý |
|---|---|
| Toàn bộ API 500 sau deploy | `wrangler tail`; nếu do code → [ROLLBACK.md](ROLLBACK.md) §1 |
| `no such column` | Code mới deploy trước migration → chạy `npm run db:migrate:<env>` |
| Người dùng báo không đăng nhập được, 403 `CSRF_FAILED` | Client cũ không gửi `X-CSRF-Token`/Origin lạ → tải lại trang |
| Nhiều 429 | Bot/brute force; giới hạn hiện tại 10/phút/IP (auth), 20/phút/học viên (booking) — chỉnh `ratelimits` trong `wrangler.jsonc` |
| Gia sư không thấy trên tìm kiếm | Kiểm tra `approval_status = 'approved' AND visibility = 'public'`, user `active`, có `hourly_rate_minor` |
| Không có slot | Lịch tuần/ngoại lệ (`availability_rules/exceptions`), horizon 30 ngày, slot đã qua bị ẩn |

## Liên hệ & quyền

- Quyền Cloudflare (deploy, D1, secrets): chủ tài khoản Cloudflare của dự án.
- Cấp/thu hồi admin: [ADMIN_PROVISIONING.md](ADMIN_PROVISIONING.md).

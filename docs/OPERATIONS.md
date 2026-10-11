# Operations — Worker, D1 và luồng gia sư

> Trạng thái remote đã biết: staging cũ là MVP đặt lịch; Worker `preview` là bản chỉ đọc. Các chỉ số và truy vấn mới dưới đây áp dụng **sau khi** migration 0007–0015 của sản phẩm `./figma` được phát hành đúng D1; không suy chúng đã có trên staging cũ.

## Health, log và chỉ số

- `GET /api/v1/health` trả trạng thái Worker, không lộ cấu hình. Response có `X-Request-Id`; dùng ID này để đối chiếu log thay vì in body/contact.
- `npx wrangler tail --env <env>` hoặc Workers Observability: theo dõi 5xx, 401/403 bất thường, 409 do stale/concurrent mutation, 429 do quota/rate limit và latency. `POST /api/v1/bookings` trả 410 theo cutover; tăng 410 có thể là client cũ cần điều hướng sang yêu cầu tìm gia sư.
- Sau mỗi deploy, `npm run smoke -- <url>` kiểm SPA/API công khai, headers, DTO lớp không có contact và anonymous bị chặn ở dashboard. Smoke **chỉ đọc**; hành trình parent → moderator → tutor được kiểm bằng Playwright trên Worker/D1 local cô lập, còn revoke/cancel/complete, complaint/deletion và race được kiểm bằng Vitest integration.
- Dashboard/report dùng D1 thật theo ngày và `Asia/Ho_Chi_Minh`. `revenue.available=false` với `NO_VERIFIED_PAYMENT_SOURCE` là trạng thái đúng khi chưa có chứng từ thanh toán, không phải lỗi tính doanh thu.

## Truy vấn D1 chỉ đọc

Chỉ thực hiện trên đúng môi trường đã xác minh; ghi tổng số, không xuất thông tin liên hệ, email, nội dung khiếu nại hoặc token:

```bash
npx wrangler d1 execute DB --env <env> --remote --command "<SQL>"
```

| Kiểm tra | SQL / kỳ vọng |
|---|---|
| Toàn vẹn FK | `PRAGMA foreign_key_check;` — không có hàng trả về |
| User theo vai trò/trạng thái | `SELECT role, status, count(*) FROM users GROUP BY role, status;` |
| Yêu cầu/lớp/ứng tuyển/gán/khiếu nại | `SELECT status, count(*) FROM parent_requests GROUP BY status;` và lặp lại cho `class_listings`, `tutor_applications`, `class_assignments`, `complaints` |
| Ba option đã công bố | `SELECT option_key, count(*) FROM fee_option_versions WHERE status = 'published' GROUP BY option_key;` — kiểm đủ ba loại và hiệu lực bằng UI/API; tổng lịch sử không chứng minh đang hiệu lực |
| Lớp active thiếu gán active | `SELECT count(*) FROM class_listings c WHERE c.status = 'active' AND NOT EXISTS (SELECT 1 FROM class_assignments a WHERE a.class_id = c.id AND a.status = 'active');` — phải 0 |
| Gán active ở lớp đã mở lại/hủy | `SELECT count(*) FROM class_assignments a JOIN class_listings c ON c.id = a.class_id WHERE a.status = 'active' AND c.status IN ('draft','open','cancelled');` — phải 0; lớp `completed` vẫn giữ gán lịch sử |
| Hủy lớp không đồng bộ yêu cầu | `SELECT count(*) FROM class_cancellations x JOIN class_listings c ON c.id = x.class_id JOIN parent_requests r ON r.id = c.source_request_id WHERE c.status <> 'cancelled' OR r.status <> 'cancelled';` — phải 0 |
| Lớp thiếu yêu cầu nguồn | `SELECT count(*) FROM class_listings c LEFT JOIN parent_requests r ON r.id = c.source_request_id WHERE r.id IS NULL;` — phải 0 |
| Ứng tuyển thiếu fee version | `SELECT count(*) FROM tutor_applications a LEFT JOIN fee_option_versions f ON f.id = a.fee_option_version_id WHERE f.id IS NULL;` — phải 0 |
| Tombstone còn active | `SELECT count(*) FROM account_deletions d JOIN users u ON u.id = d.user_id WHERE u.status = 'active';` — phải 0 |
| Booking lịch sử theo trạng thái | `SELECT status, count(*) FROM bookings GROUP BY status;` |
| Claim booking mồ côi | `SELECT count(*) FROM booking_slot_claims c LEFT JOIN bookings b ON b.id = c.booking_id WHERE b.id IS NULL;` — phải 0 |
| Claim booking đã đóng | `SELECT count(*) FROM booking_slot_claims c JOIN bookings b ON b.id = c.booking_id WHERE b.status IN ('REJECTED','CANCELLED','EXPIRED');` — phải 0 |
| Audit tổng hợp, không PII | `SELECT action, count(*) FROM audit_logs WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') GROUP BY action;` |

Sau rút gán, truy vấn DB không thay thế kiểm tra API: tutor cũ phải bị từ chối khi đọc contact; tutor mới chỉ đọc được sau gán. Kiểm tra này nằm trong E2E/incident reproduction ở môi trường cô lập, không thử bằng cách lộ contact thật vào log. Với hoàn tất, kiểm tra `class_lifecycle_events` có event và lý do, class `completed`, source request `fulfilled`; không suy ra buổi học hoặc thanh toán đã xảy ra.

## Chính sách xử lý vận hành

- Phụ huynh miễn phí dịch vụ tìm gia sư. Ba phương án phí của gia sư phải do kiểm duyệt viên nhập/publish theo version; không nhập số tiền mẫu chỉ để mở gate ứng tuyển. Quiz/ack điều khoản phiên bản đang công bố phải đạt trước ứng tuyển.
- Khiếu nại đi `submitted → in_review → resolved`; chỉ owner và kiểm duyệt viên có quyền đọc theo API. Không gửi nội dung khiếu nại hoặc contact vào log.
- Yêu cầu xóa tài khoản trả 409 khi còn booking `PENDING/CONFIRMED` hoặc yêu cầu/lớp/ứng tuyển/gán đang xử lý. Không tự hủy cam kết. Khi được phép, D1 batch xóa credential/session/contact và ẩn danh dữ liệu riêng, gồm lý do lifecycle/cancellation, lý do từ chối đơn, khiếu nại và audit metadata liên quan; giữ user ID/FK/status lịch sử, tombstone không được re-activate. Migration 0015 backfill những tài khoản đã xóa trước đó. Sao lưu/Time Travel trước 0015 có thể còn PII và phải được rà soát trước khi phục hồi.
- Rút gán do kiểm duyệt viên có lý do mở lại lớp, cắt ngay quyền contact của tutor cũ; hoàn tất lớp cũng cần lý do. Hủy lớp `open`/request `sourcing` chưa gán cần lý do, đóng cả hai, từ chối các ứng tuyển `submitted` và giữ lịch sử; lớp `active` phải rút gán trước, lớp `draft` không dùng action này. Lịch sử ứng tuyển, lựa chọn phí và hợp đồng còn để đối soát; không tự tạo refund/payment state.
- Payment gateway, email delivery, upload giấy tờ/đính kèm và báo cáo doanh thu thật chỉ vận hành sau khi có dịch vụ/chính sách được duyệt. Không dùng UI mẫu của export làm bằng chứng giao dịch.

## Sự cố thường gặp

| Triệu chứng | Kiểm tra / xử lý |
|---|---|
| 5xx hoặc `no such table/column` sau deploy | Đối chiếu Worker version, binding D1 và migration đã áp dụng; nếu lệch, dừng ghi và theo [ROLLBACK.md](ROLLBACK.md) |
| 401/403 sau login | Kiểm tra session cookie, CSRF/Origin và role server; không đổi role trong client hoặc DB thủ công để vượt quyền |
| Tutor không ứng tuyển được | Xem trạng thái duyệt tutor, môn/hình thức, đủ ba option phí đang hiệu lực, quiz đạt + xác nhận điều khoản hiện hành; không bypass gate |
| Moderator gán/rút/hoàn tất/hủy gặp 409 | Tải lại version lớp, request, application/assignment; xem audit và trạng thái mới trước khi thử lại. Lớp active phải rút gán trước khi hủy |
| Contact còn đọc được sau rút gán | Sự cố quyền riêng tư: chặn phát hành, xác minh status class/assignment và route contact, theo [ROLLBACK.md](ROLLBACK.md) |
| Xóa tài khoản 409 | Xem nghĩa vụ đang mở theo quyền moderator; hoàn tất luồng hợp lệ trước khi người dùng thử lại, không sửa trạng thái trực tiếp |
| Doanh thu unavailable | Kiểm tra có nguồn thanh toán đã xác minh và policy hay chưa; hiện trạng không có nên giữ unavailable |
| 410 tại POST booking | Client cũ; hướng người dùng sang yêu cầu tìm gia sư. GET/action booking cũ tiếp tục hoạt động |

## Dọn dữ liệu hết hạn

Chỉ chạy khi đã được phê duyệt cho môi trường và sau backup; đây là mutation thủ công, chưa có Cron. Session đã hết hạn và idempotency key cũ có thể dọn theo chính sách lưu trữ:

```sql
DELETE FROM auth_sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') OR revoked_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days');
DELETE FROM idempotency_keys WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now');
```

Không tự hết hạn booking `PENDING`, tự động hủy lớp hoặc xóa khiếu nại. Hủy lớp `open` chưa gán là thao tác kiểm duyệt viên có lý do/audit, không phải tác vụ dọn dẹp. Quyền Cloudflare thuộc chủ tài khoản; cấp quyền kiểm duyệt viên xem [ADMIN_PROVISIONING.md](ADMIN_PROVISIONING.md).

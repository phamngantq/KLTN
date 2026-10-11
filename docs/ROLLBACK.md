# Rollback runbook

> Các lệnh và kiểm tra DB dưới đây áp dụng cho bản MVP đặt lịch đang chạy. Trước khi phát hành mục tiêu `./figma`, TASK-30 phải cập nhật rollback và kiểm tra toàn vẹn cho schema request/lớp/ứng tuyển, giữ migration tương thích ngược theo DEC-007.

Quyết định rollback khi sau deploy: smoke test fail, tỉ lệ 5xx tăng rõ rệt (`wrangler tail`/Observability), lỗi đặt lịch/đăng nhập, hoặc lỗi dữ liệu. Ưu tiên **rollback code trước**, chỉ khôi phục DB khi dữ liệu bị hỏng.

## 1. Rollback code Worker (nhanh, không đụng dữ liệu)

```bash
npx wrangler deployments list --env <env>          # tìm version tốt gần nhất
npx wrangler rollback <version-id> --env <env> --message "rollback: <lý do>"
npm run smoke -- https://<url>                      # xác nhận
```

Điều kiện an toàn: migration đã chạy phải **tương thích ngược** với code cũ (quy tắc expand/contract trong DEPLOYMENT.md §3). Nếu code cũ không chạy được với schema mới, xem §3.

## 2. Static assets

Assets đi cùng version Worker — `wrangler rollback` khôi phục cả SPA của version đó.

## 3. Khôi phục dữ liệu D1 (Time Travel)

Chỉ dùng khi dữ liệu bị hỏng (ví dụ migration sai). **Mọi ghi sau thời điểm khôi phục sẽ mất** — thông báo và tạm dừng ghi trước khi làm.

```bash
# 1) Tạm dừng ghi: rollback Worker về bản cũ hoặc bật chế độ bảo trì.
# 2) Chọn điểm khôi phục: bookmark đã ghi ở DEPLOYMENT.md §4, hoặc theo thời gian
npx wrangler d1 time-travel info DB --env <env> --timestamp "2026-10-11T08:00:00Z"
# 3) Khôi phục
npx wrangler d1 time-travel restore DB --env <env> --bookmark <bookmark>
# 4) Kiểm tra
npx wrangler d1 migrations list DB --env <env> --remote
npm run smoke -- https://<url>
```

Time Travel giữ lịch sử 30 ngày (gói Workers Paid) hoặc 7 ngày (Free). Ngoài khoảng đó, khôi phục từ file `wrangler d1 export` đã sao lưu (import vào database mới rồi trỏ binding — cần review).

## 4. Migration lỗi khi đang chạy

Mỗi file migration chạy trong transaction; file lỗi không được đánh dấu đã áp dụng. Sửa bằng **migration mới** (không sửa file cũ), review lại, chạy lại `npm run db:migrate:<env>`.

## 5. Sau rollback

- Ghi incident: thời gian, version, bookmark, dữ liệu bị ảnh hưởng.
- Booking: kiểm tra không có claim mồ côi
  `SELECT count(*) FROM booking_slot_claims c LEFT JOIN bookings b ON b.id = c.booking_id WHERE b.id IS NULL;` (phải = 0) và không có claim của booking đã hủy
  `SELECT count(*) FROM booking_slot_claims c JOIN bookings b ON b.id = c.booking_id WHERE b.status IN ('REJECTED','CANCELLED','EXPIRED');` (phải = 0).

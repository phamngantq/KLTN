# Cấp quyền quản trị (admin) — thao tác operator có kiểm soát

Không có API, seed hay form nào tạo admin. Đăng ký công khai chỉ tạo `student` hoặc `tutor` (xem [ADR_AUTH.md](ADR_AUTH.md)).

## Quy trình

1. Người được cấp quyền **tự đăng ký tài khoản học viên** trên môi trường đích (không dùng mật khẩu do người khác đặt).
2. Operator có quyền Cloudflare của môi trường đó chạy:

   ```bash
   # local dev
   node scripts/grant-admin.mjs --email admin@example.com --local
   # staging (D1 remote)
   node scripts/grant-admin.mjs --email admin@example.com --env staging
   ```

   Script chỉ nâng tài khoản `student` đang `active`; email được kiểm tra bằng whitelist ký tự trước khi đưa vào SQL.
3. Kiểm tra dòng kết quả có `role = admin`. Người dùng đăng nhập lại (hoặc tải lại trang) để thấy mục "Duyệt gia sư".
4. Ghi lại ai cấp, cho ai, khi nào, trên môi trường nào vào sổ vận hành (thao tác này đi qua Wrangler nên không có `audit_logs` trong D1).

## Thu hồi

```bash
npx wrangler d1 execute DB --env staging --remote --command "UPDATE users SET role = 'student' WHERE email_normalized = 'admin@example.com' AND role = 'admin'"
```

Thu hồi phiên đang mở (bắt buộc đăng nhập lại):

```bash
npx wrangler d1 execute DB --env staging --remote --command "UPDATE auth_sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE email_normalized = 'admin@example.com')"
```

## Quyền admin trong ứng dụng

- `GET /api/v1/admin/tutors?status=pending|approved|hidden|rejected|draft`
- `POST /api/v1/admin/tutors/:id/approve` (ghi chú tùy chọn), `/reject` và `/hide` (bắt buộc lý do — hiển thị cho gia sư)
- Mọi thao tác ghi `audit_logs` (actor, target, lý do) trong cùng transaction với thay đổi.

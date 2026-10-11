# Cấp quyền quản trị (admin) — thao tác operator có kiểm soát

> TASK-22 dùng nhãn `parent` khi đăng ký công khai, D1 vẫn lưu role `student`. Operator có thể cấp role D1 `admin` cho tài khoản này; sản phẩm hiển thị actor `moderator` (kiểm duyệt viên). Không dùng lựa chọn `admin` trong form của code export `./figma` làm quyền thật.

Không có API, seed từ migration hay form công khai nào tạo admin. Đăng ký công khai chỉ nhận `parent` hoặc `tutor` (xem [ADR_AUTH.md](ADR_AUTH.md)). Riêng `npm run seed:sample:local` tạo tài khoản kiểm duyệt viên giả lập trong D1 **local** để thử giao diện; email mẫu nằm trong `.env.example`, mật khẩu ngẫu nhiên chỉ lưu tại `.wrangler/sample-local/credentials.vars` bị Git bỏ qua. Lệnh này không có tùy chọn remote và không thay quy trình cấp quyền staging/production bên dưới.

## Quy trình

1. Người được cấp quyền **tự đăng ký tài khoản phụ huynh** trên môi trường đích (không dùng mật khẩu do người khác đặt).
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

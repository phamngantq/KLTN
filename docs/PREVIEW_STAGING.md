# Staging v2: bản xem trước chỉ đọc

Ngày 2026-10-11, người dùng cho phép tạo lại staging trong tài khoản Cloudflare đang đăng nhập khi staging cũ không hiện ra, kèm dữ liệu mẫu. Môi trường này dùng **Worker và D1 riêng** tên `tutor-matching-staging-v2`, cấu hình `env.preview`. URL khác staging cũ; không sao chép hoặc xóa dữ liệu cũ.

**URL đang chạy:** https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev. Sau triển khai, smoke API và Chromium ở viewport 375 px đạt; D1 có 2 user mẫu, 0 credential, 0 request, 0 booking. Health staging cũ vẫn trả HTTP 200.

Đây là bản xem trước công khai bằng dữ liệu tổng hợp để xem UI và API đọc. **Chưa phải bản phát hành sản phẩm `./figma`**: TASK-24–30, phí nhận lớp, ứng tuyển/gán lớp và xóa dữ liệu cá nhân vẫn chưa hoàn tất. Không dùng dữ liệu thật. Banner trên UI nêu rõ chế độ này; Worker trả `503 PREVIEW_READ_ONLY` cho mọi phương thức API ghi, gồm đăng ký, đăng nhập, yêu cầu tìm gia sư và booking cũ. Các trang có form riêng và giá minh họa được ẩn/hiển thị trạng thái chưa mở.

## Dữ liệu mẫu

- Migration `0001`–`0006` tạo schema và danh mục môn học.
- [seed-preview.sql](../scripts/seed-preview.sql) thêm 2 hồ sơ gia sư **giả lập** với email `example.invalid`, không có mật khẩu/session, contact, request hay booking. Trường giá trong schema cũ chỉ để hồ sơ xuất hiện trong tìm kiếm; UI preview không công bố giá đó như chính sách phí.
- Seed tách khỏi migration và **chỉ** chạy với `--env preview`. Không đưa seed vào staging cũ hay production.

## Triển khai lại môi trường này

1. Xác nhận `npx wrangler whoami` chọn đúng tài khoản và `npx wrangler d1 list --json` chứa D1 `tutor-matching-staging-v2`. Không in ID/token vào log phát hành. Nếu chưa có D1, tạo bằng `npx wrangler d1 create tutor-matching-staging-v2 --location apac`.
2. `npx wrangler d1 migrations list DB --env preview --remote`, rồi `npm run db:migrate:preview` nếu cần. Với D1 mới trống, chạy `npx wrangler d1 execute DB --env preview --remote --file scripts/seed-preview.sql`.
3. `npm run cf-typegen`, `npm run secret-scan`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run build:preview`, `npm run e2e`. E2E hiện kiểm tra luồng cũ trên D1 local; nó không xác nhận hoàn thành sản phẩm mới. Vì E2E ghi lại `dist`, **build preview lần nữa** trước deploy.
4. Kiểm tra `dist/tutor_matching/wrangler.json`: `name`/D1 = `tutor-matching-staging-v2`, `APP_ENV=preview`, `workers_dev=true`, `preview_urls=false`, không có route/custom domain. Chạy `npx wrangler deploy --dry-run`, sau đó `npm run deploy:preview`.
5. Chạy `node scripts/smoke-preview.mjs <URL mới>` và `node scripts/smoke-preview-browser.mjs <URL mới>`; truy vấn D1 từ xa chỉ lấy số lượng `users`, `auth_credentials`, `parent_requests`, `bookings` để xác nhận chỉ có dữ liệu mẫu và không có ghi mới. Không chạy `scripts/smoke.mjs` vì script đó tạo booking/tài khoản cũ.

Worker/D1 staging cũ tại `tutor-matching-staging` thuộc tài khoản khác trong phiên kiểm tra này và **không được sửa**. Để cutover một môi trường có dữ liệu thật, hoàn thành checklist [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) mục E và kiểm kê/bảo toàn dữ liệu theo [DEPLOYMENT.md](DEPLOYMENT.md) §10.

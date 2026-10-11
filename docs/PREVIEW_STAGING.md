# Staging V2 — kế hoạch chuyển từ preview chỉ đọc

Ngày 2026-10-11, người dùng cho phép dùng tài khoản Cloudflare trên máy để phát hành sản phẩm mới theo `./figma` lên Worker V2. Nếu staging cũ không có trong tài khoản này, dùng tài nguyên V2; không sửa Worker/D1 staging cũ khi chưa xác minh quyền. Cấu hình `env.staging_v2` trỏ đến Worker và D1 `tutor-matching-staging-v2`, đặt `APP_ENV=staging` và build UI với `VITE_PREVIEW_READ_ONLY=false`.

**Trạng thái trước lần phát hành này:** URL https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev đã phục vụ bản `env.preview` chỉ đọc. Lần kiểm tra sau deploy preview trước đó có smoke API và Chromium 375 px đạt; D1 có 2 user giả lập, 0 credential, 0 request, 0 booking. Điều này không xác nhận mã chức năng mới hay `env.staging_v2` đã được deploy. `env.preview` được giữ để ghi lại cấu hình lịch sử nhưng không còn là lệnh phát hành V2; các script migrate/deploy preview đã bị bỏ khỏi `package.json` để tránh ghi nhầm lên cùng Worker/D1.

## Dữ liệu preview đã có

- Preview ban đầu áp dụng migration `0001`–`0006`. Source hiện có thêm `0007`–`0015`; phải đọc danh sách migration remote trước khi áp dụng.
- [seed-preview.sql](../scripts/seed-preview.sql) tạo 2 hồ sơ gia sư **giả lập** với email `example.invalid`, không có mật khẩu, session, contact, request hay booking. Không chạy lại seed này khi chuyển sang staging có chức năng ghi.
- D1 V2 dùng lại dữ liệu preview hiện có nếu tài nguyên vẫn thuộc tài khoản đang đăng nhập. Trước migration, kiểm kê số bản ghi và bookmark Time Travel; không xóa hay chuyển dữ liệu chỉ để phát hành.

## Các bước phát hành V2

1. Xác minh tài khoản Wrangler, Worker và D1 V2 bằng inventory chỉ đọc. Nếu tài nguyên V2 thực sự không tồn tại trong đúng tài khoản, tạo D1 mới cùng tên theo yêu cầu đã được phép, rồi xác minh lại binding. Không suy quyền quản trị từ URL công khai.
2. Hoàn thành cổng local và các mục trong [DEPLOYMENT.md](DEPLOYMENT.md), [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). So sánh `npx wrangler d1 migrations list DB --env staging_v2 --remote` với source và kiểm kê D1. Với D1 đã có dữ liệu, lưu bookmark/backup theo runbook trước khi chạy `npm run db:migrate:staging:v2`.
3. Chạy `npm run build:staging:v2` **sau E2E**. Kiểm tra `dist/tutor_matching/wrangler.json`: Worker/D1 cùng tên `tutor-matching-staging-v2`, `APP_ENV=staging`, `workers_dev=true`, `preview_urls=false`, không có route/custom domain. Build UI phải có `VITE_PREVIEW_READ_ONLY=false`. Sau dry-run đúng đích mới chạy `npm run deploy:staging:v2`.
4. Chạy `npm run smoke -- https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev`, kiểm tra migration, binding, health và trạng thái dữ liệu từ xa. Smoke là kiểm tra chỉ đọc; hành trình ghi đã được kiểm bằng E2E trên D1 local. Ghi kết quả thực tế sau phát hành, không suy PASS từ tài liệu này.

Staging cũ `tutor-matching-staging` thuộc lịch sử MVP và lần kiểm tra trước không hiện trong tài khoản Wrangler. Tài nguyên đó tách khỏi V2. Production cần quyết định phát hành riêng.

# Staging V2 — bản chức năng mới đã triển khai

Ngày 2026-10-11, bản sản phẩm mới theo `./figma` từ commit `bfac6a4` đã được triển khai lên [Worker staging V2](https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev). Cấu hình `env.staging_v2` trỏ đến Worker và D1 `tutor-matching-staging-v2`, đặt `APP_ENV=staging` và build UI với `VITE_PREVIEW_READ_ONLY=false`. Worker/D1 staging cũ không bị sửa; production chưa triển khai.

Trước lần phát hành này, cùng URL phục vụ bản `env.preview` chỉ đọc. `env.preview` vẫn có trong cấu hình để ghi lại lịch sử nhưng không còn là lệnh phát hành V2; các script migrate/deploy preview đã bị bỏ khỏi `package.json` để tránh ghi nhầm lên cùng Worker/D1.

## Kết quả sau phát hành

- Migration `0007`–`0015` đã áp dụng trên D1 V2. Truy vấn `PRAGMA foreign_key_check` trả 0 hàng.
- Cổng local trước deploy đạt: lint, typecheck, build; Vitest **46 files/387 tests** và Playwright E2E **1/1** trên D1 local. CI của nhánh `main` cho commit `bfac6a4` đã hoàn tất thành công.
- Smoke API chỉ đọc đạt **16/16** sau khi chạy lại do có timeout thoáng qua ở ngưỡng 10 giây. Chromium trên viewport di động hiển thị form đăng ký và không còn chặn bằng banner preview. Thử đăng ký với dữ liệu sai nhận `422` validation và không tạo tài khoản.
- Sau phép thử ghi không hợp lệ, D1 vẫn có 2 user gia sư giả lập, 0 credential, 0 parent request, 0 booking, 0 class. Chưa có tài khoản kiểm duyệt viên vận hành; việc cấp quyền chờ email của người dùng sau khi đăng ký.
- Smoke và thử dữ liệu đăng ký không hợp lệ không xác nhận toàn bộ hành trình ghi trên remote. Hành trình ba actor được kiểm bằng E2E với D1 local cô lập; dữ liệu mẫu hiện tại không đủ để đăng nhập/gán lớp trên remote.

## Dữ liệu preview đã có

- Preview ban đầu áp dụng migration `0001`–`0006`; lần phát hành staging V2 đã áp dụng tiếp `0007`–`0015`.
- [seed-preview.sql](../scripts/seed-preview.sql) tạo 2 hồ sơ gia sư **giả lập** với email `example.invalid`, không có mật khẩu, session, contact, request hay booking. Không chạy lại seed này khi chuyển sang staging có chức năng ghi.
- D1 V2 dùng lại dữ liệu preview hiện có. Trước mọi migration tương lai, kiểm kê số bản ghi và bookmark Time Travel; không xóa hay chuyển dữ liệu chỉ để phát hành.

## Các bước triển khai lại V2

1. Xác minh tài khoản Wrangler, Worker và D1 V2 bằng inventory chỉ đọc. Không suy quyền quản trị từ URL công khai.
2. Hoàn thành cổng local và các mục trong [DEPLOYMENT.md](DEPLOYMENT.md), [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). So sánh `npx wrangler d1 migrations list DB --env staging_v2 --remote` với source và kiểm kê D1. Với migration mới và D1 đã có dữ liệu, lưu bookmark/backup theo runbook trước khi chạy `npm run db:migrate:staging:v2`.
3. Chạy `npm run build:staging:v2` **sau E2E**. Kiểm tra `dist/tutor_matching/wrangler.json`: Worker/D1 cùng tên `tutor-matching-staging-v2`, `APP_ENV=staging`, `workers_dev=true`, `preview_urls=false`, không có route/custom domain. Build UI phải có `VITE_PREVIEW_READ_ONLY=false`. Sau dry-run đúng đích mới chạy `npm run deploy:staging:v2`.
4. Chạy `npm run smoke -- https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev`, kiểm tra migration, binding, health và trạng thái dữ liệu từ xa. Smoke là kiểm tra chỉ đọc; hành trình ghi được kiểm bằng E2E trên D1 local. Ghi kết quả mới cho từng lần phát hành.

Staging cũ `tutor-matching-staging` thuộc lịch sử MVP và lần kiểm tra trước không hiện trong tài khoản Wrangler. Tài nguyên đó tách khỏi V2. Production cần quyết định phát hành riêng.

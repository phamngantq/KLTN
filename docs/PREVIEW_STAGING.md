# Staging V2 — bản chức năng mới đã triển khai

## Thay đổi bảng giá ngày 2026-10-12 — chờ phát hành

Mã nguồn đã bổ sung hai bảng D1 cho học phí theo buổi và khoảng phí nhận lớp tham khảo. Hai mảng trong `.env.example` là nguồn nạp dữ liệu mẫu; sau khi áp dụng migration `0016` và chạy lại `seed:sample:staging:v2` trên đúng D1, hệ thống sẽ lưu sáu mức học phí và hai khoảng phí trong D1. Các lớp và ngân sách dự kiến của từng lớp đã nằm trong D1 từ lần phát hành trước. **Chưa ghi nhận áp dụng migration, seed lại hoặc deploy Worker cho thay đổi này trên staging.**

## Cập nhật dữ liệu mẫu staging V2 ngày 2026-10-11

[Worker staging V2](https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev) đã deploy version `5c1ec5a7-6809-4579-9e0c-c6a9d72bf6ee` với `APP_ENV=staging`, sau đó seed từ cấu hình riêng bị Git bỏ qua tại `.wrangler/sample-staging-v2/config.vars`. D1 V2 có **3 phương án phí published**, **6 yêu cầu sourcing** từ phụ huynh tổng hợp và **6 lớp open**. API công khai trả 6 lớp và 3 phương án phí; `PRAGMA foreign_key_check` trả 0 lỗi. Tài khoản kiểm duyệt viên mẫu là `staging-admin@example.test`; mật khẩu ngẫu nhiên chỉ ở `.wrangler/sample-staging-v2/credentials.vars` bị Git bỏ qua, không có trong Worker vars hay tài liệu. Bookmark D1 trước seed được lưu ở `.wrangler/sample-staging-v2/`.

- Cổng local: lint, typecheck, format, secret scan, build staging V2, **52 file/402 test** và Playwright E2E ba vai trò **1/1** PASS. Test seed riêng xác nhận chạy lại không nhân đôi dữ liệu và không ghi contact giả vào yêu cầu.
- Sau deploy: smoke chỉ đọc **16/16** PASS; D1 có 1 admin mẫu, 3 fee published, 6 request sourcing, 6 class open, 0 contact riêng được seed và 0 lỗi foreign key.
- Export Figma có 8 lớp tham chiếu; 6 lớp ánh xạ đúng schema hiện tại được công bố. Lớp tiếng Anh cho người đi làm và lớp Toán + Tiếng Việt hai môn vẫn nằm trong `.env.example`, chưa công bố vì miền dữ liệu hiện tại chưa biểu diễn đầy đủ. Hai bảng giá tham chiếu từ Figma chưa có schema/API. Staging chưa có cổng thanh toán; gia sư vẫn cần hồ sơ được duyệt, quiz và điều khoản đã công bố để ứng tuyển.

Các mục bên dưới là bằng chứng của những lần phát hành trước.

## Cập nhật giao diện 2026-10-11

Commit `84265ce` đã được triển khai lên cùng [Worker staging V2](https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev), Worker version `e1623aa2-82f4-410d-ba31-9545afbebc71`. Bản này thống nhất thương hiệu **Gia Sư Đỗ Hằng**, sửa menu một header cho ba vai trò, ánh xạ trang chủ phụ huynh, lưới lịch 7 ngày × 7 ca, dashboard kiểm duyệt viên và phần lớp gần đây của gia sư bằng dữ liệu API thật. Không có migration mới và không sửa production/staging cũ.

- Local: format, lint, typecheck, secret scan, build staging V2, **50 file/400 test**, E2E ba vai trò **1/1** PASS. D1 local không có migration chờ và `PRAGMA foreign_key_check` trống. Ảnh render home, dashboard admin và form phụ huynh ở 320/1280 px đã xem; không tràn ngang trang.
- Trước deploy: Wrangler dry-run trỏ Worker/D1 cùng tên `tutor-matching-staging-v2`, `APP_ENV=staging`, binding `DB` và hai rate limiter. D1 V2 không có migration chờ; Time Travel khả dụng.
- Sau deploy: smoke chỉ đọc **16/16** PASS; Chromium trên URL thật xác nhận thương hiệu, menu mobile, bảng giá, trang đăng ký và chặn route admin cho khách. D1 giữ **2 users, 0 bookings, 0 claims, 0 parent requests, 0 classes, 0 applications**; `PRAGMA foreign_key_check` trống.
- Giới hạn: frame Figma Make trực tiếp chưa truy cập được, nên không xác nhận pixel-perfect. Form tạo yêu cầu dùng route riêng thay vì dialog trên trang danh sách; testimonial, biểu đồ doanh thu/xu hướng và FAQ chứa mock/cam kết chưa duyệt không được công bố. Staging chưa có tài khoản kiểm duyệt viên vận hành hoặc các phiên bản phí/điều khoản/hợp đồng được người vận hành công bố; hành trình ghi đầy đủ được kiểm trên D1 local cô lập, chưa chạy trên remote.

Các kết quả bên dưới ghi lại đợt phát hành nền trước khi chỉnh giao diện.

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

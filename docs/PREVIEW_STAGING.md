# Staging V2 — bản chức năng mới đã triển khai

## Menu, tổng quan và hồ sơ gia sư ngày 2026-10-16

Commit `25f2a4f` được triển khai lên [Worker staging V2](https://tutor-matching-staging-v2.tutor-matching-platform.workers.dev), version `55fe59fc-bb3e-4de6-85b6-d9ee0ecaac05`. Gia sư có menu mới (Tổng quan, Hồ sơ gia sư, Tìm kiếm lớp dạy, Nội dung › Hợp đồng mẫu/đã ký, Bảng giá, Cẩm nang, Khiếu nại; không còn "Khu vực gia sư"), trang Tổng quan với 3 thẻ số liệu, lối tắt, lớp mới (ưu tiên lớp phù hợp) và mẹo nhận lớp; hồ sơ có 2 tab, xem trước ảnh đại diện, nhóm lựa chọn dạng ô checkbox với "+ Thêm lựa chọn", 34 tỉnh/thành phố và khu vực cụ thể, ma trận thời gian dạy lưu qua API lịch rảnh.

- Trước phát hành: lint, typecheck, format, secret scan, build, Vitest **506/506**, Playwright **4/4**, `git diff --check` PASS.
- Remote: mốc Time Travel trước migration lưu ngoài Git; migration `0033` (lựa chọn tự thêm của gia sư, nâng giới hạn khu vực 40 và lớp học 35) đã áp dụng.
- Dữ liệu mẫu: 6 bài "Cẩm nang dành cho gia sư" (slug `gia-su-`).
- Sau phát hành: smoke chỉ đọc PASS; `PRAGMA foreign_key_check` 0 hàng; gia sư mẫu đăng nhập thấy tổng quan 3 lớp đã đăng ký / 10 lớp phù hợp / 3 lớp đã hoàn tất nhận, hồ sơ trả `customOptions`, hợp đồng mẫu đọc được; `/tutor`, `/tutor/profile`, `/tutor/cam-nang`, `/tutor/hop-dong-mau` trả 200.

## Danh sách gia sư được đề xuất và luồng danh sách yêu cầu ngày 2026-10-13

Commit `8c5b89b` được triển khai lên [Worker staging V2](https://tutor-matching-staging-v2.tutor-matching-platform.workers.dev), version `584634e9-4ce5-419e-b3a1-95fe03e80f06`. "Tìm kiếm gia sư" chỉ hiện danh sách yêu cầu với nút "+ Tạo yêu cầu tìm gia sư"; gửi xong quay về danh sách ở tab "Đang tìm gia sư" kèm thông báo. Chi tiết yêu cầu ở tab "Đã tìm được gia sư" hiện "Danh sách gia sư được đề xuất" (chỉ điểm trên 80, xếp giảm dần; không có thì hiện thông báo chưa có gia sư phù hợp), "Xem hồ sơ" và "Xác nhận thuê" qua hộp thoại. Khiếu nại đã gửi của người học đều hiện "Đã gửi".

- Trước phát hành: lint, typecheck, format, secret scan, build, Vitest **498/498**, Playwright **4/4**, `git diff --check` PASS.
- Remote: mốc Time Travel trước migration lưu ngoài Git; migration `0032` (đề xuất gia sư theo yêu cầu) đã áp dụng.
- Dữ liệu mẫu: thêm ba gia sư chỉ có hồ sơ (không đăng nhập) có ảnh; YC-D…07 có đề xuất 96/91/85 (76 bị ẩn), YC-D…08 đã thuê gia sư 93 điểm, YC-D…09 chỉ có đề xuất 72 điểm. Điểm là số mẫu cố định.
- Sau phát hành: smoke chỉ đọc PASS; `PRAGMA foreign_key_check` 0 hàng; người học mẫu thấy 2/3/3 yêu cầu theo tab, ba đề xuất của YC-D…07 trả ảnh 200; `/parent`, `/parent/request`, `/parent/khieu-nai` trả 200.

## Xác nhận thuê gia sư, cổng liên hệ và hồ sơ gia sư ngày 2026-10-13

Commit `5ff63b3` được triển khai lên [Worker staging V2](https://tutor-matching-staging-v2.tutor-matching-platform.workers.dev), version `c7d6cebd-c208-42c6-9d98-60f1ceb83bcc`. Trang "Tìm kiếm gia sư" hiện form tạo yêu cầu ngay đầu trang, ba tab theo giai đoạn (đang tìm, đã tìm được, đã xác nhận); người học xem hồ sơ, ảnh và độ phù hợp của gia sư được đề xuất rồi xác nhận thuê. Gia sư chỉ xem được liên hệ người học sau khi người học xác nhận thuê, gia sư xác nhận hợp đồng và kiểm duyệt viên ghi nhận đã thu phí môi giới (không có cổng thanh toán; đây là xác nhận thu ngoài hệ thống). Hồ sơ gia sư có trình độ, trường, chuyên môn, kinh nghiệm và ảnh đại diện lưu trong D1.

- Trước phát hành: lint, typecheck, format, secret scan, Vitest **490/490**, Playwright **4/4** (gồm xác nhận thuê, ghi nhận phí và mở liên hệ), `git diff --check` PASS.
- Remote: mốc Time Travel trước migration lưu ngoài Git; migration `0030` (xác nhận thuê, thông tin hồ sơ gia sư) và `0031` (phí môi giới, ảnh hồ sơ) đã áp dụng. Trước: 7 user, 12 yêu cầu, 11 lớp, 3 lần gán, 8 khiếu nại.
- Dữ liệu mẫu: gia sư mẫu có ảnh, trình độ, trường và ưu tiên dạy; một yêu cầu đã xác nhận có hợp đồng mẫu "Hợp đồng nhận lớp (mẫu)" đã xác nhận và phí đã thu, nên gia sư mẫu xem được liên hệ; yêu cầu còn lại ở "Đã tìm được gia sư" chờ người học xác nhận.
- Sau phát hành: smoke chỉ đọc **16/16** PASS; `PRAGMA foreign_key_check` 0 hàng; người học mẫu thấy 2/1/2 yêu cầu theo tab, độ phù hợp 100% và ảnh gia sư; liên hệ trả 200 cho lớp đủ ba bước, 404 cho lớp chưa đủ.

## Bảng giá, minh chứng khiếu nại và dữ liệu mẫu người học ngày 2026-10-12

Commit `776ea6f` được triển khai lên [Worker staging V2](https://tutor-matching-staging-v2.tutor-matching-platform.workers.dev), version `f0d2c51a-3e16-4290-bce5-b00e21c11dbb`. Trang "Bảng giá" của người học có thẻ theo đối tượng gia sư, bảng chi tiết theo Cấp 1/2/3, Năng khiếu, Ngoại ngữ và ghi chú học phí tham khảo; form khiếu nại nhận minh chứng (ảnh/PDF, tối đa 3 tệp 1,5 MB, chỉ khi chưa gửi); người đã đăng nhập mở trang khách được chuyển về trang tương ứng trong khu vực của mình.

- Trước phát hành: lint, typecheck, format, secret scan, Vitest **483/483**, Playwright **4/4** và `git diff --check` PASS; chuỗi dữ liệu mẫu đã chạy thử hai lần trên D1 local riêng có phí công bố.
- Remote: mốc Time Travel trước migration lưu ngoài Git; migration `0028` (bảng giá theo nhóm, xóa dòng giá mẫu theo môn) và `0029` (bảng minh chứng khiếu nại) đã áp dụng. Trước: 6 user, 6 yêu cầu, 6 lớp, 4 khiếu nại, 12 bản nội dung.
- Dữ liệu mẫu `seed:learner-demo:staging:v2`: người học mẫu có 6 yêu cầu (2 đang tìm gia sư, 2 đã gán gia sư với học phí đã chốt, 1 đã hoàn tất, 1 nháp), 8 khiếu nại (mỗi trạng thái 2, hai khiếu nại có ảnh minh chứng), 12 bài cẩm nang và 20 dòng bảng giá theo nhóm. Để có lớp đã gán, staging có thêm gia sư mẫu `gia-su-mau@example.test` (mật khẩu chỉ trong `.wrangler/sample-staging-v2/tutor-credentials.vars`) cùng bản "Điều khoản trách nhiệm gia sư (mẫu)" và bài kiểm tra mẫu, vì staging chưa có điều khoản được công bố. Toàn bộ là dữ liệu minh họa.
- Sau phát hành: smoke chỉ đọc **16/16** PASS; `PRAGMA foreign_key_check` 0 hàng; D1 có 7 user, 12 yêu cầu, 11 lớp, 8 khiếu nại, 2 tệp minh chứng; người học mẫu đăng nhập thấy đúng số yêu cầu theo tab và tải được danh sách minh chứng.

## Khu vực người học ngày 2026-10-12

Commit `16b883e` được triển khai lên [Worker staging V2](https://tutor-matching-staging-v2.tutor-matching-platform.workers.dev), version `9ddcf7a2-1ecc-458b-913e-6d1c5b0f9ae9`. Vai trò phụ huynh hiển thị là "Người học"; form yêu cầu mang tên "Tìm kiếm gia sư" và không còn khối thông báo chia sẻ (phiên bản đồng ý `2026-10-12-v3`); "Khiếu nại của tôi" có bản nháp riêng tư, sửa/gửi/xóa, thẻ trạng thái, tab và bộ lọc; "Cẩm nang dành cho người học" lọc theo danh mục và từ khóa; "Bảng giá" của người học hiển thị khoảng giá tham khảo theo đối tượng gia sư và theo môn.

- Trước phát hành: lint, typecheck, format, secret scan, Vitest **475/475**, Playwright **4/4** và `git diff --check` PASS; ảnh chụp các trang mới trên D1 local có dữ liệu mẫu đã được xem.
- Remote: mốc Time Travel trước migration lưu ngoài Git trong `.wrangler/`; migration `0025` (dựng lại bảng khiếu nại với trạng thái nháp), `0026` (danh mục, tác giả bài viết) và `0027` (bảng giá tham khảo người học) đã áp dụng. Trước: 5 user, 6 yêu cầu, 6 lớp, 0 khiếu nại, 6 bản nội dung.
- Dữ liệu mẫu `seed:learner-demo:staging:v2`: tài khoản `nguoi-hoc-mau@example.test` (mật khẩu chỉ trong `.wrangler/sample-staging-v2/learner-credentials.vars`), 4 khiếu nại ở bốn trạng thái, 6 bài cẩm nang có danh mục, 12 dòng giá theo đối tượng gia sư và 32 dòng theo môn. Giá và bài viết là dữ liệu minh họa, chưa phải nội dung được duyệt.
- Sau phát hành: smoke chỉ đọc **16/16** PASS; `PRAGMA foreign_key_check` 0 hàng; API bảng giá trả 44 dòng, lọc cẩm nang theo danh mục hoạt động; người học mẫu đăng nhập được và thấy đúng số khiếu nại theo trạng thái.

## Địa chỉ học Hà Nội và thời gian có thể học ngày 2026-10-12

Commit `bc9d03e` được triển khai lên [Worker staging V2](https://tutor-matching-staging-v2.tutor-matching-platform.workers.dev), version `689b7b4a-6c26-44d1-b498-8a87bdc40335`. Phụ huynh không còn mục "Khu vực phụ huynh"; form yêu cầu có Địa chỉ học (Hà Nội cố định, 126 phường/xã theo Nghị quyết 1656/NQ-UBTVQH15, địa chỉ cụ thể không bắt buộc, học online được để trống), "Thời gian có thể học" không giới hạn 14 khung và thông báo chia sẻ thay cho ô đồng ý (phiên bản `2026-10-12-v2`).

- Trước phát hành: lint, typecheck, format, secret scan, build staging V2, Vitest **463/463**, Playwright **4/4** và `git diff --check` PASS.
- Remote: mốc Time Travel trước migration lưu ngoài Git trong `.wrangler/`; migration `0024` thay trigger khung giờ (giữ kiểm tra chồng lấn, trần 168). Trước và sau: 5 user, 6 yêu cầu, 6 lớp, 14 khung giờ.
- Sau phát hành: smoke chỉ đọc **16/16** PASS; `PRAGMA foreign_key_check` 0 hàng; `/parent`, `/parent/request`, `/parent/dashboard` trả 200. Không tạo dữ liệu thử trên staging.

## Menu phụ huynh và form yêu cầu theo Figma ngày 2026-10-12

Commit `d61d9cf` được triển khai lên [Worker staging V2](https://tutor-matching-staging-v2.tutor-matching-platform.workers.dev), version `abb10452-e636-44c9-bf04-19238eb0265f`. Menu phụ huynh còn Tổng quan, Tìm kiếm gia sư, Bảng giá, Cẩm nang, Khiếu nại; trang Thuê Gia Sư có thẻ thống kê, tab trạng thái và bộ lọc; form yêu cầu theo export Figma.

- Trước phát hành: lint, typecheck, format, secret scan, build staging V2, Vitest **459/459**, Playwright **4/4** và `git diff --check` PASS.
- Remote: mốc Time Travel trước migration lưu ngoài Git trong `.wrangler/`; migration `0023` (họ tên học sinh riêng tư, cấp học, số buổi/tuần, yêu cầu gia sư, đặc điểm học sinh) đã áp dụng. Trước và sau: 4 user, 6 yêu cầu, 6 lớp; 6/6 yêu cầu cũ có cấp học suy ra từ lớp.
- Sau phát hành: smoke chỉ đọc **16/16** PASS; `PRAGMA foreign_key_check` 0 hàng; các route `/parent`, `/parent/request`, `/parent/cam-nang`, `/parent/bang-gia`, `/parent/dashboard` trả 200 và API danh sách yêu cầu trả 401 cho khách. Hành trình ghi đầy đủ được kiểm trên D1 local cô lập, không tạo dữ liệu thử trên staging.

## Tạo mới trên tài khoản Cloudflare hiện tại ngày 2026-10-12

Commit `7d3dd54` được triển khai lên [Worker staging V2](https://tutor-matching-staging-v2.tutor-matching-platform.workers.dev), version `5695d8be-6078-42f8-a88b-0a9d9aa9a06d`, `APP_ENV=staging`, trên tài khoản Cloudflare đang đăng nhập ở máy phát hành. Tài khoản này chưa có Worker/D1 V2 nên D1 `tutor-matching-staging-v2` được tạo mới ở APAC; ID không ghi vào Git. D1 `tutor-matching-staging` cũ có trên tài khoản không bị thay đổi.

- Trước phát hành: secret scan, lint, typecheck, format, build staging V2, Vitest **456/456** (`--maxWorkers=2`; chạy song song mặc định có test client timeout, chạy riêng PASS) và Playwright **4/4** trên D1 local cô lập PASS.
- Remote: migration `0001`–`0022` đã áp dụng; seed DEC-017 từ `.wrangler/sample-staging-v2/config.vars` (sao chép `.env.example`) xác nhận 3 phương án phí published, 6 lớp mẫu open, 6 mức học phí, 2 khoảng phí tham khảo và 1 admin mẫu. Bookmark D1 trước seed và mật khẩu admin mẫu chỉ nằm trong `.wrangler/` bị Git bỏ qua.
- Sau phát hành: smoke chỉ đọc PASS; `PRAGMA foreign_key_check` trả 0 hàng.

## Sửa header ngày 2026-10-12

Commit `24a1f80` đã được fast-forward và push lên `main`, rồi triển khai tới [Worker staging V2](https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev), version `5dc5377c-b91f-4b33-be02-8c52c73a8fdd`. Menu công khai gom hai danh sách lớp dưới “Lớp học”; menu phụ huynh gom các tác vụ lớp; tài khoản đăng nhập dùng một menu gọn. Các nhãn điều hướng giữ một dòng và dropdown không đẩy chiều cao header ở desktop. Menu di động có lối vào “Lớp tìm học viên”.

- Trước phát hành: lint, typecheck, format, secret scan, `git diff --check`, build staging V2, Vitest **456/456** và Playwright **4/4** PASS. Kiểm thử header tại 320, 375, 768, 1024, 1280, 1440 và 1600 px cho khách và ba vai trò; kiểm tra mở menu bằng bàn phím và không tràn ngang.
- Sau phát hành: smoke chỉ đọc **16/16** PASS. Chromium trên URL thật ở 320 và 1280 px xác nhận menu tải được; sau khi phiên khách tải xong tại 1280 px, sáu mục desktop cùng một hàng, header cao 76 px và không tràn ngang.
- Không có migration hoặc seed trong đợt này. Staging cũ và production không được thay đổi.

## Phát hành ngày 2026-10-12

Commit `379c117` đã được fast-forward và push lên `main`, rồi triển khai tới [Worker staging V2](https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev), version `66531983-7f0a-419c-8a25-cbf035a2efb2`, với `APP_ENV=staging`. D1 V2 đã áp dụng migration `0016`–`0022`; danh sách migration từ xa không còn mục chờ. Mốc Time Travel và bản export SQL trước migration được giữ ngoài Git trên máy phát hành, không chứa trong tài liệu này.

- Trước phát hành: lint, typecheck, format, secret scan, build staging V2, Vitest **456/456**, kiểm thử race tập trung **9/9** sau chỉnh sửa cuối, Playwright **2/2** và migration `0001`–`0022` trên D1 local cô lập PASS; kiểm tra khóa ngoại local không có lỗi.
- Sau phát hành: smoke chỉ đọc **16/16** PASS; `/tutor/matched-classes` trả 200 và API gợi ý trả 401 cho khách chưa đăng nhập; `PRAGMA foreign_key_check` trên D1 V2 trả 0 hàng. D1 có 5 user, 6 yêu cầu, 6 lớp, 3 phương án phí, 6 mức học phí và 2 khoảng phí tham khảo đã công bố; không có đơn ứng tuyển. Script seed staging đã chạy lại và xác nhận các bản mẫu hiện có, không nhân đôi lớp/phương án phí.
- Worker và D1 staging cũ, cũng như production, không được thay đổi. Smoke từ xa không thay thế hành trình ghi; luồng ứng tuyển và popup cập nhật hồ sơ được kiểm trên Worker/D1 local cô lập.

## Học phí đã chốt theo lớp ngày 2026-10-12 — lịch sử trước phát hành

Mã nguồn bổ sung migration `0017`: kiểm duyệt viên bắt buộc nhập học phí đã chốt theo buổi khi gán gia sư; D1 lưu theo từng lần gán và hợp đồng mới giữ snapshot khi phát hành. Assignment cũ chưa xác minh giữ `NULL`, có thể được kiểm duyệt viên ghi một lần khi còn hiệu lực và trước hợp đồng. Migration này đã được phát hành trong đợt ghi ở trên.

## Thay đổi bảng giá ngày 2026-10-12 — lịch sử trước phát hành

Mã nguồn đã bổ sung hai bảng D1 cho học phí theo buổi và khoảng phí nhận lớp tham khảo. Hai mảng trong `.env.example` là nguồn nạp dữ liệu mẫu; migration `0016` và seed staging trong đợt phát hành ở trên đã lưu sáu mức học phí và hai khoảng phí trong D1. Các lớp và ngân sách dự kiến của từng lớp đã nằm trong D1 từ lần phát hành trước.

## Cập nhật dữ liệu mẫu staging V2 ngày 2026-10-11 — lịch sử

Trước đợt phát hành 2026-10-12, [Worker staging V2](https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev) chạy version `5c1ec5a7-6809-4579-9e0c-c6a9d72bf6ee` với `APP_ENV=staging`, sau đó seed từ cấu hình riêng bị Git bỏ qua tại `.wrangler/sample-staging-v2/config.vars`. D1 V2 có **3 phương án phí published**, **6 yêu cầu sourcing** từ phụ huynh tổng hợp và **6 lớp open**. API công khai trả 6 lớp và 3 phương án phí; `PRAGMA foreign_key_check` trả 0 lỗi. Tài khoản kiểm duyệt viên mẫu là `staging-admin@example.test`; mật khẩu ngẫu nhiên chỉ ở `.wrangler/sample-staging-v2/credentials.vars` bị Git bỏ qua, không có trong Worker vars hay tài liệu. Bookmark D1 trước seed được lưu ở `.wrangler/sample-staging-v2/`.

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
4. Chạy `npm run smoke -- https://tutor-matching-staging-v2.tutor-matching-platform.workers.dev`, kiểm tra migration, binding, health và trạng thái dữ liệu từ xa. Smoke là kiểm tra chỉ đọc; hành trình ghi được kiểm bằng E2E trên D1 local. Ghi kết quả mới cho từng lần phát hành.

Staging cũ `tutor-matching-staging` thuộc lịch sử MVP và lần kiểm tra trước không hiện trong tài khoản Wrangler. Tài nguyên đó tách khỏi V2. Production cần quyết định phát hành riêng.

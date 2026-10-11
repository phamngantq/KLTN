# Rollback runbook — Worker và D1

> Áp dụng cho bản sản phẩm `./figma` sau khi đã phát hành migration 0007–0015. Staging cũ ghi lịch sử MVP; Worker `preview` chỉ đọc là môi trường riêng. Cập nhật runbook này không thực hiện rollback, migration hay deploy.

## Khi nào dừng rollout

Dừng mutation/deploy tiếp và ghi incident nếu smoke đọc sau deploy lỗi, 5xx tăng, API gán/rút/hoàn tất tạo trạng thái không nhất quán, contact lộ sai quyền, xóa tài khoản không chặn nghĩa vụ hoặc không ẩn danh, booking cũ mất khả năng đọc/xử lý, hay dữ liệu D1 sai. Ghi môi trường, commit, Worker version, migration, thời điểm, request ID, số lượng bản ghi bị ảnh hưởng; không ghi contact, token hoặc nội dung khiếu nại.

## 1. Rollback Worker trước khi đụng D1

Kiểm tra version tốt gần nhất, schema và trạng thái D1 hiện tại trước khi chuyển code. Migration 0007–0015 thêm bảng/triggers, seed nội dung và đổi index/gate ứng tuyển; 0014 lưu lý do hủy lớp, 0015 cho phép ẩn lý do sau tombstone và backfill dữ liệu lịch sử của tài khoản đã xóa. Version cũ chỉ an toàn nếu đã kiểm thử với schema **và dữ liệu sau migration**, gồm lớp đã rút gán/hoàn tất/hủy, lý do đã ẩn danh và tombstone xóa tài khoản. Nếu chưa chứng minh tương thích, chuẩn bị hotfix forward thay vì rollback mù.

```bash
npx wrangler deployments list --env <env>
npx wrangler rollback <version-id> --env <env> --message "rollback: <lý do>"
npm run smoke -- https://<worker>.<subdomain>.workers.dev
```

`npm run smoke` là kiểm tra **chỉ đọc** cho SPA/public API/headers/anonymous RBAC; nó không thử mutation. Sau rollback, đọc các truy vấn toàn vẹn trong [OPERATIONS.md](OPERATIONS.md), so Worker binding/APP_ENV, theo dõi 5xx và kiểm thử mutation trên bản sao D1 local trước khi mở ghi lại. Static assets đi cùng Worker version; xác minh SPA sau rollback. Không dùng smoke MVP lịch sử làm bằng chứng.

## 2. Xác định lỗi code hay dữ liệu

- **Lỗi code/UI với D1 còn nhất quán:** rollback Worker đã kiểm tương thích hoặc deploy hotfix; giữ nguyên D1.
- **Migration chưa áp dụng đủ:** đối chiếu `npx wrangler d1 migrations list DB --env <env> --remote`, source và Worker version. Không chạy migration remote bổ sung khi chưa biết nó an toàn với code đang phục vụ.
- **Dữ liệu đã hỏng:** chuẩn bị kế hoạch Time Travel/backup, xác định mọi ghi sau bookmark và tác động quyền riêng tư trước khi khôi phục. Ưu tiên sửa forward có truy vết khi có thể.

Kiểm tra cụ thể:

| Miền | Sau rollback/hotfix phải đúng |
|---|---|
| Request/lớp/gán | Lớp active có đúng một gán active; rút gán mở lại lớp và request về sourcing; hoàn tất có lý do và request fulfilled; hủy lớp `open` chưa gán đóng cả lớp/yêu cầu với lý do, từ chối đơn `submitted` nhưng giữ lịch sử |
| Contact | Chỉ tutor có gán active trên lớp active đọc được; tutor cũ mất quyền ngay khi rút gán |
| Quiz/fee | Gia sư không thể ứng tuyển nếu thiếu quiz đạt + acknowledgement hoặc ba option đã publish/hợp lệ; fee version lịch sử giữ nguyên |
| Khiếu nại/xóa tài khoản | Ownership vẫn enforced; tombstone không tái kích hoạt, credential/contact không khôi phục nhầm |
| Booking cũ | GET/action hợp lệ còn chạy; POST mới trả 410; claim mồ côi bằng 0 |
| Báo cáo | Không hiện doanh thu giả; số liệu từ D1 và range/timezone đúng |

## 3. Phục hồi D1 bằng Time Travel khi thật sự cần

**Time Travel đưa toàn bộ D1 về mốc cũ và làm mất mọi ghi sau mốc đó.** Với account deletion, snapshot cũ có thể chứa contact/credential, lý do lifecycle/cancellation, rejection reason, khiếu nại và audit metadata đã được ẩn danh bởi 0015; không khôi phục nó để phục vụ người dùng nếu chưa có kế hoạch tái ẩn danh và vô hiệu hóa session. Ghi rõ ai phê duyệt, cách bảo toàn/đối soát dữ liệu phát sinh và cách kiểm lại yêu cầu xóa.

Trong phiên incident được phép, tạm dừng ghi, kiểm tra bookmark/khả năng phục hồi, sao lưu trạng thái hiện tại ở nơi bảo vệ trước khi restore. Các lệnh tham khảo:

```bash
npx wrangler d1 time-travel info DB --env <env> --timestamp "<UTC>"
npx wrangler d1 time-travel restore DB --env <env> --bookmark <bookmark>
npx wrangler d1 migrations list DB --env <env> --remote
npm run smoke -- https://<worker>.<subdomain>.workers.dev
```

Sau restore, áp dụng lại các thao tác ẩn danh/xóa tài khoản bắt buộc theo incident plan trước khi mở traffic; nếu phục hồi về trước 0015, review migration/backfill 0015 trên **bản sao D1 local** rồi áp dụng có kiểm soát. Kiểm tra FK, lớp/gán/event, booking claims, báo cáo và trạng thái công bố nội dung/phí. Không giả định retention Time Travel theo số ngày cố định: kiểm tra bằng `time-travel info` trên tài khoản thực. Nếu dùng bản export, import vào D1 mới và đổi binding chỉ sau review riêng.

## 4. Migration lỗi

Không sửa file migration đã chạy từ xa. Xác định migration nào đã áp dụng, schema thực tế và dữ liệu đang phục vụ, rồi tạo migration sửa lỗi mới hoặc khôi phục theo §3. Chạy `npm run db:migrate:local`, xác minh 0014/0015 không còn pending, `class_cancellations`/triggers có mặt và backfill 0015 đã được thử trên fixture tombstone cũ theo [DEPLOYMENT.md](DEPLOYMENT.md) §3. Chạy Vitest integration cho cancel/revoke/complete/privacy và Playwright cho hành trình ba actor trước lần thử tiếp. Không tự xóa bảng, trigger, fee version, content revision hoặc lịch sử lớp để đạt smoke.

## 5. Kết thúc incident

Ghi nguyên nhân, version trước/sau, migration/bookmark, kết quả smoke chỉ đọc, E2E local và truy vấn toàn vẹn. Xác nhận contact bị cắt sau rút gán, hủy lớp chưa gán không để yêu cầu mở, tombstone vẫn ẩn danh, GET/action booking cũ và POST 410. Chỉ tiếp tục phát hành khi [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) qua lại các cổng bắt buộc.

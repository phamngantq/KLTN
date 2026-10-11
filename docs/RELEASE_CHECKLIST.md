# Release checklist — sản phẩm gia sư theo `./figma`

> Checklist này dành cho bản có phụ huynh, gia sư và kiểm duyệt viên theo DEC-007/009/012–014. Lịch sử deploy MVP và Worker `preview` chỉ đọc không xác nhận cổng nào dưới đây đã đạt. Ghi bằng chứng của từng lần phát hành; mục ⛔ chưa đạt thì dừng.

**Commit:** `____________` · **Môi trường/URL:** `____________` · **Người phát hành/ngày:** `____________` · **Worker version:** `____________`

## A. Source, quyền và dữ liệu trước phát hành

- [ ] ⛔ TASK-19–30 trong [TASKS.md](../TASKS.md) đạt acceptance criteria và có commit; các UI/action quan trọng dùng API/D1 thật, không dùng mock auth/role, dữ liệu cá nhân mẫu hoặc toast thành công giả.
- [ ] ⛔ Đã chọn đúng tài khoản Cloudflare, Worker và D1 mục tiêu qua `npx wrangler whoami`, deployments list, D1 list và binding. Staging cũ không thấy trong tài khoản hiện tại thì không ghi vào nó; môi trường mới chỉ tạo/chọn khi được cho phép và có kế hoạch dữ liệu.
- [ ] ⛔ Kiểm kê số lượng `users`, `bookings`, `booking_slot_claims`, `parent_requests` và bảng mới; không đưa PII/ID tài khoản vào release log. Giữ ID, FK và booking lịch sử.
- [ ] ⛔ Review migration 0007–0015 theo [DEPLOYMENT.md](DEPLOYMENT.md) §3; so với migration remote, chạy D1 local, đánh giá schema mới với code rollback, ghi bookmark Time Travel ngoài Git. Có bản export bảo vệ khi D1 chứa dữ liệu thật.
- [ ] Không có secret, token, database/account ID hoặc PII mẫu trong staged diff; chạy `npm run secret-scan`, `git diff --cached --check` và rà provenance/license của file lấy từ `./figma`.
- [ ] Chốt quyền triển khai remote cho lượt phát hành này. Tài liệu/commit local tự nó không cấp quyền push, remote migration hoặc deploy.

## B. Chính sách và hành trình bắt buộc

- [ ] ⛔ Ba actor dùng RBAC server: `student → parent`, `tutor → tutor`, `admin → moderator`; không self-register kiểm duyệt viên, không đổi user ID/lịch sử.
- [ ] ⛔ Phụ huynh xác nhận consent trước submit; contact chỉ owner/moderator xem trước gán và chỉ tutor được gán xem sau commit. Rút gán cắt quyền tutor cũ ngay; public class DTO không chứa contact/học sinh.
- [ ] ⛔ Luồng yêu cầu → lớp công khai → ứng tuyển → gán active ngay; moderator có thể rút gán với lý do để mở lớp lại, hoặc hoàn tất lớp với lý do. Hủy lớp `open`/request `sourcing` chưa gán cần lý do, đóng cả hai, từ chối các đơn `submitted` nhưng giữ lịch sử; lớp `active` phải rút gán trước, lớp `draft` không dùng action hủy. Stale/duplicate/concurrent action trả 409 và không tạo bản ghi mồ côi; lịch sử ứng tuyển, fee version và hợp đồng vẫn đối soát được.
- [ ] ⛔ Moderator công bố đủ ba loại option phí với giá trị/hiệu lực cụ thể theo chính sách duyệt: tỷ lệ buổi đầu, số buổi kèm đặt cọc, tỷ lệ tháng. Gia sư đã duyệt phải đạt quiz và xác nhận điều khoản phiên bản đang công bố **trước** ứng tuyển, rồi chọn một option hợp lệ. Thiếu bất kỳ gate nào thì không mở ứng tuyển.
- [ ] ⛔ Phụ huynh miễn phí dịch vụ tìm gia sư; nội dung liên hệ công khai dùng bộ Hà Nội đã duyệt. Không seed giá, tài khoản ngân hàng, điều khoản/hợp đồng, testimonial hoặc chứng từ từ mock export. Hợp đồng chỉ được phát hành sau khi nội dung được duyệt.
- [ ] ⛔ Khiếu nại chỉ owner/moderator được xem và xử lý theo state machine. Xóa tài khoản bị chặn 409 khi còn booking `PENDING/CONFIRMED` hoặc yêu cầu/lớp/ứng tuyển/gán đang xử lý; khi đủ điều kiện, xóa credential/session/contact, ẩn danh PII, giữ ID/lịch sử không PII, không tái kích hoạt tombstone.
- [ ] ⛔ Báo cáo/dashboard tính từ D1 theo range/timezone/role, có trạng thái dữ liệu trống và PDF/print với số liệu kiểm được. Doanh thu hiển thị unavailable đến khi có nguồn thanh toán đã xác minh; không suy tiền từ lựa chọn phí.
- [ ] ⛔ `POST /api/v1/bookings` trả 410; participant vẫn GET/xử lý booking cũ hợp lệ. Không tạo lịch đặt mới từ lớp mới.
- [ ] Các hành động payment, email, upload giấy tờ/đính kèm, review/rating hoặc matching thông minh chưa có dịch vụ/chính sách phải ở trạng thái hoãn trung thực, không báo thành công.

## C. Cổng kỹ thuật local

```bash
npm ci
npm run db:migrate:local
npm run secret-scan
npm run format:check
npm run lint
npm run typecheck
npx vitest run
npm run build:staging:v2
npm run e2e
git diff --check
```

- [ ] ⛔ Tất cả lệnh trên PASS. Nếu Playwright/Wrangler dev E2E bị sandbox chặn, ghi lệnh, lỗi và môi trường chạy lại; không đánh dấu PASS từ unit test. `npm run test -- --run` không tương thích với npm hiện dùng nên dùng `npx vitest run`.
- [ ] ⛔ D1 local đã áp dụng 0014: `npx wrangler d1 migrations list DB --local` không còn 0014 pending; `class_cancellations` và trigger kiểm hợp lệ/lịch sử tồn tại; `PRAGMA foreign_key_check` không trả hàng. Integration test kiểm cancel open/sourcing đồng bộ và 409 cho draft/active/terminal.
- [ ] ⛔ D1 local đã áp dụng 0015: không còn 0015 pending; test fixture có tombstone **trước** 0015 xác minh backfill lý do lifecycle/cancellation, rejection reason, complaint text và audit metadata; ID/actor/status/time giữ nguyên. Test redaction sau tombstone và trigger chặn sửa lịch sử khác PASS. Ghi kế hoạch xử lý PII nếu Time Travel phải quay về trước 0015.
- [ ] ⛔ `npm run e2e` hiện có một hành trình Playwright trên Worker build + D1 local cô lập: parent consent/request → moderator publish/assign → tutor quiz/fee/apply/contact/contract, public/outsider contact isolation, booking POST 410, dashboard/PDF, responsive 320/768/1280 px và skip link. Harness `scripts/e2e-serve.mjs` chạy Wrangler dev, không dùng Vite preview hay D1 remote. Không claim pixel fidelity khi chưa đối chiếu frame Figma Make gốc.
- [ ] ⛔ `npx vitest run` integration bao phủ các action ngoài Playwright: revoke/complete/cancel, complaint/deletion, booking lịch sử, stale/race 409, auth/ownership/CSRF, report range/role. Ghi kết quả từng suite; smoke remote chỉ đọc không thay thế các test local này.

## D. Mutation remote và xác minh sau phát hành

- [ ] Đã ghi bookmark/backup và đường rollback; migration remote chỉ áp dụng sau A–C và quyền phát hành, rồi build lại đúng env trước deploy. Ghi phiên bản migration, Worker, bindings `DB`/limiters/`APP_ENV` và URL thực tế.
- [ ] ⛔ `npm run smoke -- <url>` PASS trên URL vừa deploy: SPA, health/headers, public classes không lộ contact, content/fee API và anonymous bị từ chối ở dashboard. Script không ghi D1; đối chiếu riêng kết quả E2E local cho mutation.
- [ ] ⛔ Truy vấn toàn vẹn ở [OPERATIONS.md](OPERATIONS.md) PASS, so sánh số lượng bản ghi trước/sau và dọn đúng dữ liệu thử. `wrangler tail` không thấy 5xx bất thường trong thời gian theo dõi đã ghi.
- [ ] Nếu gate sau deploy lỗi, ghi quyết định và thực hiện [ROLLBACK.md](ROLLBACK.md). Không phục hồi D1 chỉ vì lỗi UI/code.

## E. Production bổ sung

- [ ] ⛔ Staging của **bản sản phẩm mới** đã chạy đủ hành trình và có bằng chứng; preview chỉ đọc và smoke MVP không thay thế.
- [ ] ⛔ Product owner phê duyệt production theo DEC-002, chính sách mức phí/điều khoản/hợp đồng và giới hạn dữ liệu đã được công bố đúng. Tích hợp tiền/email/upload chỉ mở nếu dịch vụ và policy riêng được cung cấp, kiểm thử.
- [ ] ⛔ Backup D1 production được bảo vệ, bookmark phục hồi ghi ngoài Git, phương án xử lý dữ liệu phát sinh sau bookmark và người quyết định rollback đã rõ.
- [ ] Visual QA so với code export có bằng chứng; frame Figma Make gốc chưa xác minh thì ghi sai khác trong [FIGMA_GAP_LOG.md](../FIGMA_GAP_LOG.md), không tuyên bố pixel-perfect.

**Trạng thái đã biết ngày 2026-10-11:** Staging MVP cũ trả health 200 nhưng Worker/D1 không hiện trong tài khoản Wrangler ở lần kiểm tra cuối. Bản UI từ commit `84265ce` đã deploy lên staging V2: local 50 file/400 test, E2E 1/1, smoke remote 16/16 PASS, D1 sau deploy giữ 2 user giả lập và 0 yêu cầu/booking/lớp. Chưa có tài khoản kiểm duyệt viên vận hành; các mức phí và nội dung điều khoản/hợp đồng chưa được công bố, nên ứng tuyển vẫn bị chặn đúng gate. Xem [PREVIEW_STAGING.md](PREVIEW_STAGING.md) để biết giới hạn xác minh; các checkbox trên vẫn là cổng cho lần phát hành đầy đủ tiếp theo và production.

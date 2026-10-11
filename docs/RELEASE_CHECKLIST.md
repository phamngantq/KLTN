# Release checklist

> Các mục A–D kế thừa quy trình MVP đặt lịch TASK-01–18. Mục tiêu `./figma` theo DEC-007 phải qua thêm toàn bộ mục **E** trước khi phát hành staging hoặc production. Staging đang chạy chưa phải bản sản phẩm mới.

Bản `preview` riêng có dữ liệu tổng hợp và API chỉ đọc theo [PREVIEW_STAGING.md](PREVIEW_STAGING.md); đây không phải lần phát hành staging/production của sản phẩm mới và không đánh dấu mục E hoàn thành.

Điền cho mỗi lần phát hành. Mục có ⛔ là **cổng dừng**: chưa đạt thì không deploy.

**Phiên bản / commit:** `____________` **Môi trường:** staging / production **Người phát hành:** ________ **Ngày:** ________

## A. Trước khi deploy

- [ ] ⛔ CI xanh hoặc chạy tay: `secret-scan`, `format:check`, `lint`, `typecheck`, `test -- --run`, `e2e`.
- [ ] ⛔ `npx wrangler whoami` đúng tài khoản; đúng `--env`.
- [ ] ⛔ Review migration mới (DEPLOYMENT §3): tương thích ngược, không sửa file cũ, đã chạy được trên D1 local và staging.
- [ ] ⛔ Ghi bookmark Time Travel: `wrangler d1 time-travel info DB --env <env>` → `____________`.
- [ ] Production: export backup (`wrangler d1 export`), lưu nơi có kiểm soát.
- [ ] Không có secret/ID trong git (`npm run secret-scan`); secret cần thiết đã đặt bằng `wrangler secret put`.
- [ ] Ghi chú thay đổi cho người dùng (nếu có thay đổi hành vi đặt lịch/chính sách hủy).

## B. Deploy

- [ ] `npm run db:migrate:<env>` — kết quả: ________
- [ ] `npm run deploy:<env>` — Version ID: ________; bindings hiển thị đúng D1/limiters/APP_ENV.

## C. Sau deploy

- [ ] ⛔ Smoke đúng **phiên bản sản phẩm được phát hành** xanh và đã dọn dữ liệu thử. `npm run smoke` hiện kiểm tra booking cũ; trước phát hành `./figma` phải cập nhật script để phủ luồng mới.
- [ ] Header bảo mật trên `/` và `/api/v1/health` (CSP, X-Frame-Options, HSTS).
- [ ] `wrangler tail` 10 phút: không có 5xx bất thường.
- [ ] Truy vấn toàn vẹn (OPERATIONS.md): claim mồ côi = 0, claim của booking đã đóng = 0.

## D. Rollback nếu cần

Tiêu chí và lệnh: [ROLLBACK.md](ROLLBACK.md). Ghi lại quyết định ở đây: ________

## E. Cổng riêng cho sản phẩm `./figma` trên staging

- [ ] ⛔ TASK-19–30 đạt acceptance criteria; export chỉ dùng làm nguồn UI, còn ứng dụng triển khai có API/D1 thật cho request, lớp, ứng tuyển, gán và nhận lớp. Ghi commit phát hành: `____________`.
- [ ] ⛔ FIG-013–020 và policy về trạng thái, phí/hợp đồng, PII/hồ sơ học sinh, giấy tờ gia sư đã được quyết định và backend enforce. Không có role/client auth, dữ liệu mẫu, thanh toán/email thành công giả hoặc CTA quan trọng dẫn placeholder.
- [ ] ⛔ Đúng tài khoản Cloudflare có thể **đọc cả Worker và D1 staging hiện hữu**; đối chiếu tên tài nguyên, migration remote, bindings. Nếu thiếu một tài nguyên, dừng; không tạo bản trùng ở tài khoản khác.
- [ ] ⛔ Kiểm kê số lượng bản ghi staging hiện có, ghi riêng không chứa PII; bảo toàn booking và dữ liệu cũ. Có bookmark Time Travel và bản export được bảo vệ khi staging có dữ liệu người dùng. Ghi nơi lưu bản sao/record: `____________`.
- [ ] ⛔ Migration mới tương thích với dữ liệu cũ, chạy trên D1 local, được review và có phương án rollback; chỉ áp dụng remote khi các gate trước đã đạt.
- [ ] ⛔ `secret-scan`, `format:check`, `lint`, `typecheck`, `test -- --run`, `build:staging`, `e2e` đều xanh. E2E gồm public → phụ huynh → admin → gia sư → lớp, RBAC/ownership/CSRF, cạnh tranh/idempotency, responsive và keyboard.
- [ ] ⛔ Smoke staging mới xanh sau deploy; so sánh số lượng dữ liệu trước/sau, kiểm tra PII/role/CSRF, lỗi 409, security headers và log 5xx; dọn dữ liệu thử có kiểm soát.
- [ ] Git: stage đường dẫn cụ thể, rà license/PII/secret trong `./figma`, `git diff --cached --check`, commit và push nhánh đã review, không force-push. Ghi commit/remote branch: `____________`.

**Kiểm tra chỉ đọc 2026-10-11:** endpoint health staging trả HTTP 200, nhưng tài khoản Wrangler trong phiên kiểm tra không tìm thấy Worker/D1 staging. Không xác định được số bản ghi hiện tại. Cổng tài khoản và kiểm kê dữ liệu ở trên đang **chưa đạt**.

## Điều kiện riêng cho production (lần đầu)

- [ ] ⛔ Mục tiêu `./figma`: TASK-19–30 đạt theo `TASKS.md`; luồng phụ huynh → admin → gia sư → lớp chạy với API/D1 thật. Staging TASK-01–18 không đáp ứng gate này.
- [ ] ⛔ Không còn auth/role từ `localStorage`, mock PII/số liệu, thông báo thanh toán/email thành công giả hoặc CTA quan trọng dẫn placeholder.
- [ ] ⛔ Chính sách trạng thái lớp, phí/hợp đồng, dữ liệu học sinh và giấy tờ gia sư đã được duyệt; backend enforce quyền và audit.
- [ ] ⛔ Product owner phê duyệt phát hành production (DEC-002).
- [ ] ⛔ Thiết kế: code export đã có, frame Figma Make chưa xác minh hoàn toàn (FIG-001) — đối chiếu visual hoặc product owner chấp nhận sai khác theo DESIGN_RULES §H3.
- [ ] ⛔ Chốt FIG-013–020 cho request, lớp, phí/hợp đồng, hồ sơ và dữ liệu cá nhân của mục tiêu mới. DEC-003–006 chỉ ghi nhận chính sách MVP cũ, không tự áp dụng cho luồng `./figma`.
- [ ] Quyết định về email xác minh / quên mật khẩu (chưa có dịch vụ email).
- [ ] Tên miền riêng (tùy chọn) + cập nhật `routes` trong `wrangler.jsonc`; kiểm tra cookie `__Host-` trên domain mới.

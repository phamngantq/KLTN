# Release checklist

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

- [ ] ⛔ `npm run smoke -- <url>` xanh (staging: kèm `--admin-*` cho luồng đầy đủ) và đã dọn dữ liệu smoke.
- [ ] Header bảo mật trên `/` và `/api/v1/health` (CSP, X-Frame-Options, HSTS).
- [ ] `wrangler tail` 10 phút: không có 5xx bất thường.
- [ ] Truy vấn toàn vẹn (OPERATIONS.md): claim mồ côi = 0, claim của booking đã đóng = 0.

## D. Rollback nếu cần

Tiêu chí và lệnh: [ROLLBACK.md](ROLLBACK.md). Ghi lại quyết định ở đây: ________

## Điều kiện riêng cho production (lần đầu)

- [ ] ⛔ Product owner phê duyệt phát hành production (DEC-002).
- [ ] ⛔ Thiết kế: Figma vẫn chưa xác minh (FIG-001) — chấp nhận UI tạm thời **hoặc** hoàn tất đối chiếu theo DESIGN_RULES §H3.
- [ ] ⛔ Chốt các quyết định tạm: DEC-003…DEC-006 (giá theo bội 1.000 ₫, chính sách hủy, sửa hồ sơ đã duyệt).
- [ ] Quyết định về email xác minh / quên mật khẩu (chưa có dịch vụ email).
- [ ] Tên miền riêng (tùy chọn) + cập nhật `routes` trong `wrangler.jsonc`; kiểm tra cookie `__Host-` trên domain mới.

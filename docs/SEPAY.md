# Thanh toán phí nhận lớp qua VietQR + SePay

Luồng: gia sư bấm **Hoàn tất nhận lớp** → tích đồng ý hợp đồng → mã VietQR hiện ra → gia sư
chuyển khoản → tiền vào tài khoản trung tâm → SePay gọi webhook → hệ thống lưu giao dịch, đối
chiếu mã lớp và số tiền → ghi nhận đã thu phí → lớp chuyển sang **Lớp đã hoàn tất** và màn hình
của gia sư hiện **Thanh toán thành công** (tự kiểm tra mỗi 5 giây).

## 1. Biến cấu hình của Worker (đặt bằng `wrangler secret put`, không ghi vào repo)

| Biến | Ý nghĩa |
|---|---|
| `PAYMENT_BANK_BIN` | Mã BIN NAPAS 6 số của ngân hàng nhận tiền (ví dụ Vietcombank `970436`) |
| `PAYMENT_BANK_NAME` | Tên ngân hàng hiển thị cho gia sư |
| `PAYMENT_ACCOUNT_NUMBER` | Số tài khoản nhận tiền (đã liên kết với SePay) |
| `PAYMENT_ACCOUNT_NAME` | Tên chủ tài khoản, IN HOA không dấu |
| `SEPAY_WEBHOOK_API_KEY` | API key dùng để xác thực webhook SePay (tự tạo chuỗi ngẫu nhiên dài) |

```
npx wrangler secret put PAYMENT_BANK_BIN --env staging_v2
npx wrangler secret put PAYMENT_BANK_NAME --env staging_v2
npx wrangler secret put PAYMENT_ACCOUNT_NUMBER --env staging_v2
npx wrangler secret put PAYMENT_ACCOUNT_NAME --env staging_v2
npx wrangler secret put SEPAY_WEBHOOK_API_KEY --env staging_v2
```

Khi chưa có `SEPAY_WEBHOOK_API_KEY`, hệ thống giữ luồng cũ: gia sư bấm "Tôi đã chuyển khoản" và
kiểm duyệt viên ghi nhận phí sau khi đối soát.

## 2. Cấu hình trên SePay (my.sepay.vn)

1. Liên kết tài khoản ngân hàng nhận phí (đúng `PAYMENT_ACCOUNT_NUMBER`).
2. **Cấu hình công ty → Cấu trúc mã thanh toán**: thêm tiền tố `PNL` để SePay nhận diện mã.
3. **Tích hợp Webhooks → Thêm webhook**:
   - Sự kiện: *Có tiền vào*.
   - URL: `https://<tên-miền>/api/v1/payments/sepay/webhook`
   - Kiểu chứng thực: *API Key*, giá trị bằng `SEPAY_WEBHOOK_API_KEY` (SePay gửi header
     `Authorization: Apikey <key>`).
   - Bật "Bỏ qua nếu không có mã thanh toán" nếu chỉ muốn nhận giao dịch có mã `PNL…`.

## 3. Mã thanh toán và đối chiếu

- Nội dung chuyển khoản của mỗi lớp: `PNL` + mã lớp bỏ dấu gạch, ví dụ lớp `LH-D0000000000B`
  → `PNLLHD0000000000B`. Ngân hàng có thêm chữ trước/sau mã vẫn khớp.
- Giao dịch được lưu đúng một lần theo mã giao dịch SePay (SePay gửi lại cũng không trùng) và
  không thể sửa hay xóa. Xem tại **Quản trị → Giao dịch thanh toán**.

| Trạng thái | Ý nghĩa | Xử lý |
|---|---|---|
| Đã xác nhận phí nhận lớp | Đúng mã, đủ tiền, lớp đủ điều kiện | Tự động hoàn tất nhận lớp |
| Thiếu tiền | Số tiền nhỏ hơn phí nhận lớp | Liên hệ gia sư; ghi nhận tay tại "Hợp đồng lớp" khi đủ |
| Lớp chưa đủ điều kiện | Người học chưa xác nhận thuê hoặc hợp đồng chưa xác nhận | Hoàn tất điều kiện rồi ghi nhận tay |
| Lớp đã thanh toán trước đó | Chuyển trùng | Hoàn tiền cho gia sư nếu cần |
| Không khớp mã lớp | Nội dung không có mã `PNL…` hợp lệ | Đối chiếu thủ công |

## 4. Kiểm thử

Trên my.sepay.vn có công cụ *Giả lập giao dịch* để gửi một giao dịch tiền vào với nội dung
`PNL…` của một lớp đang chờ thanh toán (người học đã xác nhận, gia sư đã đồng ý hợp đồng). Lớp
phải chuyển sang "Lớp đã hoàn tất" và giao dịch hiện ở "Giao dịch thanh toán".

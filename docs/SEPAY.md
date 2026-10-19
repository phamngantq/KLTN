# Thanh toán phí nhận lớp qua VietQR + SePay

Luồng: gia sư bấm **Hoàn tất nhận lớp** → tích đồng ý hợp đồng → mã VietQR hiện ra → gia sư
chuyển khoản → tiền vào tài khoản trung tâm → SePay gọi webhook → hệ thống lưu giao dịch, đối
chiếu mã lớp và số tiền → ghi nhận đã thu phí → lớp chuyển sang **Lớp đã hoàn tất** và màn hình
của gia sư hiện **Thanh toán thành công** (tự kiểm tra mỗi 5 giây).

## 1. Biến cấu hình của Worker (đặt bằng `wrangler secret put`, không ghi vào repo)

| Biến | Ý nghĩa |
|---|---|
| `PAYMENT_BANK_CODE` | Mã ngắn ngân hàng theo vietqr.app/banks.json (ví dụ `ACB`, `VCB`, `MB`) |
| `PAYMENT_BANK_BIN` | Hoặc mã BIN 6 số (ví dụ ACB `970416`); hệ thống tự đổi sang mã ngắn |
| `PAYMENT_BANK_NAME` | Tên ngân hàng hiển thị cho gia sư (không bắt buộc) |
| `PAYMENT_ACCOUNT_NUMBER` | Số tài khoản nhận tiền (đã liên kết với SePay) |
| `PAYMENT_ACCOUNT_NAME` | Tên chủ tài khoản hiển thị cho gia sư (không bắt buộc) |
| `SEPAY_WEBHOOK_SECRET` | Secret Key của webhook khi chọn xác thực **HMAC-SHA256** (khuyến nghị) |
| `SEPAY_WEBHOOK_API_KEY` | API key khi chọn xác thực **API Key** (dùng khi không đặt HMAC) |
| `SEPAY_ENFORCE_IP` | `true` để chỉ nhận webhook từ 9 địa chỉ IP SePay công bố (tùy chọn) |

```
npx wrangler secret put PAYMENT_BANK_CODE --env staging_v2   # hoặc PAYMENT_BANK_BIN
npx wrangler secret put PAYMENT_BANK_NAME --env staging_v2
npx wrangler secret put PAYMENT_ACCOUNT_NUMBER --env staging_v2
npx wrangler secret put PAYMENT_ACCOUNT_NAME --env staging_v2
npx wrangler secret put SEPAY_WEBHOOK_SECRET --env staging_v2   # nếu dùng HMAC-SHA256
npx wrangler secret put SEPAY_WEBHOOK_API_KEY --env staging_v2  # nếu dùng API Key
npx wrangler secret put SEPAY_ENFORCE_IP --env staging_v2       # tùy chọn, nhập: true
```

Khi chưa có `SEPAY_WEBHOOK_SECRET` lẫn `SEPAY_WEBHOOK_API_KEY`, hệ thống giữ luồng cũ: gia sư bấm "Tôi đã chuyển khoản" và
kiểm duyệt viên ghi nhận phí sau khi đối soát.

## 2. Cấu hình trên SePay (my.sepay.vn)

Theo tài liệu developer.sepay.vn (SePay Webhooks):

1. **Tài khoản ngân hàng**: liên kết tài khoản nhận phí (đúng `PAYMENT_ACCOUNT_NUMBER`).
2. **Cấu hình Công ty → Cấu hình chung → Cấu trúc mã thanh toán**: bật *Nhận diện mã thanh
   toán*, thêm mẫu: tiền tố `PNL`, kiểu ký tự *Số và chữ*, độ dài hậu tố tối thiểu 6, tối đa 30,
   trạng thái *Đang hoạt động*. SePay sẽ điền trường `code` (ví dụ `PNLLHD0000000000B`).
3. **Webhooks → Thêm webhook**:
   - Sự kiện: *Có tiền vào*; có thể bật *Chỉ gửi khi có mã thanh toán*.
   - URL (HTTPS): `https://<tên-miền>/api/v1/payments/sepay/webhook`
   - Xác thực **HMAC-SHA256** (khuyến nghị): sao chép Secret Key vào `SEPAY_WEBHOOK_SECRET`.
     SePay gửi `X-SePay-Signature: sha256=<hex>` và `X-SePay-Timestamp`; hệ thống ký lại
     `{timestamp}.{raw body}` và từ chối request lệch quá 5 phút.
   - Hoặc **API Key**: SePay gửi `Authorization: Apikey <key>`; lưu key vào
     `SEPAY_WEBHOOK_API_KEY` (key chỉ hiện đầy đủ một lần khi tạo).
4. Thử trước ở **Test mode** (cấu hình mã thanh toán riêng), giả lập giao dịch, rồi sao chép
   cấu hình sang Live.

**Hành vi của endpoint** (khớp yêu cầu SePay):
- Nhận body `application/json`, `application/x-www-form-urlencoded` hoặc `multipart/form-data`.
- Thành công trả HTTP 200 với đúng `{"success": true}` (kể cả khi giao dịch đã nhận trước đó),
  nên SePay không gửi lại; sai xác thực trả 401, dữ liệu hỏng trả 400/422 để SePay thử lại tối
  đa 7 lần trong ~33 phút.
- Chống trùng bằng `id` của SePay (cột duy nhất), xử lý nhanh trong một batch D1 (dưới 30 giây).
- Kiểm tra `accountNumber` là tài khoản của trung tâm (khi đã đặt `PAYMENT_ACCOUNT_NUMBER`),
  `code`/nội dung khớp mã lớp và `transferAmount` đủ phí nhận lớp trước khi xác nhận.
- IP SePay (khi bật `SEPAY_ENFORCE_IP`): 172.236.138.20, 172.233.83.68, 171.244.35.2,
  151.158.108.68, 151.158.109.79, 103.255.238.139, 45.57.137.67,
  2400:8905::2000:8cff:fe98:45cd, 2600:3c15::2000:8aff:fedd:874b — danh sách có thể thay đổi,
  kiểm tra lại trang "Địa chỉ IP" của SePay.

## 3. Mã QR (SePay "Tạo QR và form thanh toán")

Ảnh QR lấy từ vietqr.app theo đúng mẫu tài liệu SePay:

```
https://vietqr.app/img?acc={SO_TK}&bank={NGAN_HANG}&amount={PHI_NHAN_LOP}&des={NOI_DUNG}
```

- `acc`: `PAYMENT_ACCOUNT_NUMBER`; `bank`: mã ngắn ngân hàng (BIN `970416` → `ACB`).
- `amount`: phí nhận lớp đúng của lớp đó.
- `des` (URL-encode): `PNL<mã lớp> <Tên gia sư không dấu> thanh toan phi moi gioi`, ví dụ
  `PNLLHD0000000000B Nguyen Thi Gia Su thanh toan phi moi gioi`. Mã `PNL…` đứng đầu để SePay
  điền trường `code` và webhook khớp đúng lớp; nội dung dài hơn 80 ký tự được cắt phần cuối.
- CSP của trang cho phép ảnh từ `https://vietqr.app`.

## 4. Mã thanh toán và đối chiếu

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

## 5. Kiểm thử

Trên my.sepay.vn có công cụ *Giả lập giao dịch* để gửi một giao dịch tiền vào với nội dung
`PNL…` của một lớp đang chờ thanh toán (người học đã xác nhận, gia sư đã đồng ý hợp đồng). Lớp
phải chuyển sang "Lớp đã hoàn tất" và giao dịch hiện ở "Giao dịch thanh toán".

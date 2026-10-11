# Điểm phù hợp gia sư và lớp tìm gia sư

## Mục đích và phạm vi

TASK-32 dùng công thức quy tắc có giải thích để **gợi ý** lớp `open` cho gia sư. Điểm không phải chứng nhận năng lực, lời cam kết của phụ huynh, học phí đã thỏa thuận hay quyết định gán lớp. Kiểm duyệt viên vẫn xử lý đơn và gán gia sư; cổng hồ sơ, điều khoản, quiz và ba phương án phí vẫn áp dụng độc lập.

Chỉ tính trên hồ sơ gia sư của tài khoản đang đăng nhập, trạng thái active/approved, môn thuộc danh sách đã đăng ký và hình thức dạy đã bật. Không tạo gợi ý cho lớp khác môn hoặc khác hình thức. Dữ liệu công khai của lớp không gồm tên học viên, điện thoại, địa chỉ hay mô tả riêng của yêu cầu phụ huynh.

## Công thức v1

`score = subject + mode + grade + area + schedule`, tối đa 100. `coverage` là tổng trọng số của các mục có đủ dữ liệu để đánh giá; mục `unknown` vẫn nhận điểm trung tính như bảng dưới nhưng **không** tăng coverage. Mỗi mục trả trạng thái và lý do, để UI không chỉ hiển thị một con số.

| Tiêu chí | Tối đa | Khớp | Chưa đủ dữ liệu | Lệch có thể linh hoạt |
|---|---:|---:|---:|---:|
| Môn | 30 | 30 | Không đưa vào gợi ý | Không đưa vào gợi ý |
| Hình thức online/trực tiếp | 20 | 20 | Không đưa vào gợi ý | Không đưa vào gợi ý |
| Khối lớp ưu tiên | 20 | 20 | 10 khi gia sư chưa khai báo khối ưu tiên | 0 |
| Khu vực ưu tiên | 15 | 15; online không cần khu vực | 7 khi lớp trực tiếp chưa có khu vực công khai hoặc gia sư chưa khai báo khu vực | 0 |
| Lịch rảnh | 15 | 15 khi ít nhất một khung có thể học nằm trọn trong lịch rảnh cùng múi giờ | 7 khi hẹn trao đổi sau, chưa có lịch rảnh hoặc múi giờ không thể đối chiếu | 0 |

Mục khối, khu vực và lịch lệch tạo đề nghị điều chỉnh từ dữ liệu của lớp. Các khung giờ phụ huynh nhập được xem là **những thời điểm có thể học**, nên một khung phù hợp là đủ cho tiêu chí lịch; nếu sau này phiếu phân biệt nhiều buổi bắt buộc, phải đổi công thức và version. Lịch dùng giờ địa phương kèm múi giờ; không coi hai chuỗi `HH:mm` ở hai múi giờ khác nhau là trùng. Cờ `negotiableTime` chỉ nói gia sư sẵn sàng trao đổi, không biến một giờ chưa trùng thành giờ rảnh. Khu vực so theo từng phần ngăn bằng dấu phẩy sau khi chuẩn hóa tiền tố hành chính; `Cầu Giấy` có thể khớp `Quận Cầu Giấy, Hà Nội` nhưng `Quận 1` không khớp `Quận 10`. Đây vẫn chỉ là sở thích rộng, không tính khoảng cách địa lý chính xác. Vì `tutor_profiles.hourly_rate_minor` theo **giờ**, còn `class_listings.expected_budget_minor` theo **buổi** mà lớp chưa có thời lượng buổi, học phí hiện **không tham gia điểm** và phải được ghi là chưa đủ dữ liệu để so sánh. Không suy học phí đã chốt từ điểm.

`strong` nghĩa là không có điểm lệch và coverage ít nhất 70; `near` nghĩa là đúng một điểm lệch mềm có thể điều chỉnh, score ít nhất 65 **và** coverage ít nhất 70; `uncertain` nghĩa là coverage dưới 70; `low` là các trường hợp còn lại. Danh sách xếp score giảm dần trên toàn bộ tập hợp trước phân trang, sau đó dùng ngày công bố và ID để phá hòa ổn định. Điểm và nhãn phải lấy từ API, không dùng các giá trị mẫu của Figma export.

## Popup và đơn ứng tuyển

Khi gia sư chọn ứng tuyển lớp có khác biệt mềm, popup liệt kê từng mục cần linh hoạt, dữ liệu lớp và **giá trị chính xác sẽ lưu vào hồ sơ gia sư**. Với lớp `low`, popup cảnh báo rõ mức phù hợp hạn chế; không trình bày như lớp gần phù hợp. Đóng hoặc từ chối popup không tạo đơn, không đổi hồ sơ hay lịch rảnh. Xác nhận gửi danh sách mục đồng ý cùng đơn ứng tuyển; server tính lại điểm, kiểm tra class version, quyền, điều khoản/quiz/phí và bộ mục cần đồng ý. Trong một D1 transaction, server tạo đơn, thêm khối/khu vực vào danh sách ưu tiên nếu cần và bật `negotiableTime` khi lệch lịch mà cờ này chưa bật. Nếu cờ đã bật, lịch không trùng vẫn cần gia sư xác nhận riêng cho lớp đó; popup nói rõ không có thay đổi hồ sơ ở mục lịch. Hệ thống không tạo khung rảnh định kỳ từ lịch mong muốn của lớp. Lỗi ở bất kỳ bước nào rollback cả đơn và thay đổi hồ sơ. Snapshot lưu công thức/điểm **trước cập nhật**, các mục đã đồng ý và thay đổi hồ sơ thực tế cho kiểm duyệt viên xem như thông tin hỗ trợ. Xác nhận của gia sư không tự thay ngân sách, lịch yêu cầu hoặc học phí đã chốt của lớp và không đồng nghĩa phụ huynh đã đồng ý.

API phải kiểm tra lại dữ liệu khi gửi đơn; client không được tự đặt điểm, danh sách tiêu chí hoặc trạng thái. Nếu lớp/hồ sơ thay đổi, UI yêu cầu tải lại gợi ý và xem lại các điểm cần linh hoạt trước khi gửi. Không tự động ứng tuyển hay gán lớp từ thao tác xem popup.

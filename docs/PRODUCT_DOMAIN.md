# Contract miền sản phẩm `./figma` — bản đề xuất

**Trạng thái:** Contract TASK-20, ngày 2026-10-11; các policy mở được chặn theo từng mutation. DEC-009 đã chốt actor/role, gán lớp, quyền xem liên hệ, booking cũ và chọn phiên bản phí; DEC-010 chốt consent và retention cho contact riêng. G2 còn hủy/gán lại/hoàn thành; G3 còn giá trị/công thức; G4 còn điều khoản; G5 còn quyền sau thu hồi và quy trình xóa tài khoản. Đây chưa phải schema/API đã triển khai đầy đủ. [PLAN.md §13](../PLAN.md) nêu mục tiêu; [FIGMA_GAP_LOG.md](../FIGMA_GAP_LOG.md) ghi bằng chứng và điểm mâu thuẫn từ code export. Các trang export chỉ cung cấp luồng UI/mẫu dữ liệu; không cung cấp backend hoặc nguồn quyền đáng tin cậy.

## 1. Ranh giới và bất biến

- Actor nghiệp vụ: **parent** (phụ huynh/người giám hộ), **tutor**, **moderator** (điều phối/duyệt), **public**. Theo DEC-009, role lưu trong D1 vẫn là `student/tutor/admin`; server ánh xạ một-một thành `parent/tutor/moderator` cho sản phẩm mới. Không đổi `users.id`, foreign key, session hay lịch sử booking khi đổi nhãn sản phẩm; không tin role do client gửi.
- `users`, `auth_credentials`, `auth_sessions`, `tutor_profiles`, `subjects`, `audit_logs` và hạ tầng Hono/Drizzle/D1 hiện tại là nền tảng tái sử dụng. Cookie HttpOnly/Secure, session token hash trong D1, CSRF, Zod, rate limit, `requireRole` và kiểm tra ownership ở service vẫn bắt buộc. Moderator có role DB `admin` và chỉ được cấp bằng quy trình operator, không self-register.
- Mọi `id`, `owner_id`, `tutor_id`, role, trạng thái, giá/phí và mốc thời gian tạo/cập nhật do server đặt hoặc xác minh. DTO public và DTO của mỗi vai trò là projection riêng; không gửi nguyên hàng SQL rồi ẩn bằng CSS.
- Toàn bộ mutation ghi audit cùng actor, target, `from → to`, lý do khi cần, `requestId`/idempotency reference. Audit metadata không chứa tên học sinh, điện thoại, địa chỉ, giấy tờ hoặc token.
- Thời điểm tuyệt đối dùng UTC ISO; lịch lặp lưu `weekday`, `HH:mm` địa phương, IANA timezone (mặc định `Asia/Ho_Chi_Minh`). Không biến lịch lớp thành `booking_slot_claims` 30 phút của MVP cũ.
- Hành vi trả tiền, gửi email, điểm phù hợp, rating và báo cáo doanh thu chỉ hiện khi có backend/evidence thật; UI export đang có thông báo thành công giả.

## 2. Entity và quan hệ đề xuất

| Entity | Trường chính / quan hệ | Quy tắc |
|---|---|---|
| `parent_profiles` | `user_id` FK `users`, thông tin liên hệ tối thiểu | Chỉ chủ tài khoản và moderator đọc/sửa theo mục đích; chưa lưu thêm CCCD hoặc dữ liệu trẻ em không cần thiết. |
| `parent_requests` | `id`, `parent_user_id`, `subject_id`, lớp/khối, hình thức, khu vực công khai mức rộng, mức chi **dự kiến**, mô tả, `status`, `version`, timestamps | Một yêu cầu do parent từ session hoặc moderator có audit tạo. Không tự suy ra giá/fee đã chốt từ mức chi dự kiến. |
| `parent_request_private` | `request_id`, điện thoại/địa chỉ liên hệ tối thiểu, version/thời điểm consent | Tách khỏi truy vấn public. Parent phải xác nhận consent trước submit; đúng tutor được gán xem điện thoại/địa chỉ ngay khi `assign_tutor` commit. Giữ contact đến khi xóa tài khoản theo DEC-010; xóa contact mà bảo toàn lịch sử không còn PII. Không lưu CCCD, bằng cấp hoặc file đính kèm. |
| `request_schedule_windows` | `request_id`, `weekday`, `start_local`, `end_local`, `timezone`; hoặc cờ `discuss_later` | Kiểm tra giờ hợp lệ, không chồng lấn và số lượng tối đa. Không nhận chuỗi lịch tự do làm nguồn tính toán. |
| `class_listings` | `id`, `source_request_id` nullable, `parent_user_id`, subject/grade/mode, vùng công khai, mô tả công khai, `status`, `version`, timestamps | Moderator tạo/xuất bản. `source_request_id` cần UNIQUE nếu mỗi request chỉ sinh tối đa một lớp; nếu có nhiều lớp từ một request phải quyết định lại. Bản public không chứa PII. |
| `tutor_applications` | `id`, `class_id`, `tutor_user_id`, `fee_option_version_id`, `status`, `version`, timestamps | Tutor được duyệt nộp/thu hồi và chọn một phương án phí **đã công bố, còn hiệu lực**. Server xác minh option từ D1; một tutor không có hai đơn còn hiệu lực trên cùng lớp. |
| `fee_option_versions` | `id`, `option_key`, `version`, phạm vi lớp được phép, nội dung/công thức phí được duyệt, `status`, hiệu lực, timestamps | Moderator kiểm soát và công bố phiên bản bất biến. Ứng tuyển trỏ tới đúng version đã chọn; sửa phí tạo version mới, không tự đổi ứng tuyển cũ. Phạm vi/giá trị/công thức cụ thể còn chờ FIG-016. |
| `class_assignments` | `id`, `class_id`, `tutor_user_id`, `application_id` FK, `status`, `version`, timestamps | Moderator chọn từ ứng tuyển đã có fee option hợp lệ. Assignment và lớp `active` ngay trong cùng transaction; không có bước tutor `accept_offer`. Tối đa một assignment active/lớp. |
| `class_terms_acceptances` | `class_id`, `tutor_user_id`, `terms_version_id`, kết quả/đồng ý, thời điểm, nguồn request | **Hoãn schema/mutation tới G4:** nội dung/version, bài test, bằng chứng đồng ý và hiệu lực chưa được duyệt. Không dùng `localStorage.termsTestPassed` làm bằng chứng hay ngầm chặn/cho phép gán lớp. |
| `class_sessions` | `class_id`, lịch UTC thực tế, trạng thái và người ghi nhận | **Chỉ thêm khi** có policy xác nhận buổi học. `totalSessions` và `sessionsCompleted` trong export không được thành số thật khi chưa có sự kiện nguồn. |
| `fee_quotes`, `payment_evidence` | giá/điều khoản đã chốt và bằng chứng xác nhận độc lập với lựa chọn option | **Hoãn mutation thanh toán/xác nhận thu phí** tới khi FIG-016 được duyệt. Chọn `fee_option_version_id` không phải trả tiền hoặc bằng chứng `paid`. |
| `complaints`, `content_items`, `reports` | nguồn/owner, lifecycle, quyền xuất bản | TASK-27–29 định nghĩa chi tiết sau khi contract lõi và chính sách dữ liệu được chốt. Tất cả upload giấy tờ/đính kèm hoãn; không lưu file demo. |

`class_listings` là cơ hội/lớp cần gia sư; `tutor_applications` là nguyện vọng của gia sư kèm phiên bản phương án phí được chọn; `class_assignments` là lựa chọn do moderator kiểm soát; `class_sessions` là buổi học đã xác minh nếu sau này có. Chúng không phải tên khác của `bookings`. Một lớp `with_tutor` trong export chỉ nói có gia sư, không chứng minh lớp đang học hay đã hoàn thành.

## 3. State machine đề xuất để review

Tên trạng thái dưới đây là **đề xuất kỹ thuật**; quyết định đã chốt là thao tác moderator “đề xuất/gán gia sư” là **một transaction** làm lớp `active` ngay và mở liên hệ cho đúng tutor được chọn. Không có bước tutor chấp nhận offer để kích hoạt. Backend chỉ nhận *action*; không có API `PATCH status` tự do. Mỗi hàng là `(actor, action, from → to, điều kiện)`; state sai/version cũ trả `409`. Hủy, đổi gia sư và hoàn thành vẫn cần policy G2.

### Parent request

| Actor | Action | From → to | Điều kiện |
|---|---|---|---|
| Parent owner | `submit` | `draft → submitted` | DTO hợp lệ; lịch hoặc `discuss_later`; quota. Nếu không cần nháp, có thể tạo thẳng `submitted`. |
| Parent owner | `edit` | `draft/submitted → giữ nguyên` | Chưa có lớp published hoặc assignment; tăng version và audit. |
| Moderator | `start_sourcing` | `submitted → sourcing` | Đã thẩm tra; tạo/publish lớp phải đồng bộ với request. |
| Moderator | `assign_tutor` | `sourcing → assigned` | Cùng transaction với lớp `open → active`, ứng tuyển `submitted → selected` và assignment `— → active`. Parent không phải xác nhận lần hai để lớp active. |
| Moderator | `close_fulfilled` | `assigned → fulfilled` | **Chưa mở mutation:** cần bằng chứng hoàn thành và policy G2. |
| Parent owner / Moderator | `cancel` | `draft/submitted/sourcing/assigned → cancelled` | **Chưa mở mutation:** quy tắc hủy/gán lại và quyền các bên thuộc G2. |

### Class listing

| Actor | Action | From → to | Điều kiện |
|---|---|---|---|
| Moderator | `create` | `— → draft` | Yêu cầu nguồn hợp lệ hoặc moderator tạo có audit; parent owner xác định. |
| Moderator | `publish` | `draft → open` | Public DTO không PII; request nguồn ở trạng thái phù hợp. |
| Moderator | `unpublish` | `open → draft` | Chưa có assignment; quy tắc với application hiện có cần chốt. |
| Moderator | `assign_tutor` | `open → active` | Chọn tutor hợp lệ, insert một assignment active và cập nhật request/application/audit atomically. Không tạo `offered` hay chờ tutor bấm nhận. |
| Moderator | `complete` | `active → completed` | **Chưa mở mutation:** cần nguồn xác minh buổi học và policy G2, không dùng nút demo. |
| Moderator | `cancel` | `draft/open/active → cancelled` | **Chưa mở mutation:** cần quy tắc hủy/gán lại và xử lý fee/complaint G2/G3. |

### Application và assignment

| Entity | Actor/action | From → to | Điều kiện |
|---|---|---|---|
| Application | Tutor `apply` | `— → submitted` | Tutor active + profile approved; lớp `open`; chọn một `fee_option_version_id` do moderator đã publish, còn hiệu lực và **được phép cho lớp này**; không có đơn còn hiệu lực cùng lớp. Lựa chọn không xác nhận đã trả phí. |
| Application | Tutor `withdraw` | `submitted → withdrawn` | Owner, chưa được chọn; đóng bằng version/CAS. |
| Application | Moderator `reject` | `submitted → rejected` | Lý do; audit; chỉ tác động đúng đơn. |
| Application | Moderator `select` | `submitted → selected` | Cùng transaction `assign_tutor`; giữ nguyên fee option version tutor đã chọn. |
| Assignment | Moderator `assign_tutor` | `— → active` | Tối đa một assignment active/lớp; selected tutor được mở quyền đọc liên hệ theo §4 ngay khi transaction commit. |
| Assignment | Moderator `revoke` | `active → revoked` | **Chưa mở mutation:** lý do, cập nhật class/request và quyền xem liên hệ sau thu hồi cần policy G2/G5. |

`request.searching/matched/confirmed` ở parent và `pending/assigned/completed/cancelled` ở trang admin của export cần map theo **action và đối tượng**, không map một-một theo chữ. `class.with_tutor/without_tutor` là projection từ assignment active, không phải lifecycle status. Trong sản phẩm mới, UI gọi “đề xuất” hay “gán” đều dẫn đến một action server `assign_tutor`: transaction commit làm lớp active và mở contact cho **đúng tutor được gán**; G2 vẫn cần quy tắc hủy/gán lại/hoàn thành.

## 4. API và ma trận quyền đề xuất

Tất cả đường dẫn dưới `/api/v1`. Mỗi endpoint mutation dùng JSON strict Zod + cookie session + CSRF + body cap; list có pagination/filter whitelist (mặc định 12, max 48 hoặc mức được chốt), sort deterministic và quota. API trả envelope hiện có. Không dùng `parentId`, `tutorId`, role hoặc status do client gửi làm nguồn quyền. `If-Match`/`version` hoặc CAS tương đương bắt buộc cho edit/transition. Đối tượng không thuộc quyền trả `404` để tránh dò PII; role sai trả `403`.

| API/action | Public | Parent | Tutor | Moderator | Projection / ghi chú |
|---|---|---|---|---|---|
| `POST /auth/register`, `GET /me` | Register parent/tutor theo policy | Self | Self | Không self-register | Server map product `parent/tutor/moderator` ↔ DB `student/tutor/admin`; `/me` trả `productRole` suy ra từ session cùng `role` lưu trữ để tương thích các route booking cũ. Client không được gửi một trong hai làm nguồn quyền. |
| `GET/PATCH /parent/profile` | — | Chính mình | — | Xem qua moderator API | Không gửi hồ sơ người khác. |
| `POST /parent/requests`, `GET /parent/requests` | — | Tạo/list của mình | — | List qua moderator API | Owner từ session; id/code server tạo; idempotency cho create. |
| `GET/PATCH /parent/requests/:id`, `POST .../:action` | — | Own, action được phép | — | Moderator action riêng | Private student/contact chỉ ở DTO owner/moderator. |
| `GET /classes`, `GET /classes/:id` | Chỉ lớp `open` | Public projection | Public projection | Full qua moderator API | Không địa chỉ/điện thoại/tên học sinh; không mock matchScore/rating. |
| `GET /fee-options` | — | — | Phiên bản published/effective/allowed cho lớp | Full qua moderator API | Nếu chưa có option được duyệt thì form ứng tuyển ở staging unavailable; không có trạng thái thanh toán. |
| `POST /classes/:id/applications`, `GET /tutor/applications`, `POST /tutor/applications/:id/withdraw` | — | — | Own, approved | Xem qua moderator API | Tutor ID từ session; request chỉ chọn option version ID, server xác minh published/effective/phạm vi lớp, lưu version bất biến; khi chưa có option hợp lệ phải chặn mutation, duplicate/race `409`. |
| `GET /tutor/assignments`, `GET /tutor/assignments/:id/contact` | — | — | Own, active assignment | Xem qua moderator API | Không có accept/decline gate. Endpoint contact kiểm tra assignment active ở mỗi lần đọc, trả điện thoại/địa chỉ parent/student tối thiểu ngay sau `assign_tutor` commit, audit truy cập nhạy cảm. |
| `GET /admin/requests`, `POST /admin/requests/:id/:action` | — | — | — | Moderator | Thẩm tra, publish/assign/close/cancel; assign cập nhật request/class/application/assignment atomically. |
| `POST/GET/PATCH /admin/classes`, `POST /admin/classes/:id/:action` | — | — | — | Moderator | Tạo/publish/assign_tutor/complete/cancel; không nhận arbitrary status. |
| `GET /admin/applications`, `POST /admin/applications/:id/:action` | — | — | — | Moderator | List có pagination; reject/select với reason. |
| `GET/POST /admin/fee-options`, `POST /admin/fee-options/:id/publish` | — | — | — | Moderator | Chỉ moderator soạn/publish version mới; published version không sửa tại chỗ, mọi đổi phí có audit. |
| `GET /bookings`, `GET /bookings/:id` (legacy) | — | Chỉ participant legacy | Chỉ participant legacy | Theo policy vận hành | Booking cũ, gồm `PENDING/CONFIRMED`, vẫn xem được; giữ nguyên dữ liệu và ownership. |
| `POST /bookings/:id/{confirm,reject,cancel,complete}` (legacy) | — | Action cũ theo trạng thái/quyền | Action cũ theo trạng thái/quyền | — | `PENDING/CONFIRMED` tiếp tục được xử lý theo state machine cũ; không tự chuyển thành class. |
| `POST /bookings` (legacy) | — | Chặn | Chặn | — | Chặn server-side khi bản mới cutover, trước khi tạo booking/claim; trả lỗi rõ ràng, không chỉ ẩn nút. |

Các đường dẫn `/admin/*` ở bảng trên là tên kỹ thuật tương thích export/API cũ; chỉ session có product role **moderator** (DB role `admin`) được gọi. Route UI có thể giữ alias `/admin/*` khi TASK-21 port giao diện, nhưng nhãn và quyền sản phẩm là moderator.

**Quyền contact/PII:** parent xem dữ liệu do mình tạo; moderator được truy cập đúng mục đích, có audit; tutor trước khi được gán chỉ thấy subject/grade/mode/vùng chung/lịch/mức học phí công khai đã duyệt. Parent phải tự chọn checkbox consent (mặc định bỏ chọn) trước submit; server lưu version nội dung, thời điểm và actor từ session. **Đúng tutor được moderator chọn** được xem điện thoại/địa chỉ ngay khi action `assign_tutor` commit và chỉ khi consent hợp lệ; tutor khác và public không được xem. API private projection kiểm tra assignment active và owner ở **mỗi lần đọc**, audit truy cập, không dựa vào route guard frontend. Chỉ thu dữ liệu tối thiểu cho yêu cầu; hoãn CCCD/bằng cấp/file đính kèm. Contact riêng được giữ tới khi tài khoản bị xóa; xóa contact theo quy trình riêng, không xóa lịch sử nghiệp vụ. Quyền sau thu hồi assignment còn G5.

## 5. Concurrency, idempotency, audit và thời gian

- Tạo request và application nhận `Idempotency-Key` theo `(actor, endpoint, key, hash DTO)`; cùng key/payload trả cùng kết quả, key khác payload trả `409`. Có thể tái dùng bảng `idempotency_keys` hiện có, nhưng completion và entity insert phải cùng D1 `batch()` như booking cũ.
- State transition dùng `WHERE id = ? AND status = ? AND version = ?`, tăng `version`; audit và các entity liên quan ghi trong một D1 `batch()` với statement có điều kiện theo update vừa thắng hoặc ràng buộc DB. `batch()` đơn thuần không làm một `UPDATE` zero-row trở thành lỗi; phải kiểm tra số hàng cập nhật và bảo đảm không sinh audit/assignment mồ côi. Action `assign_tutor` phải cùng lúc chuyển request sang `assigned`, class sang `active`, application sang `selected`, tạo assignment active và audit. Chỉ sau commit thành công mới mở contact cho tutor được chọn. Stale/đụng unique trả `409`, không báo success theo toast; không cho hai assignment active/lớp.
- Index đề xuất: `(parent_user_id, created_at)`, `(status, updated_at)` cho request; `(status, published_at, id)` và `(subject_id, grade, mode)` cho class; `(class_id, tutor_user_id)` unique partial cho application active; `(class_id)` unique partial cho assignment active. `fee_option_versions` có UNIQUE `(option_key, version)`; application FK tới version với `ON DELETE RESTRICT`, không cập nhật nội dung version đã publish. Foreign keys khác dùng `RESTRICT`/`SET NULL` có chủ đích để không mất lịch sử.
- Khi tutor ứng tuyển, server chỉ nhận `fee_option_version_id` như **lựa chọn**, kiểm tra option published, còn hiệu lực và được phép cho lớp đó trong cùng ranh giới ghi application, lưu ID/version và audit. Moderator không thể sửa nội dung option đã publish; thay đổi tạo version mới, không đổi hồi tố ứng tuyển cũ. Thay lựa chọn đã nộp cần action/version/audit và tutor đồng ý; `fee_option_version_id` không là bằng chứng trả tiền hay cho phép mở PII.
- Lịch tuần: whitelist IANA timezone, `weekday` 1–7, `HH:mm`, `start < end`, cửa sổ giới hạn/không overlap, có `discuss_later`; mốc buổi học cụ thể chuyển UTC. Chưa khẳng định tutor rảnh hoặc không trùng lớp nếu chưa có lịch lớp và kiểm tra giao nhau thật.
- Quota đề xuất để thiết kế test, chưa là policy vận hành: request ≤ 64 KiB theo middleware hiện tại, text field có max length, số cửa sổ lịch và số request/application đang mở mỗi người có giới hạn server-side; TASK-23/24 chốt ngưỡng và rate limiter phù hợp.

## 6. Migration D1 forward-only và tương thích

1. **Baseline:** Chạy migration 0001–0004 trên D1 local trống và fixture có user `student/tutor/admin`, bookings/sessions/claims; xác nhận `foreign_key_check` và số hàng trước/sau. Không sửa migration cũ, không xóa booking/claim/idempotency/audit.
2. **Role mapping đã chốt (DEC-009):** Giữ `users.role` và `CHECK role IN ('student','tutor','admin')` hiện tại. Server map DB `student → parent`, `tutor → tutor`, `admin → moderator` ở auth/RBAC và DTO sản phẩm mới. Giữ nguyên `users.id`, `bookings.student_id`, toàn bộ FK, session, audit và URL legacy cần đọc. Parent đăng ký mới được server lưu role DB `student`; moderator chỉ được operator cấp role DB `admin`. Không cập nhật hàng user hàng loạt hay dựng lại bảng `users` chỉ để đổi nhãn.
3. **Expand:** Migration mới lần lượt thêm `parent_profiles`, `parent_requests`, private/schedule tables, `class_listings`, `fee_option_versions`, `tutor_applications` với FK đến version đã chọn, `class_assignments` và index/constraints. Đồng bộ Drizzle schema + SQL, test D1 local cho FK/UNIQUE/check/race; các cột mới phải tương thích dữ liệu cũ. Giá trị/công thức option phải được duyệt trước publish; terms/quote/payment/complaint/content thêm khi policy và task tương ứng sẵn sàng.
4. **Code compatibility:** Trong thời gian giữa migrate và deploy, Worker cũ vẫn phải chạy được. Worker mới không giả định dữ liệu mới đã có cho user cũ; có empty states. Giữ URL legacy tạm thời hoặc redirect có chủ đích; không chuyển booking lịch sử thành request/class hoặc tự xóa dữ liệu.
5. **Cutover đã chốt về hành vi:** Khi bản mới thay staging, chặn `POST /bookings` **trên server trước khi ghi**; không tạo booking/slot claim mới. Booking cũ `PENDING/CONFIRMED` vẫn xem và thao tác bằng các action legacy hợp lệ (`confirm/reject/cancel/complete`) theo RBAC/ownership và thời gian; trạng thái terminal vẫn đọc được. UI mới không mời đặt booking cũ, nhưng cần lối truy cập lịch sử/action của cam kết đang mở. Không chuyển booking thành request/class hay xóa hàng. Đếm user, booking, claim, session trước/sau, kiểm thử tạo mới bị chặn và transition cũ còn chạy. Staging backup/bookmark và remote migration/deploy chỉ thực hiện theo runbook khi được phép.
6. **Rollback:** Chỉ rollback Worker sang phiên bản đọc được schema mở rộng; migration đã áp dụng giữ nguyên. Không drop bảng để rollback. Xem [ROLLBACK.md](ROLLBACK.md).

## 7. Phần chưa được phép kết luận

| ID | Quyết định cần product owner | Gate trước khi code mutation / công bố |
|---|---|---|
| G2 / FIG-013–014 | **Đã chốt:** moderator “đề xuất” và “gán” là cùng transaction; assignment/class active ngay và contact mở cho tutor được chọn tại commit, không chờ tutor accept. **Còn mở:** hủy/rút đơn sau chọn, thu hồi/gán lại, bằng chứng hoàn thành, xử lý lớp đang hoạt động. | Chỉ mở `assign_tutor` khi các ràng buộc trong §3/5 sẵn sàng; hoãn các mutation còn mở ở TASK-23–26. |
| G3 / FIG-016 | DEC-009 đã chốt moderator publish các option phí có version và tutor chọn khi ứng tuyển. **Chưa chốt** giá trị/công thức, cọc, hoàn, nguồn xác nhận thu và thời điểm khóa giá. | Staging không mở ứng tuyển khi chưa có option số liệu/điều khoản được duyệt và published; không publish option mẫu hay mutation thanh toán. TASK-24/26/27; revenue TASK-29. |
| G4 / FIG-017 | Nội dung/version điều khoản, bằng chứng đồng ý, bài test và hiệu lực **vẫn chưa có quyết định cụ thể**. | Hoãn `class_terms_acceptances` và UI thông báo đã chấp nhận; TASK-26 terms/contract. Không dùng terms mock để chặn hoặc xác nhận `assign_tutor`. |
| G5 / FIG-018 | **Đã chốt DEC-009/010:** chỉ thu dữ liệu tối thiểu, không upload giấy tờ; parent xác nhận chia sẻ contact trước submit, giữ contact đến khi xóa tài khoản, đúng tutor được gán xem sau commit. **Còn mở:** quan hệ nhiều học sinh, quyền sau thu hồi và quy trình xóa contact mà giữ lịch sử không PII. | TASK-23 consent/private DTO/access test; quy trình xóa là gate trước release có dữ liệu thật. |
| G6 / FIG-019–021 | Vòng đời khiếu nại, nguồn nội dung được duyệt, định nghĩa KPI và doanh thu. | TASK-27–29. |
| G7 / DEC-007 | **Đã chốt:** khi bản mới cutover, chặn tạo booking cũ; booking `PENDING/CONFIRMED` còn xem/thao tác theo state machine cũ, giữ ID/lịch sử. **Còn mở kỹ thuật:** URL/lối truy cập lịch sử và thời điểm cutover production. | TASK-21 route compatibility, TASK-30 staging cutover/QA; không xóa data, không chặn action hợp lệ của cam kết cũ. |

Ánh xạ role G1 đã được quyết định tại DEC-009; nó không quyết định quan hệ nhiều học sinh của G5. Các phần còn mở của G2/G4/G5/G7 và toàn bộ số liệu G3 là cổng rõ ràng, không được lấp bằng status/consent/redirect mẫu. Nếu một gate chưa chốt, phần tương ứng phải là empty/unavailable state trung thực hoặc bị hoãn; không suy ra từ mock page. Contract này đủ để review phạm vi và test cần có, chưa tự cấp quyền triển khai các chính sách mở.

# FIGMA_INVENTORY — PROVISIONAL (chưa xác minh với Figma)

> **Nguồn Figma:** https://www.figma.com/make/nhljatxXx9lap98Zx7s4AU/Tutor-Matching-Platform
> **Trạng thái truy cập (2026-10-11):** không đọc được — trang trả về JS shell rỗng, thumbnail công khai là ảnh trắng 800×707, `api.figma.com/v1/files/...` trả 403.
> **Thay thế đã duyệt (DEC-001):** danh mục dưới đây lấy từ `PLAN.md` §2 và nghiệp vụ trong `PLAN.md` §3. **Không có frame ID thật** — cột `Frame` dùng mã tạm `PRV-xx`. Mọi màn hình có trạng thái `UNVERIFIED`.

| Frame | Route | Actor | Mục đích | CTA chính → đích | States bắt buộc | Breakpoints | API | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PRV-01 | `/` | Guest/All | Trang chủ, ô tìm theo môn | "Tìm gia sư" → `/tutors?subject=` | loading môn, error | 320/768/1280 | `GET /subjects` | UNVERIFIED |
| PRV-02 | `/tutors` | Guest/Student | Danh sách + lọc (môn, hình thức, giá), phân trang | Thẻ gia sư → `/tutors/:slug`; "Xóa bộ lọc" | loading skeleton, empty, error/retry | 320/768/1280 | `GET /tutors` | UNVERIFIED |
| PRV-03 | `/tutors/:slug` | Guest/Student | Hồ sơ + chọn khung giờ + đặt lịch | "Đặt lịch" → xác nhận → `/student/bookings`; guest → `/sign-in?next=` | loading, 404, không có slot, 409 slot vừa bị đặt | 320/768/1280 | `GET /tutors/:slug`, `GET /tutors/:id/slots`, `POST /bookings` | UNVERIFIED |
| PRV-04 | `/sign-in` | Guest | Đăng nhập | "Đăng nhập" → `next` hoặc dashboard theo role | field error, 401 | 320/768/1280 | `POST /auth/login` | UNVERIFIED |
| PRV-05 | `/sign-up` | Guest | Đăng ký học viên/gia sư | "Tạo tài khoản" → dashboard theo role | field error, 409 email | 320/768/1280 | `POST /auth/register` | UNVERIFIED |
| PRV-06 | `/student/bookings` | Student | Lịch học theo tab trạng thái, hủy | "Hủy" (xác nhận) | loading, empty theo tab, error | 320/768/1280 | `GET /bookings`, `POST /bookings/:id/cancel` | UNVERIFIED |
| PRV-07 | `/tutor/profile` | Tutor | Hồ sơ/onboarding: tên, giới thiệu, môn, giá, hình thức; gửi duyệt | "Lưu", "Gửi duyệt" | loading, validation, trạng thái duyệt | 320/768/1280 | `GET/PATCH /tutor/profile`, `POST /tutor/profile/submit`, `GET /subjects` | UNVERIFIED |
| PRV-08 | `/tutor/availability` | Tutor | Lịch lặp tuần (T2→CN) + ngoại lệ theo ngày | "Lưu lịch tuần", "Thêm ngoại lệ", "Xóa" | dirty, saving, overlap error, cảnh báo booking bị ảnh hưởng | 320/768/1280 | `GET/PUT /tutor/availability`, `/tutor/availability/exceptions` | UNVERIFIED |
| PRV-09 | `/tutor/bookings` | Tutor | Yêu cầu đặt lịch: xác nhận/từ chối/hủy/hoàn thành | các nút hành động | loading, empty theo tab, error, 409 stale | 320/768/1280 | `GET /bookings`, `POST /bookings/:id/*` | UNVERIFIED |
| PRV-10 | `/admin/tutors` | Admin | Hàng chờ duyệt hồ sơ, duyệt/từ chối/ẩn có lý do | "Duyệt", "Từ chối", "Ẩn" | loading, empty, error | 768/1280 (320 usable) | `GET /admin/tutors`, `POST /admin/tutors/:id/*` | UNVERIFIED |
| PRV-11 | `*` | All | 404 / 403 | "Về trang chủ" | — | all | — | UNVERIFIED |

**Ngoài phạm vi (P2, chưa có yêu cầu):** `/messages`, `/payments`, `/reviews`, `/admin/reports`.

Khi có quyền Figma: thay cột `Frame` bằng frame ID thật, thêm link node, ảnh chụp desktop/mobile, cập nhật trạng thái thành `VERIFIED` hoặc ghi chênh lệch vào `FIGMA_GAP_LOG.md`.

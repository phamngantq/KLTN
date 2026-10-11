# Component map — Figma Make code export

> Nguồn thiết kế cho toàn bộ project: [Tutor Matching Platform trên Figma Make](https://www.figma.com/make/nhljatxXx9lap98Zx7s4AU/Tutor-Matching-Platform?p=f&t=F5iHIZDcvYVKK1to-0&fullscreen=1). `figma/README.md` nhận diện đây là code bundle của cùng project. Bảng dưới dựa trên **file trong `figma/`**, chưa phải component/node/frame được kiểm chứng trực tiếp trên Figma. Không tự tạo frame ID.

> **LOCAL_ONLY:** Export `figma/` được Git ignore sau audit dữ liệu mẫu. Đường dẫn source dưới đây chỉ mở trong workspace có export; chúng không tồn tại trên GitHub. SHA-256 và kết quả build/render tái kiểm được ghi trong `FIGMA_INVENTORY.md`.

## Cách dùng bản export

- Dùng `figma/src/app/pages`, `figma/src/app/components` và `figma/src/styles` làm bằng chứng cho bố cục, màu, điều hướng và các trạng thái **đã thể hiện trong code**. Mỗi màn hình cần được ánh xạ route/API và kiểm tra dữ liệu thật trước khi triển khai.
- Các component `figma/src/app/components/ui/*` (48 file) là shadcn/Radix primitives; `figma/src/styles/theme.css` là theme mặc định. Những màu thương hiệu quan sát được chủ yếu nằm trong JSX: navy `#0e2f5f`, vàng `#ffda68`, gradient tới `#1a4d8f` (`figma/src/app/pages/public/HomePage.tsx`, `figma/src/app/pages/public/PublicLayout.tsx`). Không coi `--primary: #030213` của shadcn là màu thương hiệu.
- Component hiện có ở `src/client/` đã nhận navy/vàng/gradient từ export trong `tokens.css`; shell, route và domain vẫn đang triển khai. Những dòng “cần điều chỉnh” là công việc ánh xạ, **không khẳng định luồng đã được triển khai**. Giữ auth, RBAC, validation, accessibility và state transitions của app; không chuyển mock data, localStorage auth hay thao tác UI đơn thuần thành kết quả backend.

## Component/layout mapping

| Export source / bằng chứng | Vai trò trong export | App hiện tại / hướng ánh xạ | Điểm cần điều chỉnh |
|---|---|---|---|
| `figma/src/app/pages/public/PublicLayout.tsx` | Header/footer navy, logo chữ + `GraduationCap`, nav public, CTA vàng, menu mobile tại `lg` | `src/client/app/RootLayout.tsx` | Áp dụng shell public và nav hợp lệ; export đọc `localStorage` để ẩn layout, app phải dùng session server hiện có. |
| `figma/src/app/components/Layout.tsx` | Shell phụ huynh/gia sư, nav theo vai trò, dropdown, menu mobile tại `md` | `src/client/app/RootLayout.tsx` | Tách navigation theo vai trò và route thực có; không tin vai trò do client gửi. |
| `figma/src/app/components/AdminLayout.tsx` | Shell admin, nav nhóm quản trị, header/footer navy, mobile tại `md` | `src/client/app/RootLayout.tsx`, `src/client/app/guards.tsx` | Ánh xạ mục admin theo feature đã có; route và hành động quản trị vẫn cần guard/RBAC phía server. |
| `figma/src/app/components/ui/button.tsx`; override tại `figma/src/app/pages/public/HomePage.tsx` | shadcn variants `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes `default`, `sm`, `lg`, `icon`; CTA dùng navy/vàng trực tiếp | `src/client/components/ui/Button.tsx` (`Button`, `ButtonLink`) | App đang có `primary/secondary/danger/ghost`, `md/sm`; thêm variant/size khi màn hình thực sự cần, giữ loading, disabled, focus và target chạm. |
| `figma/src/app/components/ui/card.tsx`; `figma/src/app/pages/public/HomePage.tsx` | Card shadcn `rounded-xl border`, padding 6; page thêm gradient, hover và `rounded-2xl` | `src/client/components/domain/TutorCard.tsx`, `BookingCard.tsx`, các panel trong page | Tạo primitive dùng chung nếu cần lặp lại; TutorCard/BookingCard vẫn lấy DTO thật, không chép số liệu demo trong export. |
| `figma/src/app/components/ui/input.tsx`, `label.tsx`, `select.tsx`, `textarea.tsx`, `radio-group.tsx`, `checkbox.tsx` | Form primitives cho đăng nhập, đăng ký, yêu cầu phụ huynh, hồ sơ gia sư, admin | `src/client/components/ui/Field.tsx` và form từng feature | Giữ label, `aria-describedby`, inline error và server validation; field của yêu cầu phụ huynh là domain mới, không thay bằng form booking cũ. |
| `figma/src/app/components/ui/dialog.tsx` | Modal tạo/sửa/xem chi tiết và xác nhận trên nhiều page admin | `src/client/components/ui/ConfirmDialog.tsx` | ConfirmDialog chỉ map hành động xác nhận; các form modal cần component riêng với focus/keyboard và kết quả API thật. |
| `figma/src/app/components/ui/badge.tsx`, `tabs.tsx` | Nhãn trạng thái và tab lọc danh sách | `src/client/components/ui/Feedback.tsx` (`Badge`), `src/client/components/domain/BookingCard.tsx`, `BookingsDashboard.tsx` | Trạng thái lớp/yêu cầu mới cần enum + nhãn tiếng Việt và quy tắc chuyển trạng thái riêng; không dùng nhãn booking để giả lập. |
| `figma/src/app/components/ui/table.tsx`; các page admin | Bảng, bộ lọc, thao tác quản trị | `src/client/pages/admin/AdminTutorsPage.tsx` | Chỉ dùng pattern hiển thị; lớp, yêu cầu tìm gia sư, báo cáo và nội dung admin chưa có endpoint/permission tương ứng trong app cũ. |
| `figma/src/app/pages/admin/AdminDashboard.tsx` | Chart/stat tiles (`recharts`, `lucide-react`) | Chưa có dashboard/report tương ứng | Chỉ triển khai khi số liệu được API định nghĩa; chart values trong export là ví dụ, không phải dữ liệu thật. |
| `figma/src/app/components/figma/ImageWithFallback.tsx`; ảnh trong `LoginPage.tsx`, `public/AboutPage.tsx`, blog | Ảnh tải từ Unsplash và fallback SVG | Chưa có primitive ảnh tương ứng | Kiểm tra bản quyền, alt, tải/lỗi ảnh và tối ưu ảnh. Bốn PNG ở `figma/src/imports/` không được import, có screenshot của dự án khác/thông tin cá nhân; loại khỏi Git/bundle. Ảnh Unsplash và iframe Google Maps cũng bị CSP hiện tại chặn nếu port nguyên trạng. |

## Domain boundaries cần giữ rõ

| Export UI | App hiện tại | Kết luận ánh xạ |
|---|---|---|
| `figma/src/app/pages/parent/TutorRequestPage.tsx` — form yêu cầu tìm gia sư và ma trận lịch mong muốn | `src/client/components/domain/WeeklyScheduleEditor.tsx` — lịch dạy lặp của gia sư; `SlotPicker.tsx` — chọn slot đặt lịch | Cả ba đều có UI thời gian nhưng **khác domain**. Cần model/API riêng cho yêu cầu của phụ huynh và điều phối lớp. |
| `figma/src/app/pages/public/ClassListPage.tsx` và `tutor/TutorNewClassesPage.tsx` — danh sách lớp cần gia sư | `src/client/pages/discovery/TutorsPage.tsx` và `TutorCard.tsx` — danh sách gia sư | Không thay tutor directory bằng class listing qua đổi nhãn; cần DTO, filter, quyền xem và CTA nhận lớp riêng. |
| `figma/src/app/pages/tutor/TutorProfilePage.tsx` — hồ sơ gia sư theo export | `src/client/pages/tutor/TutorProfilePage.tsx` | Có thể dùng layout/field làm tham chiếu, nhưng schema, quyền chỉnh sửa, duyệt hồ sơ và upload phải đối chiếu trước khi sửa. |
| `figma/src/app/pages/admin/AdminAcceptClassRequestsPage.tsx`, `AdminFindTutorRequestsPage.tsx`, `AdminClassesPage.tsx` | Hiện chỉ có `src/client/pages/admin/AdminTutorsPage.tsx` cho duyệt gia sư | Luồng nhận lớp/ghép lớp/quản trị lớp là feature mới, cần server state transitions, RBAC và test, không thể hoàn tất bằng copy UI. |
| `figma/src/app/pages/parent/ParentDashboard.tsx`, `tutor/TutorDashboard.tsx` | `src/client/pages/student/StudentBookingsPage.tsx`, `tutor/TutorBookingsPage.tsx` | Dashboard export theo yêu cầu/lớp; booking dashboard hiện hữu là luồng MVP lịch hẹn. DEC-007 chọn sản phẩm mới thay thế, nên không đổi nhãn dashboard cũ để tái dùng nghiệp vụ; giữ dữ liệu lịch sử trong migration. |

**Baseline render:** Bản copy export đã build Vite và screenshot trang `/` ở 320×900, 768×900, 1280×800 (Edge headless, 2026-10-11). Ở 320 px có cắt/tràn hero, CTA điện thoại và thẻ thống kê. Screenshot nằm ở thư mục tạm, không commit vì thông tin liên hệ chưa xác minh. Build riêng không kiểm TypeScript nghiêm hoặc tích hợp Worker.

**Kiểm tra còn thiếu:** truy cập frame/node Figma gốc, ảnh/chức năng cho từng route và role, trạng thái hover/focus/loading/error, WCAG, và kiểm chứng visual trên app đã kết nối backend. Xem `FIGMA_GAP_LOG.md` và `FIGMA_INVENTORY.md` để theo dõi.

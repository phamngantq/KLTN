# FIGMA_INVENTORY — ánh xạ từ code export Figma Make

> **Mục tiêu sản phẩm hiện hành:** [Tutor Matching Platform trên Figma Make](https://www.figma.com/make/nhljatxXx9lap98Zx7s4AU/Tutor-Matching-Platform?p=f&t=F5iHIZDcvYVKK1to-0&fullscreen=1), với code export người dùng đặt ở [`./figma`](figma/README.md). Code này thay thế mô hình marketplace/đặt slot `PRV-01`–`PRV-11` bên dưới, không chỉ bổ sung skin giao diện.
> **Mức xác minh:** Đã đọc tĩnh code export, chưa xem được frame/node trực tiếp trên Figma Make; không có frame ID, breakpoint đo từ Figma hoặc xác nhận pixel-perfect. `CODE_EXPORTED` = có source UI, **không** có nghĩa là đã kết nối backend hay qua QA. Router export khai báo 59 URL cụ thể (12 public/auth, 11 parent, 16 tutor, 20 admin), wildcard 404 và một object rỗng ([`routes.tsx`](figma/src/app/routes.tsx#L77)). Cột app đối chiếu [`src/client/app/router.tsx`](src/client/app/router.tsx#L20); `—` nghĩa là chưa có route tương ứng.

> **LOCAL_ONLY:** `./figma` là bản export do người dùng cung cấp tại máy và được Git ignore vì chứa dữ liệu/ảnh mẫu chưa duyệt. Các liên kết tương đối đến `figma/` trong tài liệu chỉ mở được trong workspace có export; chúng không phải bằng chứng source đã có trên GitHub. Không stage/push nguyên thư mục.

## Public và tài khoản

Route: [`routes.tsx` dòng 77–132](figma/src/app/routes.tsx#L77). Shell, menu và footer: [`PublicLayout.tsx`](figma/src/app/pages/public/PublicLayout.tsx#L21).

| Route export | Page trong `figma/src/app/pages/` | App hiện tại | Trạng thái/ý nghĩa |
|---|---|---|---|
| `/` | `public/HomePage.tsx` | `/` | CODE_EXPORTED; home nội dung khác |
| `/gioi-thieu` | `public/AboutPage.tsx` | — | CODE_EXPORTED |
| `/dich-vu` | `public/ServicesPage.tsx` | — | CODE_EXPORTED; public menu chưa liệt kê URL này |
| `/bang-gia` | `public/PricingPage.tsx` | — | CODE_EXPORTED |
| `/lop-hoc` | `public/ClassListPage.tsx` | `/tutors` chỉ gần ý định tìm kiếm | CODE_EXPORTED; liệt kê **lớp**, không phải hồ sơ tutor |
| `/blog/phu-huynh` | `public/BlogParentPage.tsx` | — | CODE_EXPORTED |
| `/blog/gia-su` | `public/BlogTutorPage.tsx` | — | CODE_EXPORTED |
| `/blog/:category/:id` | `public/BlogDetailPage.tsx` | — | CODE_EXPORTED; bài viết chi tiết |
| `/lien-he` | `public/ContactPage.tsx` | — | CODE_EXPORTED; form chỉ `alert`, chưa gửi server ([source](figma/src/app/pages/public/ContactPage.tsx#L19)) |
| `/login` | `LoginPage.tsx` | `/sign-in` | CODE_EXPORTED; login mock |
| `/register` | `RegisterPage.tsx` | `/sign-up` | CODE_EXPORTED; redirect sau đăng ký lỗi, xem mục lưu ý |
| `/forgot-password` | inline trong router | — | **PLACEHOLDER** ([source](figma/src/app/routes.tsx#L123)) |

CTA thuê gia sư dẫn `/parent` nếu đã đăng nhập parent, ngoài ra `/login` ([`getCTALink.ts`](figma/src/app/utils/getCTALink.ts#L6)); CTA tìm lớp dẫn `/parent/lop-hoc` cho parent, ngoài ra `/lop-hoc` ([`getTutorFindClassLink.ts`](figma/src/app/utils/getTutorFindClassLink.ts#L6)).

## Phụ huynh

Role `parent`, dùng [`Layout`](figma/src/app/components/Layout.tsx#L63); route: [`routes.tsx` dòng 133–221](figma/src/app/routes.tsx#L133). Menu: Trang chủ, Giới thiệu, Thuê gia sư, Bảng giá, Tin tức, Khiếu nại, Liên hệ.

| Route export | Page trong `figma/src/app/pages/` | App hiện tại | Trạng thái/ý nghĩa |
|---|---|---|---|
| `/parent` | `parent/TutorRequestPage.tsx` | `/student/bookings` chỉ gần khái niệm yêu cầu | CODE_EXPORTED; tạo/lọc/xem yêu cầu **tìm gia sư**, khác đặt slot |
| `/parent/trang-chu` | `public/HomePage.tsx` | `/` một phần | CODE_EXPORTED; tái dùng public page |
| `/parent/gioi-thieu` | `public/AboutPage.tsx` | — | CODE_EXPORTED; tái dùng |
| `/parent/dich-vu` | `public/ServicesPage.tsx` | — | CODE_EXPORTED; tái dùng |
| `/parent/bang-gia` | `public/PricingPage.tsx` | — | CODE_EXPORTED; tái dùng |
| `/parent/lop-hoc` | `public/ClassListPage.tsx` | — | CODE_EXPORTED; tái dùng |
| `/parent/blog` | `public/BlogParentPage.tsx` | — | CODE_EXPORTED; tái dùng |
| `/parent/lien-he` | `public/ContactPage.tsx` | — | CODE_EXPORTED; tái dùng |
| `/parent/request` | `parent/TutorRequestPage.tsx` | — | **ALIAS** của `/parent` |
| `/parent/profile` | `parent/ParentProfilePage.tsx` | `/account` một phần | CODE_EXPORTED; nút lưu chỉ `alert` ([source](figma/src/app/pages/parent/ParentProfilePage.tsx#L18)) |
| `/parent/khieu-nai` | `shared/ComplaintsPage.tsx` | — | CODE_EXPORTED; state cục bộ, dùng chung với tutor |

Luồng: CTA → form yêu cầu (môn, lớp, khu vực, học phí, thời gian, yêu cầu khác) → danh sách/lọc/chi tiết. Export khởi tạo dữ liệu `MOCK` rồi thêm yêu cầu qua `setRequests` ([`TutorRequestPage.tsx`](figma/src/app/pages/parent/TutorRequestPage.tsx#L343)); khiếu nại cũng chỉ thay state cục bộ ([`ComplaintsPage.tsx`](figma/src/app/pages/shared/ComplaintsPage.tsx#L96)).

## Gia sư

Role `tutor`, dùng [`Layout`](figma/src/app/components/Layout.tsx#L96); route: [`routes.tsx` dòng 222–350](figma/src/app/routes.tsx#L222). Menu: Trang chủ, Hồ sơ, tìm/nhận lớp, hướng dẫn, hợp đồng, bảng giá, blog, khiếu nại, liên hệ.

| Route export | Page trong `figma/src/app/pages/` | App hiện tại | Trạng thái/ý nghĩa |
|---|---|---|---|
| `/tutor` | `tutor/TutorDashboard.tsx` | — | CODE_EXPORTED |
| `/tutor/classes` | `tutor/TutorClassesPage.tsx` | `/tutor/bookings` chỉ gần ý định | CODE_EXPORTED; danh sách mock |
| `/tutor/profile` | `tutor/TutorProfilePage.tsx` | `/tutor/profile`, `/tutor/availability` một phần | CODE_EXPORTED; hồ sơ/xác minh/sở thích/thời gian dạy; lưu chỉ toast ([source](figma/src/app/pages/tutor/TutorProfilePage.tsx#L191)) |
| `/tutor/contracts` | `tutor/TutorContractsPage.tsx` | — | CODE_EXPORTED |
| `/tutor/signed-contracts` | `tutor/TutorContractsPage.tsx` | — | **ALIAS** cùng component `/tutor/contracts` |
| `/tutor/pricing` | `parent/ParentPricingPage.tsx` | — | CODE_EXPORTED; tái dùng component parent |
| `/tutor/blog` | `tutor/TutorBlogPage.tsx` | — | CODE_EXPORTED |
| `/tutor/new-classes` | `tutor/TutorNewClassesPage.tsx` | — | CODE_EXPORTED; lớp mock, nhận lớp chỉ `alert` |
| `/tutor/matched-classes` | `tutor/TutorMatchedClassesPage.tsx` | — | CODE_EXPORTED; đề xuất mock, nhận lớp chỉ `alert` |
| `/tutor/how-to-accept` | `tutor/TutorHowToAcceptPage.tsx` | — | CODE_EXPORTED |
| `/tutor/tutor-blog` | `tutor/TutorBlogPage.tsx` | — | **ALIAS** của `/tutor/blog` |
| `/tutor/class-history` | `tutor/TutorClassHistoryPage.tsx` | — | CODE_EXPORTED; lịch sử mock |
| `/tutor/responsibility-terms` | `tutor/TutorResponsibilityTermsPage.tsx` | — | CODE_EXPORTED; bài test lưu kết quả trong `localStorage` |
| `/tutor/contact` | `public/ContactPage.tsx` | — | CODE_EXPORTED; util link liên hệ dẫn sai path |
| `/tutor/class-requests` | `tutor/TutorClassRequestsPage.tsx` | — | CODE_EXPORTED; đã đăng ký/được đề xuất/nhận lớp/phí, dữ liệu mock |
| `/tutor/khieu-nai` | `shared/ComplaintsPage.tsx` | — | CODE_EXPORTED; tái dùng page parent |

Luồng: tìm/lọc lớp → xem chi tiết → đăng ký/nhận lớp → điều khoản và bài test → admin duyệt → hợp đồng/phí/thông tin phụ huynh. `termsTestPassed` và `pendingClassAccept` lưu trong `localStorage` ([`TutorNewClassesPage.tsx`](figma/src/app/pages/tutor/TutorNewClassesPage.tsx#L134), [`TutorResponsibilityTermsPage.tsx`](figma/src/app/pages/tutor/TutorResponsibilityTermsPage.tsx#L85)); phần nhận lớp, thanh toán chỉ `alert`/modal ([`TutorClassRequestsPage.tsx`](figma/src/app/pages/tutor/TutorClassRequestsPage.tsx#L386)).

## Admin

Role `admin`, dùng [`AdminLayout`](figma/src/app/components/AdminLayout.tsx#L90); route: [`routes.tsx` dòng 351–533](figma/src/app/routes.tsx#L351). Menu: Tổng quan, Người dùng, Yêu cầu tìm gia sư, Lớp học, Yêu cầu nhận lớp, Nội dung, Dịch vụ & Giá, Báo cáo, Khiếu nại.

| Route export | Page trong `figma/src/app/pages/` | App hiện tại | Trạng thái/ý nghĩa |
|---|---|---|---|
| `/admin` | `admin/AdminDashboard.tsx` | — | CODE_EXPORTED; card báo cáo dẫn placeholder |
| `/admin/users` | `admin/AdminUsersPage.tsx` | `/admin/tutors` một phần | CODE_EXPORTED; quản lý user, khóa/mở, duyệt tutor |
| `/admin/requests` | `admin/AdminRequestsPage.tsx` | — | CODE_EXPORTED; yêu cầu tổng quát |
| `/admin/requests/find-tutor` | `admin/AdminFindTutorRequestsPage.tsx` | — | CODE_EXPORTED; thêm/xem yêu cầu, gán tutor, tạo lớp |
| `/admin/requests/accept-class` | `admin/AdminAcceptClassRequestsPage.tsx` | — | CODE_EXPORTED; duyệt/từ chối nhận lớp |
| `/admin/classes` | `admin/AdminClassesPage.tsx` | — | CODE_EXPORTED; tạo/sửa/xóa lớp |
| `/admin/tutor-approval` | inline trong router | `/admin/tutors` một phần | **PLACEHOLDER**; export có duyệt tutor tại `/admin/users` |
| `/admin/services` | `admin/AdminServicesPage.tsx` | — | CODE_EXPORTED; CRUD gói demo |
| `/admin/pricing` | `admin/AdminPricingFeesPage.tsx` | — | CODE_EXPORTED; bảng giá/phí demo |
| `/admin/content/blog` | `admin/AdminBlogPage.tsx` | — | CODE_EXPORTED; CRUD bài demo |
| `/admin/content/faq` | inline trong router | — | **PLACEHOLDER** |
| `/admin/content/contracts` | `admin/AdminContractsPage.tsx` | — | CODE_EXPORTED; lưu chỉ toast |
| `/admin/content/terms` | `admin/AdminTermsResponsibilityPage.tsx` | — | CODE_EXPORTED; nội dung và câu hỏi test, lưu chỉ toast/state |
| `/admin/content/how-to-accept` | `admin/AdminHowToAcceptPage.tsx` | — | CODE_EXPORTED; lưu chỉ toast |
| `/admin/support` | `admin/AdminComplaintsPage.tsx` | — | CODE_EXPORTED; xử lý/từ chối khiếu nại demo |
| `/admin/reports` | inline trong router | — | **PLACEHOLDER** |
| `/admin/reports/conversion` | `admin/AdminReportsConversionPage.tsx` | — | CODE_EXPORTED; funnel/in/PDF, số liệu tĩnh |
| `/admin/reports/no-tutor` | `admin/AdminReportsNoTutorPage.tsx` | — | CODE_EXPORTED; lớp chưa có gia sư/in/PDF, số liệu tĩnh |
| `/admin/reports/revenue` | `admin/AdminReportsRevenuePage.tsx` | — | CODE_EXPORTED; doanh thu/in/PDF, số liệu tĩnh |
| `/admin/settings` | inline trong router | — | **PLACEHOLDER** |

Luồng: phụ huynh gửi yêu cầu → admin xem/gán tutor hoặc tạo lớp ([`AdminFindTutorRequestsPage.tsx`](figma/src/app/pages/admin/AdminFindTutorRequestsPage.tsx#L216)); tutor đăng ký/được đề xuất → admin duyệt/từ chối ([`AdminAcceptClassRequestsPage.tsx`](figma/src/app/pages/admin/AdminAcceptClassRequestsPage.tsx#L148)); admin quản lý người dùng, lớp, gói, giá, nội dung, khiếu nại, báo cáo. Mỗi page hiện có tập state/dữ liệu riêng; báo cáo khai báo hằng mẫu ([conversion](figma/src/app/pages/admin/AdminReportsConversionPage.tsx#L27), [revenue](figma/src/app/pages/admin/AdminReportsRevenuePage.tsx#L27)).

## Lưu ý triển khai từ audit code export

1. **Mô hình nghiệp vụ đổi:** export tập trung vào trung tâm môi giới, lớp học, yêu cầu tìm tutor/gán/nhận lớp, phí và hợp đồng. App đang chạy tập trung vào hồ sơ tutor, availability và booking slot 30 phút ([router hiện tại](src/client/app/router.tsx#L20)). Phải định nghĩa lại schema/API, role, ownership và state transition; không coi route tương tự là nghiệp vụ tương đương.
2. **Auth export là demo:** `AuthContext` tạo user mock và lưu `localStorage`; `ProtectedRoute` tin role từ đó ([`AuthContext.tsx`](figma/src/app/contexts/AuthContext.tsx#L25), [`routes.tsx`](figma/src/app/routes.tsx#L63)). Server app thật phải xác thực và phân quyền.
3. **Đăng ký lỗi:** form truyền 5 đối số cho `register`, kiểm tra return như boolean rồi chuyển `/parent/dashboard`, `/tutor/dashboard`, `/admin/dashboard`; context chỉ nhận 4 đối số và trả `Promise<void>`, ba dashboard URL đều chưa khai báo ([`RegisterPage.tsx`](figma/src/app/pages/RegisterPage.tsx#L40), [`AuthContext.tsx`](figma/src/app/contexts/AuthContext.tsx#L12)). Route home có thật là `/parent`, `/tutor`, `/admin`.
4. **Link liên hệ lỗi với tutor/admin:** util sinh `/${role}/lien-he`, trong khi router dùng `/tutor/contact` và không có `/admin/lien-he` ([`getContactLink.ts`](figma/src/app/utils/getContactLink.ts#L6), [`routes.tsx`](figma/src/app/routes.tsx#L328)).
5. **Router có object rỗng** ngay sau `/admin/users` ([`routes.tsx`](figma/src/app/routes.tsx#L369)). Có **năm placeholder**: `/forgot-password`, `/admin/tutor-approval`, `/admin/content/faq`, `/admin/reports`, `/admin/settings`. Wildcard `*` là 404 ([`routes.tsx`](figma/src/app/routes.tsx#L534)).
6. **File không reachable:** `LandingPage.tsx`, `parent/ParentDashboard.tsx`, `ParentHomePage.tsx`, `ServicePackagesPage.tsx`, `ParentBlogPage.tsx`, `ParentContactPage.tsx` không gắn route ([imports router](figma/src/app/routes.tsx#L4)); không tính là màn hình đã có. `ParentDashboard` còn dẫn `/parent/services`, `/parent/pricing`, `/parent/contact` không khai báo ([source](figma/src/app/pages/parent/ParentDashboard.tsx#L19)).
7. **Các thao tác demo cần nối API thật:** form liên hệ, yêu cầu phụ huynh, nhận lớp, thanh toán, hồ sơ, CRUD admin, khiếu nại và báo cáo hiện dùng mock/React state/alert/toast, không có luồng dữ liệu chung. Khi triển khai phải bổ sung loading, empty, lỗi, validation, giao dịch và kiểm thử chuyển trạng thái.

## Baseline thực thi local — 2026-10-11

- Nguồn: `figma/README.md` ghi code bundle Tutor Matching Platform; bản local có 126 file, khoảng 2,91 MB, trong đó 49 page TSX. SHA-256: `figma/README.md` = `14986BB627B8EA2C30DB46C93FDA1D86B3D084BF0CFC699D6BB6431EF215ADEF`; `figma/package.json` = `7C67F6347533DEF416803E1A313D8743AACBB26EF3934E08D3104E5CAB1C51F1`; `figma/src/app/routes.tsx` = `AD2D02E2D22E4CA063668B7260D60BD28646814B4DDEF106816E3F3F02BAC192`. Tính lại bằng `Get-FileHash -Algorithm SHA256` trên bản export local trước khi đối chiếu.
- Router: đếm 59 path cụ thể, 1 wildcard, 1 route object rỗng. Sáu page TSX không được route mount như mục 6 ở trên. `/tutor/new-classes` và `/tutor/matched-classes` **có** route mount; `ServicePackagesPage` không có. Năm path placeholder được liệt kê ở mục 5.
- Đã copy export sang thư mục tạm, cài dependency tại bản copy và chạy `npm run build`: **PASS** với Vite 6.3.5, 2.627 module; bundle JS chính 1.887,09 kB (gzip 506,50 kB) và có cảnh báo chunk lớn. `figma/package.json` không có lint/typecheck/test; build Vite không kiểm tra TypeScript nghiêm ngặt. Không chỉnh source export.
- Đã serve `dist` local và chụp/kiểm ảnh trang `/` bằng Edge headless tại 320×900, 768×900, 1280×800. Desktop/tablet render; tại 320 px, tiêu đề hero, CTA điện thoại và thẻ thống kê bị cắt/tràn ngang. Screenshot chỉ nằm trong thư mục tạm vì có thông tin liên hệ chưa xác nhận, không đưa vào Git. Đây là smoke UI trang public, chưa kiểm nghiệm mọi route, form, vai trò hoặc WCAG.
- Bốn PNG trong `figma/src/imports/` không được import từ app. Kiểm ảnh cho thấy screenshot của dự án Figma khác, thông tin liên hệ và trường CCCD mẫu; loại khỏi mọi commit/public bundle. `figma/ATTRIBUTIONS.md` chỉ nêu shadcn/ui MIT và Unsplash; quyền/nguồn của screenshot và toàn bộ bundle chưa được xác nhận để công bố. Xem `FIGMA_GAP_LOG.md` FIG-024–026.
- Build Worker hiện tại trỏ `index.html` → `src/client/main.tsx` và `tsconfig.app.json` chỉ include `src/client`, `src/shared`. Build export riêng không tích hợp hoặc triển khai sản phẩm mới trên Worker.

## Lịch sử — inventory PRV trước khi có code export

Các mã `PRV-xx` bên dưới lấy từ kế hoạch cũ khi chưa có source. Chúng **không phải frame Figma** và không còn là mục tiêu sản phẩm. Giữ để truy vết quyết định; không triển khai tiếp từ bảng này.

> **Nguồn của bảng lịch sử:** danh mục lấy từ `PLAN.md` §2 và nghiệp vụ trong `PLAN.md` §3 trước khi người dùng cung cấp code export. Các mã `PRV-xx` là mã tạm, không có frame ID thật. Trạng thái `UNVERIFIED` ở bảng này chỉ mô tả giả định cũ.

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

**Ghi chú phạm vi cũ (không áp dụng cho mục tiêu mới):** `/messages`, `/payments`, `/reviews`, `/admin/reports` từng được xếp P2. Export mới có luồng phí/thanh toán demo và ba trang báo cáo admin; cần đặc tả lại phạm vi.

Khi truy cập được Figma Make trực tiếp: đối chiếu mã export với frame/node và responsive state, rồi ghi khác biệt vào `FIGMA_GAP_LOG.md`.

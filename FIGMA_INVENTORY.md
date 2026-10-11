# FIGMA_INVENTORY — ánh xạ từ code export Figma Make

> **Mục tiêu sản phẩm hiện hành:** [Tutor Matching Platform trên Figma Make](https://www.figma.com/make/nhljatxXx9lap98Zx7s4AU/Tutor-Matching-Platform?p=f&t=F5iHIZDcvYVKK1to-0&fullscreen=1), với code export người dùng đặt ở [`./figma`](figma/README.md). Code này thay thế mô hình marketplace/đặt slot `PRV-01`–`PRV-11` bên dưới, không chỉ bổ sung skin giao diện.
> **Mức xác minh:** Đã đọc tĩnh code export, chưa xem được frame/node trực tiếp trên Figma Make; không có frame ID, breakpoint đo từ Figma hoặc xác nhận pixel-perfect. `CODE_EXPORTED` = có source UI, **không** có nghĩa là đã kết nối backend hay qua QA. Router export khai báo 59 URL cụ thể (12 public/auth, 11 parent, 16 tutor, 20 admin), wildcard 404 và một object rỗng ([`routes.tsx`](figma/src/app/routes.tsx#L77)). Cột app được đối chiếu lại với [`src/client/app/router.tsx`](src/client/app/router.tsx) ngày 2026-10-11; `—` nghĩa là chưa có route nghiệp vụ. Các route mới vẫn cần E2E với local D1 và kiểm tra giao diện thực tế.

> **LOCAL_ONLY:** `./figma` là bản export do người dùng cung cấp tại máy và được Git ignore vì chứa dữ liệu/ảnh mẫu chưa duyệt. Các liên kết tương đối đến `figma/` trong tài liệu chỉ mở được trong workspace có export; chúng không phải bằng chứng source đã có trên GitHub. Không stage/push nguyên thư mục.

**Tên giao diện:** `figma/src/app/pages/public/PublicLayout.tsx` và `HomePage.tsx` dùng **Gia Sư Đỗ Hằng** với khẩu hiệu **Uy tín - Chất lượng**; slug Figma “Tutor Matching Platform” là tên đường dẫn của source. Bản tích hợp dùng tên này ở trang công khai, đăng nhập, shell các vai trò và tiêu đề trình duyệt. Màu và bố cục các màn trọng tâm được đối chiếu với export local; điều đó chưa xác nhận hình ảnh của frame Make hiện tại.

## Public và tài khoản

Route: [`routes.tsx` dòng 77–132](figma/src/app/routes.tsx#L77). Shell, menu và footer: [`PublicLayout.tsx`](figma/src/app/pages/public/PublicLayout.tsx#L21).

| Route export | Page trong `figma/src/app/pages/` | App hiện tại | Trạng thái/ý nghĩa |
|---|---|---|---|
| `/` | `public/HomePage.tsx` | `/` | CODE_EXPORTED; hero, thẻ vai trò, quy trình và CTA theo bố cục export, dùng dữ liệu/copy đã duyệt thay số mẫu |
| `/gioi-thieu` | `public/AboutPage.tsx` | `/gioi-thieu` + CMS published | CODE_EXPORTED; nội dung seed đã duyệt, sửa bằng revision |
| `/dich-vu` | `public/ServicesPage.tsx` | `/dich-vu` + CMS service | CODE_EXPORTED; có một dịch vụ seed được duyệt, không có gói thanh toán |
| `/bang-gia` | `public/PricingPage.tsx` | `/bang-gia` + fee versions | CODE_EXPORTED; phụ huynh miễn phí, mức phí gia sư chỉ hiện sau khi admin publish |
| `/lop-hoc` | `public/ClassListPage.tsx` | `/lop-hoc` + API lớp công khai | CODE_EXPORTED; chỉ trường public, không lộ contact |
| `/blog/phu-huynh` | `public/BlogParentPage.tsx` | `/blog/phu-huynh` + CMS | CODE_EXPORTED; chưa seed bài viết, admin cần biên tập/publish |
| `/blog/gia-su` | `public/BlogTutorPage.tsx` | `/blog/gia-su` + CMS | CODE_EXPORTED; chưa seed bài viết, admin cần biên tập/publish |
| `/blog/:category/:id` | `public/BlogDetailPage.tsx` | `/blog/:category/:id` | CODE_EXPORTED; chỉ revision đã publish, kiểm prefix danh mục |
| `/lien-he` | `public/ContactPage.tsx` | `/lien-he` + CMS published | CODE_EXPORTED; thông tin Hà Nội được user duyệt; không mở form gửi vì email chưa có dịch vụ |
| `/login` | `LoginPage.tsx` | `/sign-in` | CODE_EXPORTED; login mock |
| `/register` | `RegisterPage.tsx` | `/sign-up` | CODE_EXPORTED; redirect sau đăng ký lỗi, xem mục lưu ý |
| `/forgot-password` | inline trong router | `/forgot-password` unavailable | **PLACEHOLDER** trong export; email khôi phục chưa có dịch vụ |

CTA thuê gia sư dẫn `/parent` nếu đã đăng nhập parent, ngoài ra `/login` ([`getCTALink.ts`](figma/src/app/utils/getCTALink.ts#L6)); CTA tìm lớp dẫn `/parent/lop-hoc` cho parent, ngoài ra `/lop-hoc` ([`getTutorFindClassLink.ts`](figma/src/app/utils/getTutorFindClassLink.ts#L6)).

## Phụ huynh

Role `parent`, dùng [`Layout`](figma/src/app/components/Layout.tsx#L63); route: [`routes.tsx` dòng 133–221](figma/src/app/routes.tsx#L133). Menu: Trang chủ, Giới thiệu, Thuê gia sư, Bảng giá, Tin tức, Khiếu nại, Liên hệ.

| Route export | Page trong `figma/src/app/pages/` | App hiện tại | Trạng thái/ý nghĩa |
|---|---|---|---|
| `/parent` | `parent/TutorRequestPage.tsx` | `/parent`, `/parent/request`, `/parent/requests/:id` | CODE_EXPORTED; API yêu cầu thật, booking cũ riêng |
| `/parent/trang-chu` | `public/HomePage.tsx` | `/` một phần | CODE_EXPORTED; tái dùng public page |
| `/parent/gioi-thieu` | `public/AboutPage.tsx` | redirect `/gioi-thieu` | CODE_EXPORTED; tái dùng |
| `/parent/dich-vu` | `public/ServicesPage.tsx` | redirect `/dich-vu` | CODE_EXPORTED; tái dùng |
| `/parent/bang-gia` | `public/PricingPage.tsx` | redirect `/bang-gia` | CODE_EXPORTED; tái dùng |
| `/parent/lop-hoc` | `public/ClassListPage.tsx` | `/parent/lop-hoc` | CODE_EXPORTED; tái dùng dữ liệu lớp công khai |
| `/parent/blog` | `public/BlogParentPage.tsx` | redirect `/blog/phu-huynh` | CODE_EXPORTED; tái dùng |
| `/parent/lien-he` | `public/ContactPage.tsx` | redirect `/lien-he` | CODE_EXPORTED; tái dùng |
| `/parent/request` | `parent/TutorRequestPage.tsx` | `/parent/request` | CODE_EXPORTED; form tạo yêu cầu, consent bắt buộc |
| `/parent/profile` | `parent/ParentProfilePage.tsx` | `/parent/profile` + API | CODE_EXPORTED; lưu tên/điện thoại thật, không lưu địa chỉ chung trong profile |
| `/parent/khieu-nai` | `shared/ComplaintsPage.tsx` | `/parent/khieu-nai` + API | CODE_EXPORTED; dữ liệu server, không đính kèm tệp |

Trong **export**, yêu cầu khởi tạo bằng `MOCK` và `setRequests` ([`TutorRequestPage.tsx`](figma/src/app/pages/parent/TutorRequestPage.tsx#L343)); khiếu nại chỉ thay state cục bộ ([`ComplaintsPage.tsx`](figma/src/app/pages/shared/ComplaintsPage.tsx#L96)). App hiện tại dùng API D1 cho hai luồng; form yêu cầu cần consent trước khi gửi.

## Gia sư

Role `tutor`, dùng [`Layout`](figma/src/app/components/Layout.tsx#L96); route: [`routes.tsx` dòng 222–350](figma/src/app/routes.tsx#L222). Menu: Trang chủ, Hồ sơ, tìm/nhận lớp, hướng dẫn, hợp đồng, bảng giá, blog, khiếu nại, liên hệ.

| Route export | Page trong `figma/src/app/pages/` | App hiện tại | Trạng thái/ý nghĩa |
|---|---|---|---|
| `/tutor` | `tutor/TutorDashboard.tsx` | `/tutor` | CODE_EXPORTED; dashboard dữ liệu server |
| `/tutor/classes` | `tutor/TutorClassesPage.tsx` | `/tutor/classes` | CODE_EXPORTED; lớp được gán từ API, lịch sử rút gán/hoàn tất có màn riêng |
| `/tutor/profile` | `tutor/TutorProfilePage.tsx` | `/tutor/profile`, `/tutor/availability` | CODE_EXPORTED; lưu/gửi duyệt thật; upload CCCD/bằng cấp hoãn theo user |
| `/tutor/contracts` | `tutor/TutorContractsPage.tsx` | `/tutor/contracts` | CODE_EXPORTED; bản phát hành và xác nhận server, cần policy được publish |
| `/tutor/signed-contracts` | `tutor/TutorContractsPage.tsx` | redirect `/tutor/contracts` | **ALIAS** cùng component `/tutor/contracts` |
| `/tutor/pricing` | `parent/ParentPricingPage.tsx` | redirect `/bang-gia` | CODE_EXPORTED; giá từ fee versions đã publish |
| `/tutor/blog` | `tutor/TutorBlogPage.tsx` | redirect `/blog/gia-su` | CODE_EXPORTED; bài từ CMS |
| `/tutor/new-classes` | `tutor/TutorNewClassesPage.tsx` | `/tutor/new-classes` | CODE_EXPORTED; lọc lớp thật, ứng tuyển có gate phí/điều khoản |
| `/tutor/matched-classes` | `tutor/TutorMatchedClassesPage.tsx` | `/tutor/matched-classes` | CODE_EXPORTED; lớp gợi ý từ API; không hứa intelligent matching |
| `/tutor/how-to-accept` | `tutor/TutorHowToAcceptPage.tsx` | `/tutor/how-to-accept` + CMS guide | CODE_EXPORTED; hiển thị khi admin publish hướng dẫn |
| `/tutor/tutor-blog` | `tutor/TutorBlogPage.tsx` | redirect `/tutor/blog` | **ALIAS** của `/tutor/blog` |
| `/tutor/class-history` | `tutor/TutorClassHistoryPage.tsx` | `/tutor/class-history` | CODE_EXPORTED; GET `/tutor/assignments/history`, phân trang và ẩn liên hệ riêng của phụ huynh |
| `/tutor/responsibility-terms` | `tutor/TutorResponsibilityTermsPage.tsx` | redirect `/tutor/terms` | CODE_EXPORTED; bài kiểm tra và xác nhận lưu server |
| `/tutor/contact` | `public/ContactPage.tsx` | redirect `/lien-he` | CODE_EXPORTED; dùng thông tin liên hệ đã duyệt |
| `/tutor/class-requests` | `tutor/TutorClassRequestsPage.tsx` | `/tutor/class-requests` | CODE_EXPORTED; ứng tuyển/rút đơn từ API; gán là lớp active ngay |
| `/tutor/khieu-nai` | `shared/ComplaintsPage.tsx` | `/tutor/khieu-nai` + API | CODE_EXPORTED; dữ liệu server, không đính kèm tệp |

Trong **export**, `termsTestPassed`/`pendingClassAccept` lưu `localStorage` và thanh toán chỉ `alert`/modal ([`TutorNewClassesPage.tsx`](figma/src/app/pages/tutor/TutorNewClassesPage.tsx#L134), [`TutorClassRequestsPage.tsx`](figma/src/app/pages/tutor/TutorClassRequestsPage.tsx#L386)). App hiện tại lưu quiz/ack/ứng tuyển/hợp đồng phía server; tutor chỉ ứng tuyển sau khi điều khoản, bài kiểm tra và cả ba phiên bản phí được admin publish, qua bài kiểm tra và xác nhận. Gán tutor là thao tác làm lớp active ngay.

## Admin

Role `admin`, dùng [`AdminLayout`](figma/src/app/components/AdminLayout.tsx#L90); route: [`routes.tsx` dòng 351–533](figma/src/app/routes.tsx#L351). Menu: Tổng quan, Người dùng, Yêu cầu tìm gia sư, Lớp học, Yêu cầu nhận lớp, Nội dung, Dịch vụ & Giá, Báo cáo, Khiếu nại.

| Route export | Page trong `figma/src/app/pages/` | App hiện tại | Trạng thái/ý nghĩa |
|---|---|---|---|
| `/admin` | `admin/AdminDashboard.tsx` | `/admin` | CODE_EXPORTED; dashboard đọc dữ liệu server |
| `/admin/users` | `admin/AdminUsersPage.tsx` | `/admin/users`, `/admin/tutors` | CODE_EXPORTED; user search/khóa/mở, duyệt tutor từ server |
| `/admin/requests` | `admin/AdminRequestsPage.tsx` | `/admin/requests` | CODE_EXPORTED; yêu cầu từ API |
| `/admin/requests/find-tutor` | `admin/AdminFindTutorRequestsPage.tsx` | redirect `/admin/requests` | CODE_EXPORTED; gán và công bố lớp qua thao tác thật |
| `/admin/requests/accept-class` | `admin/AdminAcceptClassRequestsPage.tsx` | `/admin/requests/accept-class` | CODE_EXPORTED; xét đơn ứng tuyển |
| `/admin/classes` | `admin/AdminClassesPage.tsx` | `/admin/classes` | CODE_EXPORTED; quản lý lớp từ API, không xóa lịch sử tùy ý |
| `/admin/tutor-approval` | inline trong router | redirect `/admin/tutors` | **PLACEHOLDER** export; app có duyệt tutor thật |
| `/admin/services` | `admin/AdminServicesPage.tsx` | `/admin/services` + CMS | CODE_EXPORTED; draft/publish dịch vụ, không giao dịch gói |
| `/admin/pricing` | `admin/AdminPricingFeesPage.tsx` | `/admin/pricing` + fee versions | CODE_EXPORTED; admin cấu hình/publish ba lựa chọn phí |
| `/admin/content/blog` | `admin/AdminBlogPage.tsx` | `/admin/content/blog` + CMS | CODE_EXPORTED; draft/publish, slug gắn danh mục |
| `/admin/content/faq` | inline trong router | `/admin/content/faq` + CMS | **PLACEHOLDER** export; app hỗ trợ FAQ thật |
| `/admin/content/contracts` | `admin/AdminContractsPage.tsx` | `/admin/content/contracts` + CMS | CODE_EXPORTED; mẫu hợp đồng versioned |
| `/admin/content/terms` | `admin/AdminTermsResponsibilityPage.tsx` | `/admin/content/terms`, `/admin/terms/quiz` | CODE_EXPORTED; nội dung và bài kiểm tra versioned |
| `/admin/content/how-to-accept` | `admin/AdminHowToAcceptPage.tsx` | `/admin/content/how-to-accept` + CMS | CODE_EXPORTED; bản hướng dẫn có draft/publish |
| `/admin/support` | `admin/AdminComplaintsPage.tsx` | `/admin/support` + API | CODE_EXPORTED; xử lý khiếu nại có audit, không file đính kèm |
| `/admin/reports` | inline trong router | `/admin/reports` | **PLACEHOLDER** export; app có báo cáo từ dữ liệu server |
| `/admin/reports/conversion` | `admin/AdminReportsConversionPage.tsx` | `/admin/reports/conversion` | CODE_EXPORTED; chỉ số theo dữ liệu server, không số mẫu |
| `/admin/reports/no-tutor` | `admin/AdminReportsNoTutorPage.tsx` | `/admin/reports/no-tutor` | CODE_EXPORTED; lớp thật chưa được gán |
| `/admin/reports/revenue` | `admin/AdminReportsRevenuePage.tsx` | `/admin/reports/revenue` | CODE_EXPORTED; không tạo doanh thu giả khi chưa có giao dịch |
| `/admin/settings` | inline trong router | `/admin/settings` | **PLACEHOLDER** export; app có hub đến tám trang cấu hình/nội dung thật, không ghi thay đổi giả |

Trong **export**, mỗi page admin dùng tập state/dữ liệu riêng và báo cáo hằng mẫu ([conversion](figma/src/app/pages/admin/AdminReportsConversionPage.tsx#L27), [revenue](figma/src/app/pages/admin/AdminReportsRevenuePage.tsx#L27)). App hiện tại có API D1 cho yêu cầu, lớp, đơn, tài khoản, nội dung, phí, điều khoản, hợp đồng, khiếu nại và báo cáo. Dịch vụ/gói giao dịch, hình ảnh, email và payment chưa mở.

## Lưu ý triển khai từ audit code export

1. **Mô hình nghiệp vụ đổi:** export tập trung vào lớp học, yêu cầu tìm tutor/gán/ứng tuyển, phí và hợp đồng. App đã thêm schema/API/route sản phẩm mới; booking slot 30 phút là lịch sử riêng. Cần xác nhận bằng E2E, không suy luận từ route trùng tên.
2. **Auth export là demo:** `AuthContext` tạo user mock và lưu `localStorage`; `ProtectedRoute` tin role từ đó ([`AuthContext.tsx`](figma/src/app/contexts/AuthContext.tsx#L25), [`routes.tsx`](figma/src/app/routes.tsx#L63)). App dùng session, CSRF và RBAC phía server; không port auth export.
3. **Đăng ký export lỗi:** form truyền 5 đối số cho `register`, kiểm tra return như boolean rồi chuyển URL sai ([`RegisterPage.tsx`](figma/src/app/pages/RegisterPage.tsx#L40), [`AuthContext.tsx`](figma/src/app/contexts/AuthContext.tsx#L12)). App dùng `/sign-up` và điều hướng `/parent` hoặc `/tutor`; moderator không self-register.
4. **Link liên hệ lỗi với tutor/admin:** util sinh `/${role}/lien-he`, trong khi router dùng `/tutor/contact` và không có `/admin/lien-he` ([`getContactLink.ts`](figma/src/app/utils/getContactLink.ts#L6), [`routes.tsx`](figma/src/app/routes.tsx#L328)).
5. **Router có object rỗng** ngay sau `/admin/users` ([`routes.tsx`](figma/src/app/routes.tsx#L369)). Có **năm placeholder**: `/forgot-password`, `/admin/tutor-approval`, `/admin/content/faq`, `/admin/reports`, `/admin/settings`. Wildcard `*` là 404 ([`routes.tsx`](figma/src/app/routes.tsx#L534)).
6. **File không reachable:** `LandingPage.tsx`, `parent/ParentDashboard.tsx`, `ParentHomePage.tsx`, `ServicePackagesPage.tsx`, `ParentBlogPage.tsx`, `ParentContactPage.tsx` không gắn route ([imports router](figma/src/app/routes.tsx#L4)); không tính là màn hình đã có. `ParentDashboard` còn dẫn `/parent/services`, `/parent/pricing`, `/parent/contact` không khai báo ([source](figma/src/app/pages/parent/ParentDashboard.tsx#L19)).
7. **Thao tác demo trong export:** form liên hệ, yêu cầu, nhận lớp, thanh toán, hồ sơ, CRUD admin, khiếu nại và báo cáo dùng mock/React state/alert/toast. App đã nối API cho nghiệp vụ được duyệt; contact dùng `tel:`/`mailto:`, không giả gửi email hoặc thanh toán. Còn E2E chuyển trạng thái và QA toàn màn hình.

## Baseline thực thi local — 2026-10-11

- Nguồn: `figma/README.md` ghi code bundle Tutor Matching Platform; bản local có 126 file, khoảng 2,91 MB, trong đó 49 page TSX. SHA-256: `figma/README.md` = `14986BB627B8EA2C30DB46C93FDA1D86B3D084BF0CFC699D6BB6431EF215ADEF`; `figma/package.json` = `7C67F6347533DEF416803E1A313D8743AACBB26EF3934E08D3104E5CAB1C51F1`; `figma/src/app/routes.tsx` = `AD2D02E2D22E4CA063668B7260D60BD28646814B4DDEF106816E3F3F02BAC192`. Tính lại bằng `Get-FileHash -Algorithm SHA256` trên bản export local trước khi đối chiếu.
- Router: đếm 59 path cụ thể, 1 wildcard, 1 route object rỗng. Sáu page TSX không được route mount như mục 6 ở trên. `/tutor/new-classes` và `/tutor/matched-classes` **có** route mount; `ServicePackagesPage` không có. Năm path placeholder được liệt kê ở mục 5.
- Đã copy export sang thư mục tạm, cài dependency tại bản copy và chạy `npm run build`: **PASS** với Vite 6.3.5, 2.627 module; bundle JS chính 1.887,09 kB (gzip 506,50 kB) và có cảnh báo chunk lớn. `figma/package.json` không có lint/typecheck/test; build Vite không kiểm tra TypeScript nghiêm ngặt. Không chỉnh source export.
- Đã serve `dist` local và chụp/kiểm ảnh trang `/` bằng Edge headless tại 320×900, 768×900, 1280×800. Desktop/tablet render; tại 320 px, tiêu đề hero, CTA điện thoại và thẻ thống kê bị cắt/tràn ngang. Screenshot chỉ nằm trong thư mục tạm vì có thông tin liên hệ chưa xác nhận, không đưa vào Git. Đây là smoke UI trang public, chưa kiểm nghiệm mọi route, form, vai trò hoặc WCAG.
- Bốn PNG trong `figma/src/imports/` không được import từ app. Kiểm ảnh cho thấy screenshot của dự án Figma khác, thông tin liên hệ và trường CCCD mẫu; loại khỏi mọi commit/public bundle. `figma/ATTRIBUTIONS.md` chỉ nêu shadcn/ui MIT và Unsplash; quyền/nguồn của screenshot và toàn bộ bundle chưa được xác nhận để công bố. Xem `FIGMA_GAP_LOG.md` FIG-024–026.
- Baseline export ở trên là lịch sử trước tích hợp. App hiện trỏ `index.html` → `src/client/main.tsx`; route/API mới nằm trong app chính. Build export riêng không chứng minh Worker đã triển khai bản mới.

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

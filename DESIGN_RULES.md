# DESIGN RULES — Gia Sư Đỗ Hằng

> Version 0.2 / 2026-10-11
> Dùng như specification cho UI/UX, code review và AI coding assistant.  
> Nguồn thiết kế cho toàn bộ project: [Tutor Matching Platform trên Figma Make](https://www.figma.com/make/nhljatxXx9lap98Zx7s4AU/Tutor-Matching-Platform?p=f&t=F5iHIZDcvYVKK1to-0&fullscreen=1).
> **Nguồn kiểm chứng hiện có:** thư mục `figma/` là code export người dùng cung cấp cho cùng project. Có thể xác minh route, component và giá trị style được dùng trong code export; chưa kiểm chứng trực tiếp frame, node ID, Auto Layout hay trạng thái đang xuất bản trên Figma Make. Quy tắc nghiệp vụ/a11y bên dưới vẫn là yêu cầu của hệ thống, không mặc nhiên là hành vi đã xác nhận từ export.

## A. Priority / source of truth

Thứ tự ưu tiên khi có xung đột:
1. Security, privacy, business invariants và accessibility bắt buộc.
2. UI có bằng chứng trong `figma/` và product requirement được xác nhận; khi truy cập được Figma trực tiếp, đối chiếu thêm frame/variant trước khi chốt độ trung thực hình ảnh.
3. `PLAN.md` (domain model, API, flows).
4. File này (`DESIGN_RULES.md`) và `AGENTS.md`.
5. Default library/component styles.

Không tự sáng tác trạng thái, màn hình, button hoặc feature không có trong scope. Nếu Figma thiếu error/empty/loading state, bổ sung theo rule dưới đây và ghi gap để review.

## B. Figma-to-code fidelity

Tên thương hiệu trên giao diện, tiêu đề trình duyệt và tài liệu giới thiệu là **Gia Sư Đỗ Hằng**, khẩu hiệu **Uy tín - Chất lượng**, quan sát từ `figma/src/app/pages/public/PublicLayout.tsx` và `HomePage.tsx`. Tên kỹ thuật của Figma Make URL và package không được dùng thay tên công khai. Các layout vai trò trong export dùng nhãn generic khác; bản tích hợp dùng một thương hiệu thống nhất cho mọi vai trò và vẫn hiển thị rõ vai trò phụ huynh, gia sư, kiểm duyệt viên.

### B1. Audit trước khi code UI
- Với mỗi route trong export, ghi file page/layout tương ứng, vai trò, CTA, navigation, dữ liệu đang mock và trạng thái tương tác; đối chiếu với route/API hiện tại trong `FIGMA_INVENTORY.md` và `FIGMA_GAP_LOG.md`.
- Từ code export chỉ ghi nhận giá trị thực sự xuất hiện: màu, font, spacing, radius, border, icon, shadow, container và responsive class. Không gán `frame_id`, viewport thiết kế, Auto Layout, constraints hoặc pixel-perfect khi chưa có bằng chứng trực tiếp từ Figma.
- Ánh xạ component export sang component React hiện tại trong `docs/FIGMA_COMPONENT_MAP.md`; tách phần có thể dùng lại về mặt hiển thị khỏi luồng nghiệp vụ/API cần thiết kế hoặc xác nhận thêm.
- Khi có frame/screenshot gốc, ghi node ID, viewport, variant (default/hover/focus/pressed/disabled/loading/error/success) và đối chiếu screenshot tại cùng viewport. Kiểm tra layout trước micro-styling.

### B2. Không làm
- Không dùng ảnh screenshot nguyên trang thay cho UI tương tác.
- Không thay component thiếu bằng placeholder vô hạn; nếu tạm, phải để issue và đánh dấu rõ.
- Không chọn ngẫu nhiên màu xanh/tím/font mới khi Figma đã có token.
- Không hardcode pixel rải rác trong JSX; đưa về token hoặc variant.
- Không import/export cả code bundle tự sinh từ Figma Make rồi đưa lên production mà chưa review dependency, semantics, auth và API.

## C. Design tokens — bằng chứng từ code export và ánh xạ trong app

Code export **không khai báo bộ brand token riêng**. `figma/src/styles/theme.css` và `figma/default_shadcn_theme.css` là theme shadcn mặc định (`--primary: #030213`, `--radius: 0.625rem`); `figma/src/styles/fonts.css` rỗng. Màu thương hiệu dưới đây lặp lại dưới dạng Tailwind arbitrary values trong các page/layout, vì vậy đây là **giá trị quan sát từ JSX**, chưa phải token do Figma công bố:

| Vai trò quan sát | Giá trị | Bằng chứng |
|---|---|---|
| Navy: header/footer, chữ, nút | `#0e2f5f` | `figma/src/app/pages/public/PublicLayout.tsx`, `figma/src/app/components/Layout.tsx` |
| Vàng: CTA, trạng thái nav, điểm nhấn | `#ffda68` | `figma/src/app/pages/public/PublicLayout.tsx`, `figma/src/app/pages/public/HomePage.tsx` |
| Navy sáng: điểm cuối gradient | `#1a4d8f` | `figma/src/app/pages/public/HomePage.tsx`, `figma/src/app/pages/parent/ParentDashboard.tsx` |
| Nền chính | `#ffffff` | `figma/src/styles/theme.css`; các layout dùng `bg-white` |

Các bố cục dùng Tailwind utilities (`px-4`, `py-16`/`py-20`, `gap-*`, `rounded-lg`/`rounded-xl`/`rounded-2xl`) chứ chưa có spacing/radius brand scale được khai báo. Export đặt cỡ chữ gốc 16px, heading qua Tailwind và không chỉ định font family riêng. Public navigation chuyển sang mobile tại `lg`; layout đã đăng nhập và admin tại `md`; `figma/src/app/components/ui/use-mobile.ts` dùng mốc 768px. Chưa có bằng chứng về các viewport frame gốc.

Ba màu brand đã được áp dụng vào `src/client/styles/tokens.css` trên nhánh triển khai; đoạn dưới là phần ánh xạ chính. Màu ngữ nghĩa còn lại, focus, radius và spacing vẫn là placeholder cần kiểm tra contrast/visual trước khi phát hành:

```css
:root {
  /* Brand values observed in export JSX; semantic mapping is proposed. */
  --color-bg: #ffffff;
  --color-surface: #f8fafc;
  --color-fg: #0f172a;
  --color-muted: #64748b;
  --color-primary: #0e2f5f;
  --color-on-primary: #ffffff;
  --color-accent: #ffda68;
  --color-primary-gradient-end: #1a4d8f;
  --color-border: #e2e8f0;
  --color-danger: #b91c1c;
  --color-success: #15803d;
  --color-focus: #2563eb;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
}
```

### C1. Token rules
- Colors dùng semantic names (`primary`, `surface`, `danger`, `success`, `muted`, `border`) thay vì đặt tên `blue600` trong component API.
- Hệ spacing 4px/8px trong snippet là baseline app hiện tại; class Tailwind trong export không chứng minh đây là thông số gốc của Figma.
- Typography trong export dùng base 16px và utility sizes/weights; font family cụ thể chưa được xác minh. Style display/heading/body/label/caption của app cần đối chiếu từng màn hình.
- `--radius: 0.625rem` trong export là mặc định shadcn, không áp đặt lên toàn app khi các page dùng nhiều `rounded-*` khác nhau.
- Mọi page dùng chung layout grid, max-width, horizontal gutters và breakpoint tokens.
- Dù theme shadcn có selector `.dark`, **không tự thêm** dark mode khi các page export không chứng minh đây là biến thể sản phẩm.
- Không dùng màu là tín hiệu trạng thái duy nhất; luôn có text/icon được định nghĩa dễ hiểu.

## D. Responsive & accessibility

### D1. Responsive
- Thiết kế mobile-first; kiểm thử ít nhất 320/375/768/1024/1440 px.
- Danh sách lớp `/lop-hoc` và `/tutor/new-classes` dùng filter thực có trong export; mobile phải giữ nút áp dụng/xóa bộ lọc, không che CTA xem/nhận lớp. Tutor directory cũ không quyết định layout mới.
- Navigation mobile phải giữ CTA quan trọng, không ẩn route bắt buộc.
- Không tạo horizontal overflow ngoài các thành phần chủ đích cuộn ngang có chỉ báo.
- List dài: pagination hoặc infinite scroll có load/retry/empty; search params nằm trên URL.

### D2. Accessibility — WCAG 2.2 AA target
- Dùng `<button>` cho hành động, `<a>` cho navigation, input đi kèm `<label>`; không dùng clickable div.
- Keyboard focus hiển thị rõ; Escape đóng dialog; modal focus trap và focus restore.
- Target tương tác kích thước phù hợp mobile (đề xuất 44 x 44 CSS px cho controls chính).
- Text contrast tối thiểu 4.5:1 (text thường), 3:1 cho text lớn và các yếu tố UI phù hợp quy chuẩn.
- Form error nối với field bằng `aria-describedby`, không báo lỗi chỉ bằng toast.
- Loading state có `aria-live` hợp lý; icon buttons có accessible name.
- Tôn trọng `prefers-reduced-motion`.
- Localize content nhất quán: tiếng Việt rõ nghĩa, giờ 24h, thứ Hai -> Chủ nhật.

## E. Screen rules theo nghiệp vụ

Các mục E1–E5 mô tả luồng tutor discovery/slot booking của MVP đã xây trước khi có export. Chúng tiếp tục là ràng buộc cho code đang tồn tại, nhưng không tự động trở thành luồng chính của giao diện export. Luồng yêu cầu tìm gia sư, nhận lớp và điều phối lớp được ánh xạ riêng trong `FIGMA_INVENTORY.md`, `PLAN.md` và `docs/FIGMA_COMPONENT_MAP.md`.

### E1. Landing / Tutor Search
- Filter và search phản ánh đúng URL query; refresh không làm mất filter.
- List card không hiển thị thông tin chưa tồn tại (review count giả, rating giả, tutor online giả).
- Giá và đơn vị (`₫/giờ`, v.v.) phải minh bạch, dựa trên DB, không fabricate.
- Chỉ hiển thị gia sư được duyệt và công khai.
- Empty state cho 'không có gia sư phù hợp' với hành động xóa filter.

### E2. Tutor detail
- Hiển thị profile, môn, trình độ, hình thức dạy, đơn giá và khung giờ nếu có trong scope.
- Không lộ email, SĐT, giấy tờ riêng tư nếu không có policy chia sẻ rõ.
- CTA đặt lịch dẫn đến đúng trạng thái auth/booking; nếu phải login, preserve intent/return URL an toàn.
- Lịch hiển thị timezone và số chỗ trống dựa trên API; slot data có thể đổi trước lúc submit.

### E3. Form đăng ký lịch dạy trong tuần (critical)
- Week starts Monday; 7 columns/rows rõ tên ngày; desktop/mobile interaction không phụ thuộc hover.
- Mỗi ngày cho thêm nhiều khoảng giờ `start < end`, không chồng lấn; validate ngay trên input và server.
- Các time selectors theo bước 30 phút **tạm đề xuất**, cần cập nhật nếu business yêu cầu 15/45/60 phút.
- Tách rõ `Lịch lặp hằng tuần` với `Ngoại lệ theo ngày`; tránh nhầm ngày nghỉ với xóa lịch thường xuyên.
- Cho người dùng thấy timezone đang sử dụng.
- Nút Save disabled trong lúc submit; có dirty/unsaved indicator và toast + inline error.
- Nếu thay đổi lịch ảnh hưởng buổi đã được xác nhận, phải báo rõ số booking bị tác động; không tự động hủy.
- Form phải hỗ trợ xóa khoảng giờ, undo trước Save hoặc Cancel changes; tránh xoá nhầm.

### E4. Booking flow
- Step 1: xác nhận tutor + ngày/giờ + duration + tổng chi phí/điều kiện nếu có.
- Step 2: submit; button pending + double-submit protection.
- Step 3: pending/success/error; hiển thị booking reference và trạng thái rõ.
- Nếu API trả `409 SLOT_UNAVAILABLE`: hiển thị inline message, refresh slots, không nói 'đặt thành công'.
- Chính sách đổi/hủy phải hiển thị trước action không thể hoàn tác.
- Không tính một buổi `PENDING` thành `CONFIRMED` chỉ vì UI đã hiển thị thông báo.

### E5. Tutor / Student dashboard
- Tabs trạng thái dùng labels dễ hiểu: Chờ xác nhận, Đã xác nhận, Hoàn thành, Đã hủy.
- Data chỉ được fetch theo auth context; không gửi `studentId` rồi tin vào client.
- Date groups rõ timezone; biến cố trạng thái có notification/toast và cập nhật list.
- Empty state theo tab, tránh bảng trắng.
- Trang admin tách navigation/permission; không để link admin trên UI chưa đủ quyền.

### E6. Phụ huynh tạo yêu cầu tìm gia sư (mục tiêu `./figma`)
- `/parent` và `/parent/request` là cùng luồng; form gồm môn/lớp, khu vực, hình thức, mức học phí dự kiến, lịch mong muốn hoặc “Trao đổi sau”, yêu cầu khác và thông tin học sinh tối thiểu.
- Phụ huynh tìm gia sư miễn phí theo DEC-012; mức học phí dự kiến là ngân sách học, không phải khoản phí nền tảng phải trả.
- Trước khi gửi, parent tự đánh dấu checkbox consent mặc định bỏ chọn, nêu rõ điện thoại/địa chỉ chỉ được chia sẻ với gia sư được kiểm duyệt viên gán; server kiểm tra và lưu version/thời điểm theo DEC-010.
- Danh sách/chi tiết/tabs hiển thị trạng thái do API trả về; không lấy `MOCK` trong export làm dữ liệu thật. Phụ huynh sở hữu và kiểm duyệt viên được xem dữ liệu riêng theo quyền; gia sư được kiểm duyệt viên đề xuất chỉ xem thông tin liên hệ cần thiết qua API kiểm tra quyền, theo DEC-009.
- Khi lỗi submit, giữ giá trị form và thông báo tại field; khi thành công, hiển thị mã yêu cầu/trạng thái server trả về.

### E7. Gia sư tìm và nhận lớp
- `/tutor/new-classes`, `/tutor/matched-classes`, `/tutor/class-requests` dùng class DTO và application state riêng, không map trực tiếp booking cũ.
- Trước khi cho gửi ứng tuyển, UI hiển thị phiên bản điều khoản và quiz đã công bố, kết quả đạt/xác nhận từ API, cùng **đủ ba phương án phí** do moderator công bố (tỷ lệ buổi đầu, số buổi kèm đặt cọc, tỷ lệ học phí tháng). Gia sư chọn một option còn hiệu lực; không hiển thị mức phí mẫu như giá thật.
- Chỉ hiển thị PII phụ huynh sau transition được phép; hồ sơ/điều khoản/điều kiện nhận lớp được server kiểm tra. Không dùng `termsTestPassed` trong localStorage làm quyền.
- Trạng thái ứng tuyển/rút/được gán cần message thật, 409 stale và retry hợp lệ. Khi moderator gán, lớp hoạt động ngay và đúng gia sư được chọn xem liên hệ qua API; UI không yêu cầu gia sư chấp nhận lớp lần nữa hoặc báo đã thanh toán. Sau rút gán, tutor cũ không còn được xem contact; lịch sử ứng tuyển/option phí/hợp đồng vẫn xem theo quyền.

### E8. Quản trị yêu cầu và lớp
- Admin xem yêu cầu, tạo/xuất bản lớp, duyệt ứng tuyển và gán gia sư; mỗi mutation cần xác nhận khi cần, audit actor/reason và render kết quả API. Rút gán phải nhập lý do, mở lại lớp để chọn tutor khác và cắt contact tutor cũ ngay; hoàn tất lớp phải có lý do. Hủy lớp chờ policy riêng; không đổi trạng thái bằng state client.
- Một lớp chỉ có một assignment active theo domain contract. Không hiện match score, rating hoặc notification đã gửi từ mock export.
- Admin công bố phiên bản điều khoản/quiz và đủ ba phương án phí trước khi ứng tuyển được mở; trang nội dung/bảng giá, hỗ trợ và báo cáo chỉ công bố dữ liệu được duyệt và có nguồn thật. Nội dung liên hệ công khai dùng nguồn được duyệt cho Hà Nội, không sao chép hotline/địa chỉ mẫu export.

### E9. Khiếu nại và xóa tài khoản
- Phụ huynh/gia sư chỉ xem khiếu nại của mình; kiểm duyệt viên xem và xử lý theo trạng thái API. Gửi/tiếp nhận/giải quyết dùng version, lý do/kết quả thật và hiển thị lỗi 409; không lấy `mockData` hoặc toast của export làm bằng chứng.
- Trang tài khoản yêu cầu xác nhận rõ trước khi xóa. Nếu còn booking `PENDING/CONFIRMED` hoặc yêu cầu/lớp/đơn/gán đang xử lý, hiển thị 409 và hướng dẫn xử lý cam kết; không báo xóa thành công. Khi server xác nhận xóa, kết thúc phiên và không còn hiện contact/hồ sơ riêng.
- Không hiển thị input upload tài liệu/đính kèm khi chưa có storage và chính sách retention. Nội dung khiếu nại có thể nhạy cảm; danh sách chỉ hiển thị thông tin cần thiết, chi tiết cần quyền riêng và audit.

## F. States và interaction contract

Mỗi interactive UI cần đủ trạng thái:

| State | UI behavior |
|---|---|
| initial | định hình bố cục, default values chính xác |
| loading | skeleton cho list/card; spinner/busy cho action |
| empty | thông báo cụ thể + recovery CTA |
| error | field error hoặc retry phù hợp; không che mất dữ liệu đang nhập |
| success | nêu kết quả thật do backend xác nhận |
| disabled | nêu nguyên nhân khi người dùng cần biết |
| optimistic | chỉ áp dụng với mutation an toàn; rollback khi API thất bại |

**Forbidden:** fake API responses trong production, nút bấm không thực thi hành động, placeholder count/rating/tutor data được trình bày như dữ liệu thật, client-side booking confirmation không có server response.

## G. Implementation design rules

### G1. TypeScript/React
- `strict` mode; không dùng `any` nếu không có justification.
- Component một trách nhiệm; page composition khác UI primitives/domain components.
- React hooks chỉ dùng đúng lifecycle; derive calculated state thay vì state trùng lặp.
- DTO và Zod schemas tập trung `src/shared`; sanitize/validate ở backend kể cả frontend đã validate.
- Không chuyển toàn bộ JSON từ Worker xuống client nếu có internal flags/PII.
- Data fetching qua typed API client; không `fetch('/api/...')` rải khắp 20 components.
- Form dùng controlled state có validation; reset state khi thành công, không reset khi lỗi.

### G2. CSS
- Dùng Tailwind utilities với semantic tokens và component variants.
- Không hardcode `style={{ color: '#...' }}` nếu đã có token.
- Không override shadcn component bằng CSS global phức tạp không có lý do.
- Ưu tiên SVG/icon package thống nhất, không trộn nhiều bộ icon tùy tiện.
- Font được self-host hoặc load đáng tin cậy, có fallback và cân nhắc hiệu năng.

### G3. API / DB
- REST resources dùng plural nouns, `/api/v1` versioning.
- Mutation critical phải auth, ownership, schema validation, role check, rate limit và idempotency khi phù hợp.
- D1 query qua Drizzle ORM hoặc prepared statement `.bind`; cấm SQL nối chuỗi từ input.
- Mọi query nhiều dữ liệu: limit/pagination, index review.
- Slot booking cũ vẫn dùng UNIQUE database constraint + `batch()` atomic khi còn tồn tại; request/class/application/assignment mới cần constraint và transaction riêng, không tin trạng thái UI.
- Không xóa lịch sử booking; dùng status/audit log; dữ liệu PII xóa theo chính sách retention.
- Không đưa D1/R2 secrets xuống Vite `VITE_*`.
- Khi migration DB: review, local test, staging test, prod backup, deploy có thứ tự; rollback bằng migration bù/restore có kế hoạch.

### G4. Auth & security
- Session token lưu dạng hash trong DB; cookie `HttpOnly`, `Secure`, `SameSite=Lax` hoặc chặt hơn tùy auth flow.
- CSRF defenses cho cookie-auth mutating requests: validate Origin/Referer policy và CSRF token hoặc cơ chế tương đương.
- Không dùng localStorage lưu access token nhạy cảm.
- API rate limiting riêng auth/booking/search; Turnstile phải verify token server-side.
- Logs không chứa password, session token, full phone, child identifiers hoặc credential documents.
- ID dạng UUID/ULID không được xem là cơ chế phân quyền.
- CORS restrictive, security headers, chống open redirects.
- Không để dev/admin endpoints công khai trên production.

## H. Testing và design QA

### H1. Visual review
- Screenshot tests với cùng viewport và data fixtures cho từng page export đã ánh xạ; khi có frame Figma gốc, đối chiếu thêm với viewport/node tương ứng. Không coi export code là screenshot gốc.
- Review: alignment, typography, padding/gaps, border, color, responsiveness, images, hover/focus/disabled.
- Checklist mobile touch and keyboard navigation.
- No horizontal overflow at 320px except intentional scroller.

### H2. Functional acceptance
- Phụ huynh tạo yêu cầu tìm gia sư; dữ liệu học sinh/môn/địa điểm/hình thức/thời gian được validate, lưu thật và chỉ hiện với đúng vai trò/chủ sở hữu. Lỗi submit không được báo thành công.
- Gia sư xem lớp phù hợp và gửi yêu cầu nhận lớp theo trạng thái hợp lệ; admin xem xét, ghép/duyệt và phân công gia sư. Cạnh tranh cùng lớp phải được xử lý atomically theo quy tắc nghiệp vụ đã chốt; client không được quyết định trạng thái hay phí.
- Parent, tutor và admin nhìn cùng một trạng thái lớp/yêu cầu từ backend sau mỗi chuyển trạng thái; thử role bypass, ownership bypass, request trùng, thao tác lặp, session expiry và stale update.
- Trong giai đoạn migration, booking/weekly availability cũ không được mất dữ liệu hoặc hồi quy nếu API còn phục vụ; UI đích là luồng yêu cầu/lớp theo DEC-007.
- Retry request cần idempotency cho mutation dễ gửi lặp; response lỗi API phải hiện UI phù hợp và giữ dữ liệu form.
- Performance: route splitting, image optimization, pagination, không import bundle nặng không dùng.

### H3. Definition of Done per screen
- [ ] Source file/route export và expected screenshot documented; frame ID chỉ điền nếu đã kiểm chứng trực tiếp (hoặc flagged blocked).
- [ ] Component reuse & design tokens, không CSS lặp không kiểm soát.
- [ ] Responsive mobile/tablet/desktop.
- [ ] Loading/empty/error/success/disabled states.
- [ ] Keyboard, labels, focus, contrast.
- [ ] Backend API & RBAC, no fake operations.
- [ ] Unit/integration/E2E tests cho critical action.
- [ ] No console errors, no secrets/PII leaked.
- [ ] Screenshot comparison reviewed against export render; kiểm chứng thêm với frame Figma khi có quyền truy cập.

## I. Định nghĩa hoàn thành toàn bộ ứng dụng

Release chỉ được coi là hoàn thành nếu:
- Mỗi màn hình P0 của export đã được ánh xạ route/component/API, kết nối dữ liệu thật, review responsive/a11y và đối chiếu visual với bản render export. Các khác biệt với frame Figma gốc vẫn cần đối chiếu hoặc được product owner phê duyệt khi truy cập được thiết kế.
- Phụ huynh tạo/theo dõi yêu cầu tìm gia sư; gia sư xem lớp/gửi yêu cầu nhận lớp; admin duyệt, ghép và phân công theo chính sách đã chốt. Trạng thái, quyền và lịch sử thao tác được backend enforce, không lấy mock state từ export làm dữ liệu thật.
- Test authorization, ownership, cạnh tranh nhận/ghép lớp, thao tác lặp, stale update và timezone đạt. Dữ liệu booking/availability lịch sử được bảo toàn trong migration.
- D1 local/staging/prod tách độc lập, migrations/recovery runbook có thể thực thi.
- Production không có fake data, không có client-side role trust, không có hardcoded secrets.

## J. Figma gap log mẫu

| ID | Category | Question | Status | Decision |
|---|---|---|---|---|
| FIG-001 | Access | Đã có code export; frame/node Figma trực tiếp chưa truy cập được | PARTIAL | dùng export làm bằng chứng code, không tạo frame ID |
| FIG-002 | UI | Route/component đã đọc từ export; viewport và tương tác trong Figma gốc? | PARTIAL | đối chiếu khi có quyền truy cập |
| FIG-003 | Tokens | Có màu brand trong JSX; font/spacing/breakpoint gốc? | PARTIAL | map màu có bằng chứng, giữ phần chưa xác minh là provisional |
| FIG-004 | Class flow | Quy tắc duyệt, ghép và phân công khi nhiều gia sư nhận cùng lớp? | OPEN | chốt state transitions trước triển khai |
| FIG-005 | Legacy booking | Luồng slot booking/availability hiện tại sẽ được giữ thế nào? | OPEN | không đồng nhất với yêu cầu tìm gia sư trong export |
| FIG-006 | Billing | Giá/phí trong UI export được tính, thu, xác nhận ra sao? | OPEN | không tạo payment gateway từ mock UI |

---

**Principle:** Pixel fidelity với Figma chỉ có giá trị nếu UI thực sự hoạt động, accessible, secure và phản ánh trạng thái backend thật.

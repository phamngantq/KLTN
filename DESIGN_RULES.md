# DESIGN RULES — Tutor Matching Platform

> Version 0.1 / 2026-10-11  
> Dùng như specification cho UI/UX, code review và AI coding assistant.  
> **Cảnh báo:** Không thể đọc trực tiếp Figma Make trong lần audit này. Mọi token/screen/interaction dưới đây là **quy tắc triển khai đề xuất**, không phải thông số lấy từ Figma.

## A. Priority / source of truth

Thứ tự ưu tiên khi có xung đột:
1. Security, privacy, business invariants và accessibility bắt buộc.
2. Figma đã được đối chiếu và product requirement được xác nhận.
3. `PLAN.md` (domain model, API, flows).
4. File này (`DESIGN_RULES.md`) và `AGENTS.md`.
5. Default library/component styles.

Không tự sáng tác trạng thái, màn hình, button hoặc feature không có trong scope. Nếu Figma thiếu error/empty/loading state, bổ sung theo rule dưới đây và ghi gap để review.

## B. Figma-to-code fidelity

### B1. Audit trước khi code UI
- Mỗi Figma frame phải có: `frame_id`, screenshot, screen route, desktop/mobile breakpoint, target role, các CTA và navigation destination.
- Extract style tokens: font family/weight/size/line-height, color system, spacing, radii, border widths, icons, shadows, container max-width.
- Extract component variants (default/hover/focus/pressed/disabled/loading/error/success) và layout behavior (Auto Layout, constraints).
- Tạo component mapping `Figma component -> React component -> props/variants`; ưu tiên 1 React component dùng lại thay vì copy UI.
- Đối chiếu bằng screenshot Playwright ở cùng viewport; sửa layout trước micro-styling.

### B2. Không làm
- Không dùng ảnh screenshot nguyên trang thay cho UI tương tác.
- Không thay component thiếu bằng placeholder vô hạn; nếu tạm, phải để issue và đánh dấu rõ.
- Không chọn ngẫu nhiên màu xanh/tím/font mới khi Figma đã có token.
- Không hardcode pixel rải rác trong JSX; đưa về token hoặc variant.
- Không import/export cả code bundle tự sinh từ Figma Make rồi đưa lên production mà chưa review dependency, semantics, auth và API.

## C. Design tokens — khung quản lý, giá trị cần điền từ Figma

```css
:root {
  /* Replace values after Figma audit. These are development placeholders. */
  --color-bg: #ffffff;
  --color-surface: #f8fafc;
  --color-fg: #0f172a;
  --color-muted: #64748b;
  --color-primary: #2563eb;
  --color-on-primary: #ffffff;
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
- Hệ spacing gợi ý 4px/8px baseline; **không coi đây là thông số gốc của Figma**.
- Typography có các styles display/heading/body/label/caption, map lại từ Figma trước khi chốt.
- Mọi page dùng chung layout grid, max-width, horizontal gutters và breakpoint tokens.
- Dark mode **không tự thêm** nếu không có yêu cầu hoặc Figma variants.
- Không dùng màu là tín hiệu trạng thái duy nhất; luôn có text/icon được định nghĩa dễ hiểu.

## D. Responsive & accessibility

### D1. Responsive
- Thiết kế mobile-first; kiểm thử ít nhất 320/375/768/1024/1440 px.
- Desktop search: sidebar filter + grid cards **nếu Figma thể hiện**; mobile chuyển filter thành sheet/dialog với nút áp dụng và xóa bộ lọc.
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
- Slot booking dùng UNIQUE database constraint + `batch()` atomic; không tin chỉ UI availability.
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
- Screenshot tests với cùng viewport và data fixtures cho từng Figma frame.
- Review: alignment, typography, padding/gaps, border, color, responsiveness, images, hover/focus/disabled.
- Checklist mobile touch and keyboard navigation.
- No horizontal overflow at 320px except intentional scroller.

### H2. Functional acceptance
- Form recurrence add/edit/delete nhiều khung giờ/ngày; không cho overlap.
- Exception date không xóa recurring rule.
- 2 bookings overlap theo tutor chỉ 1 thành công, test concurrent.
- Retry request idempotency, role bypass, ownership bypass, session expiry.
- Response lỗi API phải hiện UI phù hợp và giữ dữ liệu form.
- Performance: route splitting, image optimization, pagination, không import bundle nặng không dùng.

### H3. Definition of Done per screen
- [ ] Screen frame ID / expected screenshot documented (hoặc flagged blocked).
- [ ] Component reuse & design tokens, không CSS lặp không kiểm soát.
- [ ] Responsive mobile/tablet/desktop.
- [ ] Loading/empty/error/success/disabled states.
- [ ] Keyboard, labels, focus, contrast.
- [ ] Backend API & RBAC, no fake operations.
- [ ] Unit/integration/E2E tests cho critical action.
- [ ] No console errors, no secrets/PII leaked.
- [ ] Screenshot comparison reviewed against Figma.

## I. Định nghĩa hoàn thành toàn bộ ứng dụng

Release chỉ được coi là hoàn thành nếu:
- Mỗi P0 screen đã được đối chiếu với Figma hoặc được product owner phê duyệt khác biệt.
- Student có thể tìm Tutor; Tutor có thể khai báo weekly slots; booking flow hoàn chỉnh nếu được duyệt trong scope.
- Test double-booking, authorization, cancellation và timezone đã pass.
- D1 local/staging/prod tách độc lập, migrations/recovery runbook có thể thực thi.
- Production không có fake data, không có client-side role trust, không có hardcoded secrets.

## J. Figma gap log mẫu

| ID | Category | Question | Status | Decision |
|---|---|---|---|---|
| FIG-001 | Access | Chưa đọc được Figma Make link | BLOCKED | cần access/export |
| FIG-002 | UI | Các trang, frame ID và interaction thực tế? | OPEN | audit Phase 0 |
| FIG-003 | Tokens | Font, colors, spacing, breakpoints gốc? | OPEN | tạm dùng semantic tokens |
| FIG-004 | Booking | Có auto-confirm hay tutor approval? | OPEN | tạm chờ duyệt |
| FIG-005 | Scheduling | Granularity và thời lượng buổi học? | OPEN | tạm 30 phút |
| FIG-006 | Billing | Payment/chat/reviews có thật trong UI? | OPEN | giữ Phase 5 |

---

**Principle:** Pixel fidelity với Figma chỉ có giá trị nếu UI thực sự hoạt động, accessible, secure và phản ánh trạng thái backend thật.

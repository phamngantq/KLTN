# FIGMA_GAP_LOG

| ID | Category | Question | Status | Decision / tạm thời |
|---|---|---|---|---|
| FIG-001 | Access | Không đọc được Figma Make (JS shell, thumbnail trắng, API 403) | BLOCKED | DEC-001: design system tạm thời, mọi màn hình `UNVERIFIED` |
| FIG-002 | UI | Danh sách màn hình, frame ID, điều hướng thật? | OPEN | Dùng `FIGMA_INVENTORY.md` (PRV-01..11) từ `PLAN.md` §2 |
| FIG-003 | Tokens | Font, màu, spacing, radius, breakpoint gốc? | OPEN | `src/client/styles/tokens.css` = giá trị placeholder `DESIGN_RULES.md` §C; font hệ thống |
| FIG-004 | Booking | Auto-confirm hay gia sư duyệt? | OPEN | Gia sư duyệt (PENDING → CONFIRMED) theo `TASKS.md` §A.6 |
| FIG-005 | Scheduling | Granularity, thời lượng buổi? | OPEN | 30 phút; 30/60/90/120 phút, mặc định 60 |
| FIG-006 | Scope | Thanh toán/chat/đánh giá có trong UI? | OPEN | Ngoài MVP; không hiển thị rating/review giả |
| FIG-007 | Copy | Nội dung tiếng Việt, tên thương hiệu, logo? | OPEN | Tên tạm "Tutor Matching", không logo |
| FIG-008 | Imagery | Ảnh đại diện gia sư? | OPEN | Avatar chữ cái đầu (không R2) |
| FIG-009 | Policy | Chính sách hủy/đổi lịch hiển thị cho người dùng? | OPEN | DEC-005: hủy được trước giờ bắt đầu; hiển thị trước khi xác nhận hủy |
| FIG-010 | Moderation | Sửa hồ sơ đã duyệt có cần duyệt lại? | OPEN | DEC-006: giữ approved; admin có thể ẩn |
| FIG-011 | Layout | Desktop search có sidebar filter hay filter bar? | OPEN | Filter bar trên đầu danh sách, xếp dọc trên mobile |
| FIG-012 | Dark mode | Có biến thể tối? | OPEN | Không thêm (DESIGN_RULES §C1) |

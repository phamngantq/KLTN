# Component map — PROVISIONAL

> Không có component Figma để đối chiếu (FIG-001). Bảng này là hợp đồng nội bộ để thay thế nhanh khi có Figma: mỗi dòng ghi component React, variants và token sử dụng. Cột "Figma component" để trống cho tới khi audit.

| Figma component | React component | Variants / props | Tokens | Ghi chú a11y |
|---|---|---|---|---|
| _(chưa có)_ | `ui/Button` | `variant: primary \| secondary \| danger \| ghost`, `size: md \| sm`, `loading`, `disabled` | `--color-primary`, `--color-on-primary`, `--radius-md`, `--space-*` | `<button>`, min 44×44px, focus ring `--color-focus`, `aria-busy` khi loading |
| _(chưa có)_ | `ui/Field` + `ui/Input` / `ui/Select` / `ui/Textarea` | `label`, `error`, `hint`, `required` | `--color-border`, `--color-danger` | `<label for>`, `aria-describedby`, `aria-invalid` |
| _(chưa có)_ | `ui/Alert` | `tone: info \| success \| danger` | `--color-success`, `--color-danger` | `role="alert"` cho lỗi, `role="status"` cho thông tin |
| _(chưa có)_ | `ui/Spinner`, `ui/Skeleton` | — | `--color-muted` | `aria-live`, tôn trọng `prefers-reduced-motion` |
| _(chưa có)_ | `ui/EmptyState` | `title`, `action` | `--color-muted` | heading + CTA phục hồi |
| _(chưa có)_ | `ui/ConfirmDialog` | `title`, `description`, `confirmLabel`, `tone` | `--radius-lg` | `<dialog>` native: focus trap, Esc đóng, trả focus |
| _(chưa có)_ | `ui/Badge` | `tone` | semantic colors | luôn kèm chữ, không chỉ màu |
| _(chưa có)_ | `domain/TutorCard` | tutor DTO | — | `<article>`, link tên → chi tiết |
| _(chưa có)_ | `domain/SlotPicker` | slots, timezone, duration | — | nhóm theo ngày, nút radio-like có `aria-pressed` |
| _(chưa có)_ | `domain/WeeklyScheduleEditor` | rules, timezone | — | 7 nhóm ngày T2→CN, select giờ bước 30' |
| _(chưa có)_ | `domain/BookingCard`, `domain/BookingStatusBadge` | booking DTO, actions | — | nhãn trạng thái tiếng Việt |
| _(chưa có)_ | `layout/AppShell` | nav theo role | `--container-max` | skip link, `<nav aria-label>` |

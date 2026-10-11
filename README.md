# Tutor Matching Platform

Cloudflare-native modular monolith: React + Vite SPA và Hono API chạy trong **một** Cloudflare Worker, dữ liệu trên Cloudflare D1.
Đặc tả bắt buộc: [PLAN.md](PLAN.md), [DESIGN_RULES.md](DESIGN_RULES.md), [AGENTS.md](AGENTS.md); thứ tự công việc: [TASKS.md](TASKS.md).

> Nguồn thiết kế cho toàn bộ project: [Tutor Matching Platform trên Figma Make](https://www.figma.com/make/nhljatxXx9lap98Zx7s4AU/Tutor-Matching-Platform?p=f&t=F5iHIZDcvYVKK1to-0&fullscreen=1), với code export người dùng đặt tại `./figma`. Theo [DEC-007](TASK_DECISIONS.md), export này thay thế mục tiêu sản phẩm cũ. App trong `src/` đã có hồ sơ và yêu cầu tìm gia sư của phụ huynh (TASK-19–23), cùng lịch đặt cũ cần bảo toàn; luồng ứng tuyển/gán lớp và các phần còn lại ở TASK-24–30 chưa hoàn tất. Xem [PLAN.md §13](PLAN.md), [FIGMA_INVENTORY.md](FIGMA_INVENTORY.md) và [FIGMA_GAP_LOG.md](FIGMA_GAP_LOG.md) để triển khai tiếp.

Để xem giao diện và API đọc với dữ liệu tổng hợp trên Cloudflare, dùng [staging v2 chỉ đọc](https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev) ([runbook](docs/PREVIEW_STAGING.md)). Đây chưa phải luồng ghép lớp hoàn chỉnh.

`./figma` là nguồn tham chiếu **chỉ có trên máy** và được Git bỏ qua vì export chứa ảnh chụp và thông tin cá nhân mẫu chưa được rà quyền công bố. Mã được chọn lọc và kiểm thử sẽ được tích hợp vào `src/` trước khi push/deploy (DEC-008).

## Yêu cầu

- Node.js 22+ và npm
- (Chỉ khi deploy) tài khoản Cloudflare, `npx wrangler login`

## Lệnh thường dùng

| Lệnh | Mục đích |
|---|---|
| `npm install` | cài dependencies |
| `npm run dev` | Vite + workerd local (client, API, bindings local) |
| `npm run typecheck` | TypeScript strict cho client/worker/tooling |
| `npm run lint` | ESLint |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run test -- --run` | Vitest: `server` (chạy trong Workers runtime) + `client` (jsdom) |
| `npm run build` | build production (`dist/client` + `dist/tutor_matching`) |
| `npm run preview` | build rồi chạy bản production local |
| `npm run e2e` | Playwright E2E trên server production-like local (D1 riêng `.wrangler/e2e`) |
| `npm run secret-scan` | quét file đã track tìm secret / ID tài khoản |
| `npm run cf-typegen` | sinh lại `src/server/worker-configuration.d.ts` sau khi sửa `wrangler.jsonc` |

## Database (D1)

- Schema nguồn: [migrations/](migrations/) (SQL viết tay, forward-only). [src/server/db/schema.ts](src/server/db/schema.ts) là bản Drizzle phản chiếu; test `tests/server/db-schema.test.ts` kiểm tra hai bên khớp nhau.
- Local:

  ```bash
  npm run db:migrate:local   # wrangler d1 migrations apply DB --local (chạy lại an toàn)
  ```

- Danh mục môn học (dữ liệu tham chiếu) nằm trong migration `0002`, có ở mọi môi trường.
- Test server tự áp dụng migrations vào D1 local cô lập (`tests/server/setup.ts`).
- Lưu ý D1: không dùng pattern `GLOB` dài trong `CHECK` (D1 báo "pattern too complex"); kiểm tra định dạng ngày/giờ bằng `date()`/`strftime()`.

## Cấu trúc

```text
src/client/   React SPA
src/server/   Hono Worker (entry: src/server/index.ts)
src/shared/   DTO/schema dùng chung — không chứa secret
tests/server  test chạy trong Workers runtime (@cloudflare/vitest-plugin)
tests/client  test React (jsdom)
```

API dưới `/api/v1/*` luôn do Worker xử lý trước (`run_worker_first`); các đường dẫn khác trả SPA.

## Kiểm thử

- **Unit/integration** (`npm run test -- --run`): project `server` chạy trong Workers runtime với D1 local cô lập theo từng file test; project `client` (jsdom) mock API ở tầng `fetch`.
- **E2E** (`npm run e2e`): `scripts/e2e-serve.mjs` tạo D1 mới ở `.wrangler/e2e` (migrations + 1 admin chỉ dùng cho E2E), build rồi chạy Worker đã build qua Wrangler dev local tại `127.0.0.1:4173`. Playwright kiểm hành trình phụ huynh → kiểm duyệt viên → gia sư: yêu cầu, lớp, điều khoản, phí, ứng tuyển, gán lớp, liên hệ riêng, hợp đồng và báo cáo PDF; thêm responsive và bàn phím. Lần đầu: `npx playwright install chromium`.
- **Smoke sau deploy** (`node scripts/smoke.mjs <url>`): chỉ đọc SPA/API công khai, headers bảo mật và quyền truy cập anonymous; không tạo dữ liệu cần dọn.
- **CI** (`.github/workflows/ci.yml`): secret-scan, format, lint, typecheck, test, build, E2E. Không deploy, không dùng credential Cloudflare.

## Secrets

Secrets local đặt trong `.dev.vars` (đã bị `.gitignore`), xem mẫu `.dev.vars.example`. Secrets remote dùng `wrangler secret put`. Không bao giờ dùng biến `VITE_*` cho secret.

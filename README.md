# Gia Sư Đỗ Hằng

Cloudflare-native modular monolith: React + Vite SPA và Hono API chạy trong **một** Cloudflare Worker, dữ liệu trên Cloudflare D1.
Đặc tả bắt buộc: [PLAN.md](PLAN.md), [DESIGN_RULES.md](DESIGN_RULES.md), [AGENTS.md](AGENTS.md); thứ tự công việc: [TASKS.md](TASKS.md).

> Nguồn thiết kế cho toàn bộ project: [Tutor Matching Platform trên Figma Make](https://www.figma.com/make/nhljatxXx9lap98Zx7s4AU/Tutor-Matching-Platform?p=f&t=F5iHIZDcvYVKK1to-0&fullscreen=1), với code export người dùng đặt tại `./figma`. Tên hiển thị theo export là **Gia Sư Đỗ Hằng**, khẩu hiệu **Uy tín - Chất lượng**. Theo [DEC-007](TASK_DECISIONS.md), export này thay thế mục tiêu sản phẩm đặt lịch trực tiếp trước đây. Các luồng yêu cầu, ứng tuyển, gán lớp và kiểm duyệt đã có trong `src/`; mức phí vận hành thật, điều khoản và tích hợp ngoài cần quy trình công bố riêng. Xem [PLAN.md §13](PLAN.md), [FIGMA_INVENTORY.md](FIGMA_INVENTORY.md) và [FIGMA_GAP_LOG.md](FIGMA_GAP_LOG.md).

Worker [staging V2](https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev) đang chạy bản giao diện và luồng mới cùng 3 phương án phí và 6 lớp mẫu đã công bố. Xem [hồ sơ phát hành](docs/PREVIEW_STAGING.md) để biết kiểm thử và các điểm còn khác export Figma; bản Make trực tiếp chưa được đối chiếu từng frame.

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
  npm run seed:sample:local   # tạo admin mẫu, 3 phương án phí nháp và bảng giá mẫu trong D1 local
  ```

- Staging V2, theo yêu cầu nạp dữ liệu mẫu riêng: sau khi áp dụng migration mới, sao chép `.env.example` sang `.wrangler/sample-staging-v2/config.vars` bị Git bỏ qua, rồi chạy `npm run seed:sample:staging:v2`. Lệnh đọc cấu hình này và tạo admin mẫu, ba phương án phí đã công bố, sáu lớp tổng hợp đang mở, sáu mức học phí theo buổi và hai khoảng phí nhận lớp tham khảo trong D1 `tutor-matching-staging-v2`. Cấu hình cũ thiếu hai mảng bảng giá sẽ lấy giá trị mặc định từ `.env.example`. Xác minh đúng tài khoản/tài nguyên Cloudflare trước khi chạy. Xem [cấp quyền admin](docs/ADMIN_PROVISIONING.md).

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

Hai nút liên hệ nổi trên các trang công khai lấy URL mẫu từ `.env.example`: Facebook mở trang Facebook chung, Zalo dùng số trong export Figma. Để thay link khi build/dev, đặt `VITE_FACEBOOK_CONTACT_URL` và `VITE_ZALO_CONTACT_URL` trong `.wrangler/contact-links.vars` bị Git bỏ qua, rồi build lại. Chỉ URL HTTPS thuộc đúng miền Facebook/Zalo được hiển thị. Đây là URL công khai trong bundle client, không phải secret; không cần thêm Worker vars.

Worker secrets local đặt trong `.dev.vars` (đã bị `.gitignore`), xem `.dev.vars.example`. Dữ liệu mẫu có mẫu nguồn ở `.env.example`; lệnh staging đọc bản cấu hình thực tế trong `.wrangler/sample-staging-v2/config.vars` bị Git bỏ qua và ghi dữ liệu vào D1 staging. `seed:sample:local` tạo mật khẩu ngẫu nhiên tại `.wrangler/sample-local/credentials.vars` bị Git bỏ qua, rồi thêm `local-admin@example.test`, ba phương án phí nhận lớp **nháp**, sáu mức học phí theo buổi và hai khoảng phí nhận lớp tham khảo vào D1 local. Lệnh staging V2 dùng credentials riêng trong `.wrangler/`; không commit hoặc đưa mật khẩu admin vào Worker vars. Các mảng bảng giá trong env chỉ dùng để seed; sau đó trang giá và trang quản trị đọc D1. Mức học phí dự kiến của mỗi lớp nằm trong D1, tách biệt khỏi bảng giá tham khảo và phí nhận lớp. Khi gán gia sư, kiểm duyệt viên bắt buộc xác nhận học phí đã chốt theo buổi; D1 lưu mức riêng cho từng lần gán và hợp đồng mới giữ snapshot khi phát hành. Học phí đã chốt không tự tính phí nhận lớp hay trạng thái thanh toán. Seed staging không tích hợp thanh toán; gia sư chỉ ứng tuyển sau khi được duyệt hồ sơ và hoàn thành bài kiểm tra/xác nhận điều khoản. Không dùng seed mẫu trên production. Secrets remote dùng `wrangler secret put`. Không bao giờ dùng biến `VITE_*` cho secret.

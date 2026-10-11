# Tutor Matching Platform

Cloudflare-native modular monolith: React + Vite SPA và Hono API chạy trong **một** Cloudflare Worker, dữ liệu trên Cloudflare D1.
Đặc tả bắt buộc: [PLAN.md](PLAN.md), [DESIGN_RULES.md](DESIGN_RULES.md), [AGENTS.md](AGENTS.md); thứ tự công việc: [TASKS.md](TASKS.md).

> Figma chưa được audit — UI hiện tại chỉ là bootstrap shell, không phải thiết kế cuối.

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
| `npm run cf-typegen` | sinh lại `src/server/worker-configuration.d.ts` sau khi sửa `wrangler.jsonc` |

## Cấu trúc

```text
src/client/   React SPA
src/server/   Hono Worker (entry: src/server/index.ts)
src/shared/   DTO/schema dùng chung — không chứa secret
tests/server  test chạy trong Workers runtime (@cloudflare/vitest-plugin)
tests/client  test React (jsdom)
```

API dưới `/api/v1/*` luôn do Worker xử lý trước (`run_worker_first`); các đường dẫn khác trả SPA.

## Secrets

Secrets local đặt trong `.dev.vars` (đã bị `.gitignore`), xem mẫu `.dev.vars.example`. Secrets remote dùng `wrangler secret put`. Không bao giờ dùng biến `VITE_*` cho secret.

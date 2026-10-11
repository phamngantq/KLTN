# Deployment runbook — Cloudflare Workers + D1

> **Trạng thái ngày 2026-10-11:** Bản giao diện mới nhất từ commit `84265ce` đã deploy lên [Worker staging V2](https://tutor-matching-staging-v2.zhaduchanhzz.workers.dev) bằng `env.staging_v2`; xem bằng chứng trong [PREVIEW_STAGING.md](PREVIEW_STAGING.md). Bản nền `bfac6a4` và các lần deploy MVP được giữ làm lịch sử. Production chưa triển khai.

Một Worker phục vụ API `/api/v1/*` và SPA qua Workers Static Assets. Các môi trường hoạt động dùng D1 và rate limiter riêng; cấu hình lịch sử `preview` và `staging_v2` cùng trỏ vào Worker/D1 V2 trong quá trình chuyển đổi. `student`/`admin` trong D1 được ánh xạ thành actor phụ huynh/kiểm duyệt viên; `tutor` là gia sư. Giữ nguyên ID, FK và booking lịch sử.

| Môi trường | Worker / D1 | Trạng thái đã xác minh |
|---|---|---|
| Local | `npm run dev` / Miniflare `.wrangler/state` | Dùng để kiểm thử migration và hành trình mới |
| Preview lịch sử | `tutor-matching-staging-v2` / D1 riêng cùng tên | Đã deploy bản chỉ đọc; không deploy lại bằng cấu hình `preview` |
| Staging V2 | Cùng Worker/D1 V2, `env.staging_v2` | Đã deploy bản sản phẩm mới với `APP_ENV=staging`; migration 0007–0015 đã áp dụng, smoke chỉ đọc 16/16 PASS |
| Staging cũ | `tutor-matching-staging` / D1 cùng tên | Lịch sử MVP đã deploy; tài khoản Wrangler ở lần kiểm tra cuối không nhìn thấy cả Worker/D1 |
| Production | `tutor-matching` / `tutor-matching-prod` | Chưa tạo; cần quyết định phát hành riêng |

Không commit token, `account_id` hay `database_id`. Tên/binding thực tế nằm trong [`wrangler.jsonc`](../wrangler.jsonc); không suy ra quyền tài khoản từ URL công khai trả HTTP 200.

## 0. Điều kiện trước khi phát hành

- Node 22+, `npm ci`; quyền Cloudflare đúng tài khoản và môi trường. `npx wrangler whoami` phải hiển thị đúng tài khoản; CI hiện không tự deploy.
- Có commit đã review, quyền triển khai được cho phép riêng, D1 được kiểm kê số lượng bản ghi không PII, điểm khôi phục và kế hoạch rollback. Không chạy lệnh remote chỉ vì tài liệu này được cập nhật.
- Xác nhận chính sách đang có hiệu lực trong [TASK_DECISIONS.md](../TASK_DECISIONS.md) và các cổng [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Mức phí, nội dung điều khoản/hợp đồng cần kiểm duyệt viên nhập và công bố; không dùng số tiền mẫu từ export.

## 1. Chỉ tạo tài nguyên cho môi trường mới đã được cho phép

Kiểm tra `npx wrangler d1 list --json` và deployments của tài khoản trước khi cân nhắc tạo D1. Với tài nguyên mới được phê duyệt, dùng `npx wrangler d1 create <database-name> --location apac`, sau đó xác minh binding theo `wrangler.jsonc`. Không tạo một bản trùng tên để vượt qua lỗi thiếu quyền. Secret của CI/Worker chỉ lưu trong secret store, không ghi vào Git hoặc release log.

## 2. Cổng chất lượng local

```bash
npm ci
npm run db:migrate:local
npm run secret-scan
npm run format:check
npm run lint
npm run typecheck
npx vitest run
npm run build:staging:v2
npm run e2e
git diff --check
```

`package.json` khai báo `test: vitest`; dùng `npx vitest run` để chạy một lần vì `npm run test -- --run` không tương thích với npm hiện dùng. Harness `scripts/e2e-serve.mjs` tạo D1 local cô lập tại `.wrangler/e2e`, chạy migration, seed một admin kiểm thử, build Worker và phục vụ bằng Wrangler dev. Playwright **không** dùng Vite preview hay D1 remote. Nếu E2E không khởi chạy được trong sandbox, ghi lệnh và lỗi thực tế rồi chạy lại trong môi trường có Playwright/Wrangler dev; không coi unit test hoặc build là E2E PASS. E2E ghi lại `dist`; chạy lại `npm run build:staging:v2` trước deploy và kiểm tra tên Worker/D1 `tutor-matching-staging-v2`, `APP_ENV=staging` trong build output.

## 3. Review migration 0007–0015

So sánh `npx wrangler d1 migrations list DB --env <env> --remote` với source và đọc SQL theo thứ tự. Chạy `npm run db:migrate:local` và test dữ liệu cũ trước khi xem xét remote. Không sửa migration đã áp dụng; bổ sung migration mới khi cần.

| Migration | Miền | Điều phải xác minh |
|---|---|---|
| `0007_class_listings` | Lớp, ba loại phiên bản phí, ứng tuyển | Lớp lấy từ yêu cầu đã đồng ý chia sẻ contact; công khai không lộ contact; không seed mức phí |
| `0008_class_assignments` | Gán lớp | Một gán active mỗi lớp; moderator gán làm lớp active ngay |
| `0009_content` | Nội dung theo revision | Chỉ bản published ra public; bản published bất biến |
| `0010_tutor_terms_contracts` | Quiz, xác nhận điều khoản, hợp đồng | Gia sư đạt quiz và xác nhận điều khoản trước ứng tuyển; hợp đồng không là chứng từ thanh toán |
| `0011_complaints_privacy` | Khiếu nại, tombstone xóa tài khoản | Chặn xóa khi còn nghĩa vụ; giữ ID/lịch sử đã ẩn danh |
| `0012_approved_content_seed` | Nội dung được duyệt | Liên hệ Hà Nội, phụ huynh miễn phí; không seed điều khoản, hợp đồng, mức phí |
| `0013_class_lifecycle` | Rút gán/hoàn tất lớp | Rút gán có lý do mở lại lớp và cắt contact; hoàn tất có lý do, giữ lịch sử |
| `0014_class_cancellation` | Hủy lớp đã công bố | Bản ghi lý do không sửa trong vận hành thường; chỉ `open`/`sourcing` chưa gán, đóng cả lớp/yêu cầu và không còn đơn `submitted` |
| `0015_account_history_redaction` | Ẩn danh lịch sử khi xóa tài khoản | Chỉ cho ẩn lý do lifecycle/cancellation sau tombstone, giữ ID/actor/event/time; backfill tài khoản đã xóa trước 0015, gồm đơn ứng tuyển, khiếu nại và audit metadata liên quan |

Sau `npm run db:migrate:local`, kiểm tra riêng 0014 trên D1 local:

```bash
npx wrangler d1 migrations list DB --local
npx wrangler d1 execute DB --local --command "SELECT type, name FROM sqlite_master WHERE name IN ('class_cancellations','class_cancellations_valid_insert','class_cancellations_no_update','class_cancellations_no_delete') ORDER BY name"
npx wrangler d1 execute DB --local --command "PRAGMA foreign_key_check"
```

Danh sách migration chờ không được còn 0014 **hoặc 0015**; bảng và ba trigger của 0014 phải hiện, `foreign_key_check` không trả hàng. Dùng integration test để xác minh action `POST /api/v1/admin/classes/:id/cancel` trả 409 cho `draft`/`active`/terminal và ghi cùng transaction lý do, lớp/yêu cầu `cancelled`, ứng tuyển `submitted → rejected` khi lớp `open` hợp lệ.

Với 0015, kiểm thử D1 local có **tombstone tạo trước khi áp dụng migration**: lý do lifecycle/cancellation, rejection reason, nội dung khiếu nại và audit metadata liên quan được ẩn danh; ID, actor, event type, status và thời gian vẫn giữ. Chỉ redaction sau tombstone được phép cập nhật lý do lịch sử; các sửa khác phải bị trigger chặn. Chạy targeted `npx vitest run tests/server/account-deletion-redaction.test.ts tests/server/complaints-privacy.test.ts` cùng full test gate. Bản sao/Time Travel trước 0015 có thể chứa free text đã xóa, nên chuẩn bị lại redaction khi phục hồi.

Các migration 0001–0006 chứa MVP và yêu cầu phụ huynh, vẫn phải tồn tại. Kiểm tra dữ liệu booking, user, parent request và các FK trước/sau; migration mới không được tự xóa hoặc chuyển booking cũ thành lớp. `POST /api/v1/bookings` phải trả `410 LEGACY_BOOKING_CLOSED`, còn GET và action hợp lệ của booking cũ vẫn hoạt động. Kiểm tra tính tương thích code cũ với schema mới trước khi chọn rollback code.

## 4. Sao lưu và kiểm kê trước mutation remote

```bash
npx wrangler d1 time-travel info DB --env <env>
npx wrangler d1 migrations list DB --env <env> --remote
```

Ghi bookmark ngoài Git cùng commit, môi trường, thời điểm và số lượng từng bảng (không ghi PII). Nếu có dữ liệu thật, xuất bản sao D1 được bảo vệ trước migration; production bắt buộc. Bản export có email, hash mật khẩu và contact nên giới hạn truy cập, không commit và lưu/xóa theo chính sách. Xem truy vấn chỉ đọc trong [OPERATIONS.md](OPERATIONS.md).

## 5. Áp dụng migration và deploy khi đã qua gate

Các lệnh dưới đây là bước thực thi có ghi từ xa, chỉ chạy trong phiên phát hành được cho phép và sau checklist:

```bash
npm run db:migrate:staging:v2
npm run build:staging:v2
npm run deploy:staging:v2
```

Các lệnh trên chỉ dành cho V2 sau khi inventory, bookmark/backup và gates hoàn tất. Với production, dùng cấu hình/lệnh `production` riêng sau khi staging mới đã qua kiểm thử và được duyệt. Kiểm tra output Wrangler có đúng tên Worker, binding `DB`, `AUTH_LIMITER`, `BOOKING_LIMITER`, `APP_ENV`; không dùng `npm run deploy` mặc định vì build đó dùng development. Nếu tạo subdomain mới, DNS/TLS có thể cần thời gian; xác minh lại URL trước khi đánh giá smoke.

## 6. Xác minh sản phẩm mới sau deploy

Chạy smoke **chỉ đọc** trên URL vừa deploy:

```bash
npm run smoke -- https://<worker>.<subdomain>.workers.dev
```

Script kiểm tra SPA routes, health/security headers, subjects, public classes không lộ contact, cấu trúc phản hồi API nội dung/phương án phí và API dashboard từ chối anonymous. Chưa có mức phí được kiểm duyệt viên công bố trên staging. Script không tạo user, booking hoặc dữ liệu dọn dẹp; nó không xác nhận mutation.

**Bằng chứng staging V2 ngày 2026-10-11:** CI của `main` cho commit `bfac6a4` đã hoàn tất thành công. Worker ở URL trên đạt smoke chỉ đọc 16/16 sau khi chạy lại do timeout thoáng qua ở ngưỡng 10 giây. Chromium ở viewport di động hiển thị form đăng ký, không còn chặn bằng banner preview. Đăng ký với dữ liệu sai trả `422` validation, không tạo tài khoản. Sau phép thử đó, D1 có 2 user gia sư giả lập, 0 credential, 0 yêu cầu phụ huynh, 0 booking, 0 lớp; `PRAGMA foreign_key_check` trả 0 hàng. Đây là kiểm tra remote giới hạn; hành trình ba actor có ghi dữ liệu được kiểm trên D1 local.

`e2e/journeys.spec.ts` hiện có **một** hành trình Playwright trên Worker build + D1 local cô lập: parent consent/gửi yêu cầu; moderator tạo, xuất bản và gán lớp; tutor đã duyệt làm quiz/xác nhận điều khoản, chọn một trong ba option phí đang công bố, ứng tuyển, đọc contact sau gán và xác nhận hợp đồng. Test còn kiểm public/outsider không thấy contact, POST booking trả 410, GET danh sách booking trả 200, dashboard hiển thị số liệu từ hành trình, tạo file PDF hợp lệ, responsive ở 320/768/1280 px và skip link bằng bàn phím. Nó không thử rút gán, hoàn tất, hủy lớp, khiếu nại, xóa tài khoản hoặc race.

Các trường hợp đó được kiểm bằng Vitest integration trên D1 local: `tests/server/admin-assignments.test.ts`, `tests/server/complaints-privacy.test.ts`, `tests/server/classes.test.ts`, `tests/server/bookings-lifecycle.test.ts` và `tests/server/reports.test.ts`. Xem kết quả thực chạy trong release record; không suy test đã PASS từ việc file tồn tại. Sau deploy, kiểm tra số lượng dữ liệu, log 5xx và báo cáo theo quyền mà không đưa PII vào log.

Ghi kết quả E2E/smoke và version Worker trong tài liệu phát hành; giữ bookmark Time Travel và bản sao D1 được bảo vệ ngoài Git. Nếu bất kỳ gate nào lỗi, dùng [ROLLBACK.md](ROLLBACK.md); không tự khôi phục D1 khi chỉ lỗi code.

## 7. Cấp quyền kiểm duyệt viên

Xem [ADMIN_PROVISIONING.md](ADMIN_PROVISIONING.md). DB role `admin` là actor kiểm duyệt viên; không tự đăng ký vai trò này từ client. Staging V2 chưa có tài khoản kiểm duyệt viên vận hành; chờ người dùng đăng ký và cung cấp email để cấp quyền đúng tài khoản.

## 8. Tài khoản staging cũ

Trước mọi mutation trên staging cũ, `npx wrangler whoami`, `npx wrangler deployments list --name tutor-matching-staging --json` và `npx wrangler d1 list --json` phải cùng nhìn thấy đúng Worker/D1. Lần kiểm tra chỉ đọc ngày 2026-10-11, `/api/v1/health` trả 200 nhưng tài khoản Wrangler đang chọn không thấy hai tài nguyên đó. Vì vậy chưa có kiểm kê dữ liệu hiện tại hoặc quyền triển khai đã xác minh. Staging V2 có D1 riêng và không thay thế trạng thái đó.

## 9. Lịch sử deploy MVP cũ

| Ngày | Nội dung | Kết quả ghi nhận lúc đó |
|---|---|---|
| 2026-10-11 | Tạo D1 staging APAC, migration 0001; deploy auth + availability | Smoke auth/CSRF/PBKDF2 OK |
| 2026-10-11 | Migration 0002–0004; deploy tính năng TASK-01–16 | Smoke MVP 24/24 PASS; dữ liệu smoke đã xóa |
| 2026-10-11 | Deploy lại staging MVP, bookmark lưu ngoài Git | Smoke MVP 24/24 PASS; Chromium tải `/`, `/tutors`, `/sign-in` |

Các kết quả MVP lịch sử không xác nhận dữ liệu hiện tại hay tính năng `./figma`; bằng chứng phát hành mới được ghi riêng tại §6.

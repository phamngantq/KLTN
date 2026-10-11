# One-line agent command

Mở Codex CLI, Claude Code hoặc Cursor Agent **tại thư mục root repo** có `AGENTS.md`, `TASKS.md`, `PLAN.md`, `DESIGN_RULES.md`.

Gửi đúng một dòng:

> Tiếp tục thực hiện

Agent bắt buộc: chọn task `[ ]` đầu tiên trong TASKS.md → kiểm tra code và dependencies → thực hiện 1 task → chạy tests → tick checkbox + append TASK_LOG.md → tạo đúng 1 commit local → báo cáo → dừng.

Nếu coding agent không tự load `AGENTS.md`, chỉ lần đầu gửi:

> Đọc AGENTS.md và TASKS.md trong repository này, sau đó **Tiếp tục thực hiện**. Từ các lần sau, khi tôi nói “Tiếp tục thực hiện”, hãy áp dụng đúng workflow này.

Không paste credentials. Không tự push, deploy hoặc đụng D1 remote.

Có thể kiểm tra task kế tiếp **không cần chạy agent**: `node scripts/next-task.mjs`. Lệnh này chỉ đọc `TASKS.md`, không thay đổi file hay Git.

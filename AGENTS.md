# AGENTS.md — Coding assistant execution rules

## Project mission
Build a production-oriented Tutor Matching Platform with React/Vite frontend, Hono Cloudflare Worker API, Cloudflare D1 + Drizzle, Wrangler v4. Treat `PLAN.md` and `DESIGN_RULES.md` as required specifications.

## Strict constraints
1. **Figma is not yet audited.** Do not claim visual fidelity, add unapproved screens, fabricate screenshot values, or infer functionality from filename alone. Capture unresolved items in `FIGMA_GAP_LOG` (or `DESIGN_RULES.md` section J).
2. Single-worker modular monolith first. Do not introduce microservices, Redis, Durable Objects, Queues, paid SaaS or complicated realtime features without a concrete requirement.
3. All business decisions are enforced server-side. Never trust roles, prices, ownership, booking status, timestamps or availability just because the frontend sends them.
4. D1 migration SQL is source-controlled. Never silently modify production DB schema or run remote migrations as part of local tests.
5. Do not double-book: 30-minute booking slot claims with UNIQUE(tutor_id, slot_start_utc); create booking and all claims in one atomic D1 `batch()` operation. On conflict return HTTP 409; state transitions must release claims in same atomic operation.
6. Store concrete booking timestamps in UTC and recurring weekly hours with explicit timezone (default Asia/Ho_Chi_Minh), maintaining stable conversions.
7. Session cookies must be HttpOnly + Secure in production; protect unsafe requests against CSRF. Enforce role + resource ownership at service level. Hash session tokens at rest.
8. Use Zod schemas for request validation and parameterized SQL/Drizzle. No interpolated user input in SQL.
9. Separate dev/staging/prod databases and R2 storage; secrets go in Workers secrets or untracked `.dev.vars`, never git or browser bundles.
10. Favor design token-backed reusable components, mobile responsiveness and WCAG 2.2 AA. Every interactive page must support loading/error/empty states.
11. No fake API success. UI must show confirmed server state. No inert CTA buttons in release code.
12. Implement only P0/P1 features required by an audited Figma screen/product spec. Treat payments, chat, reviews and AI matching as optional until confirmed.

## Coding workflow
For every feature:
1. Identify the relevant Figma frame or mark `UNVERIFIED` in issue.
2. Write acceptance tests, auth matrix and data requirements.
3. Design D1 schema/index/migration if needed.
4. Implement domain logic + server tests before connecting UI.
5. Build responsive UI with tokenized reusable components and all states.
6. Add integration/E2E tests; compare screenshot at fixed viewports after Figma becomes available.
7. Run typecheck, lint, tests, migration review, and inspect for privacy leaks before completing.

## Completion report format
For each increment summarize:
- Implemented screens/features and files changed.
- Deviations from Figma/spec; unresolved questions.
- Commands/tests run and results (never fabricate).
- DB migrations and whether local/remote was touched.
- Known risks, limitations and next smallest increment.

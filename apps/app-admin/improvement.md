# Code Review Report

## DRY Violations

- src/app/api/whatsapp/webhook/route.ts and src/app/api/whatsapp/testRoute.ts: Large, duplicated OpenAI Assistant orchestration, tool definitions, thread/run lifecycle, media handling, and WhatsApp response logic. Consolidate into shared modules:
  - src/lib/assistant/client.ts: OpenAI client and assistant singleton
  - src/lib/assistant/tools.ts: Tool schemas and adapters to service functions
  - src/lib/assistant/runner.ts: Run lifecycle (create run, wait, submit tool outputs)
  - src/lib/assistant/formatters.ts: WhatsApp vs Web response formatting
  - src/lib/assistant/sessions.ts: Thread/session state accessors
- src/app/api/whatsapp/webhook/route.ts (~520–1880) and src/app/api/chat/route.ts (~1–240+): Repeated assistant instructions and tools. Extract shared instruction text and tool definitions to src/lib/assistant/tools.ts.
- Media handling duplicated:
  - src/app/api/whatsapp/webhook/route.ts (~1260–1880) vs src/app/api/checklist-items/[id]/photos/route.ts. Create src/lib/media/upload.ts covering: external fetch, MIME checks, path strategy, upload, and return URL.
- Location/task flows are reimplemented in multiple places (inspectorService + routes). Centralize in src/lib/services/inspection.ts with small, typed functions: getLocationsWithStatus, getTasksForLocation, completeAllForLocation, updateTask, getTaskMedia.

## Security Issues

- Excessive logging of PII and payloads:
  - src/app/api/whatsapp/webhook/route.ts (~96–140): Logs phone numbers and full message JSON (JSON.stringify(data)).
  - src/app/api/whatsapp/testRoute.ts (~96–140): Same as above.
  - Risk: PII leakage and large log volume. Action: Add a logger with levels; redact phone numbers, truncate payloads; disable verbose logs in production via env flags.
- Missing schema validation:
  - Many routes parse request.json() into any without validation (customers, work-orders, webhook, etc.). Action: Add Zod schemas in src/lib/validators/* and enforce per route.
- Public ACL on object storage:
  - src/app/api/checklist-items/[id]/photos/route.ts (~41–66): PutObjectCommand with ACL: 'public-read'.
  - src/app/api/whatsapp/webhook/route.ts (~1640–1675): PutObjectCommand with ACL: 'public-read'.
  - Action: Prefer private buckets and signed URLs; if public objects are required, ensure paths do not expose PII (avoid names/phones in keys).
- Webhook authentication via query param only:
  - src/app/api/whatsapp/webhook/route.ts (GET/POST): Compares ?secret to env. Action: If provider supports, use signature verification (HMAC). Add rate limiting and avoid logging secrets.
- Prisma query logging in production:
  - src/lib/prisma.ts (~25–40): Slow query logs may leak query text. Action: Ensure parameters are redacted.
- Local CA cert and unused direct pg access:
  - src/lib/db.ts: Reads ca-certificate.crt and exposes Pool; appears unused. Action: Remove or gate behind env; ensure no sensitive files are committed.

## Architecture Issues

- Serverless anti-patterns (ephemeral state and timers in route files):
  - src/app/api/whatsapp/webhook/route.ts (~30–60): In-memory Maps for whatsappThreads and processedMessages.
  - src/app/api/whatsapp/webhook/route.ts (~60–75): setInterval cleaner inside route module.
  - src/app/api/whatsapp/testRoute.ts: Same patterns.
  - Action: Move to Redis/MemCachier-backed stores with TTLs; run periodic cleanup (if needed) via cron (vercel.json already has a cron example for cache warmup).
- Cache-only reads without DB fallback:
  - src/lib/services/inspectorService.ts: getLocationsWithCompletionStatus (~280–345), getTasksByLocation (~345–470), getWorkOrderById (~110–160) explicitly depend on MemCachier dataset and return []/null without DB fallback.
  - Action: Implement cache-first, DB-fallback pattern; update caches on writes (write-through/invalidations already partially present).
- Data model duplication (enums vs tables):
  - prisma/schema.prisma: PropertyType/PropertySize enums co-exist with Property and PropertySizeOption tables.
  - Action: Choose dynamic tables or enums; if dynamic needed, migrate CustomerAddress.propertyType/propertySize to FKs and remove enums from the model and API contracts.
- Mixed data access layers:
  - Prisma is standard; src/lib/db.ts (pg Pool) is unused. Action: Remove to prevent drift and confusion.
- Build masking errors:
  - next.config.ts (3–13): eslint.ignoreDuringBuilds and typescript.ignoreBuildErrors set to true. Action: Set to false and fix issues; enforce in CI.

## Performance & Reliability

- Heavy polling for OpenAI runs:
  - src/app/api/whatsapp/webhook/route.ts (~630+): waitForRunCompletion polls every 100ms up to 60s. Action: Consider webhook/callback or async background worker; if polling must remain, use exponential backoff and reduce request concurrency.
- Cache warmup stores large arrays:
  - src/lib/services/cache-warmup.ts: Fetches and caches enriched arrays for inspectors, work orders, customers, addresses, checklist items. Action: Shard keys (e.g., per inspectorId), add pagination, and verify memory limits; include “last updated” versioning to detect stale reads.
- Verbose logging in hot paths increases latency and cost. Action: Replace console.log with leveled logging, default warn/error in production.

## Error Handling & Observability

- Inconsistent error responses:
  - Many routes return generic 500. Action: Standardize error payloads with error codes and user-safe messages; include correlation IDs for tracing.
- No request/response metrics. Action: Add minimal instrumentation (duration, errors) to critical endpoints (webhook, chat, uploads).

## API Design & Validation

- No input validation across CRUD endpoints:
  - src/app/api/customers/route.ts (~20–80, ~100–170) and src/app/api/work-orders/route.ts: Directly trusting body fields. Action: Add Zod schemas and reuse across client/server.
- Media endpoints accept any file with minimal checks:
  - src/app/api/checklist-items/[id]/photos/route.ts: Allow-list image/*, but no size limit or scanning. Action: Enforce size limits, content-type allowlist, and consider virus scanning hooks.

## Configuration & Versions

- Package versions:
  - package.json: next 15.5.0 with react 19.1.0. Action: Verify Next.js 15 compatibility with React 19 in your deployment target; pin known-good versions.
- Linting/Type checking disabled in builds (see Architecture Issues), undermining code quality gates.

## Code Quality Notes

- src/lib/prisma.ts:
  - Uses as never cast for client.$on('query'). Clean up types. Signal handlers in serverless contexts are unnecessary.
- src/lib/services/inspectorService.ts:
  - Intermixes cache lookup, mapping, and business logic with many any casts. Refactor into smaller typed functions and centralized DTOs.
- src/lib/thread-store.ts:
  - In-memory store with a comment to use Redis. Replace with real persistence.

## Refactor Plan (Prioritized)

1) Fail builds on problems
- Set next.config.ts to enforce ESLint and TypeScript checks.
- Add CI gate: pnpm lint && tsc --noEmit before pnpm build.

2) Replace ephemeral state with durable storage
- Move whatsappThreads and processedMessages to Redis/MemCachier with TTLs.
- Replace setInterval cleaners with a scheduled job (Vercel cron) if needed.
- Add idempotency keys for incoming webhook messages (use provider message id).

3) Add validation and secure logging
- Introduce Zod schemas in src/lib/validators and apply in all route handlers.
- Add a logger with levels and redaction (phone, ids). Reduce prod logs to warn/error.

4) Unify assistant orchestration
- Implement src/lib/assistant/* modules and migrate chat and WhatsApp routes to use shared flows.
- Centralize assistant instruction templates and tool definitions.

5) Fix cache strategy
- Convert “cache-only” reads to cache-first with DB fallback.
- Add write-through caching and explicit invalidation where writes occur.
- Shard warm caches and include updatedAt/version in a manifest.

6) Resolve property model duplication
- Decide on dynamic tables vs enums. If dynamic, migrate CustomerAddress to FKs and remove enums and enum-based fields from API.

7) Harden media pipeline
- Centralize external download and Spaces upload with strict MIME/size checks and predictable key paths.
- Prefer private objects + signed URLs where possible.

8) Remove dead code and tighten types
- Remove src/lib/db.ts if unused.
- Replace any/never casts with proper types; add DTOs under src/types.

## Quick Wins

- Disable verbose logs in production; redact phone numbers and payloads.
- Add request timeout handling consistently (webhook currently doesn’t send a quick fallback like testRoute does).
- Document required env vars for Spaces and MemCachier and validate on boot.
- Add small health/manifest endpoint to inspect cache coverage (e.g., extend /api/cache/inspect).

## Suggested Folder Additions

- src/types/: Shared interfaces/DTOs (JobSummary, WorkOrderSummary, LocationStatus, Task, MediaResult).
- src/lib/validators/: Zod schemas per API route.
- src/lib/assistant/: Assistant orchestrator (client, runner, tools, formatters, sessions).
- src/lib/media/: Media download/validation/upload helpers.


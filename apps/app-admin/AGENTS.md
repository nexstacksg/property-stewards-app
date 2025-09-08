# Repository Guidelines

## Project Structure & Module Organization
- `src/app` — Next.js App Router pages and API routes (e.g., `src/app/api/*/route.ts`).
- `src/components` — Reusable UI components (export components in PascalCase; files in kebab-case).
- `src/lib` — Server-side utilities (Prisma, Redis, S3, helpers). Aliased as `@/*`.
- `prisma` — Prisma schema, migrations, and `seed.ts`.
- `public` — Static assets.
- `docs` — Project docs; see `VERCEL_ENV_SETUP.md`, `REDIS_SETUP.md`.

## Build, Test, and Development Commands
- `pnpm dev` — Run the local Next.js dev server.
- `pnpm build` — Generate Prisma client, then build the app.
- `pnpm start` — Start the production server (after `pnpm build`).
- `pnpm lint` — Run ESLint with Next.js/TypeScript rules.
- Database: `pnpm db:migrate`, `pnpm db:push`, `pnpm db:seed`, `pnpm db:studio`.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict: true`). Indentation: 2 spaces.
- Imports: use path alias `@/*` (see `tsconfig.json`).
- Files: components in kebab-case (e.g., `add-checklist-button.tsx`); React components exported in PascalCase.
- Routes: App Router with `route.ts` for APIs and `page.tsx` for pages.
- Linting: ESLint (`eslint.config.mjs`, Next core-web-vitals). Fix issues before PRs.
- TailwindCSS v4 is used; prefer utility-first styles in components.

## Testing Guidelines
- No formal test runner is configured yet. When adding tests, prefer Jest/Vitest.
- Place unit tests in `src/__tests__` and name files `*.test.ts(x)`.
- Aim for coverage on lib utilities and API route handlers first.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject (≤72 chars), optional scope, e.g., `fix(work-orders): handle null dates`.
- PRs: include a clear summary, linked issues, before/after screenshots for UI, and migration notes if Prisma schema changes.
- Keep PRs focused and small; include `docs:` updates when behavior/config changes.

## Security & Configuration Tips
- Env vars via `.env`/Vercel: database, Redis, S3, OpenAI, WhatsApp. Never commit secrets.
- See `VERCEL_ENV_SETUP.md` and `REDIS_SETUP.md` for required variables and setup.
- Prisma uses `DATABASE_URL`; run `pnpm db:migrate` after schema updates.


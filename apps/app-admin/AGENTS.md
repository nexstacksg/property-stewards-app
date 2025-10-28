# Repository Guidelines

## Project Structure & Module Organization
- `src/app` — Next.js App Router pages and API routes (e.g., `src/app/api/*/route.ts`).
- `src/components` — Reusable UI; files in kebab-case, components exported in PascalCase.
- `src/lib` — Server-side utilities (Prisma, Redis, S3, helpers). Import via `@/*`.
- `prisma` — Prisma schema, migrations, and `seed.ts`.
- `public` — Static assets.
- `docs` — Setup docs; see `VERCEL_ENV_SETUP.md`, `REDIS_SETUP.md`.
- Tests — Place in `src/__tests__` with `*.test.ts(x)`.

## Build, Test, and Development Commands
- `pnpm dev` — Start the local Next.js dev server.
- `pnpm build` — Generate Prisma client and build the app.
- `pnpm start` — Run the production server (after `pnpm build`).
- `pnpm lint` — Lint with Next.js/TypeScript rules.
- Database: `pnpm db:migrate`, `pnpm db:push`, `pnpm db:seed`, `pnpm db:studio`.
- Example: after schema changes run `pnpm db:migrate && pnpm build`.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict: true`), 2-space indentation.
- Imports: use `@/*` paths (configured in `tsconfig.json`).
- Components: files in kebab-case (e.g., `add-checklist-button.tsx`); export in PascalCase.
- Routes: App Router with `page.tsx` for pages and `route.ts` for APIs.
- Styles: TailwindCSS v4; prefer utility-first classes in components.
- Linting: fix all ESLint issues before opening PRs.

## Testing Guidelines
- No runner configured yet. When adding tests, prefer Jest or Vitest.
- Place unit tests under `src/__tests__`; name `*.test.ts` or `*.test.tsx`.
- Prioritize coverage for `src/lib` utilities and `src/app/api/*/route.ts` handlers.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject (≤72 chars), optional scope. Example: `fix(work-orders): handle null dates`.
- PRs: include a clear summary, linked issues, before/after UI screenshots, and migration notes if Prisma schema changes.
- Keep PRs focused and small; include `docs:` updates when behavior/config changes. Run `pnpm lint` and build locally before requesting review.

## Security & Configuration Tips
- Configure env via `.env`/Vercel (database, Redis, S3, OpenAI, WhatsApp). Never commit secrets.
- See `docs/VERCEL_ENV_SETUP.md` and `docs/REDIS_SETUP.md` for required variables and setup.
- Prisma uses `DATABASE_URL`; run `pnpm db:migrate` after schema updates.


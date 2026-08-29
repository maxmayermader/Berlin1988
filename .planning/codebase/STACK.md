# Technology Stack

**Analysis Date:** 2026-08-18

## Languages

**Primary:**
- TypeScript 5.7.3 - Full project, `strict: true`. Used across engine, AI, apps, and tests

**Supporting:**
- JavaScript (ESM modules) - Package format

## Runtime

**Environment:**
- Node.js 22+ (from `@types/node@22.20.1`)

**Package Manager:**
- pnpm 9.15.4
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Next.js 15, App Router - Web app (`apps/web`), React Server Components + client components
- PartyKit - Realtime authoritative room server (`apps/party`), runs on Cloudflare Durable Objects

**Testing:**
- Vitest 2.1.9 - Unit tests, golden replay tests, integration tests
  - Config: `vitest.config.ts`
  - Environment: Node.js (no browser DOM)
  - Include pattern: `packages/**/tests/**/*.test.ts`

**Build/Dev:**
- TypeScript compiler (tsc) - Type checking via `pnpm typecheck`
- tsx 4.23.12 - TypeScript execution for simulation harness (`packages/ai/sim/run.ts`)
- Turborepo - Monorepo task orchestration (referenced in ARCHITECTURE.md)
- Biome - Linting and formatting (referenced in CLAUDE.md, config not yet created)

## Key Dependencies

**Runtime (Current):**
- None at present. Packages are framework-free and dependency-free to maintain purity.

**Runtime (Planned - Phase 2+):**
- **Zod** - Runtime validation at trust boundaries (mentioned in `docs/ARCHITECTURE.md` §1), planned for `packages/shared` schemas
- **Zustand** - Client state management (`apps/web`), holds session/UI concerns only
- **Motion** (framer-motion successor) - Resolution replay animation
- **Tailwind CSS v4** - Styling with design tokens in CSS variables
- **Drizzle ORM** - Database schema migrations and queries (`apps/web` + `apps/party`)

**Development:**
- `@types/node@22.20.1` - TypeScript definitions for Node.js APIs
- `typescript@5.9.3` - TypeScript compiler

## Configuration

**TypeScript:**
- `tsconfig.base.json` - Shared compiler options (`target: ES2022`, `lib: ES2022`, `module: ESNext`, `moduleResolution: Bundler`)
- `tsconfig.json` - Root project references via monorepo workspace (`packages/shared`, `packages/engine`, `packages/ai`)
- Per-package tsconfig files with `composite: true` for incremental builds

**Environment:**
- `NEXT_PUBLIC_PARTYKIT_HOST` - Only environment coupling between `apps/web` and `apps/party` (set via Vercel)
- Other environment vars planned for Phase 6+ (Neon Postgres credentials, etc.)

**Build:**
- `pnpm-workspace.yaml` - Monorepo structure (`packages/*`, `apps/*`)
- Root `package.json` - Workspace scripts: `test`, `test:watch`, `typecheck`, `sim`

## Package Structure

**Core Packages (Dependency-free):**
- `packages/shared/` - Types, enums, wire-protocol schemas. Zero dependencies. Re-exports via `src/index.ts`
- `packages/engine/` - Pure rules engine. Only depends on `@berlin/shared`. Re-exports via `src/index.ts`
- `packages/ai/` - Bot opponents. Depends on `@berlin/shared`, `@berlin/engine`. Re-exports via `src/index.ts`

**Applications:**
- `apps/web/` - Next.js client application (skeleton as of 2026-08-18)
- `apps/party/` - PartyKit room server (skeleton as of 2026-08-18)

## Platform Requirements

**Development:**
- Node.js 22+ with pnpm 9.15.4
- TypeScript 5.7.3
- Biome for linting/formatting (config not yet present; will replace ESLint/Prettier)

**Production:**
- **Web hosting:** Vercel (Next.js 15 App Router)
- **Realtime hosting:** Cloudflare (PartyKit Durable Objects, distributed globally)
- **Database (Phase 6+):** Neon Postgres (serverless PostgreSQL)

## Commands

```bash
pnpm test              # Run all tests via Vitest
pnpm test:watch        # Watch mode
pnpm typecheck         # Full TypeScript build check
pnpm sim               # Run balance harness (bot-vs-bot simulation, ~6ms/match)
```

## Special Notes

- **No Python dependency:** Rules engine implemented in TypeScript, not Python/FastAPI, for code sharing across client/server boundaries
- **Purity constraints:** `packages/engine` and `packages/ai` contain no side effects, randomness, I/O, or framework imports
- **Monorepo with strict boundaries:** Dependency flow is `shared ← engine ← ai ← apps`, enforced by lint
- **Seeded PRNG:** All randomness comes from a seeded PRNG inside `GameState`, enabling deterministic replay and golden-file testing
- **Module resolution:** ESM only, `"type": "module"` in root and all packages, `verbatimModuleSyntax: true` for precise re-exports

---

*Stack analysis: 2026-08-18*

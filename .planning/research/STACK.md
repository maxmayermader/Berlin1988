# Stack Research

**Domain:** Realtime multiplayer hidden-movement web game — UI/realtime layer (`apps/web` on Next.js/Vercel, `apps/party` on PartyKit)
**Researched:** 2026-08-18
**Confidence:** MEDIUM (version numbers verified directly against the npm registry = HIGH; PartyKit maintenance/hosting claims verified via multiple cross-checked web sources = MEDIUM; single-source claims flagged LOW below)

This is a **subsequent milestone** in a brownfield project. `packages/shared`, `packages/engine`, `packages/ai` are done. This document covers only what's needed to build `apps/web` and `apps/party` — the lobby, realtime sync, board rendering, chat, deckbuilder, and local persistence. It does not re-litigate the engine/AI stack, and it does not re-litigate decisions already locked in `docs/ARCHITECTURE.md` (Next.js 15, PartyKit, native SVG board) — it verifies those decisions are still current and fills in the specifics those docs left open (exact versions, supporting libraries, and the undecided PartyKit hosting mode).

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 15.5.23 (latest 15.x) | `apps/web` — App Router, RSC for lobby/menus, client components for the board | Already committed in `docs/ARCHITECTURE.md` §2 and every `apps/web/CLAUDE.md`. Confirmed still current: 15.x is actively patched (latest 15.5.x released within the last few weeks). **Next.js 16 is now the `latest` npm tag** (16.3.1) — see "What NOT to Use" below for why this research does not recommend jumping to it mid-decision. |
| React | 19.2.x | UI runtime | Required peer for Next.js 15/16 and current Zustand/Radix/Motion majors. No reason to pin below 19 — RSC + `use()` + Actions are assumed by the rest of this stack. |
| PartyKit | 0.0.115 (CLI + room runtime) | `apps/party` — authoritative room server, one Durable Object per match | Confirmed still actively maintained after Cloudflare's April 2024 acquisition: GitHub releases through March 2026, open issues through July 2026 (MEDIUM confidence, cross-checked). Already the committed choice per `apps/party/CLAUDE.md`; nothing found in research changes that. |
| `partysocket` | 1.3.0 | Client-side WebSocket connection from `apps/web` to the PartyKit room | The correct pairing for a PartyKit room: reconnect-with-backoff, `usePartySocket` React hook (`partysocket/react`), works outside PartyKit too (dependency-free, no DOM/EventEmitter coupling) so it won't fight Next.js's RSC/client boundary. This is what `apps/web/lib/socket.ts` should be built on per the existing `CLAUDE.md`. |
| Zustand | 5.0.15 | Client-side session/UI state (`matchStore.ts`, `uiStore.ts`) | Already the committed choice. v5 targets React 18+ (peer dep confirms `react: >=18.0.0`), works cleanly with React 19. Deliberately thin — per `apps/web/lib/CLAUDE.md` rule 2, the store holds a `PlayerView`, not a mirrored `GameState`, so Zustand's minimal-boilerplate model (no reducers/actions ceremony) fits; a heavier state library (Redux Toolkit, Jotai atoms-per-field) would be solving a problem this project doesn't have. |
| Tailwind CSS | v4 (4.3.x latest) | Styling, CRT/high-contrast design-token themes | Already committed. v4's `@theme` CSS-variable model (replacing `tailwind.config.js`) is a good structural fit for the two-theme (CRT / high-contrast) token requirement in `apps/web/CLAUDE.md` — themes become a CSS variable swap, not a JS config branch. Build is materially faster than v3 (helps `apps/web` dev-loop). |
| Motion (`motion` npm package) | 13.x | Resolution replay animation | This is the current name for what was `framer-motion` — the same team ships both `motion` (framework-agnostic, includes a React import path) and `framer-motion` (React-only) as synchronized releases; `motion` is the forward-looking package name. Confirms `prefers-reduced-motion`-aware animation is a first-class supported pattern (`useReducedMotion` hook), which matters directly for `apps/web/CLAUDE.md`'s non-negotiable accessibility rule ("replay still runs; it just cuts rather than tweens"). |
| Zod | ^4 (4.4.x latest) | Runtime validation at every trust boundary (`SUBMIT_ORDER`, all inbound room messages, `packages/shared` schemas) | Not yet installed anywhere in the repo despite being referenced in `docs/ARCHITECTURE.md` §1 and the codebase STACK.md as "planned." Zod v4 is the current stable major (v3 is legacy-maintenance only at this point) — start on v4 rather than v3, since this is a fresh install with no migration cost either way. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, and similar Radix primitives | 1.1.x–1.2.x latest | Unstyled, accessible primitives underlying `components/ui/` (dialog, tooltip, etc.) | Use via the shadcn/ui CLI pattern (below) rather than installing Radix packages one-by-one by hand — but know that what you're actually shipping is Radix + your own Tailwind classes, not a component library dependency. |
| shadcn/ui (CLI, not an npm dependency) | current CLI, Tailwind v4-compatible | Scaffolding for `components/ui/` primitives (button, panel, tooltip, dialog) | `npx shadcn@latest init` then `add` per component. It copies component source into the repo rather than installing a package — exactly what's needed here, because the CRT/phosphor-green aesthetic requires deep restyling of every primitive, not a themed wrapper around someone else's default look. Full ownership beats a dependency you'd immediately be fighting. |
| `class-variance-authority` (cva) | 0.7.1 | Variant styling for `ui/` primitives (button states, panel variants) | Pairs with shadcn/ui-style components; use for any primitive with >2 visual variants (button kind, panel emphasis). |
| `clsx` + `tailwind-merge` | 2.1.1 / 3.6.0 | Conditional className composition without Tailwind class conflicts | Standard `cn()` helper pattern; needed the moment a component takes a `className` override prop. |
| `lucide-react` | current | Icon set | Only if the CRT aesthetic needs generic UI icons (chevrons, close, etc.) beyond the game's own sector/agent iconography, which should stay bespoke SVG per `apps/web/CLAUDE.md`'s "shape and pattern, not color alone" rule. |
| `nanoid` (or a hand-rolled custom-alphabet generator) | 6.x latest, but pin the *behavior* not the version | Lobby join codes | Use `customAlphabet` with an unambiguous character set (no `0/O`, `1/I/l`) for a short, typeable code — not the default nanoid alphabet, which includes lookalikes. This is a design choice more than a library choice; the library just needs to support a custom alphabet, which nanoid does. |
| `idb-keyval` | 6.3.0 | **Not recommended for v1** — noted only as the upgrade path if localStorage's ~5MB/synchronous-API limits ever bite | See "local storage persistence" section below. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| PartyKit CLI (`npx partykit dev`) | Local dev server for `apps/party`, mirrors the production Durable Object runtime | Already the standard workflow; `apps/party` skeleton should get a `partykit.json` config pointing at the compiled Worker entry. |
| Vitest (already in repo, 2.1.9) | Extend existing test setup to cover `apps/web` component/store logic and `apps/party` message-handling logic | No new test runner needed — this is a `vitest.config.ts` project/include-pattern extension, not a new dependency. Browser DOM testing (if needed for component tests) would add `@vitest/browser` or `jsdom`, but hold off until UI components exist to justify it. |

## Installation

```bash
# apps/web — core
pnpm --filter web add next@^15 react@^19 react-dom@^19 partysocket zustand zod motion

# apps/web — UI primitives (via shadcn CLI, run from apps/web)
npx shadcn@latest init
npx shadcn@latest add button dialog tooltip
pnpm --filter web add class-variance-authority clsx tailwind-merge

# apps/web — dev deps
pnpm --filter web add -D tailwindcss@^4 @tailwindcss/postcss typescript@^5.9

# apps/party — core
pnpm --filter party add partykit zod
pnpm --filter party add @berlin/shared @berlin/engine @berlin/ai   # workspace:* per existing convention
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Native inline SVG for the board | React Flow (`@xyflow/react` — the current npm name; `reactflow` is the deprecated alias, do not install it) | **Only if the map ever needs user-driven layout** (drag nodes, auto-layout, multiple dynamically-generated maps). This project's map is 18 fixed nodes with designer-authored `x`/`y` percentages per `docs/ARCHITECTURE.md` — exactly the case the architecture doc already ruled on ("canvas/WebGL is unjustified complexity"; the same reasoning excludes a flowchart-editor library like React Flow, which ships pan/zoom/drag-node/minimap machinery this game doesn't use). Pulling in React Flow here would be importing an editor to render a board game map. |
| PartySocket + Zustand for state sync | Yjs / `y-partykit` (CRDT sync) | Only if the game needed collaborative, merge-conflict-tolerant shared editing (e.g., simultaneous free-text co-editing). This game's state model is the opposite: one authoritative server (`GameState` in the Durable Object) broadcasting fog-filtered snapshots (`PlayerView`) to clients that never write shared state directly — a CRDT solves a problem (concurrent conflicting writes to the same document) this architecture already avoids by design. Do not introduce Yjs. |
| Zustand `persist` middleware + `localStorage` | `idb-keyval` (IndexedDB) | Switch if saved-deck data or match history grows past a few hundred KB, or if synchronous localStorage reads start blocking anything performance-sensitive. For v1 scope (player name + a handful of 10-card loadouts, each a small JSON array of card ids), localStorage is well within its ~5MB ceiling and simpler — no async API, no schema migrations. |
| PartyKit managed cloud (`partykit.io`) for initial deploy | Cloud-prem: deploy to your own Cloudflare account via the PartyKit CLI | Switch once there's a reason to control cost at scale or fold the room server into existing Cloudflare infra — see "PartyKit Hosting" below. Not needed to start; the managed platform's free tier is sufficient for a friends-group game in active development. |
| shadcn/ui (copy-in components) | A packaged component library (Chakra, Mantine, MUI) | Only if the project wanted a stock visual language. This project's CRT/phosphor-green aesthetic with a mandatory high-contrast alternate theme needs every primitive restyled from scratch — a packaged library's theming API becomes friction, not leverage, the moment you're overriding every default. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Upgrading to Next.js 16 as part of this milestone | Next.js 16 is now `npm dist-tag latest` (16.3.1), but `docs/ARCHITECTURE.md` and every `apps/*/CLAUDE.md` explicitly commit to "Next.js 15, App Router" as an established decision. Silently building against 16 during a UI-focused milestone risks discovering breaking changes (App Router/RSC behavior, caching semantics) mid-build, in a phase explicitly scoped to *not* touch architecture. | Build on the latest Next.js **15.x** patch (15.5.23 at research time). Treat the 15→16 upgrade as a deliberate, separate decision — flag it back to the team rather than absorbing it here. |
| `reactflow` (the old npm package name) | Deprecated; the same maintainers now publish under `@xyflow/react`. Installing the old name means picking up an unmaintained package by accident. | Not applicable here — see "Alternatives Considered": neither package should be installed for this project's board. If a future project needs a real graph-editor, use `@xyflow/react`, not `reactflow`. |
| Building a second, hand-rolled WebSocket reconnection layer | `partysocket` already provides reconnect-with-backoff and a React hook (`usePartySocket`) purpose-built for PartyKit rooms; re-implementing this in `apps/web/lib/socket.ts` duplicates well-tested logic and is an easy place to introduce a fog-of-war-adjacent bug (e.g., stale state surviving a reconnect). | `partysocket` / `partysocket/react`. |
| A generic chat SDK (Pusher, Ably, Stream Chat, etc.) for in-lobby/in-game chat | The PartyKit room is already the single authoritative message hub for this match; a `CHAT` message type over the existing `partysocket` connection is a few lines of protocol, not a new integration. A third-party chat SDK would add a second realtime provider, a second connection, and a second point of trust-boundary validation for no functional gain — this game's chat is scoped to players already in the room. | A `CHAT` variant on the existing Zod-validated wire protocol, broadcast by `apps/party` like every other message type. |
| Yjs / CRDT-based sync (`y-partykit`) | Solves concurrent-write conflict resolution, which this architecture doesn't have — the server is the single writer of `GameState`; clients only ever hold a read-only, fog-filtered `PlayerView` plus locally-pending order state. Introducing a CRDT here adds a merge model with no writes to merge. | Plain PartyKit broadcast + Zod-validated request/response, exactly as scoped in `apps/party/CLAUDE.md`. |
| `idb-keyval` (or any IndexedDB wrapper) for v1 persistence | Solves a storage-size/async problem this project doesn't have yet — the only local data is a player name and a small number of 10-card loadouts. Reaching for IndexedDB now adds an async data layer (loading states, migration versioning) for kilobytes of JSON. | `localStorage` via Zustand's built-in `persist` middleware. |

## Stack Patterns by Variant

**If PartyKit's managed free tier ever becomes a cost or rate-limit concern (production, more concurrent matches than a friends-group needs):**
- Switch to "cloud-prem" — deploy `apps/party` to your own Cloudflare account with the PartyKit CLI (env vars + Cloudflare API token with "Edit Cloudflare Workers" permission).
- Because Cloudflare Durable Objects have been available on the Workers **Free** plan since April 2025 (100K requests/day, 5GB storage), this switch does not itself require paying Cloudflare — you only start paying if usage exceeds the free tier, and even then it's Cloudflare's Workers/DO pricing, not a PartyKit fee.

**If the map data ever needs to support multiple maps or a map editor:**
- Reconsider the native-SVG-only decision at that point — the "no library" recommendation above is scoped to the current single-map, fixed-layout requirement. Don't pre-adopt a graph library speculatively.

**If local-only "solo mode" (per `apps/web/lib/localMatch.ts`) needs to survive a page refresh mid-match:**
- Persist the in-progress `GameState` (not `PlayerView` — this is the one place a full `GameState` legitimately lives client-side, per `apps/web/lib/CLAUDE.md` rule 3) to `localStorage` via the same Zustand `persist` pattern, keyed separately from the deck/profile store so a stale mid-match save can't leak into multiplayer state.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@15.5.x` | `react@19.x`, `react-dom@19.x` | Next.js 15's App Router targets React 19; do not pair with React 18 — several Next 15 features (Server Actions maturity, `useFormStatus` behavior) assume it. |
| `zustand@5.x` | `react@>=18.0.0` | Confirmed via published peer dependencies; React 19 is within range. If using the `persist` middleware's `createJSONStorage`, no extra peer needed for basic localStorage use. |
| `tailwindcss@4.x` | shadcn/ui current CLI | shadcn/ui's CLI and component set have been updated for Tailwind v4's CSS-variable `@theme` model; do not mix a Tailwind v3-era shadcn component snapshot with a v4 Tailwind install — regenerate components via the current CLI rather than copying old snippets from pre-v4 tutorials. |
| `motion` (or `framer-motion`) | `react@19.x` | Both package names are maintained in lockstep by the same team; pick one and don't install both — `motion`'s React entry point (`motion/react`) supersedes `framer-motion` as the forward-facing name, but `framer-motion` still receives synchronized releases if the team prefers that import name. |
| `partysocket@1.3.0` | any WebSocket server, not just PartyKit | Confirms it's safe to use even if `apps/party`'s hosting mode changes later (managed vs. cloud-prem) — the client library doesn't care which Cloudflare account the Durable Object lives in, only the room URL (`NEXT_PUBLIC_PARTYKIT_HOST`). |
| PartyKit CLI `0.0.115` | Cloudflare Workers/Durable Objects runtime (`workerd`) | PartyKit's runtime is built directly on `workerd`; no separate Node.js compatibility layer to manage inside `apps/party` beyond what PartyKit's build already handles. |

## Sources

- npm registry (`npm view <pkg> version` / `dist-tags`) — direct version lookups for `next`, `react`, `react-dom`, `partykit`, `partysocket`, `zustand`, `@xyflow/react`, `reactflow`, `motion`, `framer-motion`, `tailwindcss`, `idb-keyval`, `nanoid`, `zod`, Radix packages, `cva`, `clsx`, `tailwind-merge`, `lucide-react`. Confidence: HIGH (authoritative registry, current at research time).
- WebSearch: "PartyKit still maintained 2026 Cloudflare Workers status future" — confirms active releases/issues through mid-2026 post-Cloudflare-acquisition. Confidence: MEDIUM (cross-checked against GitHub activity signals in the same result set).
- WebSearch: "PartyKit vs Cloudflare Durable Objects vs Vercel realtime multiplayer game hosting comparison" — confirms PartyKit-as-abstraction-over-Durable-Objects model and the Vercel-frontend + Cloudflare-realtime-backend split already committed to in this repo. Confidence: MEDIUM.
- WebSearch: "partyserver cloudflare npm library successor to PartyKit" — confirms `partyserver` as the lower-level primitive PartyKit itself is partly built from; noted as an alternative, not a recommendation. Confidence: MEDIUM.
- WebSearch: "PartySocket npm package version React hooks usePartySocket" — confirms `partysocket/react`'s `usePartySocket` hook API shape and multi-platform/dependency-free design. Confidence: MEDIUM.
- WebFetch: `https://docs.partykit.io/guides/deploy-to-cloudflare/` — managed vs. cloud-prem deployment modes, requirements (Cloudflare account, API token scope). Confidence: LOW (single source; official docs page, not independently cross-checked, treat specifics as directionally correct but verify against current docs before deploying).
- WebSearch: "Cloudflare Durable Objects require Workers Paid plan free tier 2026" — confirms Durable Objects moved to the Workers Free plan in April 2025 (Cloudflare changelog dated 2025-04-07). Confidence: MEDIUM (cross-checked against multiple pricing-summary results plus a dated official changelog title).
- WebSearch: "Tailwind CSS v4 shadcn/ui 2026 stable release Next.js 15 setup" — confirms Tailwind v4's `@theme`/CSS-variable model, shadcn/ui CLI's current Tailwind v4 + React 19 support. Confidence: MEDIUM.
- Codebase docs (read directly, not web research): `docs/ARCHITECTURE.md` §1–2, §9; `apps/web/CLAUDE.md`; `apps/party/CLAUDE.md`; `apps/CLAUDE.md`; `apps/web/components/CLAUDE.md`; `apps/web/lib/CLAUDE.md`; `.planning/codebase/STACK.md`; `.planning/codebase/ARCHITECTURE.md` — source of the already-locked decisions this research verifies rather than re-derives (Next.js 15, PartyKit, native SVG board, Zustand session-only state, Motion, Tailwind v4, no accounts/localStorage persistence).

---
*Stack research for: Realtime multiplayer hidden-movement web game UI layer (Berlin 1988)*
*Researched: 2026-08-18*

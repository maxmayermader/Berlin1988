# External Integrations

**Analysis Date:** 2026-08-18

## APIs & External Services

**Not currently integrated.** The engine, AI, and core game logic are intentionally framework-free with no external API calls. All integrations are planned for Phase 2+.

## Data Storage

**Databases:**
- **Neon Postgres** (Phase 6+)
  - Purpose: Async matches, user accounts, match replay storage, leaderboards
  - Connection: Environment variable (details to be configured)
  - Client: Drizzle ORM for migrations and queries
  - Status: Not yet implemented; referenced in `docs/ARCHITECTURE.md` §2

**File Storage:**
- Local filesystem only — no cloud storage integration

**Caching:**
- None currently

## Authentication & Identity

**Auth Provider:**
- Custom (Phase 2+)
- Implementation approach: To be designed in Phase 2 (lobby/matchmaking layer)
- No third-party OAuth/SSO currently planned
- User profiles and match history storage deferred to Phase 6

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Console logging only (no external log aggregation)
- Engine, AI, and shared packages have no logging capability by design (purity constraint)

## CI/CD & Deployment

**Hosting:**
- **Web:** Vercel (Next.js 15)
  - Deployment target: `apps/web`
  - Build command: (to be configured)
  - Environment: Preview environments point at staging PartyKit host

- **Realtime:** Cloudflare (via PartyKit)
  - Deployment target: `apps/party`
  - PartyKit abstracts raw Cloudflare Durable Objects
  - One Durable Object per match, globally distributed
  - Generous free tier

**CI Pipeline:**
- Not yet configured (as of 2026-08-18)
- Planned validations:
  - TypeScript type check (`pnpm typecheck`)
  - Vitest test suite (`pnpm test`)
  - Golden replay tests (determinism validation)
  - Fog-of-war leak scan (server-only state never reaches client)
  - Bot validation gates: distinguishability, monotonicity, exploitability, speed

## Environment Configuration

**Required env vars (Phase 1):**
- `NEXT_PUBLIC_PARTYKIT_HOST` - PartyKit host URL for client WebSocket connection (only cross-app coupling)

**Planned env vars (Phase 2+):**
- Vercel-managed secrets (to be determined)
- Neon Postgres connection string (Phase 6+)

**Secrets location:**
- Vercel environment variables (production)
- `.env.local` / `.env.development.local` (development, not committed)
- No secrets currently in codebase

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Realtime Protocol

**Direction:** WebSocket via PartyKit

**Messages (both directions, Zod-validated):**
- Client → Server: Orders (`AgentOrder`), pause/resume, reconnection
- Server → Client: `PlayerView` updates, `ResolutionEvent` logs, opponent commit status, clock signals
- See `docs/ARCHITECTURE.md` §5 for full protocol specification

**Connection Lifecycle:**
- Player joins room → seat assignment → view projection
- Order submission → room collects from all agents → `resolveRound()` → new `PlayerView` broadcast
- Disconnection → auto-Hold (absent player) + rejoining support via snapshot

## Known Integrations Not Yet Built

**Phase 2 (UI Skeleton):**
- Next.js App Router setup
- Tailwind CSS v4 + design token system
- Lobby/matchmaking UI

**Phase 3 (Async Matches):**
- Neon Postgres for match persistence
- Drizzle ORM schema and migrations
- Match history + replay storage

**Future Considerations:**
- **AI Radio Chatter:** Claude API for bot personality flavor text (decision loop remains deterministic; API is optional flavor only, per `docs/AI_OPPONENTS.md` §6)
- **Migration escape hatch:** `packages/ai` exposes a narrow `AIAgent` interface and can swap for an HTTP client without affecting the rest of the codebase
- **Realtime fallback:** Raw Cloudflare Durable Objects can replace PartyKit if it becomes a constraint (migration is mechanical per `docs/ARCHITECTURE.md` §1.3)

## Testing & Validation Infrastructure

**Simulation Harness (`packages/ai/sim`):**
- Balance testing: Bot-vs-bot matches (~6ms/match)
- Command: `pnpm sim --matches 300 --profile`
- Validation gates:
  - **Distinguishability:** Action histograms separable across 1000 matches per personality
  - **Monotonicity:** Each difficulty tier beats the tier below it
  - **Exploitability:** Documented personality "tells" are demonstrably counterable
  - **Speed:** p99 decision time under 50ms

**Golden Replay Tests:**
- Determinism validation: `(seed, config, ordered Orders) → GameState`
- Update fixtures after intentional rules changes: `UPDATE_GOLDEN=1 pnpm test golden`

**Fog-of-War Leak Scan:**
- Build fails if any serialized `PlayerView` contains opponent hidden state
- Checks: agent positions, safehouse, active traps, cooldown timers
- Runs in CI alongside unit tests

---

*Integration audit: 2026-08-18*

# Berlin 1988

## What This Is

A 1–4 player Cold War hidden-movement web game, inspired by the mobile game "Two Spies" but built to support more players (and AI opponents filling any empty seats). Players run 1–2 hidden agents each on a node-graph map of divided Berlin, secretly assigning actions each round, with results resolving simultaneously. Built for a group of friends (or solo vs. bots) to play a full match together in the browser.

## Core Value

A group of players (any mix of humans and AI) can go from the home page through a lobby into a complete, playable 14-round match and see a result — with no gaps in the underlying rules engine. Everything else (visual polish, extra UI niceties) can slip; this cannot.

## Requirements

### Validated

- ✓ Core rules engine (round resolution, priority order, node-graph movement, kill/ambush mechanics, safehouses, node sealing from round 7, win conditions) — existing, `packages/engine`
- ✓ Fog-of-war projection (`PlayerView`, hides other players' agent positions/safehouse/traps/cooldowns) — existing, `packages/engine`
- ✓ AI opponents that consume `PlayerView` and emit Orders, with distinct personalities and difficulty tiers that degrade inference (not information) — existing, `packages/ai`
- ✓ Shared types + wire protocol with zero dependencies — existing, `packages/shared`
- ✓ Seeded PRNG determinism (no `Math.random()`/`Date.now()` in engine) enabling replays and golden tests — existing, `packages/engine`
- ✓ 10-card loadout system (reusable active abilities + single-use passive insurance) — existing, `packages/engine`
- ✓ Balance/sim harness for bot-vs-bot matches — existing, tooling
- ✓ Home page: create game, join game by code, or edit deck — Phase 1/2
- ✓ Deckbuilder: build/edit a 10-card loadout, reachable from the home page — Phase 2
- ✓ Lobby: unique join code on create; players ready up and edit their loadout for the match; countdown triggers once ≥50% of filled seats are ready — Phase 1/2
- ✓ Solo mode: host a game where all other seats auto-fill with AI opponents — Phase 1
- ✓ Full in-game UI for the round loop: node-graph map, secret order assignment (2 actions per agent), simultaneous resolution display — Phase 1
- ✓ Match end / result screen (win by dossiers, elimination, or round-14 score lead) — Phase 1
- ✓ Anonymous play — no accounts for v1; player name and saved decks persist via browser local storage — Phase 1
- ✓ Public list of open lobbies, one-click join, no code required — Phase 3
- ✓ Host can toggle game size (1–4) and kick a player from the lobby before start — Phase 3
- ✓ A kicked or disconnected player's seat is filled by AI without voiding the match, with a reversible mid-match human/AI handoff — Phase 3
- ✓ Every AI-controlled seat displays the bot's name and personality, not a bare difficulty label — Phase 3
- ✓ In-lobby and in-match chat, free text plus predefined flavor-text prompts — Phase 3
- ✓ Round history/log of past resolutions — v1.0, Phase 4
- ✓ Burn Track panel showing exactly what public information opponents have learned about a player — v1.0, Phase 4
- ✓ General UI transitions and micro-interactions applied consistently, respecting reduced-motion preferences — v1.0, Phase 4

### Active

- [ ] Deploy `apps/web` to Vercel and link it to the already-live `apps/party` Cloudflare deployment — the one item that kept Phase 1's phase-gate checkpoint (Durable Object hibernation under a real client, four-player human-plausibility read) from ever actually running; still blocking, carried across Phases 1-4 unresolved
- [ ] Close the Phase 1/2 human-verification gaps acknowledged at v1.0 close (see Context) — 2 pending Phase 1 UAT scenarios, 1 pending Phase 2 UAT scenario, both VERIFICATION.md reports left at `human_needed`

### Out of Scope

- User accounts / sign-up / login — no auth system for v1; revisit once there's a reason to persist across devices
- Cross-device deck sync — depends on accounts, deferred with it
- Mobile-optimized layout — browser/desktop-first for v1; mobile just needs to not be broken, not be polished
- Gameplay rule changes/rebalancing as part of this UI phase — engine is already built and tested; this phase is UI only, rule refinement is future work

## Context

- **v1.0 shipped 2026-09-14** — all 4 phases complete, 28/28 requirements checked off, 580 tests green across the monorepo, 18 plans across 30 commits over 23 days. Full accomplishment list in `.planning/MILESTONES.md`.
- **Known gaps at v1.0 close (acknowledged, not blocking):** Phase 1 and Phase 2 each have unresolved human-verification items — 2 pending Phase 1 UAT scenarios (one is Task 3's Vercel-deployment-dependent phase gate from 01-06, still open), 1 pending Phase 2 UAT scenario, and both phases' VERIFICATION.md left at `human_needed` rather than `passed`. Recorded in STATE.md's Deferred Items. `apps/party` is deployed and verified live on Cloudflare; `apps/web` has never been deployed to Vercel in this environment, which is the root cause of most of these gaps (no live URL to test against).
- Brownfield project: `packages/shared`, `packages/engine`, and `packages/ai` are implemented and tested. `apps/` was a skeleton at project start; Phases 1–4 have built it out fully — round history, Burn Track deduction surfaces, and an app-wide reduced-motion-respecting motion system landed in Phase 4.
- Full codebase map available at `.planning/codebase/` (STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md).
- Game design fully specified in `docs/GAME_DESIGN.md`; architecture and engine contract in `docs/ARCHITECTURE.md`; AI opponent behavior in `docs/AI_OPPONENTS.md`.
- Motivation: the maintainer enjoys the mobile game "Two Spies" and wants their own version playable with more people (up to 4) and with AI filling empty seats.
- CONCERNS.md (from codebase mapping) already flags 14 areas worth watching during UI/integration work, including fog-of-war leakage risk, simultaneous-turn network delay, and untested real-time 4-action timing under load — worth a pass once the UI phase is underway.

## Constraints

- **Tech stack**: TypeScript throughout, strict mode. `apps/web` on Next.js/Vercel; `apps/party` is a PartyKit room server acting as the authoritative match host. — established in ARCHITECTURE.md
- **Dependency direction**: `shared ← engine ← ai ← apps` only; an import going the other direction is a build error. — established rule, CLAUDE.md
- **Engine purity**: no `Math.random()`, `Date.now()`, fetch, or logging below `apps/` — all randomness flows from the seeded PRNG in `GameState`. — established rule, CLAUDE.md
- **Fog of war**: `PlayerView` must never carry another player's agent positions, safehouse, traps, or cooldowns. — established rule, CLAUDE.md
- **Hosting**: `apps/web` deploys to Vercel; where `apps/party` (PartyKit) deploys is undecided — flagged for research before/during the relevant phase.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deck editing in the lobby and the home-page deckbuilder are the same loadout system | User confirmed "class" in-lobby just means picking/tweaking the same 10-card loadout | Shipped, Phase 2 |
| Solo mode = host fills empty seats with AI, not a separate practice mode | Simpler mental model, reuses the same match flow | Shipped, Phase 1 |
| Joining supports both a private code and a public browsable list of open lobbies | User wants both discovery paths available | Shipped, Phase 3 — a second PartyKit "directory" party holds the live registry |
| No accounts for v1; local-storage-based persistence | Reduces scope; nothing yet requires cross-device sync | Shipped, Phase 1 |
| Ready-to-start threshold is ≥50% of filled seats ready, not unanimous | User explicitly wants a faster start than waiting on every seat | Shipped, Phase 1 |
| A kicked/disconnected seat's AI takeover is reversible — a reconnecting human can reclaim it mid-match | User wanted a forgiving reconnect window rather than a permanent bot handoff | Shipped, Phase 3 — required a `controlledBy` field distinct from seat origin and a purge of stale bot orders on reclaim (verified overwrite-race regression test) |
| Kicked players are never banned — they can rejoin immediately with the join code | Simplicity; no accounts means no durable identity to ban | Shipped, Phase 3 |
| PartyKit hosting location deferred | Not yet decided; will be researched when relevant | Shipped, Phase 1 — Cloudflare Durable Objects, verified live |
| Round history is a server-side full match log, filtered exactly once at round-resolution time (never re-filtered later against a newer GameState) | Research found the naive read-time-refilter implementation is a genuine fog-of-war leak: `filterEvents()`'s STRIKE_FIRED grading reads the viewer's *current* agent positions | Shipped, Phase 4 — mirrors the existing `burnTracks` "compute once, store the answer" discipline; closed with a dedicated regression test |
| Shared `apps/web/lib/motion.ts` utility is the app's one reduced-motion code path | D-08: every new transition/hover/flip should route through one utility so `prefers-reduced-motion` handling isn't duplicated per component | Shipped, Phase 4 — `StepThrough.tsx` refactored onto it; a cross-file test asserts no second inline branch exists |
| `apps/web` was never deployed to Vercel during v1.0 | No blocking reason found in any phase's session — appears to be an environment/tooling gap (no `vercel` CLI / linked project available to the executing agent), not a product decision | Open — carried into Active requirements for v1.1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-14 after v1.0 milestone*

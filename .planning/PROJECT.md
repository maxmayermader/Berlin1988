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

### Active

- [ ] Home page: create game, join game (by code or from a public list of open lobbies), or edit deck
- [ ] Deckbuilder: build/edit a 10-card loadout, reachable from the home page
- [ ] Lobby: unique join code generated on create; host can toggle game size and kick players; players can ready up and edit their class/loadout for this match; countdown to start triggers once ≥50% of filled seats are ready
- [ ] Solo mode: host a game where all other seats auto-fill with AI opponents
- [ ] In-lobby chat
- [ ] In-game chat, including a set of predefined flavor-text prompts (e.g. "Berlin is nice this time of year") alongside free text
- [ ] Full in-game UI for the round loop: node-graph map, secret order assignment (2 actions per agent), simultaneous resolution display, round history/log
- [ ] Match end / result screen (win by dossiers, elimination, or round-14 score lead)
- [ ] Anonymous play — no accounts for v1; player name and saved decks persist via browser local storage
- [ ] Deployed web app on Vercel (`apps/web`); match-hosting server (`apps/party`, PartyKit) on a to-be-decided host

### Out of Scope

- User accounts / sign-up / login — no auth system for v1; revisit once there's a reason to persist across devices
- Cross-device deck sync — depends on accounts, deferred with it
- Mobile-optimized layout — browser/desktop-first for v1; mobile just needs to not be broken, not be polished
- Gameplay rule changes/rebalancing as part of this UI phase — engine is already built and tested; this phase is UI only, rule refinement is future work

## Context

- Brownfield project: `packages/shared`, `packages/engine`, and `packages/ai` are implemented and tested (69 tests, green). `apps/` is currently a skeleton — this is the primary gap.
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
| Deck editing in the lobby and the home-page deckbuilder are the same loadout system | User confirmed "class" in-lobby just means picking/tweaking the same 10-card loadout | — Pending |
| Solo mode = host fills empty seats with AI, not a separate practice mode | Simpler mental model, reuses the same match flow | — Pending |
| Joining supports both a private code and a public browsable list of open lobbies | User wants both discovery paths available | — Pending |
| No accounts for v1; local-storage-based persistence | Reduces scope; nothing yet requires cross-device sync | — Pending |
| Ready-to-start threshold is ≥50% of filled seats ready, not unanimous | User explicitly wants a faster start than waiting on every seat | — Pending |
| PartyKit hosting location deferred | Not yet decided; will be researched when relevant | — Pending |

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
*Last updated: 2026-08-18 after initialization*

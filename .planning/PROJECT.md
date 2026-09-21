# Berlin 1988

## What This Is

A 1–4 player Cold War hidden-movement web game, inspired by the mobile game "Two Spies" but built to support more players (and AI opponents filling any empty seats). Players run 1–2 hidden agents each on a node-graph map of divided Berlin, secretly assigning actions each round, with results resolving simultaneously. Built for a group of friends (or solo vs. bots) to play a full match together in the browser.

## Core Value

A group of players (any mix of humans and AI) can go from the home page through a lobby into a complete, playable 14-round match and see a result — with no gaps in the underlying rules engine. Everything else (visual polish, extra UI niceties) can slip; this cannot.

## Current Milestone: v1.1 Gameplay and UI Refinement

**Goal:** A human player can play the full game `docs/GAME_DESIGN.md` describes — every action and card usable, every clue and every burn visible — on a redesigned site deployed to Vercel that friends can join.

**Target features:**
- Full order composer — every action and card (Sprint, Wiretap, Bribe, Decoy, Safehouse, Strike, Ambush, silencers), with Intel cost and cooldown state shown before you submit
- Own-status panel — Intel, the 10-card loadout with cooldowns and passive status, silencers, safehouse, traps, decoys
- Signals log — radio intercepts, adjacency chatter, "you are not alone", informant reports, border crossings, strike reports (`docs/GAME_DESIGN.md` §10)
- Burn visibility — a roster of which agents are alive or burned (yours and every opponent's), plus every player's Burn Track, not only your own
- Animated resolution replay — a timed, skippable timeline on the map that says who did what, within fog-of-war entitlement
- Spectator view for eliminated players (own fog only)
- Host match settings in the lobby — agents per player, round timer, round limit, blockade mode, dossier count
- FFA-16 and FFA-18 maps for 3–4 player matches
- Declassified-dossier visual redesign across every screen — manila paper, typewriter type, stamps
- Deploy `apps/web` to Vercel linked to the live `apps/party`, and close v1.0's open human-verification gaps

**Done looks like:** the maintainer and friends open the deployed site, play a 3–4 player match on a proper map with 2 agents each, use their cards, and can follow each round's replay and who got burned.

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
- ✓ Full in-game UI for the round loop: node-graph map, secret order assignment (2 actions per agent), simultaneous resolution display — Phase 1 *(⚠️ only partially true: a 2026-09-14 human playtest found the order composer offers only Move, Hold, and an undiscoverable Strike — no card or other ability is playable by a human. Closed by v1.1)*
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

- [ ] A human player can use every action and card from the order composer — Sprint, Wiretap, Bribe, Decoy, Safehouse, Strike, Ambush, silencer purchase — with Intel cost and cooldown state visible before submitting
- [ ] A human player can see their own Intel, loadout (with cooldowns and passive status), silencers, safehouse, traps, and decoys during a match
- [ ] A human player can read the per-round signals feed (`docs/GAME_DESIGN.md` §10)
- [ ] A human player can see which agents are alive or burned — their own and every opponent's — and every player's Burn Track, not only their own
- [ ] Round resolution plays back as an animated, skippable timeline on the map that names actors within fog-of-war entitlement
- [ ] An eliminated player can keep watching the match as a spectator, limited to their own fog
- [ ] The host can configure agents per player, round timer, round limit, blockade mode, and dossier count in the lobby, enforced server-side
- [ ] 3–4 player matches play on the FFA-16 and FFA-18 maps
- [ ] Every screen uses the declassified-dossier visual language
- [ ] `apps/web` is deployed to Vercel and linked to the live `apps/party` Cloudflare deployment — the item that kept Phase 1's phase-gate checkpoint (Durable Object hibernation under a real client, four-player human-plausibility read) from ever running, carried across all of v1.0
- [ ] The Phase 1/2 human-verification gaps acknowledged at v1.0 close are closed (see Context) — 2 pending Phase 1 UAT scenarios, 1 pending Phase 2 UAT scenario, both VERIFICATION.md reports left at `human_needed`

### Out of Scope

- User accounts / sign-up / login — no auth system for v1; revisit once there's a reason to persist across devices
- Cross-device deck sync — depends on accounts, deferred with it
- Mobile-optimized layout — browser/desktop-first for v1; mobile just needs to not be broken, not be polished
- Rule changes and rebalancing — user excluded them again for v1.1. Host settings only expose existing `MatchSettings` fields and the new maps are content data, so neither changes the rules
- Unanimous pause flow — deselected for v1.1 even though `plan.md` Phases 2 and 5 list it; the host-configurable round timer is the mitigation for 2-agent timing pressure
- High-contrast theme — deselected for v1.1 even though `docs/ARCHITECTURE.md` §9 calls for it; the redesign must still keep non-color sector encoding, keyboard navigation, and reduced-motion support
- Per-seat bot difficulty / personality picker — not selected for v1.1; bots stay on the fixed HANDLER tier
- Audio and the interactive tutorial (`plan.md` Phase 7) — not part of v1.1

## Context

- **v1.0 shipped 2026-09-14** — all 4 phases complete, 28/28 requirements checked off, 580 tests green across the monorepo, 18 plans across 30 commits over 23 days. Full accomplishment list in `.planning/MILESTONES.md`.
- **v1.1 trigger — 2026-09-14 human playtest.** Playing as a human, the maintainer could only Move or Hold: `OrderComposer`/`ActionSlot` never grew past Phase 1's tracer scope, so no card or other ability is playable, even though `legalOrders()` already returns every legal action and bots use all of them. They also could not tell whether their own or an opponent's agents had been burned. A code audit at milestone start found several `PlayerView` fields the server already sends are never rendered: `signals`, `opponents[].agentsAlive/eliminated/intel/score`, opponents' `burnTracks`, and most of `self` (intel, cooldowns, loadout, passives, silencers, safehouse, traps, decoys). A burned agent silently disappears from the board, and resolution text never says whose agent burned. The "Burn Track" name (card-use history) also collides with "burned" (agent killed). Match settings are hardcoded in `apps/party/src/settings.ts` (1 agent, `duel-12`, 90s timer, no pauses, 2 dossiers), and `duel-12` is the only map in `packages/engine/src/content/maps/`. The global theme is Phase 1's placeholder ("D-10: clean but plain — no theme").
- **The v1.1 scope follows `plan.md`.** Phase 2 ("Playable Board") and Phase 5 ("Multiplayer") of the original build plan list most of what the playtest found missing — they were only partly delivered by the v1.0 GSD milestone.
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
- **Hosting**: `apps/web` deploys to Vercel (never deployed yet — a v1.1 target); `apps/party` is live on Cloudflare via PartyKit at `berlin1988-party.maxmayermader.partykit.dev`. `NEXT_PUBLIC_PARTYKIT_HOST` is the only coupling between them.
- **Fog-bounded presentation**: anything the replay, roster, or signals log names must come from what `projectView()` already delivers — a UI that wants to say more than the projection allows is a fog leak, not a feature.

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
| v1.1 builds the in-match experience `plan.md` Phases 2 and 5 describe, minus unanimous pause and the high-contrast theme | User asked for "working gameplay that follows roadmap" after a playtest; pause and high-contrast theme were explicitly deselected | — Pending |
| Declassified-dossier visual direction (manila paper, typewriter type, stamps) replaces the CRT-phosphor aesthetic | User's choice at v1.1 start; `docs/GAME_DESIGN.md` §1 and `docs/ARCHITECTURE.md` §9 must be updated to match rather than left contradicting the build | — Pending |
| No rule or balance changes in v1.1 | User deselected them; keeps golden replays and the sim-validated balance stable while the UI catches up to the engine | — Pending |

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
*Last updated: 2026-09-14 after starting milestone v1.1*

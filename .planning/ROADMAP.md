# Roadmap: Berlin 1988

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-09-14)
- 🚧 **v1.1 Gameplay and UI Refinement** — Phases 5-10 (in progress)

## Overview

v1.1 is a **presentation milestone**. The rules engine, fog projection, AI, and wire protocol are complete and correct — the 2026-09-14 playtest exposed missing *surfaces*, not missing logic. `legalOrders()` already returns every legal action and card play; the client offers Move, Hold and an undiscoverable Strike. The server already sends `signals`, every opponent's `agentsAlive`/`eliminated`, every player's Burn Track, and the whole of `self`; the client renders almost none of it. Only two things sit below the UI: a pure Intel cost calculator exported from `packages/engine`, and `SET_SETTINGS` in the wire protocol and room handler.

The ordering follows v1.0's hardest lesson. Phase 5 is the Vercel deployment on its own, as a gate — in v1.0 a deploy-dependent checkpoint rode silently across all four phases and left three UAT scenarios and two verification reports open. Everything after Phase 5 verifies against a live URL. Phase 6 lands host settings and the FFA maps *before* the composer, because `agentsPerPlayer` is hardcoded to `1` today and that masks the cross-agent Intel bug Phase 7 has to solve. Phase 8 (own status, signals, burn visibility) reads `PlayerView` fields that already exist and shares no files with Phases 6–7, so it can run in a parallel worktree alongside them. Phase 9 (the animated replay) carries the milestone's highest fog-leak risk and needs Phase 7's real events to animate. Phase 10 skins finished surfaces and closes the milestone with the live human verification v1.0 never got.

**Standing conventions for every phase:**

- **Fog is the standing risk.** Every new surface renders only what `projectView()`/`filterEvents()` already graded. Never re-derive, never re-filter against fresher state. Write the fog regression test *before* the feature it guards.
- **The engine is the only rules model.** No client-side legality, Intel or cooldown math — the UI renders `legalOrders()` and the engine cost calculator, never a parallel implementation.
- **Style through tokens, not hex.** Phase 10 replaces the theme. Any component built in Phases 6–9 should use CSS variables/Tailwind tokens so the redesign is a token swap, not a second hand-styling pass.
- **Worktree base refs** (`worktree.baseRef: "head"`) get set at the start of any phase running parallel waves — v1.0 lost a respawn cycle to fork-base drift.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order. Numbering continues across milestones — v1.1 starts at Phase 5.

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-09-14</summary>

- [x] Phase 1: Playable Skeleton (6/6 plans)
- [x] Phase 2: Deckbuilder & Persistent Loadouts (4/4 plans)
- [x] Phase 3: Open Lobbies, Host Control & Table Talk (4/4 plans) — completed 2026-09-02
- [x] Phase 4: Deduction Surfaces & Presentation Polish (4/4 plans) — completed 2026-09-03

Full detail: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v1.1 Gameplay and UI Refinement (In Progress)

**Milestone Goal:** A human player can play the full game `docs/GAME_DESIGN.md` describes — every action and card usable, every clue and every burn visible — on a redesigned site deployed to Vercel that friends can join.

- [ ] **Phase 5: Live Deployment** - The game reachable at a public Vercel URL wired to the live PartyKit server, redeploying on every merge
- [ ] **Phase 6: Host Match Settings & Full-Size Maps** - Host-configured match shape (2 agents, timer, length, blockades, dossiers) and FFA-16/FFA-18 for 3–4 players
- [ ] **Phase 7: Full Order Composer** - Every action and card playable, with Intel cost, cooldown and refusal reasons visible before committing
- [ ] **Phase 8: Own Status, Signals & Burn Visibility** - Intel, loadout, safehouse, traps, the signals log, and who is alive or burned across every seat
- [ ] **Phase 9: Resolution Replay & Spectating** - Each round replayed on the map within fog entitlement, and eliminated players kept in the game as watchers
- [ ] **Phase 10: Declassified Dossier Redesign & Live Verification** - The dossier visual language across every screen, then a real group plays a full match on the deployed site

## Phase Details

### Phase 5: Live Deployment

**Goal**: The game is reachable by anyone with the link, at a public Vercel URL wired to the live PartyKit server — so every later phase is verified against a real deployment instead of localhost.
**Depends on**: Nothing (v1.0's Phases 1-4 are shipped; `apps/party` is already live on Cloudflare)
**Requirements**: DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):

  1. Anyone opening the public Vercel URL reaches the home page and can create a game that connects to the live PartyKit server at `berlin1988-party.maxmayermader.partykit.dev`, with no local dev server running anywhere.
  2. Two people in different browsers, on different machines, can join the same lobby through that deployed URL and see each other.
  3. A commit merged to `main` produces a new deployment of the site without anyone running a CLI command.

**Plans**: 4 plans

Plans:
- [ ] 05-01-PLAN.md — Production build config (`transpilePackages`, Node 22.x pin) plus the smoke script and Playwright base-URL switch that can interrogate any deployed URL
- [ ] 05-02-PLAN.md — Redeploy the PartyKit room server, which is running pre-Phase-3 code, and prove `main`'s client works against it
- [ ] 05-03-PLAN.md — Create and configure the Vercel project (maintainer checkpoint), then prove DEPLOY-01 from outside
- [ ] 05-04-PLAN.md — Prove DEPLOY-02 by pushing to `main` with no CLI, and confirm provenance, the build gate, and rollback

**Why this is its own phase**: v1.0's top retrospective lesson. A deploy-dependent checkpoint (01-06 Task 3) rode silently across four phases and is the root cause of both open `human_needed` verification reports. Isolating it as a gate makes "is it deployed?" un-ignorable before anything else in v1.1 starts.

**Known risks to resolve here** (`PITFALLS.md` 17, `STACK.md`): `apps/web/next.config.ts` lacks `transpilePackages: ['@berlin/shared', '@berlin/engine']` for the TypeScript-source workspace packages — the likely first build failure. Also needed: Root Directory `apps/web` with "include source outside the root directory", Node 22+ pinned, `NEXT_PUBLIC_PARTYKIT_HOST` set at build time per environment, `wss://` scheme, and a plain git-diff Ignored Build Step. Vercel CLI/auth availability for an automated agent is the open environmental unknown — the maintainer may need to link the project by hand.

**Decision needed in planning** — RESOLVED (D-01, `05-CONTEXT.md`): Preview builds point at the **production** PartyKit host. `NEXT_PUBLIC_PARTYKIT_HOST` is set for Production and Preview with the same value, and the consequence — preview lobbies appearing in the public open-lobby list — was accepted explicitly. `DEPLOY-05` (staging PartyKit) stays deferred.

**Explicitly deferred from this phase**: the full-match human verification on the deployed site (Phase 10, DEPLOY-03/04) — it needs the v1.1 feature set to be worth running.

### Phase 6: Host Match Settings & Full-Size Maps

**Goal**: The host shapes the match before it starts — two agents each, round timer, round limit, blockade mode, dossier count — and 3–4 player games play on a map actually built for that many people.
**Depends on**: Phase 5
**Requirements**: LOBBY-08, LOBBY-09, LOBBY-10, LOBBY-11, LOBBY-12, LOBBY-13, LOBBY-14, LOBBY-15, MAP-01, MAP-02, MAP-03, MAP-04
**Success Criteria** (what must be TRUE):

  1. Host can set agents per player (1 or 2), round timer, round limit, blockade mode and dossier count in the lobby, and the match that starts honors every one of them.
  2. Every other player in the lobby sees the current settings update live and read-only, and changing a setting after players have readied up clears ready state so nobody starts a match they didn't agree to.
  3. A settings change from a non-host, or any value outside the allowed range, is rejected by the server — not merely hidden by the UI.
  4. A 3-player match starts on a 16-node FFA-16 map and a 4-player match on an 18-node FFA-18 map, chosen automatically from the seat count, while 1–2 player matches still use Duel-12.
  5. Each new map has passed a bot-vs-bot sim sweep — no crashes, no runaway loadout or personality dominance, dossier count tuned for the player count — before any human plays on it.

**Plans**: TBD

**Why before the composer**: `agentsPerPlayer` is hardcoded to `1` in `apps/party/src/settings.ts` today. Until 2-agent play can actually be started, the cross-agent Intel bug Phase 7 exists to fix cannot be reproduced or tested.

**Below the UI**: `SET_SETTINGS` is documented in `docs/ARCHITECTURE.md` §5 and `apps/party/src/CLAUDE.md` as if shipped, but is absent from `packages/shared/src/protocol.ts` and `apps/party/src/handlers.ts`. `createMatch()`, the bots and the sim harness already honor every `MatchSettings` field — only the "host sets it → `buildMatchConfig()`" wiring is missing. Maps are content data: `ffa16.ts`, `ffa18.ts`, `MAPS` registry entries, a `mapId` rule in `buildMatchConfig()`, and a new `map-invariants` Vitest suite. Existing golden fixtures are pinned to `duel-12` via `quickSettings()` and must not churn.

**Parallelization**: the settings track (protocol + handler + lobby UI) and the maps track (data files + registry + sim sweep) share no files and can run as parallel worktree plans.

**Known risks** (`PITFALLS.md` 4, 11, 12, 13): client-only validation; settings changed after ready-up; placebo controls for fields nothing honors — audit every `MatchSettings` field before exposing it; loadouts leaking into a lobby snapshot; the wrong map for the seat count. Round-timer default is unresolved: the design doc says 60s, the room uses 90s, and unanimous pause is out of scope, so the timer is the only mitigation for the 4-actions-under-one-clock squeeze — pick a default with that in mind and measure real submission times.

**UI hint**: yes

### Phase 7: Full Order Composer

**Goal**: A human can play the whole game — every action and every card — with the cost and the consequence visible before they commit.
**Depends on**: Phase 6 (2-agent play must be startable before ORDER-05 is testable)
**Requirements**: ORDER-01, ORDER-02, ORDER-03, ORDER-04, ORDER-05, ORDER-06, ORDER-07, ORDER-08, ORDER-09
**Success Criteria** (what must be TRUE):

  1. Player can choose any action `legalOrders()` offers for the active slot — Move, Sprint, Wiretap, Bribe, Decoy, Safehouse, Strike, Hold — including which card pays for it and which node it targets, and can set an Ambush or buy silencers without spending either of that agent's two actions.
  2. Before choosing, the player sees each option's Intel cost and cooldown state, and for anything unavailable, the reason it is unavailable — on cooldown, not enough Intel, already committed by their other agent, or an illegal target.
  3. With two agents, the options offered for the second agent already account for the Intel and card cooldowns the first agent's submitted order consumed — the server never rejects an order the UI presented as affordable.
  4. When a node is a legal target for more than one action (Move and Strike, say), the player is asked which one rather than the UI silently picking.
  5. Player sees their agents' planned moves and targets drawn on the map before submitting, can read any card's rules text, Intel cost, cooldown and color bonus from the composer, and can change or withdraw a submitted order until the round locks.

**Plans**: TBD

**Below the UI**: one export — a pure Intel cost calculator from `packages/engine` (the logic already exists as `viewWithCommittedSpend`/`intelCostOf` inside `submitOrder.ts`). No `PlayerView` change, no protocol change. Plus a retract/replace path for ORDER-09 (`RETRACT_ORDER` was deliberately deferred from Phase 1 to here).

**Known risks** (`PITFALLS.md` 3, 6, 7, 8, 9): the cross-agent double-spend preview is the headline bug — two agents share one Intel pool and submit separately, so both look affordable against the same pre-spend Intel and the player has no idea why the second is refused. Movement-first resolution ordering breaks naive Strike/Ambush/Bribe targeting. Strike-vs-Move click ambiguity and zero-action purchases get lost in a slot-centric UI. Never compute legality, cost or cooldown client-side.

**UI hint**: yes

### Phase 8: Own Status, Signals & Burn Visibility

**Goal**: The player can see everything the server already tells them — their own Intel and kit, every clue they have received, and who across the table is still alive.
**Depends on**: Phase 5 (reads only `PlayerView` fields that already exist — parallel-safe with Phases 6 and 7, no file overlap with the settings, maps or composer tracks)
**Requirements**: INTEL-01, INTEL-02, INTEL-03, INTEL-04, INTEL-05, INTEL-06, INTEL-07, INTEL-08, BURN-01, BURN-02, BURN-03, BURN-04, BURN-05
**Success Criteria** (what must be TRUE):

  1. Player can see their current Intel, their 10-card loadout with each active's cooldown and each passive's armed-or-consumed state, their silencer stock, safehouse location, live traps and live decoys at any point in a match.
  2. Player can read a persistent signals log grouped by round — radio intercepts, adjacency chatter, "you are not alone", informant reports, border crossings, strike reports, blockade notices — select any signal to highlight the node or sector it names on the map, and read a short per-round digest of what the round revealed.
  3. Where a signal is deliberately vague (a strike reported by sector only), the withheld detail shows as a redaction bar rather than an unexplained gap, and the UI keeps what is publicly known about the player visually distinct from what only the player knows.
  4. Player can see at any time which of their own agents are alive and which are burned, is told in the round it happens that an agent burned and what burned it as far as fog allows, and reads a round report that names whose agent acted and whose burned instead of "An agent was burned".
  5. Player can see, for every opponent, how many agents are alive versus burned and whether that player is eliminated, and can open any player's Burn Track, not only their own.

**Plans**: TBD

**Zero data gaps**: every field here is already projected and already fog-graded server-side — `view.self` (intel, cooldowns, loadout, passives, silencers, safehouse, traps, decoys), `view.signals`, `view.opponents[].agentsAlive/eliminated/intel/score`, `view.burnTracks`. This is rendering, not plumbing, which is why it parallelizes cleanly.

**Known risks** (`PITFALLS.md` 2, 5, 16): death by omission or inference — a roster that reveals *which specific* agent burned rather than a count, or a signals layout that lets a player triangulate past what any single signal revealed. Render only what `OpponentPublicInfo` and the filtered events carry, and extend the existing wire-level fog scan to each new surface. The "Burn Track" (card-use history) vs. "burned" (agent killed) naming collision is real: the name stays per user decision, so labels and layout have to carry the distinction.

**Explicitly deferred from this phase**: searchable/filterable long-form combat log (out of scope — re-filtering history against fresher state is the exact leak class v1.0 fixed).

**UI hint**: yes

### Phase 9: Resolution Replay & Spectating

**Goal**: Each round plays back on the map as a story the viewer is entitled to see, and a player whose agents are all dead keeps watching instead of staring at an empty panel.
**Depends on**: Phase 7 (needs a full composer's real events to animate and test against) and Phase 8 (spectators are served the roster and Burn Tracks built there)
**Requirements**: REPLAY-01, REPLAY-02, REPLAY-03, REPLAY-04, SPECT-01, SPECT-02, SPECT-03
**Success Criteria** (what must be TRUE):

  1. When a round resolves, the map plays it back as a timed sequence of beats in the published resolution order, one step at a time.
  2. Player can pause a replay, step through it beat by beat, and skip to the end — and with `prefers-reduced-motion` set, the replay cuts between beats instead of tweening.
  3. No replay beat shows or names anything the viewer's fog did not already deliver: opponent movement the viewer never received is never animated, at any speed.
  4. An eliminated player sees an explicit "eliminated — watching" state instead of an empty order panel, and keeps receiving public events, the roster, Burn Tracks and round replays until the match ends.
  5. A spectator never sees more than their own fog entitled them to while alive.

**Plans**: TBD

**Highest fog-leak risk in the milestone** (`PITFALLS.md` 1): an animator wanting a "complete" story will invent opponent paths from public breadcrumbs. `filterEvents.ts` only emits `AGENT_MOVED` for the viewer's own agents, so opponent activity can appear *only* as anonymous node-level markers on public events. **Write the fog-leak regression test before any animation logic lands.** Drive playback from the same `reveal` cursor `StepThrough` already uses — no second event renderer.

**No engine or protocol change for spectating**: `apps/party` already treats an eliminated connection like any seat, and `projectView()` already yields an empty `visibleNodes` plus the public-event branch. v1.1 adds the explicit state, not new data.

**Decision needed in planning**: is "public events + roster + Burn Tracks + own history on a bare map" the intended spectator experience, or should spectators keep their last-known map state? Requirements-time default is the bare map (no engine change). Also flagged: replay length versus the next round's clock (`PITFALLS.md` 10).

**Explicitly deferred from this phase** (tracked as REPLAY-05..08): re-watching an earlier round's animated replay from the history drawer, causal captions, playback speed control, rubber-stamp moments. Also out of scope: animating all agents at once, and any omniscient "ghost" spectator (`docs/GAME_DESIGN.md` §8.1 forbids it).

**UI hint**: yes

### Phase 10: Declassified Dossier Redesign & Live Verification

**Goal**: Every screen wears the declassified-dossier look, and a real group plays a full match on the deployed site — closing v1.1 and v1.0's open verification gaps in the same session.
**Depends on**: Phases 6, 7, 8, 9 (a skin over finished information architecture; the verification needs the whole v1.1 feature set)
**Requirements**: THEME-02, THEME-03, THEME-04, THEME-05, THEME-06, DEPLOY-03, DEPLOY-04
**Success Criteria** (what must be TRUE):

  1. Home, deckbuilder, lobby, match and result screens all read as a declassified dossier — manila surfaces, typewriter headings, stamps — while dense data (loadout grid, signals log, Intel and cooldown numbers) stays on a plain, highly legible face.
  2. Text and interactive elements meet WCAG 2.1 AA contrast on the new backgrounds, sectors stay distinguishable without color, and keyboard navigation and reduced-motion support still work after the redesign.
  3. `docs/GAME_DESIGN.md` §1 and `docs/ARCHITECTURE.md` §9 describe the declassified-dossier aesthetic instead of the CRT aesthetic they specify today.
  4. A full match played by real people entirely on the deployed site completes without desync, covering the Durable Object hibernation and four-player timing checks Phase 1's gate never ran.
  5. v1.0's 3 pending UAT scenarios (2 from Phase 1, 1 from Phase 2) are re-run against the deployed site and pass, clearing both `human_needed` verification reports.

**Plans**: TBD

**Token set first**: establish the theme token set as this phase's opening plan, then sweep the hardcoded hex colors scattered across components. If the redesign is instead applied as a rolling convention from Phase 6 onward, the token set must exist before any new component is written — otherwise every surface gets hand-styled twice.

**Known risks** (`PITFALLS.md` 14, 15): WCAG AA failures on manila/paper backgrounds and lost non-color sector encoding; Playwright selectors and the static hex-color source tests from Phase 4 breaking in the sweep. Stack notes: self-hosted Courier Prime (body/UI) plus Special Elite (display and stamps only, 16px+) via `next/font/google`; inline SVG `feTurbulence` data-URI for grain as a static background layer, never a live filter on an animating element.

**Verification is a gate, not a build task**: criteria 4 and 5 need a real multi-browser session with real people on the deployed URL. Schedule them as an explicit human checkpoint at phase close — do not let them slip past the milestone the way 01-06 Task 3 slipped past v1.0.

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8 → 9 → 10. Phase 8 has no data or file dependency on Phases 6–7 and may be executed in a parallel worktree alongside either.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Playable Skeleton | v1.0 | 6/6 | Complete | 2026-08-27 |
| 2. Deckbuilder & Persistent Loadouts | v1.0 | 4/4 | Complete | 2026-08-31 |
| 3. Open Lobbies, Host Control & Table Talk | v1.0 | 4/4 | Complete | 2026-09-02 |
| 4. Deduction Surfaces & Presentation Polish | v1.0 | 4/4 | Complete | 2026-09-03 |
| 5. Live Deployment | v1.1 | 0/TBD | Not started | - |
| 6. Host Match Settings & Full-Size Maps | v1.1 | — | Implemented (direct) | 2026-09-21 |
| 7. Full Order Composer | v1.1 | — | Mostly implemented (direct) | 2026-09-21 |
| 8. Own Status, Signals & Burn Visibility | v1.1 | 0/TBD | Not started | - |
| 9. Resolution Replay & Spectating | v1.1 | 0/TBD | Not started | - |
| 10. Declassified Dossier Redesign & Live Verification | v1.1 | 0/TBD | Not started | - |

## Requirement Coverage (v1.1)

| Phase | Requirements | Count |
|-------|--------------|-------|
| 5 | DEPLOY-01, DEPLOY-02 | 2 |
| 6 | LOBBY-08 … LOBBY-15, MAP-01 … MAP-04 | 12 |
| 7 | ORDER-01 … ORDER-09 | 9 |
| 8 | INTEL-01 … INTEL-08, BURN-01 … BURN-05 | 13 |
| 9 | REPLAY-01 … REPLAY-04, SPECT-01 … SPECT-03 | 7 |
| 10 | THEME-02 … THEME-06, DEPLOY-03, DEPLOY-04 | 7 |
| **Total** | | **50 / 50** ✓ |

No orphaned requirements. No requirement appears in more than one phase.

## Execution note — Phases 6 and 7 (2026-09-21)

Phases 6 and 7 were implemented directly rather than through the full
discuss → plan → execute → verify ceremony, at the user's request to "make
the app work". There are no PLAN.md / SUMMARY.md / VERIFICATION.md artifacts
for them; this note and the code are the record. Phase 5 (Live Deployment)
is still not started, so everything below was verified against localhost,
not a deployed URL.

**Phase 6 — done.** `SET_SETTINGS` added to the wire protocol, the room
handler, and the lobby UI; `buildMatchConfig()` now reads the room's settings
instead of hardcoded literals. FFA-16 and FFA-18 authored as data
(`packages/engine/src/content/maps/`), selected automatically from seat count
via `mapIdForPlayerCount()`. All of LOBBY-08..15 and MAP-01..04 are met.
Dossier default is now per-player-count, tuned by sim sweep (see
`defaultDossierCount` for the measured table).

**Phase 7 — mostly done.** The composer now offers every action
`legalOrders()` returns, as a two-step operation-then-target picker, with
Intel cost, card rules text, and per-card unavailability reasons. ORDER-01
through ORDER-07 and ORDER-09 are met. **ORDER-08 is partial**: legal targets
for the pending action are highlighted, but already-composed moves are not
yet drawn as paths on the map.

**Bug found and fixed in passing:** `decideForBotSeats` gave both of a seat's
agents the same pre-spend `projectView`, so with 2 agents the second order
routinely failed `submitOrder` at release time and the round could only close
on the deadline. Invisible while `agentsPerPlayer` was hardcoded to 1.
Regression test: `apps/party/tests/fog-wire.test.ts`, "a two-agent seat never
plans two orders it cannot jointly afford".

**Known discrepancy, not fixed:** duel-12 ships at average degree 3.17, not
the 2.8 its own `docs/GAME_DESIGN.md` §3.1 table claims. Left alone
deliberately — its topology is what every golden fixture and the AI balance
data in `docs/AI_OPPONENTS.md` §7 were produced against. Either the map or
the doc should move; that is a balance decision. Recorded in
`packages/engine/tests/map-invariants.test.ts`.

---
*v1.1 roadmap created: 2026-09-18*

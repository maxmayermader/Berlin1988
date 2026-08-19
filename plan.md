# Berlin 1988 — Build Plan

**Status:** Phases 0, 1 and 3 complete — engine and AI are built, headless, and green (69 tests). Phase 2 (the UI) is next.

Phase 3 was taken before Phase 2 deliberately, on this file's own advice: the fastest way to de-risk the design was a headless engine plus real bots and a few thousand simulated matches, and that is what found the balance problem recorded below.
**Read first:** `docs/GAME_DESIGN.md` → `docs/ARCHITECTURE.md` → this file.

---

## The decision, up front

**Next.js + TypeScript. Not Python/FastAPI.**

The one-line reason: the rules engine has to run on both the client (to preview legal moves) and the server (to be authoritative), and in TypeScript that's one package imported twice instead of the same game implemented in two languages that will drift apart. Vercel also can't hold WebSockets, so a Python backend would need a second host anyway — and if we're deploying a second host regardless, it should run the same language as the engine. Full reasoning, including where Python *would* have won, is in `docs/ARCHITECTURE.md` §1.

Realtime lives in **PartyKit** (one Cloudflare Durable Object per match), which imports the same engine package as the web app.

---

## Sequencing principle

The engine is built and proven **headless**, before any UI exists. Two reasons:

1. A hidden-information game is a permanent opportunity to leak state to the wrong player. That property is provable in a test suite and nearly unprovable by clicking around.
2. Balance work needs tens of thousands of simulated matches. That requires a headless engine and an AI, and it should not be blocked on a working board.

The first thing that will be genuinely playable is a solo match in Phase 3. That's later than feels comfortable and it is the right call.

---

## Phase 0 — Foundations ✅
**Goal:** `pnpm test` runs green on an empty monorepo.

- [x] pnpm workspaces; packages per `docs/ARCHITECTURE.md` §3
- [x] TypeScript `strict: true`, `noUncheckedIndexedAccess`, project references
- [x] Vitest
- [ ] Biome (lint + format) — one tool instead of ESLint+Prettier
- [ ] Playwright scaffold *(deferred to Phase 2 — nothing to drive yet)*
- [ ] Lint rule enforcing the one-way dependency graph — `engine` importing from `apps/` must fail the build
- [ ] GitHub Actions: typecheck, lint, test on PR
- [ ] Vercel project linked, deploying a placeholder page *(deferred to Phase 2)*

Turborepo was skipped: with two packages and a sub-second build, it is pure
overhead. Add it when `apps/` lands and the graph is worth caching.

---

## Phase 1 — The Engine ✅
**Goal:** a complete, headless, deterministic implementation of the rules. No UI.

- [x] `packages/shared` — all types. `Card`, `NodeState`, `PlayerSecrets`, `GameState`, `PlayerView`, `Action`, `ResolutionEvent`, `MatchSettings`, Zod schemas for the wire protocol
- [x] Seeded PRNG carried inside `GameState`. Ban `Math.random`/`Date.now` below `apps/` via lint rule
- [x] Map data + loader; the 12-node duel map first
- [x] `createMatch` honouring `MatchSettings` — **agent count 1 or 2**, blockade schedule pre-rolled at creation
- [x] `submitOrder` (two actions per agent), `legalOrders`
- [x] **`resolveRound`** — the eleven-step priority pipeline from `docs/GAME_DESIGN.md` §7.2, one module per step
- [x] Reusable actives with per-player cooldowns; Sprint; Intel tolls
- [x] Traps, *Dead Drop* escapes, mutual-trap sealing
- [x] **The contested-node ladder** (§8.4) — mutual traps → safehouse tiebreak → 50/50 → K9
- [x] Blockades: pre-rolled schedule, announced vs. random, catching and sheltering
- [x] Permanent burn + elimination cleanup (drop dossiers, release informants, clear safehouse/decoys/traps)
- [x] Passive card triggers, consumed vs. permanent
- [x] **`projectView`** — the fog boundary, including graded strike noise and symmetric Burn Tracks
- [x] Victory checks: extraction, elimination, round-limit score

Tests (54, all green): per-op units; golden replay fixtures; **fog leak scan**
across positions, safehouses, traps, and agent identity; property test that
submission order never affects outcome; every branch of the contested ladder at
a fixed seed; elimination-integrity and soak tests for orphaned state.

**Done — verified:** 1,400+ random-agent matches per test run at both 1 and 2
agents, 4-player and duel, with no crashes, no leaks, no orphaned state, and
byte-identical replays from a seed. Golden fixtures pin behaviour against a
frozen ruleset so balance tuning doesn't churn the regression net.

Two real bugs the suite caught before any UI existed, both invisible to
playtesting: `STRIKE_FIRED` and `AMBUSH_TRIGGERED` were shipping stable agent
ids to opponents, which would have let anyone correlate sightings of a specific
agent across the whole match for free. Also worth knowing: the design doc's
20-point loadout budget was unbuildable — the ten cheapest legal cards come to
17 — so it moved to 26 and all four starter decks were rebuilt.

**Risk:** the resolution pipeline is the hardest code in the project and the easiest to get subtly wrong — v3 grew it from 8 steps to 11, and `contested.ts` has five ordered branches that all consume PRNG draws. Advance the stream in a fixed order regardless of which branch runs, or replays diverge. Budget generously; write the golden fixtures as you go, not after.

---

## Phase 2 — Playable Board
**Goal:** a human can play a full match against a scripted dummy in the browser.

- [ ] Next.js app shell, Tailwind v4 tokens, CRT theme + high-contrast theme
- [ ] SVG board — nodes, typed edges, fog states, blockade overlays, driven entirely by map data
- [ ] Order composer: **two actions per agent**, agent switcher for 2-agent play, legal-target highlighting, Intel cost preview, cooldown state, commit
- [ ] Burn Track panel — everyone's, **including a "what they know about me" view of your own** (`docs/GAME_DESIGN.md` §6.3)
- [ ] Intel meter, signals log, passive-card status, silencer stock
- [ ] **Round clock + unanimous pause flow** — request, poll, accept/decline, resume
- [ ] **Resolution replay** — animate `ResolutionEvent[]` as a timeline (§9 of the architecture doc). This is where the game is taught, so it gets real attention
- [ ] Local-only match loop (engine in the browser, no server yet)
- [ ] Keyboard navigation, `prefers-reduced-motion`, non-color sector encoding

**Done when:** a person who has never seen the game can complete a match against a dummy and correctly explain what happened in the resolution replay.

---

## Phase 3 — AI Opponents ✅ *(taken before Phase 2 — see status note)*
**Goal:** solo play against personalities that feel like people.

- [x] `packages/ai` — `AIAgent` interface taking `PlayerView` only
- [x] Particle filter belief tracker (`docs/AI_OPPONENTS.md` §2.1)
- [x] Feature extractors + weighted scoring
- [x] Softmax selection with difficulty temperature and blunder roll
- [x] Five personalities: Vogel, Katja, Marek, Halloran, Sable
- [x] Four difficulties: Recruit → Spymaster
- [x] `packages/ai/sim` — headless N-match harness, CSV/JSON output
- [x] Validation suite from `docs/AI_OPPONENTS.md` §5 (distinguishability, monotonicity, exploitability, speed, determinism)
- [ ] Wire bot seats into the local match loop with padded think time *(Phase 2 — no match loop to wire into yet)*
- [ ] 2–3 ply lookahead for Handler/Spymaster *(deferred: monotonicity already passes without it, so this is an improvement rather than a gap)*

**Done — verified:** all six validation gates pass (`packages/ai/tests/validation.test.ts`) —
fairness, determinism, distinguishability, difficulty monotonicity, p99 speed
under 50ms, and self-preservation. Sim harness runs ~6ms/match.

**What it found, in order of importance:**

1. **A game-design problem, not a bot problem.** With 3 dossiers on the map and
   3 needed to extract, a pure objective-runner won 92% of duels with almost no
   combat in the entire match. Fixed by putting *fewer dossiers on the map than
   you need* (default now 2), which forces a predictable return trip: runner win
   rate 92% → 75%, burns up ~20×, outcome mix from 72% extraction to a 51/40
   extraction/round-limit split. Four-player was never broken.
2. **Three real bot deficiencies**, all invisible without measurement: scans
   were massively over-valued (30–43% of every bot's actions), bots aimed at
   where rivals *had been* rather than where they were going, and nobody moved
   to intercept a rival two dossiers into a run. Full write-up in
   `docs/AI_OPPONENTS.md` §7.

**Still open:** the evasive personality is at 84% in a duel even after all of
the above. That is a design question — evasion is simply strong when there is
only one hunter — and the candidates are listed in `docs/AI_OPPONENTS.md` §7.

---

## Phase 4 — Loadouts & Content
**Goal:** deckbuilding, and enough cards for it to be a real decision.

- [ ] Card content in `packages/engine/src/content` — data, not code
- [ ] ~24 active cards 🔧 (6 icons × 4 colors), each with Intel cost, **cooldown**, and Budget Points
- [ ] The 10 passive cards from `docs/GAME_DESIGN.md` §6.2, consumed vs. permanent
- [ ] Deckbuilder UI with live constraint validation and an actives/passives balance readout
- [ ] Four starter loadouts, playable without ever opening the builder
- [ ] Personality-appropriate loadouts for each bot via `ai.buildLoadout`
- [ ] First balance pass: sweep Strike cost/cooldown, Intel income, ambush cost, blockade timing, and BP budget

**Done when:** no single loadout wins >58% 🔧 against the field in 10k simulated matches, at both 1 and 2 agents.

---

## Phase 5 — Multiplayer
**Goal:** 2–4 humans play live over the network.

- [ ] `apps/party` — room Durable Object, authoritative `GameState`
- [ ] Protocol from `docs/ARCHITECTURE.md` §5; Zod-validate everything inbound
- [ ] Simultaneous commit + reveal; `OPPONENT_COMMITTED` never leaks content
- [ ] **Host settings UI + enforcement** — agent count, timer, blockade mode, pause allowance (`docs/GAME_DESIGN.md` §2). Host-only messages verified server-side
- [ ] Round timers via DO alarms; **auto-Hold** on timeout (banks +1 Intel, so a timeout isn't fatal)
- [ ] **Unanimous pause** — poll every live human seat, bots auto-accept, one decline resumes. Enforced in the room, never the client
- [ ] Reconnection via snapshot; spectator seats for eliminated players (own fog only)
- [ ] Mixed human/bot lobbies — fill empty seats with AI
- [ ] Lobby, invite links, ready-up
- [ ] Playwright E2E on a seeded match

**Done when:** four browsers complete a match, one of them disconnecting and rejoining mid-round without desync.

---

## Phase 6 — Persistence & Async
**Goal:** matches survive a closed tab.

- [ ] Neon Postgres + Drizzle; `matches`, `users`, `replays`
- [ ] Room hydrates from and checkpoints to Postgres
- [ ] Async "play-by-mail" mode with long deadlines and email/push nudges
- [ ] Auth (Clerk or Auth.js) + guest sessions that can be claimed later
- [ ] Replay viewer built on stored `(seed, orders)` — nearly free given Phase 1's determinism

---

## Phase 7 — Polish
- [ ] Interactive tutorial teaching the Strike-reveal rule and resolution ordering by doing
- [ ] Audio: tape hiss, dial tones, the Strike sting
- [ ] Full accessibility audit against WCAG 2.1 AA
- [ ] Mobile layout — the board must work in portrait
- [ ] Optional Claude-API flavour layer for bot radio chatter (feature-flagged)
- [ ] Telemetry: match length, win rates by mode/loadout/personality, drop-off points

---

## Phase 8 — Balance & Live
- [ ] Large-scale sim sweeps across the six levers in `docs/GAME_DESIGN.md` §8
- [ ] Ruleset versioning so live matches aren't rebalanced mid-flight
- [ ] Public playtest; fold telemetry into the next sweep

---

## Risk register

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Resolution pipeline has subtle ordering bugs | High — corrupts every downstream phase | Golden replays from day one; one module per step; property tests |
| **Reusable strikes + permanent death ends matches in six rounds** | **High — the central v3 balance question** | Strike Intel cost and cooldown are the only brakes. Sim this *first*, before any content work |
| **1-agent FFA benches players early** | High — dead time in the mode most likely to be played socially | Default FFA to 2 agents; host can override. Eliminated players get spectator seats |
| **Four actions in 60 seconds is too tight** | Medium — 2 agents × 2 actions under a clock | Unanimous pause exists for this. Measure real submission times in the first playtest and revisit the default timer |
| Simultaneous turns confuse new players | High — kills retention at the front door | Resolution replay is a first-class UI; tutorial teaches ordering explicitly |
| Bots are boring or samey | High — solo is the main mode | Distinguishability is a gating test, not a nice-to-have |
| Balance is off and only found late | Medium | Sim harness exists from Phase 3, before content lands |
| PartyKit becomes a constraint | Low | It's a thin layer over Durable Objects; migration is mechanical |
| Scope creep into content | Medium | ~24 actives + 10 passives is the Phase 4 ceiling. More cards is a post-launch problem |

---

## What is deliberately *not* in v1

Ranked matchmaking and ELO. Cosmetics or monetization. A campaign or story mode. Map editor. Mobile apps (the web build is responsive; that's the answer for v1). More than 4 players. Voice chat.

---

## Immediate next steps

1. Read `docs/GAME_DESIGN.md` end to end and push back on anything that reads wrong — the design is much cheaper to change now than in Phase 4.
2. **Settle the five open decisions in `docs/GAME_DESIGN.md` §12.** Each has a working default so Phase 1 isn't blocked, but #1 (does setting an ambush cost an action?) changes the feel of the whole game.
3. Start Phase 0.

Fastest way to de-risk the whole design: **build Phase 1 and a deliberately crude Phase 3 bot, skip the UI, and simulate 10k matches.** The specific question to answer first is whether reusable strikes plus permanent death end matches in six rounds. That's worth knowing before a single pixel is drawn, and it's the one v3 change with no precedent in the earlier drafts to reason from.

# Berlin 1988 — Architecture

**Version:** 1.0
**Companion docs:** `docs/GAME_DESIGN.md` (rules), `docs/AI_OPPONENTS.md` (bot design), `plan.md` (build order)

---

## 1. The tech decision: Next.js, not Python

**Verdict: TypeScript end-to-end. Next.js on Vercel for the app, PartyKit (Cloudflare Durable Objects) for authoritative realtime rooms. No Python.**

### Why not FastAPI

FastAPI is a good framework and the wrong one for this game, for four reasons:

1. **The rules engine has to run in two places.** The server must be authoritative (a client that can compute hidden state can cheat), but the client needs the same rules locally to grey out illegal orders, preview movement range, and show Intel costs before you commit. In TypeScript that's one package imported twice. In Python it's either the rules written twice in two languages that will drift apart, or a network round-trip every time the user hovers a node.

2. **There is no compute here.** The heaviest operation in the entire game is a particle filter over ~18 nodes — microseconds. Python's numerical ecosystem, its main advantage, buys nothing.

3. **Vercel does not run persistent WebSocket servers.** Serverless functions can't hold a socket, so a Python backend needs a *second* host (Fly, Railway, Render) with its own deploy pipeline, its own cold-start behaviour, and CORS between them. Since we need a separate realtime host regardless, we should pick one that runs the same language as the engine.

4. **Shared types are the entire safety story.** A hidden-information game is a permanent opportunity to accidentally leak state to the wrong client. `PlayerView` being a compile-time type that physically cannot contain another player's position is worth more than any runtime check.

**Where Python would win, and doesn't apply:** if the AI were a trained neural policy needing PyTorch, we'd carve out a Python inference service. The bot design in `docs/AI_OPPONENTS.md` is a hand-authored belief filter plus utility search; it's ~500 lines of TypeScript. If that ever changes, `packages/ai` exposes a narrow `AIAgent` interface and can be swapped for an HTTP client without the rest of the codebase noticing. That's the escape hatch, and we should not pre-pay for it.

### Chosen stack

| Layer | Choice | Notes |
| :--- | :--- | :--- |
| Language | TypeScript, `strict: true` | Single language across engine, AI, UI, server |
| App framework | Next.js 15, App Router | React Server Components for lobby/menus, client components for the board |
| Styling | Tailwind CSS v4 | Design tokens in CSS variables; theme is a token swap |
| Animation | Motion (framer-motion successor) | Resolution replay is the only heavy animation surface |
| Board rendering | Native inline SVG | 18 nodes; canvas/WebGL is unjustified complexity. Accessible, styleable, and screen-reader-navigable |
| Client state | Zustand + the engine's own reducer | The engine is the state machine; Zustand holds session/UI concerns only |
| Realtime | **PartyKit** — one Durable Object per match | Runs TS, imports `@berlin/engine` directly, stateful, globally distributed, generous free tier |
| Persistence | Neon Postgres + Drizzle ORM | Only needed from Phase 6 (async matches, accounts) |
| Validation | Zod at every trust boundary | Client→server messages are never trusted |
| Testing | Vitest (unit + golden replays), Playwright (E2E) | Determinism tests are the backbone, see §6 |
| Monorepo | pnpm workspaces + Turborepo | |
| Hosting | Vercel (web) + Cloudflare via PartyKit (rooms) | |

### Realtime alternatives considered

* **Supabase Realtime** — a good pub/sub broadcaster, but there's no natural home for authoritative game logic. You'd end up putting rules in Postgres functions or an edge function with the match state in a row, and every order becomes a read-modify-write transaction. Wrong shape.
* **Raw Cloudflare Durable Objects** — this is what PartyKit *is*, minus ergonomics. Perfectly viable; if PartyKit ever becomes a liability the migration is mechanical.
* **Socket.IO on a long-running Node host** — works, but reintroduces the second-deploy-target problem with none of PartyKit's per-room isolation.

---

## 2. System shape

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                             │
│                                                                      │
│   Next.js client (apps/web)                                          │
│    ├─ SVG board, order composer, resolution replay                   │
│    ├─ holds ONLY a PlayerView — never full GameState                 │
│    └─ imports @berlin/engine for *local legality preview only*       │
│         (predictive, never authoritative)                            │
└────────────┬─────────────────────────────────┬───────────────────────┘
             │ WebSocket (orders / views)      │ HTTPS (lobby, auth, assets)
             ▼                                 ▼
┌────────────────────────────────┐  ┌──────────────────────────────────┐
│  PARTYKIT ROOM (apps/party)    │  │  NEXT.JS SERVER (apps/web)       │
│  1 Durable Object per match    │  │  RSC pages, route handlers       │
│                                │  │  matchmaking, profiles           │
│  ┌──────────────────────────┐  │  └────────────┬─────────────────────┘
│  │ AUTHORITATIVE GameState  │  │               │
│  └───────────┬──────────────┘  │               ▼
│              │                 │  ┌──────────────────────────────────┐
│   @berlin/engine  ─────────────┼─▶│  Neon Postgres (Phase 6+)        │
│   @berlin/ai      (bot seats)  │  │  matches, users, replays         │
│                                │  └──────────────────────────────────┘
│   projectView(state, playerId) │
│      → one PlayerView per seat │
└────────────────────────────────┘
```

The hard rule this diagram encodes: **the full `GameState` exists in exactly one place, inside the room object.** Nothing else in the system ever holds it.

---

## 3. Package layout

```
berlin1988/
├── apps/
│   ├── web/            Next.js app — UI, lobby, deckbuilder
│   └── party/          PartyKit room server — authoritative match host
└── packages/
    ├── shared/         Types + wire protocol schemas. Zero dependencies.
    ├── engine/         Pure rules engine. No I/O, no React, no network.
    ├── ai/             Bot opponents. Consumes PlayerView, emits Orders.
    └── (ui/)           Extracted later only if apps/web outgrows itself
```

Dependency direction is strictly one-way, and the lint config enforces it:

```
shared  ◀── engine  ◀── ai
   ▲          ▲          ▲
   └──────────┴──────────┴──── apps/web, apps/party
```

`engine` importing from `apps/` is a build error. This is what keeps the rules testable in isolation and portable to a future native client.

---

## 4. The engine contract

`packages/engine` is a pure function library. Same inputs, same outputs, always.

```ts
// The whole public surface.
function createMatch(config: MatchConfig, seed: string): GameState;

function legalOrders(view: PlayerView, agentId: AgentId, prefix?: Action[]): Action[];

function submitOrder(state: GameState, playerId: PlayerId, order: AgentOrder): SubmitResult;

/** Compose actions against this, not projectView: a player's agents share one Intel pool. */
function viewForOrdering(state: GameState, playerId: PlayerId, agentId: AgentId): PlayerView;

/** Every player has submitted → advance one full round. */
function resolveRound(state: GameState): { state: GameState; log: ResolutionEvent[] };

/** The security boundary. */
function projectView(state: GameState, playerId: PlayerId): PlayerView;
```

Four properties this design buys us:

**Determinism.** All randomness comes from a seeded PRNG carried inside `GameState`. No `Math.random()`, no `Date.now()` anywhere below `apps/`. A match is fully reconstructible from `(seed, config, ordered list of Orders)` — which gives us free replays, free bug reports, and golden-file tests.

This matters more in v3 than it looks. Three systems now consume randomness mid-match: **contested-node rolls** (50/50, or 75/25 with K9), **blockade scheduling**, and **dossier respawn placement**. All three draw from the same PRNG stream, which means blockades are *pre-determined at match creation* — that's what makes the *Kontrolle Schedule* passive implementable at all, and it's why the PRNG stream must be advanced in a fixed order regardless of which branches execute.

**Immutability.** `resolveRound` deep-clones and returns new state, so the previous state stays valid and the client can animate A→B by holding both. Implemented with `structuredClone`, not Immer: `GameState` is plain data, the clone is sub-millisecond at this size, and it keeps a dependency out of the package with the strictest purity rules.

**No I/O.** The engine can't read a clock, hit a network, or log. Anything time-based (order deadlines) lives in the room server and enters as an explicit `TimeoutOrder`.

**Total functions.** Illegal orders don't throw — `submitOrder` returns a state carrying a rejection. Exceptions are for bugs, not for rules.

### 4.1 The fog boundary

```ts
interface GameState {
  players: Record<PlayerId, PlayerSecrets>;  // agents, safehouse, traps, cooldowns
  nodes:   Record<NodeId, NodeState>;
  // ...
}

interface PlayerView {
  self:        PlayerSecrets;              // yours in full — both agents, your safehouse
  opponents:   OpponentPublicInfo[];       // burn track, score, Intel, agents alive. NO positions.
  visibleNodes: Record<NodeId, NodeState>;
  signals:     Signal[];
  burnTracks:  Record<PlayerId, BurnEntry[]>;  // includes your own — see §4.2
  clock:       ClockState;
}
```

`PlayerView` has no field capable of holding another player's agent position, safehouse, or trap. Not "we remember not to send it" — the type makes it unrepresentable.

Three pieces of hidden state are equally sensitive and are easy to forget because they aren't agents: a player's **safehouse** (permanent, and the tiebreaker for every contested node), their **active ambush traps**, and their **cooldown timers**. The leak scan in `packages/engine/tests/` covers all four categories.

### 4.2 Symmetric Burn Tracks

`burnTracks` deliberately includes the viewing player's own. Players can see exactly the public record opponents hold on them (`docs/GAME_DESIGN.md` §6.3), so it's the same data structure for everyone — there is no "private version" of a Burn Track to keep in sync. Redaction from *Cutout* is applied once, when the entry is appended, so every viewer including the owner sees the identical redacted row.

Everything that reaches a client goes through `projectView`. There is one send path in the room server, and it calls it. `packages/engine/tests/` includes a leak test that deep-scans every serialized `PlayerView` for opponent node ids and fails the build if one appears.

---

## 5. Realtime protocol

Client → server (all Zod-validated on arrival):

| Message | Payload |
| :--- | :--- |
| `JOIN` | `{ matchId, playerToken }` |
| `SET_SETTINGS` | `{ settings: MatchSettings }` — **host only**, lobby only (`docs/GAME_DESIGN.md` §2) |
| `SET_SEAT` | `{ seat, kind: 'human' \| 'bot', personality?, difficulty? }` — host only |
| `SUBMIT_LOADOUT` | `{ cards: CardId[] }` |
| `SUBMIT_ORDER` | `{ round, agentId, actions: [Action, Action] }` — **two actions per agent**; players with 2 agents send two messages |
| `RETRACT_ORDER` | `{ round, agentId }` — allowed until everyone has committed |
| `REQUEST_PAUSE` | `{ round }` |
| `ANSWER_PAUSE` | `{ round, accept: boolean }` |

Server → client:

| Message | Payload |
| :--- | :--- |
| `VIEW` | `{ view: PlayerView }` — full snapshot, sent on join and after each round |
| `ROUND_RESOLVED` | `{ log: ResolutionEvent[], view: PlayerView }` |
| `OPPONENT_COMMITTED` | `{ playerId, agentsCommitted, agentsTotal }` — *that* they moved, never what |
| `CLOCK` | `{ deadlineAt, paused, pausesRemaining }` |
| `PAUSE_REQUESTED` | `{ byPlayerId, pending: PlayerId[] }` |
| `ERROR` | `{ code, message }` |

Design notes:

* **Snapshots, not deltas.** A `PlayerView` is a couple of kilobytes and rounds are ~60 seconds apart. Delta sync would be an optimization with no problem to solve, and it's a classic source of desync bugs.
* **`ResolutionEvent[]` is already fog-filtered** — it's the script the client animates. A player's replay only contains what that player is entitled to have seen. Strike events in particular carry *graded* precision (exact node for adjacent agents, sector only for everyone else, nothing if silenced) and that grading happens in `projectView`, never on the client.
* **Reconnection is trivial** because of snapshots: rejoin, get a `VIEW` and a `CLOCK`, you're current.
* **The clock lives in the room**, via Durable Object alarms — 60s default, host-configurable. On expiry, agents with unsubmitted actions auto-**Hold** (banking +1 Intel each), so a timeout is wasteful rather than catastrophic.
* **Pause requires unanimity.** `REQUEST_PAUSE` opens a poll; the alarm is suspended only once every live human seat has sent `ANSWER_PAUSE {accept: true}`. Bots auto-accept. A single decline resumes the clock immediately. This is enforced in the room, not the client — a client that could stop the clock alone is a griefing vector.

---

## 6. Testing strategy

The rules engine is where bugs are expensive and where testing is cheapest, so weight is deliberately bottom-heavy.

| Layer | Tool | What it proves |
| :--- | :--- | :--- |
| Engine unit | Vitest | Each op resolves correctly in isolation |
| **Golden replays** | Vitest + JSON fixtures | A recorded match replays to a byte-identical final state. This is the regression net — every fixed bug becomes a fixture |
| **Fog leak scan** | Vitest | No `PlayerView` ever serializes an opponent's agent position, safehouse, or trap. Runs over randomized states |
| Resolution ordering | Vitest property tests | Order-of-submission never affects outcome (simultaneity holds) |
| **Contested-node ladder** | Vitest | Every branch of `docs/GAME_DESIGN.md` §8.4 — mutual traps, safehouse tiebreak, neutral roll, K9, double-K9 — with a fixed seed |
| **Elimination integrity** | Vitest | Burned agents drop dossiers, release informants, and clear safehouse/decoys/traps. No orphaned state, no ghost participation |
| AI fairness | Vitest | Bots are constructed with `PlayerView` only; passing a `GameState` is a type error |
| Balance | `packages/ai/sim` | 10k headless bot-vs-bot matches per ruleset; win rates, match length, Strike hit rate |
| E2E | Playwright | Lobby → loadout → 3 rounds → resolution, on a seeded match |

---

## 7. AI integration

Bots are seats in the room, not clients. When the round deadline passes or all humans have committed:

```ts
for (const seat of room.botSeats) {
  const view = projectView(state, seat.id);          // identical to a human's
  for (const agent of view.self.agents) {            // 1 or 2, per host settings
    const actions = await seat.agent.decide(view, agent.id);   // @berlin/ai
    state = submitOrder(state, seat.id, { agentId: agent.id, actions });
  }
}
```

`AIAgent.decide` takes `PlayerView` and an agent id — nothing else. It is structurally incapable of cheating, and §6 has a test asserting exactly that. With two agents the bot plans both from one belief state, so it can coordinate them (bracket a node from two sides) the same way a human would.

Bot latency is artificially padded to 1.5–4s 🔧 so a bot's "thinking" doesn't reveal how hard the decision was, and bots auto-accept pause requests immediately.

An optional **flavour layer** may call the Claude API to generate in-character radio chatter from a personality prompt plus the bot's *own legitimate knowledge*. It is cosmetic, non-blocking, cached, and behind a feature flag — the game must play identically with it off, and it never sees `GameState`.

---

## 8. Deployment

| Target | Host | Trigger |
| :--- | :--- | :--- |
| `apps/web` | Vercel | Push to `main`; preview deploys per PR |
| `apps/party` | Cloudflare via `partykit deploy` | GitHub Action on `main` |
| Postgres | Neon | Drizzle migrations in CI |

Preview environments point at a staging PartyKit host so PR previews are fully playable. `NEXT_PUBLIC_PARTYKIT_HOST` is the only environment coupling between them.

---

## 9. Frontend notes

**Board.** One SVG viewport. Nodes are `<g>` elements with a `<circle>`, label, and state rings; edges are `<path>` styled by type. Layout comes from the map data's `x`/`y` percentages, so a new map needs no code.

**Resolution replay.** The most important UI in the game. `ResolutionEvent[]` is played back as a timeline — movement, then scans, then strikes — at ~700ms per beat 🔧, skippable, and scrubbable. Players learn the game by watching this, so it needs to read like a story rather than a diff.

**Accessibility, non-negotiable despite the CRT aesthetic.** The phosphor-green look is a themeable token set, and a high-contrast theme ships from day one. Sector color is *never* the only signal — every sector also has a distinct shape and pattern, because a game with four color-coded factions is otherwise unplayable for the ~8% of players with a color vision deficiency. The board is keyboard-navigable, nodes are focusable, and every signal in the log has a text form. Motion respects `prefers-reduced-motion` (replay still runs; it just cuts rather than tweens).

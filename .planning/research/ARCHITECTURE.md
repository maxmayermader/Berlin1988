# Architecture Research — v1.1 Gameplay and UI Refinement

**Domain:** Feature integration for a brownfield TypeScript monorepo (pure engine + AI package + Next.js client + PartyKit authoritative server)
**Researched:** 2026-09-14
**Confidence:** HIGH — every claim below is traced to a specific file read in this repository, not inferred from the docs alone. Where a claim rests on documentation rather than code, it is marked.

## How to read this document

This is not "what does a hidden-movement game architecture look like" — the architecture already exists and is sound (v1.0 shipped 28/28 requirements, 580 tests green). This document answers: **for each v1.1 feature, which existing files does it touch, does it need a `packages/shared`/protocol/`packages/engine`/`packages/ai` change, and what's the data flow before/after.** It is written for the roadmapper and phase planners, so every claim names a file.

The single biggest finding: **`legalOrders()` already drives every action type and every target list — the gap is entirely in `apps/web`, which never asks it for anything beyond `HOLD` and `MOVE`.** Nearly all of v1.1 is presentation work surfacing data the engine and protocol already produce. Two areas are the exception and need small, well-scoped `packages/engine` / protocol additions: cross-agent Intel preview on the client, and host-configurable match settings (`SET_SETTINGS` does not exist yet, despite being documented as if it did).

---

## System Overview (unchanged by v1.1)

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER (apps/web) — holds ONE PlayerView, never GameState          │
│   lib/socket.ts → matchStore (view) + uiStore (drafts, reveal)       │
│   components/{orders,board,hud,intel,resolution,result}/             │
│   imports @berlin/engine ONLY for legalOrders() preview               │
└────────────┬─────────────────────────────────┬───────────────────────┘
             │ WebSocket (Zod-validated)        │
             ▼                                  │
┌────────────────────────────────┐              │
│  PARTYKIT ROOM (apps/party)     │              │
│  RoomState.gameState: GameState │◄─────────────┘
│  handlers.ts → submitOrder()    │
│  round.ts → resolveRound()      │
│  broadcast.ts → projectView()   │  ONE call per connection, chokepoint
│  bots.ts → @berlin/ai           │
└────────────────────────────────┘
```

Nothing about this shape changes in v1.1. Every feature below is additive within it: new fields read off `PlayerView` that already exist, new components, one new engine export, one new protocol message, two new map data files.

---

## Feature Integration Points

### 1. Full order composer (every action + card + silencer purchase)

**Files touched:**

| File | New/Modified | Change |
|---|---|---|
| `apps/web/components/orders/OrderComposer.tsx` | Modified | Currently renders only `ActionSlot` (Hold + implicit board-click Move/Strike). Needs to render the full `legalForSlot` list from `legalOrders(view, activeAgentId, prefix)` grouped by action type, not just check `canHold`. |
| `apps/web/components/orders/ActionSlot.tsx` | Modified | `describeAction()` already formats all 9 action types (dead code today — never reached because nothing but `HOLD`/board-clicks ever gets assigned to a slot). Needs an actual picker UI, not just a passive label. |
| `apps/web/lib/orderDraft.ts` | Modified | `composerTargets()` only extracts `moveTargets`/`strikeTargets` from `legalForSlot`. Needs `wiretapTargets`/`decoyTargets` extraction (WIRETAP and DECOY are node-targeted the same way MOVE/STRIKE are) and a card-picker path for the four non-targeted plays (`BRIBE`, `SAFEHOUSE`, `AMBUSH` have no `target` field at all; `SPRINT` needs a two-node `via`+`to` picker, not one click). `toAgentOrder()` needs to carry `buySilencers` — it currently drops it. |
| `apps/web/components/board/TargetOverlay.tsx` | Modified | Needs a `wiretapTargets`/`decoyTargets` prop and a distinct visual treatment per action-type highlight (today only move/strike are distinguished). |
| New: `apps/web/components/orders/CardPicker.tsx` (or similar) | New | Non-targeted card plays (`BRIBE`, `SAFEHOUSE`, `AMBUSH`) and the silencer-purchase control have no board-click path — they need a direct list of buttons, each showing Intel cost (`ActiveCard.intelCost`) and cooldown (`self.cooldowns[cardId]` via `cooldownRemaining()`, already exported from `@berlin/engine`). |

**Can `legalOrders(view, agentId, prefix)` drive every action type's affordances, including card choice and target nodes? — Yes, already, in full.** Verified by reading `packages/engine/src/legalOrders.ts`: it enumerates `HOLD`, every legal `MOVE`, every legal `SPRINT` (both Intel-paid and `AGENT`-card-paid variants), every `WIRETAP` target (every non-blocked node), `BRIBE` (when standing on an unclaimed informant node), every `DECOY` target (start node + 2-hop range, capped by `ruleset.maxActiveDecoys`), `SAFEHOUSE` (when not already there), every `STRIKE` target (self + neighbours), and `AMBUSH` (free action or slot-consuming, per `ruleset.ambushCostsAction`) — filtered by `self.loadout.includes(id)`, `isReady()` (cooldown), `!sim.cardsUsed.has(id)` (already used this round), and `card.intelCost <= intelLeft`. It also respects the "movement before operations" rule (closes movement once a `STRIKE`/`BRIBE` is in the prefix) so the UI never offers an action it will then reject. **No `packages/engine` change is needed to make the composer complete** — every affordance the UI needs is already a member of the array `legalOrders` returns.

**Intel cost / cooldown preview across two agents sharing one Intel pool, submitted separately — this is the one real gap.**

Traced the mechanism precisely:

- `packages/engine/src/submitOrder.ts` exports `viewForOrdering(state, player, agentId)` — internally `viewWithCommittedSpend()` — which reduces `view.self.intel` by the Intel cost of every *other* agent's **already-submitted** (`state.pendingOrders`) order before validating. This requires a `GameState`, which only exists inside `apps/party`. `apps/web` never has a `GameState` (by design — `apps/web/CLAUDE.md` rule 1) and therefore **cannot call `viewForOrdering` itself.**
- The doc comment on `viewForOrdering` says explicitly: *"The client does the same subtraction locally from its own pending orders."* This client-side subtraction **does not exist yet.** `apps/web/components/orders/OrderComposer.tsx` calls `legalOrders(view, activeAgentId, prefix)` against the raw `view` from `matchStore`, where `view.self.intel` is **not** reduced by the other agent's already-submitted order.
- Confirmed the server-side view is stale on the client independent of this: `apps/party/src/broadcast.ts`'s `sendViews`/`sendResolved` are the only two `projectView()`-based sends, fired on `JOIN`/reclaim and on round close — **not** after an individual `ORDER_ACK`. So after agent 1 submits, `matchStore.view.self.intel` still shows the pre-spend balance until the round fully resolves.
- Consequence today (latent, because `agentsPerPlayer` is hardcoded to `1` — see Feature 6): a 2-agent player's composer for agent 2 would preview affordability against the wrong (too generous) Intel balance, and could offer/accept an action client-side that the server then rejects with `INSUFFICIENT_INTEL` once submitted.
- **Does `submitOrder()` on the server re-validate cross-agent Intel? Yes, already, correctly.** `viewWithCommittedSpend` runs on every `submitOrder()` call, reading `state.pendingOrders` for the player's *other* agents — this is authoritative and cannot be bypassed by the client. The server is not the gap; the client preview is.

**Recommended fix (small `packages/engine` addition, not a protocol or `PlayerView` change):** export a pure Intel-cost-of-an-order calculator — the same logic currently private as `intelCostOf()` in `submitOrder.ts` — from `packages/engine`'s public surface (e.g. add to `costs.ts` and re-export from `index.ts`). `apps/web`'s composer then does its own local reduction: for every *other* living agent whose `orderStatus[agentId].state === 'accepted'` (already tracked per-agent in `apps/web/lib/matchStore.ts`), look up that agent's committed draft (`draftByAgent` in `apps/web/lib/uiStore.ts`) and subtract `costOfOrder(map, ruleset, self, draft.actions, draft.buySilencers)` from `view.self.intel` before calling `legalOrders`. This is a **pure function export, not a `PlayerView` field** — it takes the same inputs the client already legitimately holds (its own drafts, its own view) and introduces no new information flow, so it does not touch the fog boundary.

**Silencer purchases — `AgentOrder.buySilencers`, not an `Action`.** Confirmed in `packages/shared/src/orders.ts`: `buySilencers` is a sibling field on `AgentOrder`, not a member of the `Action` union, so it never appears in `legalOrders()`'s output and needs its own UI control (a stepper, not a board click or card button), wired through `orderDraft.ts`'s `toAgentOrder()` (which currently drops it — a real bug to fix). **Important gap found in the engine, not just the UI:** `submitOrder()` does *not* validate `order.buySilencers` against affordability or `ruleset.maxSilencersHeld` at submission time (traced in `submitOrder.ts` — only the *other* agent's `buySilencers` is subtracted via `intelCostOf`, never the current agent's own request against the cap or its own remaining Intel). The actual enforcement is a silent clamp at resolution time in `packages/engine/src/resolution/arm.ts`: it buys as many as it can afford up to `maxSilencersHeld`, and **silently drops the rest — no rejection code exists for "requested more silencers than affordable."** The composer must therefore clamp its own input to `min(ruleset.maxSilencersHeld - self.silencers, floor(intelLeft / ruleset.silencerIntelCost))` and treat that as advisory UX, not something the server will confirm or reject — there is no `ORDER_REJECTED` path for over-requesting.

**Fog-of-war check:** none of the above touches `PlayerView`'s shape. The one proposed engine export is a pure calculator over data the client already has (its own draft actions, its own `self`, the public `map`/`ruleset`). No new field crosses the client/server boundary.

---

### 2. Own-status panel

**Files touched:** New component only, e.g. `apps/web/components/hud/SelfStatusPanel.tsx`. No existing component currently reads `view.self.intel`, `.safehouse`, `.loadout`, `.passivesAvailable`, `.cooldowns`, `.silencers`, `.traps`, `.decoys`, `.burnsInflicted`, `.dossiersExtracted` for display (`view.ts` confirms every one of these fields is already on `SelfView` and delivered every round).

**Data gap: none.** `SelfView` (`packages/shared/src/view.ts`) already carries every field the requirement lists. This is pure presentation work — no `packages/shared`, protocol, or `packages/engine` change.

**Fog-of-war check:** trivially clean — this is the viewer's *own* full secret state, which `SelfView` already exists to carry in full (`docs/ARCHITECTURE.md` §4.1: "self: PlayerSecrets — yours in full").

---

### 3. Signals log

**Files touched:** New component, e.g. `apps/web/components/intel/SignalsLog.tsx`, plus a small addition to `apps/web/lib/format.ts` if grouping/sorting by round is wanted (though `Signal.text` is already human-readable and screen-reader-ready per the field's own doc comment — no new formatter function is strictly required).

**Data gap: none.** `PlayerView.signals: readonly Signal[]` (`view.ts`) is populated every round by `apps/party`'s `projectView()` call and is confirmed by `.planning/PROJECT.md`'s own audit note to be sent but never rendered. `Signal` already carries `kind`, `round`, `nodeId`, `sector`, `playerId`, human-readable `text`, and (for `RADIO_INTERCEPT`) a structured `intercept: InterceptFact`.

**Fog-of-war check:** clean by construction — `signals` is generated inside `packages/engine/src/fog/signals.ts`, which is documented (`packages/engine/src/fog/CLAUDE.md` rule 3) to only emit true, appropriately vague facts. Nothing here needs review as a fog change; it's an existing, already-filtered feed.

---

### 4. Roster (alive/burned agents, every player) + everyone's Burn Tracks

**Files touched:**

| File | New/Modified | Change |
|---|---|---|
| New: `apps/web/components/hud/Roster.tsx` | New | Renders `view.opponents[].{name, faction, agentsAlive, agentsTotal, eliminated, score}` plus `view.self.agents[].alive` for the viewer's own row. |
| `apps/web/components/intel/BurnTrackPanel.tsx` | Modified | Currently takes `entries: readonly BurnEntry[]` for exactly one player (the caller slices `view.burnTracks[view.self.id]`). Needs a player-selector (tabs, or a per-opponent row) so any `view.burnTracks[playerId]` can be viewed — every player's track is already present. |
| `apps/web/components/match/MatchIntelDrawer.tsx` | Modified | Hardcodes `ownTrack = view.burnTracks[view.self.id]` at line 39 — this is the one line that needs to become "select a player, then look up `view.burnTracks[selectedId]`." |

**Data gap: none.** Confirmed in `packages/shared/src/view.ts`: `OpponentPublicInfo` already carries `agentsAlive`, `agentsTotal`, `eliminated`, `score`, `intel`; and `PlayerView.burnTracks: Readonly<Record<string, readonly BurnEntry[]>>` is documented ("Every player's track, including the viewer's own, identically redacted") and confirmed in `projectView.ts` to be built by iterating **all** of `state.playerOrder`, not just the viewer. `.planning/PROJECT.md`'s audit already names this exact gap: `opponents[].agentsAlive/eliminated/intel/score` and opponents' `burnTracks` are sent but never rendered.

**Fog-of-war check:** clean. Every field involved is already public-by-construction in `PlayerView` (agent *positions* are never in `OpponentPublicInfo`; only counts and status are). No new leak surface — this is wiring existing public fields into new UI.

---

### 5. Animated, skippable resolution replay on the map

This is the feature with the most real architectural work, because **the map-based animated replay does not exist today** — only a text step-through does.

**What exists today, confirmed by reading the code:**

- `apps/web/components/resolution/StepThrough.tsx` + `apps/web/lib/stepThrough.ts`: a click-to-advance **text list**, driven by a single global `reveal: RevealState` cursor in `apps/web/lib/uiStore.ts`. `revealedEvents(log, reveal)` returns `log.slice(0, n)` — a prefix of `view.lastRound`, the engine's own emission order.
- `apps/web/components/resolution/RoundHistoryPanel.tsx` reuses the *same* `StepThrough` component in `mode="full"` for historical rounds, specifically so there is never a second event-log renderer (`apps/web/lib/CLAUDE.md` rule 5; enforced by a cross-file test per `.planning/PROJECT.md`'s Key Decisions).
- `apps/web/components/board/Board.tsx` / `AgentToken.tsx`: renders **only the viewer's current living agent positions** (`view.self.agents`, post-resolution) as static, unanimated `<circle>` elements. During the `RESOLUTION` sub-state, the match page (`apps/web/app/match/[code]/page.tsx`) renders `Board` with the exact same props as during `ORDERS` — there is no "before" state, no movement tween, no marker for any other event type. **The animated map timeline is entirely unbuilt.**
- `apps/web/components/board/CLAUDE.md` already documents the intended files for this — `ResolutionReplay.tsx`, `ReplayControls.tsx`, a `TrapMarker.tsx`, a `SafehouseMarker.tsx` — none of which exist in `apps/web/components/board/` today. This is expected scope, not scope creep.

**What can be animated, precisely, from the fog-filtered events the viewer receives — traced event-by-event in `packages/engine/src/fog/filterEvents.ts`:**

| Event | Survives for viewer when... | Animatable as |
|---|---|---|
| `AGENT_MOVED` | `mine(playerId)` **only** — never for another player, at all | Full precise animation: `agentId`, `from`, `to`, `viaTunnel`/`viaCheckpoint`/`sprint` — but **only for the viewer's own agents.** Opponents' movement is structurally invisible; there is no path to animate for them. |
| `STRIKE_FIRED` | Own strikes always; an opponent's only if `audibilityFor()` grades `EXACT` (adjacent), and then with `agentId` nulled | A flash/marker at `target` node — "someone fired here" — never a moving token, since the shooter's prior position is unknown to the viewer unless it's their own strike. |
| `AGENT_BURNED` | Always public (fact), `agentId` nulled unless yours, `byPlayerId` nulled unless you're the killer or the victim holding *Sleeper Cell* | A marker at `nodeId` — "an agent was burned here" — anonymized per the same rule the text log already follows (`eventText()`'s `"Someone"`/`"An agent"` branching in `apps/web/lib/format.ts` is the existing precedent to mirror). |
| `CONTEST` | Only if the viewer is a claimant | A marker/animation at `nodeId`, with `method` (coin flip / K9 roll / etc.) — `apps/web/components/board/CLAUDE.md` rule 3 already calls out that a 50/50 loss needs to visibly show it was a 50/50. |
| `AMBUSH_TRIGGERED` | Victim always; owner sees it with `victimAgentId` nulled | Marker at `nodeId`, escape/seal state. |
| `DOSSIER_TAKEN`, `EXTRACTION` | Always public, `agentId` nulled unless yours | Marker at `nodeId`. |
| `BLOCKADE_*`, `DOSSIER_SPAWNED`, `INFORMANT_CLAIMED`, `CARD_PLAYED`, `PASSIVE_FIRED`, `PLAYER_ELIMINATED`, `MATCH_ENDED` | Always public, unconditionally | Node/board-wide markers, no identity concern at all. |
| `SAFEHOUSE_PLACED`, `AMBUSH_SET`, `DECOY_PLACED`, `WIRETAP_RESULT`, `SILENCER_BOUGHT`, `INTEL_GAINED`, `CHECKPOINT_CROSSED` | Own only | Own-agent-only markers/animation. |

**The architectural conclusion this drives:** the animated map cannot and must not attempt to show an opponent's agent traveling from A to B — that data was never sent, and building a client-side path-inference from public node-level events would be reconstructing hidden state from public breadcrumbs, which is exactly the kind of fog leak `docs/ARCHITECTURE.md` §4.1 and the fog-leak test suite exist to prevent. The correct design is: **precise, tweened movement for the viewer's own agent(s); anonymous "something happened here" markers, keyed by `nodeId`, for every public event that isn't the viewer's own.**

**How to build it without a second event renderer** (the explicit ask): don't build an independent event-log parser for the map. Drive it from the *same* `reveal` cursor `StepThrough` already uses:

1. New pure module, e.g. `apps/web/lib/boardEffects.ts` — a function `boardEffectsFor(events: readonly ResolutionEvent[]): BoardEffect[]` mapping each event to `{ nodeId, kind, ... } | null` (returns `null` for events with no map-relevant coordinate). Pure, colocated with `stepThrough.ts`'s existing style, independently testable exactly like `roundHeadline()`.
2. `apps/web/app/match/[code]/page.tsx` (already reads `reveal` indirectly through `StepThrough`) additionally computes `revealedEvents(view.lastRound, reveal)` itself (or `StepThrough` exposes it, e.g. via a small prop-passthrough or a shared selector) and passes `boardEffectsFor(revealed)` into `Board` as a new prop.
3. `Board.tsx` renders those effects as transient SVG markers layered near `TargetOverlay`; `AgentToken.tsx` becomes a `motion.circle` (Motion is already a project dependency, used elsewhere via `apps/web/lib/motion.ts`) whose position tweens when the viewer's own agent's `nodeId` changes between the pre-round and post-round position — which requires **capturing the pre-round position**, since `view.self.agents` only ever reflects the current (post-resolution) state. The pre-round position is derivable from the `AGENT_MOVED` event's own `from` field for the viewer's own agents; for opponents there is no "before" to show, matching the fog conclusion above.
4. This means one cursor (`reveal` in `uiStore.ts`), one revealed-events selector (`revealedEvents()` in `stepThrough.ts`), and two consumers (`StepThrough`'s text rows, `Board`'s map markers) — never two independent playback states that could drift out of sync (a real risk the "no second renderer" instruction is explicitly guarding against, given `apps/web/lib/CLAUDE.md` rule 5's existing "one source of truth" convention for `format.ts`).

**`packages/shared`/protocol/`packages/engine` changes needed: none.** Every event this animates is already delivered on `view.lastRound`. This is 100% `apps/web` work (new files: `boardEffects.ts`, likely `ResolutionReplay.tsx`/marker components under `components/board/`; modified: `Board.tsx`, `AgentToken.tsx`, `TargetOverlay.tsx`, `app/match/[code]/page.tsx`).

**Fog-of-war check:** the design above is fog-safe by construction — it never invents an opponent position from a node id. The risk to flag for phase planning: it would be easy to accidentally add a "trail" effect that looks like it's showing an opponent walking, when actually only the destination node is known — reviewers should treat any opponent-agent animation that implies a *path* (not just a *node flash*) as a fog-leak candidate requiring explicit sign-off, same weight as a `PlayerView` field change.

---

### 6. Spectator view for eliminated players

**Files touched:** Primarily `apps/web` presentation — likely `apps/web/app/match/[code]/page.tsx` (an explicit "you are eliminated — spectating" branch) and `apps/web/components/orders/OrderComposer.tsx` (already has a `living.length === 0` branch, but it's currently generic, not spectator-specific copy).

**What `projectView()` returns for an eliminated player — traced exactly:**

- `me.eliminated` → `SelfView.eliminated = true` (`projectView.ts` line 71).
- `visibleNodesFor()` (`packages/engine/src/fog/visibility.ts`) computes visible nodes only from **living** agents (`if (!a.alive) continue`) — an eliminated player (all agents dead) with no team (`teams: false` today) gets an **empty** `visibleNodes: {}`. The board effectively has no runtime overlays for any node.
- `legalOrders()` (`packages/engine/src/legalOrders.ts` line 32) returns `[]` unconditionally once `self.eliminated` is true, for every agent.
- `opponents: OpponentPublicInfo[]` is built from **all** `playerOrder` entries except the viewer (`projectView.ts`) — an eliminated player still sees every other player's public info, unaffected by their own elimination.
- `burnTracks`, `signals`, `history` continue to be delivered per the same `visionGroup()` (self only, no team) — so a spectator continues to receive the public branch of `filterEvents()` (round narrative, `PLAYER_ELIMINATED`, `MATCH_ENDED`, anonymized burns/contests they aren't part of) but nothing private.

**What `apps/party` and `apps/web` do today when a player is eliminated — traced exactly:**

- **`apps/party` does nothing special.** `sendViews`/`sendResolved` in `apps/party/src/broadcast.ts` iterate `room.getConnections()` and call `projectView()` for every bound seat unconditionally — an eliminated player's connection keeps receiving `VIEW`/`ROUND_RESOLVED`/`CLOCK`/`OPPONENT_COMMITTED` frames exactly like a live player, for the rest of the match. No disconnection, no special message type, no room-side branch exists for elimination.
- **`apps/web` degrades gracefully but silently.** `livingAgents` computes to `[]`; `OrderComposer` renders "No living agents — nothing to order." (a generic empty state, not spectator-aware copy); `Board` renders with an empty `visibleNodes`, so it shows bare map topology with no informant/dossier/blockade markers; `RoundClock`, `SubmittedCount`, `LockedInRow`, and (once built) the roster/signals/burn-track panels all continue to render normally, since they read only public/self fields that remain populated.

**Conclusion: the server-side spectator mechanism already exists and needs no protocol or engine change.** v1.1's spectator work is: (1) detect `view.self.eliminated` in the match route and render an explicit "You were eliminated — watching the rest of the match" state instead of the generic empty-composer message, and (2) confirm/polish that the resulting near-blank board plus the new roster/signals/burn-track surfaces (Features 3–4) constitute a coherent spectator experience — because those are the *only* things left for a spectator to look at once `visibleNodes` goes empty.

**Fog-of-war check:** clean — a spectator's view is already *more* restricted than a live player's (empty `visibleNodes`), never less. No new field, no new message.

---

### 7. Host match settings in the lobby

This is the other feature with a genuine protocol/server gap, and it is more significant than the others.

**`apps/party/src/CLAUDE.md` documents `settings.ts` as "host-only lobby settings; validation and lock-on-start" and `docs/ARCHITECTURE.md` §5 documents a `SET_SETTINGS` client message — but neither exists in the shipped protocol.** Confirmed by reading `packages/shared/src/protocol.ts` in full: `clientMessageSchema`'s discriminated union has exactly `CREATE`, `JOIN`, `SET_READY`, `SET_CODENAME`, `SUBMIT_ORDER`, `SUBMIT_LOADOUT`, `SET_SEAT_COUNT`, `KICK`, `CHAT_SEND` — **no `SET_SETTINGS`.** `apps/party/src/handlers.ts` has no `handleSetSettings`. `apps/party/src/settings.ts` contains only `buildMatchConfig()` (which hardcodes every field) and `startMatch()` — no host-settings *mutation* logic at all, despite its `CLAUDE.md`-documented role.

**Current hardcoded values, confirmed in `apps/party/src/settings.ts` `buildMatchConfig()`:**

```
agentsPerPlayer: 1,       // D-02 — comment cites a past phase decision
mapId: 'duel-12',         // D-03 — "the only key in MAPS"
roundTimerSeconds: 90,    // D-04
pausesPerPlayer: 0,
roundLimit: 14,
dossierCount: 2,
startingIntel: 4,
blockadeMode: 'MIXED',
rulesetId: 'default',
```

**What the engine and bots already honor, independent of any UI:** every one of these is a plain field on `MatchSettings` (`packages/shared/src/settings.ts`) that `createMatch()` (`packages/engine/src/createMatch.ts`) already consumes correctly — `agentsPerPlayer` controls how many `AgentState`s are seeded per seat; `mapId` is looked up via `getMap()`; `dossierCount` drives `placeDossiers()`; `blockadeMode` drives `rollBlockadeSchedule()` (`OFF`/`ANNOUNCED`/`RANDOM`/`MIXED`, confirmed as a 4-way branch); `roundLimit` bounds the blockade roll loop and (per `docs/GAME_DESIGN.md`) the round-limit win condition. `packages/ai/sim/match.ts`'s `runMatch()` already accepts `Partial<MatchSettings>` overrides and `packages/ai/sim/run.ts`'s CLI already exposes `--agents`, `--players`, `--ruleset`, `--dossiers` flags that exercise these same fields. **None of this needs an engine or AI change — the settings plumbing on the "consume" side is complete and already balance-tested via the sim harness.** The gap is entirely "host sets it in the lobby, and it reaches `buildMatchConfig()`."

**Data flow to build, LOBBY → `startMatch` → `createMatch`:**

1. Add `SET_SETTINGS` to `clientMessageSchema` in `packages/shared/src/protocol.ts` — payload `{ type: 'SET_SETTINGS', settings: Partial<Pick<MatchSettings, 'agentsPerPlayer' | 'roundTimerSeconds' | 'roundLimit' | 'blockadeMode' | 'dossierCount'>> }` (mapId is likely host-*derived* from seat count rather than freely chosen — see Feature 8 below — so it may not belong in this payload at all; a per-field allow-list, not the whole `MatchSettings` shape, is the safer wire contract, mirroring how `SET_SEAT_COUNT` carries one bounded field rather than a whole settings blob).
2. Add a matching field to `RoomState` (`apps/party/src/state.ts`) — e.g. `pendingSettings: Partial<MatchSettings>` — populated only in `LOBBY`/`LOADOUT` phase, mirroring `setLoadout()`'s phase guard.
3. New `handleSetSettings()` in `apps/party/src/handlers.ts`, modeled exactly on `handleSetSeatCount()`: resolve the acting seat via `seatFor(connectionId)`, compare `seat.playerId === state.hostPlayerId` (never trust a role flag in the payload — `apps/party/CLAUDE.md` rule 5), validate bounds server-side (the wire schema's own bounds are defence in depth, not the enforcement — same pattern `canSetSeatCount()` establishes), reject with an explicit message on non-host or bad value, otherwise store and broadcast a `ROOM_STATE` update (settings likely need to be visible in `LobbySnapshot` too, meaning `lobbySnapshotSchema`/`toSnapshot()` in `state.ts` need a `settings` field alongside `seats`).
4. `apps/party/src/settings.ts`'s `buildMatchConfig()` reads `state.pendingSettings` (falling back to today's hardcoded defaults for any field the host never touched) instead of hardcoding every value — this is the one function that currently owns every hardcoded literal and is the correct single seam to change.
5. `startMatch()` (same file) is otherwise unchanged — it already calls `buildMatchConfig()` then `createMatch()`.

**Fog-of-war check:** `MatchSettings` is *public* lobby data by design (`docs/GAME_DESIGN.md` §2 calls these "the host configures in the lobby") — it is not hidden state, so exposing it via `ROOM_STATE`/`LobbySnapshot` is not a fog change. The only care needed: don't let a non-`SET_SETTINGS` path (e.g. reusing `SET_SEAT_COUNT`'s existing count field for `mapId` selection) create two divergent ways to mutate settings — keep it to the one new message, matching every other host-only message's existing one-message-one-mutation pattern.

**Sequencing note for planners:** this is the feature that changes what "2-agent play" actually means for humans in production. Today `agentsPerPlayer` is hardcoded to `1`, so the composer's cross-agent Intel bug (Feature 1) is currently *latent* — it only manifests once a real host sets `agentsPerPlayer: 2`. That is the concrete reason the prompt's suggested ordering ("settings before multi-agent composer polish") is correct, not just a general instinct: turning on the settings UI is what makes the two-Intel-pool bug observable and matters for.

---

### 8. FFA-16 and FFA-18 maps

**Files touched:**

| File | New/Modified | Change |
|---|---|---|
| `packages/engine/src/content/maps/ffa16.ts` | New | 16-node map, following `duel12.ts`'s exact `RawNode`/`RawEdge` → `build(): MapDefinition` pattern. Already named and scoped in `packages/engine/src/content/CLAUDE.md`'s "Expected files" table as `maps/ffa-16.ts` — this is anticipated, not novel, structure. |
| `packages/engine/src/content/maps/ffa18.ts` | New | Same, 18 nodes, per `content/CLAUDE.md`. |
| `packages/engine/src/content/index.ts` | Modified | `MAPS: Record<string, MapDefinition>` currently has exactly one key, `'duel-12'`. Add `'ffa-16'` and `'ffa-18'`. |
| `apps/party/src/settings.ts` `buildMatchConfig()` | Modified | Currently hardcodes `mapId: 'duel-12'` with the comment "the only key in MAPS." Needs a `mapId` selection by seat count (e.g. 1–2 players → `duel-12`, 3 → `ffa-16`, 4 → `ffa-18`), unless Feature 7's settings UI exposes it as an explicit host choice — either way this is the call site to change. |
| `packages/ai/sim/run.ts` | Modified | No `--map` CLI flag exists today (confirmed — `parseArgs()` has `matches`/`agents`/`players`/`ruleset`/`difficulty`/`seed`/`dossiers`/`csv` only). `runMatch()` in `packages/ai/sim/match.ts` already forwards `Partial<MatchSettings>` overrides, so adding `--map` is a one-line `parseArgs`/`main()` change, not a `match.ts` change. |

**What `createMatch`/AI/sim/golden tests assume about map ids and sizes:**

- `createMatch()` (`packages/engine/src/createMatch.ts`) is fully map-agnostic: `getMap(settings.mapId)` throws only on an unregistered id; `homeNodeFor()` looks up `extractionPointFor(map, faction)` and falls back to any node of that `faction`'s sector, then `map.nodes[0]`; `placeDossiers()` picks `settings.dossierCount` unoccupied nodes at random via the seeded RNG; `rollBlockadeSchedule()` excludes only extraction-point nodes. **None of this hardcodes node count or topology** — a new map needs no `createMatch.ts` change, matching `content/CLAUDE.md`'s rule: "Adding a map should never require touching `apps/web`" (nor, per this read, `createMatch.ts`).
- `packages/ai` has no map-specific logic either (confirmed: `packages/ai/CLAUDE.md` describes the belief filter/threat map/scoring pipeline entirely in terms of `PlayerView`/`map` data, never a hardcoded topology) — bots will play a new map correctly by construction, though their *balance* against it is unverified until swept.
- **Golden replay fixtures are pinned to `duel-12` by construction, not by accident** — confirmed in `packages/engine/tests/golden.test.ts`: every fixture case calls `quickSettings({...})`, whose default `mapId` is `'duel-12'` (`packages/engine/src/createMatch.ts`'s `quickSettings()`). **Adding new maps does not require regenerating golden fixtures** — they never reference the new map ids, since `quickSettings()`'s default is unchanged. Golden fixtures would only need regeneration if a *rules* change altered `duel-12` resolution outcomes, per the existing "regenerate golden replay fixtures after an intentional rules change" convention in the root `CLAUDE.md`.
- **`apps/party`'s `emptySeats()`/`SECTORS` already support up to 4 seats** (`SECTORS = ['RED', 'BLUE', 'GOLD', 'GREEN']`, `MAX_SEAT_COUNT = 4` in `apps/party/src/state.ts`) — no seat-count ceiling work is needed; only the map selection at match-build time.

**How to validate a new map with `pnpm sim`:** once the `--map` flag is added to `run.ts`, `pnpm sim --matches 2000 --players 3 --map ffa-16` (or `--players 4 --map ffa-18`) runs the existing bot-vs-bot balance harness against the new map exactly like any ruleset sweep — win rates, match length, and action-mix profiling (`--profile`) are the same report machinery already used for `duel-12`. This is the correct place to re-derive `dossierCount` for 3–4 players, since `quickSettings()`'s current `dossierCount: 2` is explicitly tuned and measured for a **duel** (`createMatch.ts`'s own comment: "measured, not guessed... in a duel" — sim results at 92%/75%/63%/58%/28% win rates were specifically 2-player numbers). A 3–4 player match likely needs its own dossier-count sweep before the new maps ship as more than "technically playable."

**Fog-of-war check:** clean — maps are pure public data (`x`/`y`, sector, edges), no hidden fields, no engine logic change.

---

### 9. Declassified-dossier visual redesign

**Files touched:** `apps/web/app/globals.css` (currently 35 lines, 5 `@theme` tokens: `--font-weight-body`, `--font-weight-heading`, `--color-surface`, `--color-surface-secondary`, `--color-border`, `--color-accent`, `--color-destructive` — confirmed by reading the file in full) plus every component file that hardcodes a hex color inline instead of using a token.

**Scale of the hex-color problem, confirmed by search:** 28 files under `apps/web/components/` contain at least one literal `#RRGGBB`/`#RGB` value in a `className` or inline `style` (e.g. `#2563eb`, `#dc2626`, `#e2e8f0`, `#64748b`, `#0f172a`, `#f1f5f9`, `#ffffff` recur across `OrderComposer.tsx`, `BurnTrackPanel.tsx`, `MatchIntelDrawer.tsx`, `RoundHistoryPanel.tsx`, and others read above). These are Tailwind v4 arbitrary-value utilities (`text-[#2563eb]`, `bg-[#f1f5f9]`) — functional but bypassing the `@theme` token layer entirely, so a redesign today means a find-and-replace across ~28 files rather than a token swap.

**Recommended restructuring (an `apps/web` change only, no `packages/*` impact):**

1. Extend `globals.css`'s `@theme` block with the full "declassified dossier" palette as named tokens (e.g. `--color-manila`, `--color-ink`, `--color-stamp-red`, `--color-redacted`, plus the existing `surface`/`border`/`accent`/`destructive` re-themed to the new palette) so the token *names* stay semantic (`surface`, `border`, `accent`, `destructive`) while their *values* change once, in one file.
2. Sweep every component's arbitrary hex utility (`text-[#...]`, `bg-[#...]`, `border-[#...]`, and the handful of inline `style={{ backgroundColor: ... }}` cases like `BurnTrackPanel.tsx`'s `SECTOR_SWATCH` usage) to the corresponding Tailwind theme utility (`text-surface`, `bg-border`, etc.) — this is mechanical once the tokens exist, but touches most of `apps/web/components/`.
3. `SECTOR_SWATCH` in `apps/web/lib/burnTrack.ts` and its duplicate in `CardGrid.tsx` (noted in `burnTrack.ts`'s own comment: "copied verbatim from `apps/web/components/deck/CardGrid.tsx`") are the one existing case of a *duplicated* color table — worth consolidating into a single exported constant (e.g. `apps/web/lib/theme.ts`, already listed as an expected file in `apps/web/lib/CLAUDE.md` for "Theme token switching (CRT / high-contrast)" though it doesn't exist yet) rather than fixing the duplication ad hoc during the redesign sweep.
4. `apps/web/lib/CLAUDE.md` already documents an expected `theme.ts` for token switching — v1.1 explicitly deselects the high-contrast theme (per `.planning/PROJECT.md` Out of Scope), so this file's scope in v1.1 is narrower than originally planned: it need only exist if the redesign wants a single named palette object, not a switcher.

**Fog-of-war check:** not applicable — pure presentation, zero data-flow change.

---

### 10. First Vercel deployment of `apps/web`

**Files/config touched:**

- `apps/web/next.config.ts` — confirmed minimal today (7 lines of actual config): `reactStrictMode: true` and a webpack `resolve.extensionAlias` shim so `.js`-suffixed relative imports resolve to `.ts`/`.tsx` in `next dev` (needed because the whole monorepo uses `verbatimModuleSyntax`-style explicit `.js` extensions). **This shim is webpack-specific** — if Vercel's build pipeline or a Turbopack default changes bundler, this needs re-verification; it's the one piece of existing config most likely to behave differently in a Vercel build than local `next dev`.
- **Environment coupling is exactly one variable**, confirmed everywhere this is documented (`docs/ARCHITECTURE.md` §8, `apps/CLAUDE.md`, `.planning/PROJECT.md` Constraints): `NEXT_PUBLIC_PARTYKIT_HOST`, pointing at the already-live `berlin1988-party.maxmayermader.partykit.dev`. This needs to be set as a Vercel project environment variable; no other secret or config crosses this boundary.
- **Workspace imports:** `apps/web` depends on `@berlin/shared` and `@berlin/engine` via the pnpm workspace (`packages/shared`, `packages/engine` in `pnpm-workspace.yaml`). Vercel's build needs to run in a context where pnpm workspace resolution works (Vercel supports pnpm monorepos natively via its "Root Directory" + auto-detected `turbo`/pnpm settings, but this needs an explicit Vercel project configuration step — e.g. Root Directory `apps/web`, and a build command that ensures `packages/shared`/`packages/engine` are built or at least type-resolvable before `next build` runs). This is an infra/CI concern, not a code change, but it is the one item flagged in `.planning/PROJECT.md` as the actual blocker: *"appears to be an environment/tooling gap (no `vercel` CLI / linked project available to the executing agent), not a product decision."*
- No `apps/party` change is implied by this — it is already deployed and live on Cloudflare.

**Fog-of-war check:** not applicable.

---

## Anti-Patterns to Avoid in v1.1 (specific to this codebase, not generic)

### Anti-Pattern: Building a second `ResolutionEvent[]` renderer for the map

**What people might do:** write a fresh event-loop/animation-state-machine inside `Board.tsx` or a new `ResolutionReplay.tsx` that independently walks `view.lastRound`.

**Why it's wrong:** `apps/web/lib/CLAUDE.md` rule 5 and an existing cross-file test already enforce "one source of truth" for event text; `uiStore.ts`'s `reveal` cursor is already the single global timeline cursor, shared by every mounted `StepThrough`. A second, map-side cursor advancing independently would desync from the text log the instant a player clicks "Next" — the two would show different rounds' events at the same moment.

**Do this instead:** derive map effects from the exact same `revealedEvents(log, reveal)` slice `StepThrough` already computes (see Feature 5 above).

### Anti-Pattern: Inferring an opponent's movement path from public node events

**What people might do:** animate an opponent agent "walking" to the `nodeId` of a `STRIKE_FIRED`/`AGENT_BURNED`/`CONTEST` event, inventing a start point from the previous round's last-known public location.

**Why it's wrong:** this reconstructs hidden state (an opponent's position/path) from a public breadcrumb — precisely the failure mode `docs/ARCHITECTURE.md` §4.1 and the fog-leak test suite exist to prevent, even though it happens entirely client-side and touches no `PlayerView` field. A leak doesn't require a schema change to be a leak.

**Do this instead:** render public events as anonymous node-level markers only ("something happened here"), never as a path with an inferred origin.

### Anti-Pattern: Composing agent 2's order preview against `view.self.intel` unmodified

**What people might do:** wire the new full composer straight to `legalOrders(view, agentId, prefix)` for both agents without accounting for the other agent's already-accepted order this round.

**Why it's wrong:** confirmed above — this is exactly the latent bug already present in the shipped composer, currently invisible only because `agentsPerPlayer` is hardcoded to 1.

**Do this instead:** the client-side committed-spend subtraction described in Feature 1, using a newly-exported pure cost calculator mirroring `submitOrder.ts`'s private `intelCostOf()`.

### Anti-Pattern: Adding a whole `MatchSettings` blob to the wire for `SET_SETTINGS`

**What people might do:** `z.object({ type: z.literal('SET_SETTINGS'), settings: matchSettingsSchema })`, letting the client submit (and the server trust) every field including `seats`/`mapId` wholesale.

**Why it's wrong:** every existing host-only message (`SET_SEAT_COUNT`, `KICK`) carries exactly one bounded, purpose-built field and re-derives everything else server-side — this is a deliberate, repeated pattern (`apps/party/CLAUDE.md` rule 5) precisely so a client can never smuggle in a field it shouldn't control (e.g. `seats`, which is entirely room-derived).

**Do this instead:** a narrow, explicit allow-list payload (see Feature 7), matching the existing message shapes.

---

## Integration Points Summary

### Internal Boundaries Touched by v1.1

| Boundary | v1.1 change | Fog/security review needed? |
|---|---|---|
| `apps/web` ↔ `@berlin/engine` (`legalOrders`) | New: read full output, not a filtered subset | No — same call, same data, just used completely |
| `apps/web` ↔ `@berlin/engine` (new cost export) | New pure function, exported from `packages/engine/src/costs.ts` / `index.ts` | No — pure calculator over already-client-held data |
| `apps/web` ↔ `apps/party` (protocol) | New `SET_SETTINGS` client message; `LobbySnapshot` gains a `settings` field | Yes, but low-risk — `MatchSettings` is public lobby data by design, same tier as existing `ROOM_STATE` content |
| `apps/web` ↔ `apps/party` (protocol) | No change for signals/roster/burn-tracks/replay/spectator — all already-delivered `PlayerView` fields | N/A |
| `apps/party` ↔ `@berlin/engine` (`createMatch`) | `buildMatchConfig()` reads host-set values instead of literals | No — same `MatchSettings` shape, same `createMatch()` call |
| `@berlin/engine` content ↔ `apps/party`/`apps/ai`/sim | Two new map data files registered in `MAPS` | No — pure data, existing `getMap()`/`createMatch()` already map-agnostic |

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| Vercel | Standard Next.js 15 App Router deploy, pnpm workspace monorepo | Root Directory must be set to `apps/web`; workspace packages (`@berlin/shared`, `@berlin/engine`) must resolve during build |
| Cloudflare (via PartyKit) | Already live, unaffected by v1.1 | Only coupling is `NEXT_PUBLIC_PARTYKIT_HOST`, already documented |

---

## Suggested Build Order

This order is driven by three dependency facts established above, not by feature-list order:

1. **`apps/web` → Vercel deployment should land first, or at least in parallel with the very first phase.** Every other feature's UAT ("play a real match, watch the replay, use every card") is far more trustworthy against a real deployed URL than local `next dev` — and this item is the one that has silently blocked verification for all of v1.0 (`.planning/PROJECT.md`: "kept Phase 1's phase-gate checkpoint... from ever running, carried across all of v1.0"). It has no dependency on any other v1.1 feature (the `next.config.ts` webpack shim and the one env var are the only things to verify), so there's no reason to sequence it last again.

2. **Host settings (Feature 7) and maps (Feature 8) before the order-composer's multi-agent polish (part of Feature 1).** Established above: `agentsPerPlayer` is hardcoded to `1` today, which means the cross-agent Intel-preview bug in the composer is currently unobservable. Shipping the composer overhaul before settings exist risks looking correct in testing (1 agent, no cross-agent interaction possible) and then breaking the moment a host sets `agentsPerPlayer: 2` in production. Landing settings first (so `agentsPerPlayer: 2` and new maps are reachable) makes the composer's two-agent path testable as it's built, not after.

   Within this group: settings (protocol + `apps/party` work) has no dependency on maps; maps (pure content + one `buildMatchConfig()` call-site change) has no dependency on settings. They can proceed in parallel, but both should land before the composer's two-agent Intel work is verified end-to-end.

3. **Order composer completeness (every action/card, silencer purchase) next.** This is the largest single chunk of `apps/web` work and the one most directly blocking the milestone's stated core value ("every action and card usable"). It depends on nothing else in this list except the one new `packages/engine` cost-export, which is small and isolated. It should land before the animated replay, because the replay's own event stream (`ResolutionEvent[]`) is far more interesting to test once the composer can actually produce Wiretaps, Ambushes, Decoys, Strikes, and Bribes to replay — testing the replay against a composer that only ever produces `MOVE`/`HOLD` exercises a fraction of `filterEvents()`'s branches.

4. **Own-status panel, signals log, roster, everyone's Burn Tracks.** These are independent, additive, low-risk components with zero data gaps — they can be built any time after (or even alongside) the composer, in any order among themselves, and are good candidates for parallelization across multiple contributors/agents since none of them touch a shared file with each other (only `MatchIntelDrawer.tsx` is shared between the roster/burn-track work and existing history tabs, and that's a small, mechanical addition of a tab/selector).

5. **Animated map replay last among the gameplay features.** It has the highest design risk (the fog-safety anti-pattern above) and the most benefit from having a fully-featured composer already producing a rich variety of events to animate, plus the roster/signals surfaces already in place to cross-reference against ("who is this anonymous marker probably" reasoning a player does by combining the replay with the roster and signals log — those surfaces should exist first so the replay isn't the only source of truth being tested in isolation).

6. **Spectator polish and the visual redesign can run throughout, or last.** Spectator mode needs no new mechanism (Feature 6's finding: `apps/party` already treats an eliminated player like any other connected seat) — it's a presentation branch that becomes more meaningful once the roster/signals/replay surfaces exist to spectate *with*, so sequencing it after those (or concurrently, since it touches almost entirely different files) is reasonable. The visual redesign is the most parallelizable of all — it's a mechanical token-and-sweep exercise across nearly every component file, so it's better run as a dedicated pass **after** the functional features land (to avoid every functional-feature phase also having to hand-author "declassified dossier" styling for its own new components, only to have the redesign pass re-touch the same files days later) — or, if bandwidth allows, run as a rolling convention applied to each new component as it's built, provided the token set (Feature 9, step 1) is established first, before any new component is written.

**One sequencing constraint worth stating explicitly for the roadmapper:** Features 2–4, 6 (own-status, signals, roster, burn-tracks, spectator) have **no file overlap with the settings/maps work** and **no data dependency on the composer work** — they read `PlayerView` fields that exist today, unconditionally. If phase parallelization is available, this cluster is the safest to run fully in parallel with the settings/maps/composer track, since none of it can be broken by decisions made in that track.

---

## Sources

Every claim in this document is grounded in a direct read of the files listed below (this session), not inference from documentation alone, unless explicitly marked "per docs" or "per `CLAUDE.md`":

- `packages/shared/src/view.ts`, `orders.ts`, `settings.ts`, `protocol.ts`, `enums.ts`
- `packages/engine/src/legalOrders.ts`, `submitOrder.ts`, `costs.ts`, `cooldowns.ts`, `createMatch.ts`, `index.ts`, `graph.ts`
- `packages/engine/src/fog/projectView.ts`, `filterEvents.ts`, `visibility.ts`
- `packages/engine/src/resolution/arm.ts`
- `packages/engine/src/content/index.ts`, `content/maps/duel12.ts`, `content/CLAUDE.md`
- `packages/engine/tests/golden.test.ts`
- `packages/ai/sim/run.ts`, `sim/match.ts` (grep-confirmed), `packages/ai/CLAUDE.md`, `sim/CLAUDE.md`
- `apps/party/src/handlers.ts`, `room.ts`, `round.ts`, `broadcast.ts`, `bots.ts`, `state.ts`, `settings.ts`, `CLAUDE.md`
- `apps/web/app/match/[code]/page.tsx`, `next.config.ts`, `globals.css`
- `apps/web/components/orders/OrderComposer.tsx`, `ActionSlot.tsx`
- `apps/web/components/board/Board.tsx`, `AgentToken.tsx`, `CLAUDE.md`
- `apps/web/components/resolution/StepThrough.tsx`, `RoundHistoryPanel.tsx`
- `apps/web/components/intel/BurnTrackPanel.tsx`, `apps/web/components/match/MatchIntelDrawer.tsx`
- `apps/web/lib/orderDraft.ts`, `matchStore.ts`, `uiStore.ts`, `burnTrack.ts`, `format.ts`, `stepThrough.ts`
- `docs/ARCHITECTURE.md`, `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`
- Every `CLAUDE.md` in `apps/`, `packages/`, and their subdirectories (read via the environment's automatic context injection for files touched in this session)

---
*Architecture research for: Berlin 1988 v1.1 "Gameplay and UI Refinement"*
*Researched: 2026-09-14*

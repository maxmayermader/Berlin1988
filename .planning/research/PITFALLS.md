# Pitfalls Research

**Domain:** Realtime multiplayer hidden-movement game — adding a Next.js/PartyKit UI and networking layer on top of an existing pure, deterministic rules engine and AI system
**Researched:** 2026-08-18
**Confidence:** MEDIUM (domain patterns are well-established across realtime multiplayer and hidden-information games; PartyKit-specific findings are grounded in official docs; project-specific severity is inferred from this repo's own architecture and CONCERNS.md, not from live incident data)

This file builds on `.planning/codebase/CONCERNS.md`, which already flags fog-of-war leakage risk (PlayerView field additions), simultaneous-turn network delay, and untested real-time timing at the type/engine level. Everything below is scoped to the **new** risk surface this milestone introduces: wire-level transport, PartyKit room lifecycle, lobby coordination, and bot integration into a live network loop. Where a pitfall extends a CONCERNS.md item rather than duplicating it, that's called out explicitly.

## Critical Pitfalls

### Pitfall 1: Fog-of-war leaks at the wire, not just the type

**What goes wrong:**
CONCERNS.md already flags that `PlayerView` is structurally safe (positions/safehouses/traps cannot be represented in the type) and that a future field addition is the main residual risk. But the more common real-world failure mode for this exact game shape is orthogonal to the type system entirely: the server computes a correct, safe `PlayerView` per player, and then broadcasts the **same serialized message** — or the full authoritative `GameState` — to every connection in the room, trusting the client to filter or simply not render the hidden parts. PartyKit's `room.broadcast()` is a single call that sends one payload to every open connection; it is the path of least resistance for "just get it working," and it is exactly wrong for a hidden-movement game. Once the payload is on the wire, `PlayerView`'s type-level guarantees are worthless — anyone can open devtools' Network/WS tab and read every opponent's position for the rest of the match.

Related but distinct leak surfaces specific to this project:
- A debug/admin route (`apps/web` API route or a PartyKit debug message type) added during development to inspect full room state, left reachable in production.
- The round history/log and resolution-replay features (both in-scope for this milestone) persisting or transmitting one canonical event log instead of a per-viewer-filtered one — replays are exactly the kind of "nice to have, added late" feature that bypasses the projection boundary.
- Server-side logging (PartyKit `console.log` of full `GameState` for debugging) that ends up in a log aggregator or, worse, is echoed back over a debug websocket message in a non-production build that ships anyway.

**Why it happens:**
Broadcasting one message per event is the natural, simplest implementation of "tell everyone what happened," and PartyKit's API makes broadcast-to-all a single line of code, while per-connection sends require iterating connections and calling `projectView()` once per recipient. Under time pressure, "broadcast the event, let the client sort it out" ships and works in every manual playtest with one browser tab — because the developer testing it can already see their own state and doesn't notice the extra fields riding along.

**How to avoid:**
- Establish one hard rule at the start of the multiplayer phase: **the room never calls `broadcast()` with a payload derived from full `GameState`.** Every outbound message for game-state content is built by iterating live connections and calling `projectView(state, connectionPlayerId)` per recipient, even when the result happens to be identical for every player (e.g., a public settings-change message can broadcast, but anything touching round resolution cannot).
- Extend the existing fog-leak test pattern (`packages/engine/tests/fog-leak.test.ts`) one layer up: add an integration-level test in `apps/party` that spins up a room, submits orders for multiple simulated players, captures the literal bytes sent to each connection, and asserts no connection's payload contains another player's node ids/safehouse/trap data. This is the same assertion as the engine-level test, just moved to the transport boundary where the actual bug lives.
- Treat the round history/log and resolution-replay features as security-relevant from day one: they must be re-derived per viewer at request time (or stored per-viewer), never stored once and served to everyone.
- Strip or feature-flag-gate any debug/inspection endpoint before it's reachable from a deployed URL; do not rely on "we'll remove it later."

**Warning signs:**
- Any PR that introduces `room.broadcast(` in a resolution- or order-related code path without a per-connection loop around it.
- A network tab inspection (manual or scripted) during a 2+ tab local playtest showing any opponent's `nodeId`, `safehouseNodeId`, or trap data.
- A round-history or replay feature implemented as "store the `ResolutionEvent[]` once, serve it to whoever asks."

**Phase to address:**
The phase that stands up `apps/party` (room server / realtime multiplayer). This must be a design decision made before the first message type is wired, not a review comment after the fact — retrofitting per-connection filtering onto a broadcast-first message layer touches every message type.

---

### Pitfall 2: "Waiting for other players" reads as a hang because there is no feedback loop

**What goes wrong:**
CONCERNS.md already notes that a slow player's delay is the whole table's delay, and that the current mitigation is a 60-second timer with auto-Hold. That's a *server-side* mitigation for wasted time; it says nothing about what the *player* sees while waiting. In a simultaneous-secret-order game, every round has a phase where a player has locked in their orders and is now staring at a screen where nothing visibly changes for up to a minute, because — correctly — the UI must not reveal anything about what other players are doing. Without an explicit design for this window, the default outcome is a static screen with no progress signal, which is functionally indistinguishable from "the app is broken" to a first-time player. This is the single most common new-player drop-off point in simultaneous-turn digital adaptations of hidden-information games.

A second, narrower version of the same pitfall: conflating "waiting for humans to submit" (can legitimately take up to 60s) with "server computing resolution" (should be near-instant, since the engine is pure and fast per CONCERNS.md's own latency numbers). If both states render as the same generic spinner, a player can't tell whether they're waiting on a slow teammate or watching a stuck server, and will react to both the same way — refreshing the tab, which is exactly the action most likely to trigger a reconnection-race bug (Pitfall 3).

**Why it happens:**
The order-composer UI (submit orders, see a "submitted" state) is the natural focus of development effort because it's interactive and testable solo. The waiting state is the boring, non-interactive middle of the round and gets built last, minimally, or not at all — it's easy to defer as "just show a spinner" until a real multi-tab playtest surfaces how long and how ambiguous that spinner actually feels.

**How to avoid:**
- Design the waiting state as a first-class UI state, not a fallback: show a live count (e.g., "2 of 4 committed") without ever naming who or what they submitted — count-only information is safe to broadcast (it reveals nothing about content, only participation) and gives players a concrete signal that things are progressing.
- Visually and structurally separate three states: (1) composing orders, (2) waiting on other players (bounded by the round timer, countdown visible), (3) resolution playing back (bounded, fast, animated — this is the resolution-replay feature already planned for this milestone). State 3 should never look like state 2.
- Surface the round timer prominently during state 2 so "nothing is happening" reads as "there's still 47 seconds left," not "this might be stuck."
- Add a lightweight submission acknowledgment: when a player commits orders, the client should show a clear, distinct "locked in" confirmation state tied to a server ack, not just an optimistic local UI change — see Pitfall 2b below.

**Warning signs:**
- In manual multi-tab testing, a tester waiting on another tab to submit has no on-screen indication that anything is progressing.
- The "committed" and "resolving" visual states are the same component with no difference.
- Playtesters (per the "no real-time playtest" gap in CONCERNS.md) ask "is it stuck?" or refresh the tab during a normal wait.

**Phase to address:**
The in-match UI phase, in tandem with the multiplayer/realtime phase — the count-only broadcast message needs to exist in the protocol from the multiplayer phase, and the UI states need to be built against it in the UI phase. If these ship in different phases, sequence the protocol message first.

---

### Pitfall 2b: Silent submission failure — the player doesn't know their order didn't go through

**What goes wrong:**
A player composes orders and clicks submit. If the client updates to a "submitted" state optimistically, before the server has acknowledged receipt, then a dropped connection, a validation rejection (Zod schema failure on the server), or a race with a reconnect can leave the player believing they've locked in while the server never received anything. They find out only when the round times out and they're auto-Held — with no explanation of why, on a turn where they thought they'd made a real choice.

**Why it happens:**
Optimistic UI updates are the natural pattern for responsiveness, and in most web apps a failed request is recoverable and low-stakes. Here, a missed submission has a hard, visible consequence (auto-Hold, banked +1 Intel instead of the player's actual chosen actions) and no user-facing retry path is obvious once the round has moved past the composing phase.

**How to avoid:**
- The "locked in" UI state must be driven by a server acknowledgment message, not by the local act of clicking submit. Model it explicitly: `submitting → confirmed` or `submitting → rejected(reason)`, never just `submitted`.
- On rejection (schema validation failure, stale round number, disconnected mid-send), return the player to the composing state with a visible error, not a silent failure.
- On reconnect mid-round, the client must query "did my last submission for this round land?" and reconcile UI state to match server truth rather than trusting whatever was in local state before the disconnect.

**Warning signs:**
- Client code sets a "committed" flag directly in the submit handler instead of in a message handler keyed off a server response.
- No error UI exists for a rejected/failed order submission.

**Phase to address:**
Multiplayer/realtime phase (protocol: submit must have an explicit ack/reject response type) and in-match UI phase (state machine must consume it).

---

### Pitfall 3: PartyKit hibernation silently drops handlers attached in `onConnect`

**What goes wrong:**
PartyKit (via Cloudflare Durable Object hibernation) can put a room to sleep between messages to scale to many concurrent connections, and wakes it on the next incoming message. If event handlers or listeners are attached inside `onConnect` (e.g., `connection.addEventListener(...)` closures, or any per-connection state held only in memory outside PartyKit's own state/storage APIs), those attachments are lost the moment the room hibernates — the connection appears open to the client, but the server no longer reacts to it the way it did before hibernation. This is a documented, specific PartyKit gotcha, not a generic websocket issue: `onMessage`/`onClose` must be used instead of manual listener attachment in `onConnect`, and any state that must survive hibernation has to be explicitly persisted (PartyKit storage or an external store) rather than kept as in-memory closures.

For this project specifically, a match can sit idle for tens of seconds during the order-composing phase (up to the round timer) with no messages flowing — exactly the idle window where hibernation is most likely to kick in on a low-traffic room. A bug here would manifest as "reconnecting or slow players stop receiving updates after a quiet period," which is very close to indistinguishable from a network issue during manual testing.

**Why it happens:**
The naive/idiomatic-looking way to wire up a websocket handler is to attach listeners when the connection is created, which is exactly what `onConnect` looks like it's for. The hibernation behavior is an implementation detail of PartyKit's scaling model that isn't obvious from the connection lifecycle alone, and won't show up in local dev (hibernation is a production/scale behavior) — so it's easy to write code that works perfectly in `npm run dev` and breaks only in deployed, idle rooms.

**How to avoid:**
- Use only `onMessage(connection, message)` and `onClose(connection, ...)` as the source of truth for per-connection behavior; treat `onConnect` as setup-only (e.g., assigning a connection to a player, sending initial state), never as a place to attach custom listeners.
- Persist any state that must survive a hibernation cycle (room membership, current round, pending orders) via PartyKit storage/DO storage or an external store, not as an in-memory-only object — the pure `GameState` object is a natural fit to persist wholesale after every mutation, given it's already a small, serializable object per the engine's design.
- Explicitly test the idle-then-message path in staging: open a room, let it sit past whatever the platform's hibernation threshold is, then send a message and confirm the room still behaves correctly (state intact, connections still mapped to players).

**Warning signs:**
- Any `connection.addEventListener` or similar call inside `onConnect`.
- Game state held only as a class field on the room's Server instance with no corresponding write to storage.
- A match that works fine during active play but "loses" a player's connection after a long think-time round in deployed (not local) testing.

**Phase to address:**
The multiplayer/realtime phase, as a foundational implementation constraint on the room server — this needs to be right from the first line of `apps/party`, not discovered via a production bug report.

---

### Pitfall 4: Reconnection restores a stale or wrong-identity view

**What goes wrong:**
Two distinct bugs hide under "reconnection":
1. **Stale view on reconnect:** the room resends whatever `PlayerView` it last computed/cached for that player rather than recomputing fresh from current `GameState` at reconnect time. If anything changed while disconnected (a round resolved, an opponent moved, the player's own agent died), the reconnecting client renders old data until the next event arrives — confusing at best, actively wrong (e.g., showing an agent as alive when it isn't) at worst.
2. **Wrong-identity reconnect:** because this project has no accounts (anonymous play, local-storage-based identity per PROJECT.md), the mapping from "new websocket connection" to "which existing player seat is this" depends entirely on a client-held token/session id surviving the disconnect and being replayed on reconnect. If that binding is done by connection id instead of a stable per-player token, a page refresh creates what looks to the server like a brand-new player joining an already-full room — either rejected outright or, worse, silently given a spectator seat while the player's actual agents sit un-piloted for the rest of the match.

**Why it happens:**
Connection-based identity is what websocket frameworks hand you for free (`connection.id`), and it's tempting to use it directly as player identity because it "just works" for the happy path of one continuous session. The stale-view bug happens because it's cheaper to resend a cached last-broadcast payload than to recompute a fresh projection on every reconnect, and this cache-vs-fresh distinction isn't visible in a quick manual test where reconnection happens within the same second as the last game event.

**How to avoid:**
- Generate a stable per-player session token at lobby join time, store it client-side (consistent with the project's local-storage-based, account-free persistence model), and require it on every reconnect to rebind the new connection to the existing player seat — never trust connection id as identity.
- On every reconnect, recompute `projectView()` fresh from the room's current authoritative `GameState` and send that as the very first message on the new connection, before resuming normal event-driven updates.
- Decide and implement an explicit grace-period policy: how long can a player be disconnected before their seat is either auto-Held every round (consistent with the existing timeout mechanic) or converted to a bot/spectator takeover — and make this policy visible in the UI ("reconnecting... 23s left this round") rather than silent.

**Warning signs:**
- Player identity in the room's server code is keyed by `connection.id` anywhere outside connection bookkeeping.
- Reconnect handling sends `lastBroadcastMessage` instead of calling `projectView()` again.
- Manual test: refresh the browser tab mid-round and observe whether the player resumes their own seat or appears to join as someone new.

**Phase to address:**
Multiplayer/realtime phase — reconnection is explicitly called out as a Phase 5-equivalent deliverable in `plan.md` ("Done when: four browsers complete a match, one of them disconnecting and rejoining mid-round without desync"), so this pitfall maps directly onto that phase's own success criterion.

---

### Pitfall 5: Lobby readiness and seat state are read-then-write races, not atomic transitions

**What goes wrong:**
The lobby has several pieces of mutable, shared state that change from different triggers at overlapping times: join-code allocation, seat occupancy, per-seat ready flags, and the host-controlled game-size setting. Treating any of these as "read current state, compute new state, write it back" invites classic race conditions in a room server handling concurrent messages:
- **Join-code collision:** two lobbies created back-to-back generate the same short code if uniqueness is checked with a separate read-then-insert instead of an atomic check-and-reserve, especially likely if codes are short (for shareability) and the check is a simple "does this exist" lookup rather than a scoped, retried claim.
- **Kick during ready-up:** a host clicks "kick" on a player at the same moment that player's ready-toggle message is in flight, or at the same moment the ready-threshold (≥50% of filled seats, per PROJECT.md's decision) is crossed and a countdown starts. If the kick and the readiness recomputation aren't ordered through a single authoritative sequence per room, the room can end up starting a countdown for a seat that no longer exists, or leave a stale "ready" count that includes a just-kicked player.
- **Seat count changing mid-ready-up:** the host lowers game size while players are already seated and ready above the new cap. Without explicit handling, this either silently strands a displaced player in an inconsistent UI state or crashes the readiness calculation (e.g., dividing by a seat count that no longer matches occupancy).
- **Bot-fill timing in solo mode:** empty seats auto-fill with AI (PROJECT.md decision). If bots are assigned eagerly as soon as a seat is empty, rather than only at the moment the match actually locks and starts, a human joining in the last second before start can collide with a bot that's already been assigned that seat.

**Why it happens:**
Lobby state feels low-stakes compared to in-match state (it's "just" a waiting room), so it's a common place to reach for the simplest possible implementation — direct reads and writes against room state from each incoming message handler — without routing every mutation through one serialized, single-threaded authority. PartyKit's per-room Durable Object model actually makes this easy to get right (each room already processes messages one at a time), but only if every lobby mutation is implemented as a pure function over current room state rather than as scattered read-modify-write logic across multiple message handlers that can interleave in unexpected orders.

**How to avoid:**
- Scope join-code uniqueness to *active* lobbies only (not all-time), and generate-check-claim as a single retried operation (generate → attempt claim → on collision, regenerate and retry with a bounded attempt count) rather than a separate existence check followed by a later write.
- Model the lobby as one authoritative state object per room (seats, ready flags, host settings) and make every incoming lobby message (join, ready, kick, resize, leave) a pure transition function applied to that state in the order messages actually arrive at the room — since PartyKit rooms process messages sequentially, this ordering guarantee is free if you don't fight it by doing async work (DB calls, etc.) in the middle of a transition.
- Recompute the ready-threshold check after **every** state-changing event (join, leave, kick, ready-toggle, resize), not only after ready-toggle messages — kicking a player or resizing the lobby can change whether the threshold is currently met.
- Make match-start itself idempotent and guarded by a single "has this room already started" flag checked and set atomically within the same transition that triggers it, so a race between two events that both cross the readiness threshold can't start the match twice.
- Assign bot seats only at the match-start transition (solo mode), not eagerly when a seat becomes empty, so a late-joining human can always claim an open seat right up until start.

**Warning signs:**
- Join-code generation code does a `find` followed by a separate `create` call with no retry-on-conflict path.
- Kick, ready-toggle, and resize are handled by three independent code paths that each recompute "are we ready to start?" with their own copy of seat/ready state instead of one shared function.
- Manual test: rapidly kick a player right as they toggle ready, or resize the lobby while players are ready, and observe whether the UI reaches a state that doesn't match server reality.

**Phase to address:**
The lobby phase. This is squarely new-in-this-milestone functionality (PROJECT.md lists lobby join-code generation, kick, ready-up, and the ≥50% threshold all as Active/unbuilt requirements) with no existing engine precedent to lean on, so it needs its own explicit state-machine design rather than being treated as simple CRUD.

---

### Pitfall 6: Bots that think in milliseconds give themselves away — or worse, resolve the round before the timer even starts

**What goes wrong:**
`packages/ai` is validated at p99 <50ms per personality/difficulty (per CONCERNS.md and the AI docs' validation gates). Wired naively into a live multiplayer room, that means a bot seat can submit its orders within milliseconds of the round opening — before any human has had a chance to look at the board. Two distinct problems follow:
1. **Immersion/fairness:** an instant "3 of 4 committed" the moment the round starts, with the "3" always being the same seats, makes it trivial for players to infer which seats are bots purely from timing, undermining any design intent around bots feeling like people (`docs/AI_OPPONENTS.md`'s whole premise). `plan.md` itself already flags this exact concern as a deferred Phase 3 item: "Wire bot seats into the local match loop with padded think time."
2. **Correctness/timing coupling:** if bot decision-making is invoked synchronously in the same server tick that starts the round (e.g., directly inside the room's round-start handler, blocking on the AI call before returning), it risks either blocking the room's message loop for other concurrent work, or — depending on how "round ready to resolve" is computed — triggering premature resolution logic that wasn't written with the assumption that a bot's "submission" might arrive before the room has finished setting up the round's timer and state.

**Why it happens:**
The AI package was built and validated headless, where speed is a feature (sub-6ms/match sim throughput is explicitly a design goal for balance sweeps). Carrying that same "call the AI and use its answer immediately" pattern directly into the live room is the path of least resistance, and nothing about the AI package's own tests would catch the UX or timing problem — its validation gates are about decision quality and speed ceilings, not about deliberately slowing down for human-paced play.

**How to avoid:**
- Never let a bot's order submission land immediately upon round start. Schedule bot submission via the room's own timer mechanism (PartyKit alarms, consistent with how the round clock and auto-Hold timeout are already planned to work per `plan.md` Phase 5) with a randomized delay drawn from a plausible human-like distribution — long enough to not be instantly identifiable, short enough not to make bots the effective bottleneck every round, and varied by difficulty tier/personality if that's meaningful (matching the existing personality-differentiation design intent).
- Compute the bot's actual decision (the fast part, <50ms) whenever is convenient — even immediately at round start — but decouple *deciding* from *announcing/submitting*; hold the computed orders and release them to the room's order-collection logic only when the artificial delay elapses.
- Keep bot decision computation itself off the critical path of any message the room needs to respond to quickly — schedule it, don't block on it inline in a handler that other logic depends on completing first.
- Route bot "submissions" through the exact same order-validation and commit path a human's submission goes through (same Zod schema, same state transition), so there's no special-cased bot fast path that could diverge from human behavior in a way that reveals bots or introduces its own bugs.

**Warning signs:**
- Bot orders appear in the "N of M committed" count within the first second of a round, every round, consistently.
- Bot submission logic is called synchronously and its result used directly, with no scheduling/delay layer in between.
- No difficulty- or personality-based variation in how long a bot seat takes to "commit."

**Phase to address:**
The phase that wires AI into the live multiplayer loop (post-`apps/party` room server, likely alongside or just after the core multiplayer phase) — `plan.md` already anticipates this exact gap under Phase 3's deferred item and Phase 5's "mixed human/bot lobbies," so the roadmap should make explicit that "padded think time" and "route bots through the same commit path as humans" are acceptance criteria, not polish.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `room.broadcast(fullState)` instead of per-connection `projectView()` sends | Faster to build, works in single-tab dev testing | Silent fog-of-war leak reachable by anyone with devtools open | Never, for any message touching agent positions/orders/resolution |
| Caching player identity by websocket `connection.id` | No token/session plumbing needed | Every refresh/reconnect looks like a new player; breaks anonymous-play reconnection entirely | Never in this project, given the no-accounts, reconnect-required design |
| Bot orders submitted synchronously and instantly | Simplest possible AI wiring, reuses sim-harness call pattern as-is | Bots are trivially identifiable by timing; risk of round logic racing ahead of human think time | Never past an internal dev-only prototype |
| Lobby readiness computed inline in each message handler instead of one shared transition function | Fast to ship the first version of join/ready/kick | Race conditions between concurrent lobby events (kick vs. ready, resize vs. threshold) | Acceptable only for a throwaway spike, never for the shipped lobby |
| Skipping the reconnect-recompute-view step and resending last cached broadcast | Saves one `projectView()` call per reconnect | Reconnecting players see stale/wrong state, most visible exactly when it matters most (right after a disconnect) | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| PartyKit hibernation | Attaching listeners in `onConnect`; keeping game state only as in-memory server fields | Use `onMessage`/`onClose` exclusively for per-connection logic; persist `GameState` to PartyKit storage after every mutation |
| PartyKit `broadcast()` | Using it for anything derived from full `GameState` | Reserve `broadcast()` for genuinely public data (lobby settings, ready counts); loop connections + `projectView()` for anything else |
| Zod wire-protocol validation (already a flagged dependency risk in CONCERNS.md) | Trusting client-submitted order shape without server-side re-validation against current legal orders | Every inbound message re-validated with Zod *and* re-checked against `legalOrders()` computed server-side at receipt time, not just at UI composition time |
| AI package (`packages/ai`) wired into a live room | Calling it synchronously in the round-start handler and using the result immediately | Compute early, hold result, release via a scheduled/delayed submission through the same commit path as humans |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-connection `projectView()` recomputed from scratch on every single event even when unchanged | Wasted CPU per broadcast tick; likely fine at 2-4 players | Cache the last-computed view per connection and only recompute on state-changing events, not idle ticks | Not a concern at this project's stated 1-4 player, no-observers-yet scale; revisit only if spectator seats or larger lobbies are added |
| Bot decision + joint planning latency growing (already flagged in CONCERNS.md re: lookahead) colliding with the new artificial "think time" delay | Bots feel slow for the wrong reason (real computation) rather than the intended reason (deliberate pacing) | Keep the artificial delay separate from and larger than actual compute time; profile bot decision latency in the live room, not just the offline sim harness, once wired in | If/when Handler/Spymaster lookahead ships and pushes p99 close to the 50ms ceiling CONCERNS.md already flags |
| Full-room broadcast fan-out (32 messages/round at 4 players × 4 agents per CONCERNS.md's own estimate) unbatched | Message bursts at round resolution; unlikely to matter at 4 players but worth watching | Batch resolution events into a single per-connection payload per round rather than one message per event | Not a concern at 1-4 players; would matter if player/agent counts scale up later |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client-reported "my order" without server-side legality re-check | A modified client could submit illegal orders (moves to unreachable nodes, actions on cooldown) that the pure engine would reject if it ever saw them, but a naive room might accept and desync from a legitimate client's view | Server always recomputes `legalOrders()` from its own authoritative `GameState` and validates the submission against that, never trusting client-side legal-move UI as an enforcement layer |
| Host-only lobby actions (kick, resize, settings) enforced only in the client UI | Any player could send a "kick" or "resize" message directly over the wire, bypassing a UI that merely hides the button from non-hosts | Room server checks sender identity against the stored host player id for every host-gated message type, independent of what the UI allows |
| Debug/inspection tooling reachable in production | Full `GameState` dump exposed via an unguarded route | Gate any debug tooling behind a build-time flag stripped from production bundles, or don't ship it at all |
| Reconnect token predictability | If per-player session tokens are short, sequential, or otherwise guessable, another party could hijack a seat by guessing a token | Use a cryptographically random token of sufficient length generated at join time, stored client-side |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| No visible signal during the "waiting for other players" phase | Players think the app is frozen/broken; refresh, potentially triggering reconnect bugs | Count-only progress indicator + visible round timer, distinct from the resolution-playback state |
| Optimistic "submitted" UI not tied to server ack | Player believes their order landed when it didn't; discovers only via an unexplained auto-Hold | Server-ack-driven commit state with explicit error/retry path on rejection |
| Bots submitting instantly, every round | Breaks the illusion of AI-as-opponent, telegraphs which seats are bots | Scheduled, randomized bot submission delay through the same commit path as humans |
| Silent lobby state changes (kicked player gets no explanation, seat count changes without notice) | Confusing, feels arbitrary or buggy | Explicit, visible transition messaging for every lobby state change a player is affected by |
| Reconnection with no visible grace-period status | Disconnected player doesn't know if they're about to be auto-Held, timed out, or still has time | Show "reconnecting... Ns left this round" or equivalent status during the grace window |

## "Looks Done But Isn't" Checklist

- [ ] **Fog-of-war on the wire:** UI correctly hides opponent state, but verify with an actual network-tab/message-capture inspection (not just "the UI doesn't show it") that no hidden field is present in any message sent to that connection.
- [ ] **Reconnection:** "reconnect works" in a same-second manual test is not the same as reconnecting after a hibernation cycle or after a full round has resolved while disconnected — test both.
- [ ] **Lobby ready-up:** works fine in a manual single-tester click-through; verify with concurrent/rapid actions (kick during ready-toggle, resize during ready-up) before considering it done.
- [ ] **Bot integration:** "bots play" is not the same as "bots play at a pace and through a path indistinguishable from a human seat" — verify submission timing and that bots go through the same validation/commit path.
- [ ] **Round timer / auto-Hold:** verify the UI actually communicates *why* an auto-Hold happened when it does (not just that it happened), especially when the cause was a failed submission rather than genuine inaction.
- [ ] **Join-code generation:** works fine at low volume in dev; verify the collision-retry path actually exists and is exercised (e.g., with a temporarily-shrunk code space in a test) rather than assumed.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|-----------------|
| Fog-of-war leak found in production (wire-level) | HIGH | Immediately patch the offending broadcast to per-connection filtering; audit all other message types for the same pattern (it's rarely isolated to one message type once found); assume any leaked match data is compromised for that match — no retroactive fix for players who already saw it |
| Lobby race condition causing duplicate match-start or stuck readiness | MEDIUM | Add the missing atomicity guard (idempotent start flag, shared transition function); affected in-flight lobbies may need a manual "reset lobby" escape hatch for players stuck in a bad state |
| Bots identified by timing / feel robotic | LOW | Retrofit a delay/jitter layer between decision and submission; no architectural change needed since decision and submission were already (or should already be) decoupled |
| Reconnection returns stale/wrong state | MEDIUM | Force a fresh `projectView()` computation on every reconnect going forward; for already-reported confusion, a manual "resync" client action (re-request full current view) is a reasonable stopgap while the root cause is fixed |
| Hibernation-lost listeners causing dead connections | MEDIUM | Migrate all per-connection logic out of `onConnect` into `onMessage`/`onClose`; requires touching every connection-lifecycle code path in the room, so budget for a focused pass rather than a quick patch |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Wire-level fog-of-war leakage | Realtime/multiplayer room server phase (`apps/party` stand-up) | Transport-level integration test capturing literal per-connection payloads across a multi-player simulated match, asserting no cross-player hidden data |
| "Waiting for other players" reads as a hang | In-match UI phase, paired with the multiplayer phase for the count-only protocol message | Multi-tab manual playtest explicitly checking for a visible progress signal during a full round timer window |
| Silent submission failure | Multiplayer phase (protocol ack/reject) + in-match UI phase (state machine) | Simulate a rejected submission (bad schema, stale round) and confirm the UI surfaces it rather than showing false "committed" |
| PartyKit hibernation dropping handlers | Multiplayer/realtime phase, as a foundational room-server constraint | Deployed (not local-dev) idle-then-message test against a real room past the hibernation threshold |
| Reconnection stale/wrong-identity view | Multiplayer/realtime phase | The project's own stated Phase 5 success criterion: four browsers complete a match with one disconnecting/rejoining mid-round without desync |
| Lobby race conditions (join code, kick, resize, ready threshold) | Lobby phase | Concurrent/adversarial manual or scripted test: rapid kick-during-ready, resize-during-ready-up, simultaneous lobby creation for code collision |
| Bots trivially identifiable by instant/synchronous submission | AI-into-live-loop integration phase (post room server) | Timing measurement in a live room: bot seats never commit within an unrealistically short window, and route through the same commit path as humans |

## Sources

- [Scaling PartyKit servers with Hibernation](https://docs.partykit.io/guides/scaling-partykit-servers-with-hibernation/) — official docs, MEDIUM/HIGH confidence: source of the `onConnect` listener-loss and state-persistence findings (Pitfall 3)
- [Party.Server — New API for a programmable primitive](https://blog.partykit.io/posts/partyserver-api/) — official PartyKit blog, MEDIUM confidence: `onConnect`/`onMessage`/`onClose` lifecycle semantics
- [boardgame.io secret-state.md](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/secret-state.md) and [Issue #399 — PlayerView.STRIP_SECRETS leak via ctx._undo/_initial](https://github.com/boardgameio/boardgame.io/issues/399) — official docs + real reported bug in a directly comparable "authoritative server + per-player filtered view" framework, MEDIUM confidence: informs the "leak can hide in an adjacent feature like history/replay/undo, not just the primary state object" pattern behind Pitfall 1
- [How to design a join code system (thoughtbot)](https://thoughtbot.com/blog/join-code-system-design) — engineering blog, LOW/MEDIUM confidence: scoped-uniqueness and retry-on-collision pattern behind Pitfall 5's join-code guidance
- [WebSocket Reconnection: State Sync and Recovery Guide](https://websocket.org/guides/reconnection/) and [AccelByte Lobby WebSocket Recovery](https://docs.accelbyte.io/gaming-services/knowledge-base/graceful-disruption-handling/lobby-websocket-recovery/) — LOW/MEDIUM confidence: general reconnection-window and outbound-buffer patterns informing Pitfall 4
- [Simultaneous action selection (Wikipedia)](https://en.wikipedia.org/wiki/Simultaneous_action_selection) — LOW confidence, background only: confirms "secret yet binding" simultaneous commit as the standard mechanic this project already implements at the engine level; UI-specific waiting-state guidance was not well covered by available sources and is synthesized from general realtime-UX reasoning plus this project's own architecture (see Pitfall 2's confidence note)
- General web-search synthesis on AI bot timing/delay in multiplayer games (TechRound, gamedesigning.org search results) — LOW confidence, directional only: corroborates that artificial delay is a standard technique for bot believability, informing Pitfall 6
- `.planning/codebase/CONCERNS.md` and `plan.md` (this repository) — HIGH confidence, primary source: existing project-specific risk register this file extends rather than duplicates

---
*Pitfalls research for: realtime multiplayer hidden-movement web game (Berlin 1988), UI/realtime milestone*
*Researched: 2026-08-18*

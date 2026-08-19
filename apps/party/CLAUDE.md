# apps/party

The PartyKit room server — the authoritative host for a live match. One Cloudflare Durable Object per match.

## Why this exists

Vercel's serverless functions can't hold a WebSocket open, and a hidden-information game needs a stateful authority that holds secrets no client is allowed to see. A Durable Object is exactly that: a single-threaded, stateful object with a stable identity, one per match. And because PartyKit runs TypeScript, it imports the same `@berlin/engine` as the browser — no second rules implementation.

## Responsibilities

- Own the **only full `GameState`** in the entire system
- Hold the lobby: host settings, seat assignment, bot personalities, loadout submission
- Accept and validate orders; hold them secret until every agent has committed
- Call `resolveRound` when the round closes, then send each seat its own projected view
- Run bot seats via `@berlin/ai`, deciding once per agent
- Enforce the round clock with Durable Object alarms; **auto-Hold** absent players
- Run the **unanimous pause poll**
- Handle reconnection by snapshot, and spectator seats for eliminated players
- From Phase 6: checkpoint to and hydrate from Postgres

## Rules

1. **`projectView` is the only send path.** Every outbound message is built from a `PlayerView`. If a code path serializes anything else toward a client, it's a bug. Remember that safehouses, traps, and cooldowns are hidden state too — not just agent positions.
2. **Validate every inbound message with Zod before it reaches the engine.** Clients are untrusted, including your own. Host-only messages are checked against the seat, not the payload.
3. **Orders stay sealed until every agent commits.** `OPPONENT_COMMITTED` reports a count, never content — and timing and message size must not leak it either.
4. **The room owns time; the engine never does.** Deadlines, alarms, pause state, and bot think-time padding live here. Anything time-based enters the engine as an explicit action.
5. **Bots get `projectView` output, same as humans.** Never hand an `AIAgent` the `GameState` — the types forbid it, and that's deliberate.

Protocol details in `docs/ARCHITECTURE.md` §5.

# apps/party/src

Implementation of the match room.

## Expected files

| File | Role |
| :--- | :--- |
| `room.ts` | The PartyKit `Server` class. Connection lifecycle, message routing, the authoritative `GameState` |
| `handlers.ts` | One handler per inbound message type — `JOIN`, `SET_SETTINGS`, `SET_SEAT`, `SUBMIT_LOADOUT`, `SUBMIT_ORDER`, `RETRACT_ORDER`, `REQUEST_PAUSE`, `ANSWER_PAUSE` |
| `broadcast.ts` | **The only outbound path.** Projects a view per connection and sends it |
| `bots.ts` | Bot seats: builds agents from `@berlin/ai`, decides per agent on round close, pads think time to 1.5–4s 🔧, auto-accepts pauses |
| `timers.ts` | Durable Object alarms for round deadlines; **auto-Hold** on expiry |
| `pause.ts` | The unanimous-consent pause poll and clock suspension |
| `settings.ts` | Host-only lobby settings; validation and lock-on-start |
| `persistence.ts` | Postgres checkpoint/hydrate (Phase 6) |
| `auth.ts` | Player token validation — which connection owns which seat |

## Rules

1. **`broadcast.ts` is a chokepoint, and that's the point.** Every message to a client goes through it, and it calls `projectView` per recipient. Never `send()` from a handler directly — one bypass undoes the entire fog model.
2. **A connection is bound to exactly one seat, verified by token on `JOIN`.** Never trust a `playerId` from the message body.
3. **Round close is the only place `resolveRound` is called**, and it happens when every **agent** has committed its two actions *or* the alarm fires — never on a client's say-so. Note the unit: a player with 2 agents commits twice.
4. **Pause requires unanimity, enforced here.** `REQUEST_PAUSE` opens a poll; the alarm is suspended only after every live human seat accepts. One decline resumes immediately. A client that could stop the clock alone is a griefing vector, so never trust a client-side pause state.
5. **Host-only messages are verified against the seat that owns the room**, not against a flag in the message body. Settings lock when the match starts.
6. **Timeout is auto-Hold, not auto-forfeit.** Unsubmitted agents bank their actions and the +1 Intel each. A player who steps away loses tempo, not the match.
7. **Bot think-time is padded deliberately.** An instant response tells the human the decision was easy. Pad to a plausible range regardless of actual compute.
8. **Durable Objects are single-threaded**, so no locking is needed — but `await` points are still interleaving points. Don't leave state half-updated across one. Bot decisions are awaited, so a human's late submission can land mid-loop.
9. **All randomness is the engine's seeded PRNG.** No `Math.random()` here either; a match must replay identically from its seed.

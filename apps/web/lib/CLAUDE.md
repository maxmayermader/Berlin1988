# apps/web/lib

Client-side plumbing. Everything that isn't a React component: the socket connection, stores, hooks, and formatting.

## Expected files

| File | Role |
| :--- | :--- |
| `socket.ts` | PartyKit connection via `partysocket`. Reconnect, message dispatch, Zod-parse inbound |
| `matchStore.ts` | Zustand store holding the current `PlayerView` and pending per-agent orders |
| `uiStore.ts` | Selected agent, the two pending action slots, hover target, replay scrub position, theme |
| `clock.ts` | Renders the round timer from the server's `deadlineAt`; drives the pause request/poll flow |
| `localMatch.ts` | Runs a match entirely in-browser against `@berlin/ai` — solo mode with no server |
| `useLegalOrders.ts` | Hook wrapping `engine.legalOrders(view)` for order previews |
| `format.ts` | Signal and event text for the log and for screen readers |
| `theme.ts` | Theme token switching (CRT / high-contrast) |

## Rules

1. **`socket.ts` is the only place that touches the network.** One inbound path, Zod-validated. A malformed or unexpected message is dropped and logged, never trusted.
2. **The store holds a `PlayerView`.** Do not build a client-side mirror of `GameState` — the whole security model rests on that state not existing here.
3. **Local solo mode is the exception that proves the rule.** `localMatch.ts` holds a real `GameState` because there's no server and no opponent to hide it from. It must still call `projectView` before anything reaches a component, so the UI code path is identical to multiplayer. Never let a component read `GameState` directly, even in solo.
4. **Optimistic order preview is advisory.** When the server disagrees, the server wins and the store reconciles without a page reload.
5. **The clock is server-authoritative.** Derive the countdown from `deadlineAt`, never from a local interval that drifts across a tab suspend. Pause is a request the room grants — a client that can stop its own clock is a griefing vector.
5. Keep `format.ts` as the single source of human-readable event text — the visual log and the screen-reader announcement should never drift apart.

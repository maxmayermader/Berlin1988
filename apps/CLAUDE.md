# apps/

Deployable applications. These are the only places in the repo allowed to touch the network, the DOM, a clock, or a database.

| App | Runs on | Role |
| :--- | :--- | :--- |
| `web/` | Vercel | Next.js — board UI, lobby, deckbuilder, matchmaking |
| `party/` | Cloudflare (via PartyKit) | Authoritative match host, one Durable Object per match |

Two hosts because Vercel's serverless functions can't hold a WebSocket open. Both are TypeScript and both import the same `@berlin/engine`, so there's no duplicated rules implementation — see `docs/ARCHITECTURE.md` §1.

## Division of authority

**`party/` is the authority.** It holds the only full `GameState` in the system and is the only thing that may call `resolveRound`.

**`web/` is a view.** It holds a `PlayerView` and imports the engine solely to preview legality — greying out illegal orders, showing Intel costs, highlighting movement range. Those predictions are never authoritative; the room's answer always wins.

## Rules

- Apps may import from `packages/`. Nothing in `packages/` may import from here.
- All inbound client messages are Zod-validated at the room boundary before touching the engine.
- The only environment coupling between the two is `NEXT_PUBLIC_PARTYKIT_HOST`.

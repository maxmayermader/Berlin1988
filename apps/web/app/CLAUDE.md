# apps/web/app

Next.js App Router — routes, layouts, and server-side data loading.

## Expected routes

| Route | Rendering | Purpose |
| :--- | :--- | :--- |
| `/` | RSC | Landing, mode select |
| `/play/solo` | Client | Solo setup: personality + difficulty picker, then a local match |
| `/play/[matchId]` | Client | The live board. Connects to a PartyKit room |
| `/lobby/[matchId]` | Client | Host settings (agent count, timer, blockades, round limit), seat assignment, ready-up, invite link, bot fill |
| `/deck` | Mixed | Loadout builder with live constraint validation |
| `/replay/[matchId]` | Client | Replay viewer over a stored `(seed, orders)` |
| `/api/match` | Route handler | Create a match, mint player tokens |

`layout.tsx` holds the theme provider and global CRT frame; `globals.css` holds the Tailwind v4 token definitions.

## Rules

- **Default to Server Components.** Only the board, lobby, and deckbuilder genuinely need to be client components — menus and static pages shouldn't ship JS.
- **Match state never comes from an RSC.** It arrives over the socket as a `PlayerView`. Server components handle lobby metadata, profiles, and content; they don't touch live game state.
- **Player tokens are opaque and server-minted.** A client must never be able to guess or forge another seat's token — that would be a fog-of-war bypass around every other precaution in the codebase.
- **Host authority is checked in the room, not here.** The lobby UI may hide settings from non-hosts; that's cosmetic. The room verifies the seat on every `SET_SETTINGS`.
- Keep route files thin. Logic belongs in `components/` and `lib/`.

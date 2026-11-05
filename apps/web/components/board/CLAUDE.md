# apps/web/components/board

The SVG map of Berlin and the resolution replay. The centrepiece of the game.

## Expected files

| File | Role |
| :--- | :--- |
| `Board.tsx` | The SVG viewport. Fits its viewBox to the map's own node extents and stacks every layer below |
| `BoardDefs.tsx` | Shared `<defs>`: one hatch pattern per sector, the sheet grid, arrowheads |
| `Territory.tsx` | Voronoi district shading per sector (colour **and** hatch) and the Wall around East Berlin — public geometry only |
| `MapNode.tsx` | One node: sector silhouette, label, fog state (faded when out of sight), informant/dossier/extraction markers, **blockade overlay** and announced closures |
| `MapEdge.tsx` | One edge, styled by type — street (cased road), tunnel (dashed green arc), checkpoint (double line with a barrier) |
| `AgentToken.tsx` | Your agents (1 or 2, numbered pins in your faction's ink); a burned pin stays struck out until the replay ends |
| `OwnAssets.tsx` | Your safehouse, your live ambushes and decoys. Yours only — nobody else's is ever in the data |
| `PlanOverlay.tsx` | ORDER-08: your composed orders as pencil routes (draft) or inked routes (locked by the room) |
| `TargetOverlay.tsx` | Legal-target highlighting while composing an order — rings for moves, reticles for strikes |
| `BeatOverlay.tsx` | The replay beat on the map: rings, arrow and stamped word for the one event being shown |

The replay's controls and prose live in `components/resolution/StepThrough.tsx`; its beat model is `lib/replay.ts`.

## Why SVG and not canvas

Eighteen nodes. Canvas or WebGL would buy nothing and cost accessibility, styling, and hit-testing. SVG elements are focusable, screen-reader-addressable, and themeable with CSS variables.

## Rules

1. **Layout comes entirely from map data.** `x`/`y` are percentages in the map definition. A new map must render correctly with zero changes in this folder — if it doesn't, something is hardcoded that shouldn't be.
2. **Fog is rendered as absence, not as hidden elements.** Never put a rival's position, safehouse, or trap in the DOM with `display: none` — inspect-element is the oldest cheat there is. The data isn't in the `PlayerView` to begin with; keep it that way in the markup.
3. **The replay is a teaching tool.** ~700ms 🔧 per beat, ordered by the resolution pipeline (movement → trap triggers → blockades → scans → strikes → contested nodes → objectives) so the priority rules become intuitive by watching. It should read like a story, not a diff.
   Two beats need special care: a **contested-node roll** must show the die, not just the result — a player who loses a 50/50 needs to see it was a 50/50 — and a **blockade** should land as an event with weight, since it kills agents outright.
4. **`prefers-reduced-motion` cuts between beats** rather than tweening. The replay still runs — the information is the point, the animation is the delivery.
5. **Keyboard navigation is a requirement.** Arrow keys traverse adjacent nodes, Enter targets. The whole game must be playable without a mouse.

# apps/web/components

React components. Presentational and interaction logic; no network calls (those live in `lib/`).

## Expected structure

| Path | Contents |
| :--- | :--- |
| `board/` | The SVG map and everything on it — see its own CLAUDE.md |
| `orders/` | Order composer: agent switcher, **two action slots per agent**, op picker, target selector, Intel and cooldown preview, commit |
| `hud/` | Intel meter, round counter, **round clock and pause control**, commit status of other players, victory progress |
| `intel/` | Burn Track panels (all players **including your own**), signals log, informant reports, passive-card status, silencer stock |
| `deck/` | Loadout builder: card grid, actives/passives balance readout, constraint validator, archetype presets |
| `lobby/` | **Host settings panel** (agent count, timer, blockades, round limit), seat list, ready toggles, bot personality picker, invite link |
| `ui/` | Primitives — button, panel, tooltip, dialog, CRT frame |

## Rules

- **Components render a `PlayerView`.** No component should ever receive an opponent's agent position, safehouse, or trap, because no `PlayerView` contains them. If a prop type would allow it, the type is wrong.
- **Your own Burn Track is shown exactly as opponents see it** (`docs/GAME_DESIGN.md` §6.3) — same component, same redaction, no owner-only extras. Players are meant to be able to audit their own tells.
- **Two agents is the default, one is a setting.** Every board and order component takes a list of agents, never a singleton. Hardcoding one agent is the easiest way to make the 2-agent path an afterthought.
- **Server truth vs. optimistic preview stays visually distinct.** A locally previewed legal move and a server-confirmed result must not look identical — players need to know what's real.
- **Nothing here fetches.** Socket access and stores live in `lib/`; components take props and callbacks.
- **Sector color is never the only signal.** Every component encoding a sector also encodes shape or pattern.
- Primitives in `ui/` stay game-agnostic — no imports from `@berlin/engine`.

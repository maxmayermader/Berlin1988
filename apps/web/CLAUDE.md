# apps/web

The Next.js 15 app (App Router) — everything a player sees. Deploys to Vercel.

## Stack

Next.js 15 · React 19 · Tailwind CSS v4 · Motion · Zustand · inline SVG for the board · `partysocket` for the room connection.

## Layout

```
app/         Routes (App Router). RSC for menus/lobby, client components for the board
components/  React components; components/board/ holds the SVG map
lib/         Client-side plumbing: socket, stores, hooks, formatting
```

## Rules

1. **The client holds a `PlayerView`, never a `GameState`.** Anything else is a fog-of-war leak. If a component wants opponent data that isn't in the view, the answer is almost always "the player isn't entitled to it." Rival **safehouses and traps** are hidden state just as much as positions are.
2. **Engine calls here are predictive only.** Import `@berlin/engine` for `legalOrders` and cost previews so the UI feels instant. The room is the authority; when its answer differs, it wins and the UI reconciles.
3. **Board rendering is data-driven.** Node positions come from the map's `x`/`y` percentages. Adding a map must never require editing a component.
4. **Accessibility isn't traded away for the CRT aesthetic.** The phosphor-green look is a token set with a high-contrast alternative shipping alongside it. Sector is *never* encoded by color alone — every sector also carries a distinct shape and pattern. The board is keyboard-navigable and every signal has a text form. Motion respects `prefers-reduced-motion`.
5. **Zustand holds session and UI state only** — the selected agent, the two pending action slots, hover target, replay scrub position. Game state comes from the server; don't mirror it.
6. **The clock is server-authoritative.** Render from the `CLOCK` message's `deadlineAt`, never from a local countdown that drifts. Pause is a request the room grants, not a local state you set.

## The screen that matters most

The **resolution replay** (`components/board/`). Simultaneous turns are the game's central mechanic and also its steepest onboarding cliff — players learn how the game works by watching this animation. It gets disproportionate design attention. See `docs/ARCHITECTURE.md` §9.

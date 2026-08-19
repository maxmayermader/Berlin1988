# Berlin 1988

A 1–4 player Cold War hidden-movement game. Node-graph map of divided Berlin, simultaneous secret orders, 1–2 agents per player, 10-card loadouts of reusable abilities and passive insurance, and AI opponents with distinct personalities. Web app, TypeScript throughout, hosted on Vercel.

**Status:** engine and AI complete and green (Phases 0, 1, 3 — 69 tests). `packages/shared`, `packages/engine` and `packages/ai` are implemented and tested; `apps/` is still a skeleton. Phase 2 (the browser UI) is next.

## Read these in order

| Doc | What it answers |
| :--- | :--- |
| `docs/GAME_DESIGN.md` | The rules. Start here — nothing else makes sense first |
| `docs/ARCHITECTURE.md` | Tech stack, package boundaries, engine contract, protocol |
| `docs/AI_OPPONENTS.md` | How the bots think; personalities and difficulty tiers |
| `plan.md` | Phased build order and risk register |
| `game_specs.md` | Superseded v1 draft, kept for history. Do not build from it |

## The rules in one paragraph

Each player fields 1 or 2 hidden agents (host's choice) on a node graph. Every round, all players secretly assign **2 actions per agent**, then everything resolves simultaneously in a fixed, published priority order. Actions are free moves, Intel-funded Sprints, or plays from a **10-card loadout** of reusable active abilities and single-use passive insurance. Killing is easy and loud: strike a node and anyone there dies, but adjacent agents learn exactly where you are. Ambush traps kill quietly but must be set in advance. **Agents never respawn.** Contested ground is decided by who owns the safehouse there — and a safehouse is the one secret that never moves. From round 7 the city starts sealing nodes at random, and anyone caught inside is gone. Win by extracting 3 dossiers, eliminating everyone, or leading on score at round 14.

## Layout

```
apps/web/       Next.js app — UI, lobby, deckbuilder
apps/party/     PartyKit room server — authoritative match host
packages/shared/  Types + wire protocol. Zero dependencies
packages/engine/  Pure rules engine. No I/O, no React, no network
packages/ai/      Bot opponents. Consumes PlayerView, emits Orders
docs/           Design documentation
```

Every folder has its own `CLAUDE.md` describing what belongs in it.

## Rules that hold everywhere in this repo

1. **Dependencies flow one way:** `shared ← engine ← ai ← apps`. An import going the other direction is a build error, not a style preference.
2. **The engine is pure.** No `Math.random()`, no `Date.now()`, no fetch, no logging anywhere below `apps/`. All randomness comes from the seeded PRNG inside `GameState`. This is what makes replays, golden tests, and reproducible bug reports possible.
3. **Fog of war is a type boundary.** The full `GameState` lives only inside the PartyKit room. Everything sent to a client goes through `projectView()`. `PlayerView` has no field capable of holding another player's **agent positions, safehouse, traps, or cooldowns** — all four are hidden state, and only the first is obvious.
4. **Bots don't cheat.** An `AIAgent` receives `PlayerView` and nothing else. Difficulty degrades the bot's *inference*, never its information.
5. **Content is data, not code.** Cards, maps, and rulesets are data files the sim harness can sweep over.

## Conventions

- TypeScript `strict: true`. Prefer `type` for unions, `interface` for object shapes.
- Biome for lint and format — not ESLint/Prettier.
- Tests live beside what they test in `apps/`, and in `packages/*/tests/` for packages.
- Numbers marked 🔧 in the docs are tuning targets, not commitments. Change them in the ruleset object, never inline.

## Commands

```bash
pnpm test
```

```bash
pnpm typecheck
```

Run the balance harness (bot-vs-bot, ~6ms/match). Every balance claim in the
docs is a hypothesis until this confirms it:

```bash
pnpm sim --matches 300 --profile
```

Regenerate golden replay fixtures after an intentional rules change — read the
diff before committing it:

```bash
UPDATE_GOLDEN=1 pnpm test golden
```

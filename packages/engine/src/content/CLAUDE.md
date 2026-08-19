# packages/engine/src/content

Game content as **data, not code**. Cards, maps, and rulesets live here so the simulation harness can sweep over them without touching logic.

## Expected files

| File | Contents |
| :--- | :--- |
| `cards/actives.ts` | The six operations in four colors — reusable all match, each with Intel cost, **cooldown**, Budget Point cost, and effect id |
| `cards/passives.ts` | The passive catalogue (`docs/GAME_DESIGN.md` §6.2) — trigger condition, effect id, and whether it's **consumed** or permanent |
| `maps/duel-12.ts` | 12-node map for solo and 1v1 |
| `maps/ffa-16.ts` | 16-node map for 3 players |
| `maps/ffa-18.ts` | 18-node map for 4 players and 2v2 |
| `rulesets.ts` | Named tunable parameter sets. `DEFAULT` plus experimental variants for balance sweeps |
| `settings.ts` | `MatchSettings` defaults and validation — the host's lobby options (`docs/GAME_DESIGN.md` §2), including agent count, timer, pause allowance, and blockade mode |
| `loadouts.ts` | The four starter loadouts (Phantom, Hunter, Oligarch, Spider) and the bots' personality loadouts |

## Rules

- **Data files contain no branching logic.** A card declares *what* it does via an effect id; `../resolution/` decides *how*. If a card needs behaviour no effect id covers, add the effect to the resolution pipeline rather than smuggling a function in here.
- **Every tunable number lives in `rulesets.ts`.** Strike cost and cooldown, Intel income, ambush cost and duration, blockade start round and frequency, Budget Point ceiling, intercept pool width, round limit — the seven levers in `docs/GAME_DESIGN.md` §13. A magic number in a resolution module is a bug: the sim harness can't sweep it.
- **Cooldowns are card properties, not hardcoded rules.** They're the only brake on reusable actives, so they will move constantly during balance work.
- **Passive Budget Point costs are the actives-vs-insurance dial.** Price them too low and every loadout carries four passives; too high and nobody survives an ambush. *Kontrolle Schedule* should be the most expensive passive in the game 🔧 — it converts the match's main random element into private information.
- **Maps are pure data.** `x`/`y` are percentages so the SVG board renders any map without code changes. Adding a map should never require touching `apps/web`.
- Card Budget Point costs are the main deck-balance lever. Expect them to move a lot during Phase 4 — keep them in one table, not scattered across card definitions.

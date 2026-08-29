# packages/ai/sim

Headless simulation harness. Runs bot-vs-bot matches by the thousand to answer balance and AI-quality questions with numbers instead of opinions.

This is the tool that decides whether the design in `docs/GAME_DESIGN.md` actually works. Every balance claim in the docs is a hypothesis until it runs through here.

## Expected files

| File | Role |
| :--- | :--- |
| `run.ts` | CLI entry: `pnpm sim --matches 10000 --ruleset default --mode ffa4` |
| `match.ts` | Plays one headless match to completion, returns a result record |
| `sweep.ts` | Runs a matrix of rulesets/loadouts/personalities and diffs the outcomes |
| `report.ts` | Aggregates results to CSV/JSON: win rates, match length, Strike hit rate, Intel curves, action histograms |
| `validate.ts` | The AI gating suite from `docs/AI_OPPONENTS.md` §5 |

## What it answers

**Balance:** Does any loadout win more than 58% 🔧 against the field? Do matches end by extraction, elimination, or the round limit — and is that mix what we intended? What does a ±1 change to Intel income do to match length?

**The first question to answer, before any content work:** *do reusable strikes plus permanent death end matches in six rounds?* Actives are reusable all match and burned agents never come back, so Strike's Intel cost and cooldown are the only brakes in the system. Sweep that pair first — it's the one v3 change with no earlier draft to reason from, and if it's wrong, everything built on top of it is wasted.

**Also unresolved:** whether ambushes should cost an action (`docs/GAME_DESIGN.md` §12.1), and whether 1-agent free-for-all benches players so early that the mode isn't worth shipping.

**AI quality:** Are the five personalities statistically distinguishable? Does each difficulty tier beat the one below it? Is every documented tell actually exploitable? Is p99 decision time under 50ms? Do bots avoid announced blockades and rival safehouses at Field Agent and above?

**Every sweep runs at both 1 and 2 agents.** Agent count is a host setting, both are supported, and a balance result that only holds at one of them isn't a result.

## Rules

- **Fully deterministic.** Every run takes a master seed and is reproducible. A surprising result must be re-runnable with one command.
- **No UI, no network, no I/O in the hot loop.** Write results at the end. A 10k-match sweep should finish in seconds.
- **Sweeps vary the ruleset object, never the code.** If a parameter can't be swept, it's hardcoded somewhere it shouldn't be — fix that in `engine/src/content/rulesets.ts` instead of special-casing here.
- **Check results in when they inform a decision.** A committed report explaining why Strike costs 4 is worth more than the number alone.

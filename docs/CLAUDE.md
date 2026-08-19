# docs/

Design documentation. These are the source of truth for *what* Berlin 1988 is; the code is the source of truth for what it currently does.

| File | Contents |
| :--- | :--- |
| `GAME_DESIGN.md` | Complete rules: map, ops, loadouts, round structure, resolution priority, modes, victory conditions, balance levers |
| `ARCHITECTURE.md` | Tech decision (Next.js over Python, with reasoning), package boundaries, engine contract, fog boundary, realtime protocol, testing strategy, deployment |
| `AI_OPPONENTS.md` | Bot architecture (particle filter → scoring → selection), five personalities, four difficulty tiers, validation requirements |

## Working in here

- **Design changes land here first, then in code.** A rule that exists only in an implementation is a bug waiting to be "fixed" by someone reading these docs.
- **Numbers marked 🔧 are tuning targets.** They belong in the engine's ruleset object so the sim harness can sweep them. Don't hardcode them into logic.
- **Balance claims are hypotheses** until `packages/ai/sim` confirms them. Write them as such.
- Keep the "why" for rejected designs. `ARCHITECTURE.md` §1 explains why not Python and `GAME_DESIGN.md` §5.3 explains why the live reaction window was cut — that reasoning stops the same debate being reopened every few months.

Cross-references between these three files are load-bearing. If you renumber a section, grep for it.

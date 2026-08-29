# packages/ai/src/personalities

The five AI opponents. Each is a feature-weight vector plus a small number of hard behavioural rules — the personality *is* the AI, not a costume over a shared one.

| File | Character | Plays like | The tell |
| :--- | :--- | :--- | :--- |
| `vogel.ts` | 🎖️ Oberst Klaus Vogel — *The Bureaucrat* | Systematic sweeps, banks Intel, only strikes on high confidence | The sweep is a pattern; dead ends are provably safe |
| `katja.ts` | 👻 Katja Reiner — *The Ghost* | Constant motion, decoys, races dossiers, avoids all combat | Almost never strikes — Safehouses against her are wasted |
| `marek.ts` | 🔪 Marek Doležal — *The Butcher* | Hunts hard, strikes on thin evidence, accepts exposure | Burns his Strikes early; check the Burn Track |
| `halloran.ts` | 🕸️ Director Halloran — *The Spider* | Lays traps and buys informants; almost never strikes directly | Territorial and static — his quarter is a minefield, everywhere else is free |
| `sable.ts` | 🪞 "Sable" — *The Mirror* | Models your habits and counters them | Reactive, so it can be baited with a false pattern |

Full profiles, quotes, and weight rationale in `docs/AI_OPPONENTS.md` §3.

## Rules

- **Every personality must have a documented, exploitable tell.** If a player can't learn to beat it by reading its habits, it isn't a personality — it's a difficulty slider. `sim/` gates this: a scripted counter-strategy must beat the bot at a materially higher rate than a generic baseline.
- **Personalities differ in weights and rules, not in secret knowledge.** All five call the same `decide` pipeline over the same `PlayerView`.
- **Hard rules are few and legible.** "Never strikes below 65% confidence" is a good rule. A twelve-branch decision tree is not — it's unreadable to players, which defeats the purpose.
- Sable is unlocked at Handler difficulty and above; below that its habit model has too little signal to be interesting.
- Each personality declares a loadout — actives *and* passives — that matches how it plays. A Butcher without Strikes is a bug; so is a Ghost without *Dead Drop*.
- **The Strike card's two modes are a personality axis.** Marek almost always picks Mode A (strike now); Halloran almost always picks Mode B (set a trap). Same card, opposite temperaments — that split does more characterisation work than any weight tweak.
- **Every personality must be tuned at both 1 and 2 agents.** With two, a bot should coordinate them; with one it must not play like half a team.

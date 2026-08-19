# packages/ai

`@berlin/ai` — the AI opponents. Five personalities × four difficulty tiers.

Full design in `docs/AI_OPPONENTS.md`. Read it before changing anything here;
the personalities are a product feature, not an implementation detail. §7 of
that doc records what the first sweep measured and is the fastest way to
understand why the code looks the way it does.

**Status:** implemented and green. All six validation gates pass.

## Public API

```ts
interface AIAgent {
  /** This agent's actions for the round — usually 2, but ambush costs no
   *  action slot, so the list can be longer. */
  decide(view: PlayerView, agentId: AgentId): Action[];
  buildLoadout(settings: MatchSettings): CardId[];
}

function createAgent(personality: PersonalityId, difficulty: Difficulty, seed: string): AIAgent;
```

## The two constraints that define this package

1. **`decide` takes `PlayerView` and an agent id — nothing else.** A bot sees exactly what a human in that seat sees. Passing a `GameState` is a type error, and `tests/` asserts it. Difficulty degrades the bot's *inference* — belief noise, softmax temperature, lookahead depth, blunder rate — never its information.

2. **No LLM in the decision loop.** Decisions must be deterministic under a seed, instant, free, and offline-capable. The Claude API may generate a bot's radio chatter; it never picks a move. See `docs/AI_OPPONENTS.md` §6.

## How a bot thinks

```
PlayerView → particle filter (where are they?)
          → threat map (where are the traps, safehouses, blockades?)
          → feature scoring against personality weights (what's each move worth?)
          → softmax at difficulty temperature + blunder roll (what do I do?)
          → [Action, Action]
```

## Things the v3 rules force on this package

- **Two agents are scored jointly, not greedily.** Score agent A's candidates, then agent B's *conditioned on A's choice*. Independent greedy scoring sends both agents at the same belief peak and leaves half the map unwatched.
- **Cooldowns are shared across a player's agents**, so they're a player-level resource in the scorer, not a per-agent one.
- **Permanent death raises the floor.** Agents don't respawn, so a bot that walks into an announced blockade or fights on a suspected rival safehouse is *broken*, not easy. That's a validation gate, not a personality trait.
- **Bots build their own loadouts** via `buildLoadout`, matched to personality. A Butcher without Strikes is a bug.

## Layout

```
src/               Belief filter, feature extractors, scoring, selection
src/personalities/ The five weight vectors and their behavioural rules
sim/               Headless match harness for balance and validation
```

## The bar for shipping a personality

A personality that doesn't play measurably differently is flavour text. `sim/` enforces four gates: **distinguishability** (action histograms separable across 1000 matches), **monotonicity** (each difficulty beats the one below it), **exploitability** (the documented "tell" is demonstrably counterable), and **speed** (p99 under 50ms). Details in `docs/AI_OPPONENTS.md` §5.

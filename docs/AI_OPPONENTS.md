# Berlin 1988 — AI Opponents

**Version:** 1.0
**Implements:** `packages/ai/`
**Depends on:** `docs/GAME_DESIGN.md` (rules), `docs/ARCHITECTURE.md` §7 (integration)

---

## 1. The design goal

Most solo modes in hidden-information games fail the same way: the bot either cheats (and feels arbitrary) or plays randomly (and feels stupid). Neither one teaches you anything.

Berlin 1988's bots are built for a different outcome — **an opponent you can learn to read.** After five matches against Oberst Vogel you should be able to say "he always sweeps the high-degree nodes first, so the dead end is safe on round two," and be right. That's the product. Personality is not flavour text on top of one AI; the personality *is* the AI, expressed as a weight vector that produces genuinely different, genuinely exploitable habits.

Two hard constraints:

* **No cheating, ever.** A bot receives `PlayerView` — the same projection a human gets. Difficulty is never implemented by giving the bot more information. This is enforced by the type system, not by discipline (`docs/ARCHITECTURE.md` §4.1).
* **No LLM in the decision loop.** The bot must be deterministic under a seed, testable, instant, free, and offline-capable. The Claude API may generate a bot's *dialogue*; it never picks a move.

---

## 2. How a bot thinks

Three stages, run once per round.

```
   PlayerView (same as a human's)
            │
            ▼
┌───────────────────────────┐
│ 1. BELIEF UPDATE          │   Particle filter over opponent positions.
│    Where are they?        │   Predict → weight by evidence → resample.
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 2. CANDIDATE SCORING      │   Enumerate legal orders. Score each against
│    What's each move worth?│   the personality's weight vector.
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 3. SELECTION              │   Softmax over scores at difficulty temperature,
│    Which do I actually do?│   then a difficulty-gated blunder roll.
└─────────────┬─────────────┘
              ▼
          Order
```

### 2.1 Belief update — the particle filter

The bot maintains a weighted probability distribution over the map for each
opponent **player** — not per agent. That is not a simplification: the fog
deliberately hides agent identity (see the leak fixed in `filterEvents`), so a
bot genuinely cannot tell one of an opponent's agents from the other and must
not pretend it can. The cloud means "an agent of theirs is here".

Because the map is 12–18 nodes, the distribution is held **exactly**, one weight
per node, rather than sampled with particles. Same algorithm, no sampling error,
and still microseconds — sampling would only be worth it on a much larger graph.

Each round:

1. **Predict.** Every particle diffuses along the map graph — stay, or move to any neighbour. Transition probabilities are *personality-informed*: a bot that has watched you burn two GREEN cards weights tunnel moves higher, because it believes you're a tunnel deck.
2. **Weight by evidence.** Every signal in the bot's `PlayerView` reweights the set:
   * Wiretap `CLEAR` → particles on that node go to zero. (Unless the target holds *Counter-Surveillance* — so `CLEAR` is strong evidence, not proof.)
   * Wiretap `OCCUPIED` → particles elsewhere are heavily downweighted (but not zeroed — it might be a decoy).
   * Informant report → near-certainty on that node.
   * Radio Intercept ("in a BLUE sector") → zero every particle outside BLUE.
   * Border Crossing event → mass shifts across that checkpoint.
   * **Strike report, adjacent** → the striker's node is *known*; collapse to a point.
   * **Strike report, distant** → sector-level only. Reweight the whole sector up, everything else down. A silenced strike gives nothing at all, which is exactly why silencers cost Intel.
   * **"You are not alone"** → a rival is on one of *my* agent's nodes. Near-certainty, and the single strongest signal in the game.
   * **Blockade** → zero every particle on a closed node, and redistribute to its neighbours (whoever was there either died or escaped adjacent).
3. **Resample.** Renormalize, resample to N, inject a small uniform floor so the filter can recover from a wrong lock.

This is the whole reason the bots feel alive: the filter produces genuine uncertainty and genuine convictions. When a bot sweeps toward you it is because it *believes* something, and when you fool it with a decoy the belief is really wrong for several rounds.

**Two clouds, not one.** The posterior describes where rivals were at the end of
last round. Movement resolves at pipeline step 4 and strikes and scans at steps
8–9, so every post-movement action is evaluated against a *second* cloud
advanced one further step. Aiming at the posterior means aiming at where they
*were* — before this existed, bots landed 0.05 kills per match.

### 2.2 Candidate scoring

Legal orders come from `legalOrders(view, agentId)` — the same list a human's UI shows. Each is scored as a weighted sum of features:

| Feature | Meaning |
| :--- | :--- |
| `killProbability` | P(a Strike lands), read straight off the belief distribution |
| `trapValue` | P(someone walks into an ambush here over the next 3 rounds), from belief mass × node degree × dossier proximity |
| `exposureCost` | How much this reveals about me. Graded now: an unsilenced Strike near a known rival is maximal, a silenced one much less, Hold is zero |
| `informationGain` | Expected entropy reduction in my belief set — the reason bots wiretap |
| `economyDelta` | Intel gained/spent, plus informant income over remaining rounds |
| `objectiveProgress` | Distance to dossiers and to my extraction point |
| `survivalRisk` | P(I get hit), from rivals' plausible strike ranges *and* suspected trap locations, given their beliefs about me |
| `blockadeRisk` | P(this node closes while I'm standing in it). Zero for a bot holding *Kontrolle Schedule* — it simply knows |
| `groundAdvantage` | Am I fighting on my own safehouse node? Contested nodes are won outright there and are a coin flip everywhere else (`docs/GAME_DESIGN.md` §8.4) — a large term |
| `tempoValue` | Value of acting now vs. banking the action (rises sharply near the round limit) |

`score = Σ (personality.weights[f] × features[f])`

**Two agents change the shape of this.** When a bot fields two agents it scores the pair jointly, not greedily one at a time — otherwise both agents chase the same belief peak and leave half the map unwatched. In practice: score agent A's candidates, then score agent B's *conditioned on A's choice*, and keep the better of the two orderings. Cheap, and it produces the bracketing and pincer behaviour that reads as competence.

**Cooldowns are shared across a bot's agents**, so the scorer has to reason about them as a player-level resource — spending the Strike cooldown on agent A means agent B can't use it this round.

### 2.3 Selection

Scores go through a softmax at temperature `τ`, set by difficulty. Low `τ` → near-greedy; high `τ` → loose and human-ish. A separate **blunder roll** may then substitute the *second*-best move, which produces recognisably human mistakes rather than random noise.

### 2.4 Reasoning about hidden threats

Agents die permanently (`docs/GAME_DESIGN.md` §8.1), so a bot that wanders into traps is not "easy" — it's broken. Three hazards are invisible and have to be *inferred* rather than observed:

**Traps.** A bot maintains a second, much coarser belief layer: a **threat map** of P(trap) per node. It's fed by the same evidence as position beliefs — a rival's Burn Track showing Strike uses that produced no reported kill implies ambushes were set somewhere, and the likely somewhere is near their suspected territory, high-degree nodes, and dossier approaches. `survivalRisk` reads this layer. It should be wrong often; that's what makes a good trap satisfying to land.

**Rival safehouses.** Contested nodes are won outright by whoever owns a safehouse there, so a bot that suspects a safehouse should refuse to fight on that node at all. Safehouse inference comes from repeated returns to the same area and from escapes: an agent that survives an ambush and reappears somewhere specific has just shown you either its safehouse or a U-Bahn station, and the bot can rule out the station.

**Blockades.** In *Announced* mode the bot simply plans around them. In *Random* mode `blockadeRisk` is a flat prior weighted by how long a node has stayed open. A bot holding *Kontrolle Schedule* sets this term to a hard constraint instead — and this is the one place a bot legitimately "knows the future," because a human with that card knows the same thing.

**Passives are tracked from the Burn Track, not assumed.** A bot should update its estimate of what insurance you still hold and price its strikes accordingly. Guessing your loadout from a public record is inference, not cheating.

---

## 3. The five personalities

Each is a weight vector plus a couple of hard behavioural rules. The "tell" column is the exploitable habit — every personality must have one, and it must be discoverable within about five matches.

### 🎖️ Oberst Klaus Vogel — *The Bureaucrat*
> "Everything is in the file. You simply haven't read far enough."

Methodical Stasi counter-intelligence. Sweeps the map in a systematic pattern, banks Intel, never bluffs, and only strikes on high confidence. Slow, relentless, and utterly consistent.

* **High:** `informationGain`, `economyDelta`, `blockadeRisk` avoidance **Low:** `trapValue`, decoy usage
* **Rule:** never Strikes below 65% belief confidence. Prioritises high-degree nodes when scanning. With two agents, runs them as a sweep line rather than splitting them.
* **Loadout lean:** *Kontrolle Schedule*, *Bagman* — he wants the schedule and the budget.
* **Tell:** **he never sprints.** A man with a file does not run — so you always have one more round of margin against Vogel than against anyone else. His sweep is also a *pattern*: dead ends stay safe for two rounds at a time. *(Implemented as a hard rule; the sim harness measures his SPRINT rate at exactly 0.0%.)*

### 👻 Katja Reiner — *The Ghost*
> "I was never there. Check your own records."

Tunnel runner. Constant motion, heavy decoy usage, avoids confrontation entirely, and wins on dossiers while you're still looking for her.

* **High:** `objectiveProgress`, `survivalRisk` avoidance, decoy weight, Sprint usage **Low:** `killProbability`, `trapValue`
* **Rule:** never strikes and never traps. Always spends the first two rounds moving toward a dossier. Prefers tunnel edges even when a street route is shorter, because tunnels emit no chatter.
* **Loadout lean:** *Dead Drop*, *Ghost Protocol*, *Tunnel Rat* — three ways to not die.
* **Tell:** she almost never fights, so the ground between you and her is safe to cross boldly. She's also *predictably* headed for whichever dossier is closest to her last known vicinity.

### 🔪 Marek Doležal — *The Butcher*
> "Subtlety is for people with time."

Contractor. Hunts aggressively, strikes on thin evidence, accepts being revealed as the cost of doing business. Terrifying early, often broke by round ten.

* **High:** `killProbability`, `tempoValue` **Low:** `exposureCost`, `economyDelta`, `blockadeRisk` avoidance
* **Rule:** Strikes at ≥35% confidence, and never buys a silencer — he doesn't care who hears. Splits his two agents to cover twice the ground.
* **Loadout lean:** *K9 Unit*, *Sleeper Cell* — he expects to be in a fight and expects to lose someone.
* **Tell:** his Intel never accumulates. Watch the Burn Track and his Intel meter together — a Butcher at 2 Intel is a Butcher who can't strike this round, and that's your window. He also walks straight into blockades.

### 🕸️ Director Halloran — *The Spider*
> "Come to me. I've been patient."

CIA station chief. Doesn't hunt — builds. Lays traps, buys informants, and punishes anyone who walks into ground he already owns.

* **High:** `trapValue`, `groundAdvantage`, `economyDelta`, bribe weight **Low:** `killProbability` via Mode A — he almost always picks Ambush over Strike
* **Rule:** never moves more than 2 nodes from his safehouse. Traps high-degree nodes and dossier approaches rather than chasing belief peaks.
* **Loadout lean:** trap-heavy Strikes, *K9 Unit*, *Cutout*.
* **Tell:** he's territorial and static. His quarter of the map is a minefield and everywhere else is free — but he owns the economy and the contested-node tiebreak on his own ground, so never fight him at home.

### 🪞 "Sable" — *The Mirror*
> "You've done this before. Twice, actually."

Unknown allegiance. Builds a model of *your* habits across the match — your favourite sectors, your move-after-being-scanned tendencies, your bluff frequency — and turns them against you.

* **Weights:** starts near-neutral and drifts toward the counter of whatever you're doing
* **Rule:** maintains an opponent-habit histogram — sector preference, response to being scanned, Sprint frequency, strike-vs-trap ratio, safehouse-relative movement — feeding directly into its particle filter's transition model. It also reads your Burn Track to infer which passives you're still holding, and won't waste a strike on someone it believes has *Ghost Protocol* left.
* **Tell:** it is *reactive*, which means it can be baited. Establish a pattern for four rounds, then break it, and Sable will be badly wrong for three.

Unlocked at Handler difficulty and above; below that the modelling has too little signal to be interesting.

---

## 4. Difficulty tiers

Difficulty adjusts **how well the bot reasons**, never how much it knows.

| Tier | Belief noise | Softmax τ | Lookahead | Blunder | Habit modelling |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Recruit** | High — 30% of particles randomized each round | 1.2 | 1 ply | 25% | No |
| **Field Agent** | Moderate — 15% | 0.7 | 1 ply | 10% | No |
| **Handler** | Low — 5% | 0.35 | 2 ply | 3% | Yes |
| **Spymaster** | None | 0.15 | 3 ply + opponent modelling | 0% | Yes, aggressive |

"Belief noise" degrades the bot's *inference*, which is the honest way to make an opponent weaker — a Recruit-tier Vogel still sweeps like Vogel, he's just genuinely bad at reading the evidence. Contrast with the dishonest alternatives we're not using: giving the bot your position and asking it to pretend, or making it play randomly.

Lookahead ≥2 ply means the bot simulates its move, samples your likely responses from its belief distribution, and evaluates the resulting position. With ≤18 nodes and a small legal-order set, 3 ply is still sub-millisecond.

---

## 5. Validation

A personality that doesn't play differently is just flavour text. Requirements before any personality ships:

1. **Distinguishability.** In 1000 headless matches, each personality's action histogram (Strike rate, Wiretap rate, avg. distance travelled, Intel at end) must be separable from the others by a wide margin. If two personalities are statistically indistinguishable, one of them is redundant.
2. **Difficulty monotonicity.** Spymaster must beat Handler must beat Field Agent must beat Recruit, head-to-head, at every personality.
3. **Exploitability.** Each documented "tell" must be demonstrable: a scripted counter-strategy exploiting it should beat that bot at a materially higher rate than the generic baseline. If a tell isn't exploitable, the personality is fake.
4. **Speed.** p99 decision time under 50ms at Spymaster, with 2 agents and joint scoring.
5. **Determinism.** Same seed + same view history → same order, always.
6. **Basic self-preservation.** At Field Agent and above, a bot must not walk into an *announced* blockade, and must not initiate a contested fight on a node it has good reason to believe holds a rival safehouse. These aren't personality traits — a bot that fails them is broken, not weak, and permanent death means the mistake ends its match.
7. **Agent-count parity.** Every personality must be validated at both 1 and 2 agents. A bot tuned only for two will play a single agent like half a team.

The harness for all of this is `packages/ai/sim/`, and all six gates are
enforced by `packages/ai/tests/validation.test.ts` on every run.

---

## 7. What the first sweep actually found

Every claim below is measured, not argued. Reproduce any of it with one command.

### The bots were wrong in three ways, and the harness found all three

**They scanned instead of playing.** Every personality was spending 30–43% of
its actions on wiretaps and almost none of them ever fired a shot. Naive entropy
reduction badly over-values a scan, because it ignores two real properties of
the game: scans resolve *after* movement and orders for the next round are
committed before you see the result, so most of what you paid for has diffused
away by the time you can use it; and information is only worth what you can do
with it — Katja, who never strikes, was still buying it. Discounting for both
cut scanning to 22–29%.

**They aimed at where rivals had been.** The belief filter's posterior describes
the end of *last* round, but strikes resolve after *this* round's movement. Bots
were shooting at ghosts. They now evaluate every post-movement action against a
belief advanced one further step — which is precisely the "shoot where they're
going, not where they are" skill the design names as its ceiling.

**They ignored the scoreboard.** Nobody moved to intercept a rival two dossiers
into a run, even though pickups are announced publicly by node and every
faction's extraction point is on the map. That is public-log arithmetic any
human does automatically, and it is now the `denialValue` feature.

### The game itself had one, and it was bigger

With 3 dossiers on the map and 3 needed to extract, a pure objective-runner in a
duel won **92%** of matches with essentially zero combat in the entire game. The
mechanism is simple: a runner collects a full set in one loop and never has to
come back, and on a 12-node map with one opponent you cannot find someone who
does not want to be found.

Putting **fewer dossiers on the map than you need to extract** fixes it, because
it forces a return trip you can predict:

| Dossiers on map | Runner win rate | Outcome mix | Burns / match |
| :---: | :---: | :--- | :---: |
| 3 | 92% | extraction 72% | ~0.03 |
| **2 (now default)** | **75%** | extraction 51%, round limit 40% | **~0.5** |
| 1 | 53% | round limit 76% — the turtle wins instead | ~0.4 |

Two is the setting. One overshoots: extraction becomes so rare that sitting on
your safehouse is the dominant strategy.

**Four-player was never broken.** Even at 3 dossiers it read as a healthy game —
win rates 45/27/23/18/17, burns an order of magnitude higher. Enough bodies on
the map create incidental contact on their own. The duel is the fragile mode,
and it is the one solo play uses.

### Still open

* **Katja remains ahead at 84% in a duel** after every fix above. Evasion is
  simply strong when there is only one hunter. Candidates: make dossier pickup
  reveal more than the node, raise the respawn delay, or shrink the duel map.
  This one is a design question, not a bot-tuning question.
* **Lookahead is not implemented.** Handler and Spymaster are documented as 2-
  and 3-ply; they currently differ from lower tiers by belief noise, softmax
  temperature, blunder rate, and joint planning only. That is already enough for
  the monotonicity gate to pass, so lookahead is an improvement rather than a
  missing requirement — but the doc above overstates what ships today.

```bash
pnpm sim --matches 300 --profile
```

---

## 6. Optional: the flavour layer

A bot may emit short in-character radio messages ("Alexanderplatz is quiet. Too quiet for a Tuesday.") generated by the Claude API from the personality prompt plus **only the knowledge the bot legitimately has**.

Strict boundaries:

* Cosmetic. The game plays identically with the flag off.
* Non-blocking. Never in the decision path; a failed or slow call just means silence.
* Never sees `GameState`. Prompt is built from the bot's `PlayerView` and belief summary.
* Cached and rate-limited per match — this is atmosphere, not a chat feature.

A hand-written line pool is the fallback and the default, and it should be good enough that the LLM layer is a nice-to-have rather than a dependency.

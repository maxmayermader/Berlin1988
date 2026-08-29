# Berlin 1988 — Game Design Document

**Version:** 3.0 (supersedes v2; `game_specs.md` at repo root is the original v1 draft)
**Status:** Design locked for prototype. Numbers marked 🔧 are tuning targets, not commitments. Items marked ❓ are open decisions listed in §12.
**Genre:** Hidden-movement / deduction / light deckbuilding. 1–4 players, human or AI.

---

## 0. Design Pillars

Every rule here serves one of these four. If a rule doesn't, cut it.

1. **Deduction over reflexes.** You win by out-thinking someone, not by clicking faster. No reaction-time mechanics anywhere.
2. **Every action leaks something.** The most powerful plays are the loudest. Information is the real currency; Intel is just the meter.
3. **Randomness in the world, never in your hand.** The map's dossiers move, blockades fall, contested neutral ground is a coin flip. Your own capabilities never shuffle — you know exactly what you own for the whole match.
4. **The AI plays the same game you do.** Bots read the same fog-of-war projection a human gets. A bot that cheats isn't a difficulty setting, it's a bug.

### What makes this better than Two Spies

| Two Spies | Berlin 1988 |
| :--- | :--- |
| 1v1 only | 1–4 players, host-configured |
| Fixed ability set | 10-card loadout of reusable actives and passive insurance |
| One spy | 1 or 2 agents per player, host's choice |
| Opponent is a stranger | 5 named AI personalities with readable, learnable habits |
| Shoot / move / scan | Same core, plus traps, informants, safehouses, dossier extraction, and late-game blockades |
| Static map | The city closes down around you as the match runs long |

---

## 1. Setting

Autumn 1988. The Wall has fourteen months to live and nobody in the game knows it. Four networks work the same city — Stasi counter-intelligence in the East, CIA station chiefs in the West, a diplomatic corridor answering to neither, and the U-Bahn runners who move under both.

**Aesthetic:** monochrome-green phosphor CRT over a dark ink map. Monospaced, slightly misaligned type, like a teletype. Analogue sound — tape hiss, dial tones, the click of a rotary phone. See `docs/ARCHITECTURE.md` §9 for how this coexists with accessibility.

---

## 2. Setup — the host builds the match

Everything is configured in the lobby. There are no mode-locked rules; a "mode" is just a preset of these settings.

| Setting | Options | Default |
| :--- | :--- | :--- |
| **Players** | 1–4 (any seat may be a bot) | — |
| **Agents per player** | **1 or 2** | 2 |
| Map | Duel-12 / FFA-16 / FFA-18 | by player count |
| Teams | Free-for-all / 2v2 | FFA |
| Round timer | 30s / 60s / 120s / untimed | **60s** |
| Pause allowance | 0–5 per player | 3 |
| Round limit | 10 / 14 / 20 | 14 🔧 |
| Dossiers on map | 2 / 3 / 4 | 3 |
| Starting Intel | 2–8 | 4 🔧 |
| **Blockades** | Off / Announced / Random / Mixed | Mixed, from round 7 🔧 |
| Loadouts | Free build / Starters only / Mirror match | Free build |
| Bot seats | personality + difficulty, per seat | — |

**Agent count is the biggest dial.** Two agents doubles your action economy and your deduction surface — an opponent who finds one of yours still doesn't know where the other is, and misdirecting with your own two agents is the deepest skill in the game. One agent is faster, tenser, and much more fragile.

> ⚠️ **Recommendation: default free-for-all to 2 agents.** Agents do not respawn (§8.1), so with 1 agent a 4-player game can put someone on the bench in round three with twenty minutes left to watch. Two agents means losing one is a wound, not an exit.

---

## 3. Components

### 3.1 The Map

A node graph. Node count scales with player count so the board never feels empty or claustrophobic.

| Map | Nodes | Avg. degree 🔧 | U-Bahn stations |
| :--- | :---: | :---: | :---: |
| Duel-12 (solo / 1v1) | 12 | 2.8 | 3 |
| FFA-16 (3P) | 16 | 3.0 | 4 |
| FFA-18 (4P / 2v2) | 18 | 3.2 | 5 |

Each node carries `id`, `name`, `sector`, `x`/`y` percentages for responsive SVG layout, typed `edges`, `informantOwner`, `isExtractionPoint`, `isUBahnStation`, `hasDossier`, and `blockadeState`.

**Sectors:**

| Sector | Territory | Character |
| :--- | :--- | :--- |
| 🔴 RED | East Berlin — Alexanderplatz, Prenzlauer Berg, Karl-Marx-Allee | Dense, heavily watched, short sightlines |
| 🔵 BLUE | West Berlin — Tempelhof, Tiergarten, Kurfürstendamm | Open, well-connected, long sightlines |
| 🟡 GOLD | The corridor — Checkpoint Charlie, Friedrichstraße, Glienicke Bridge | Chokepoints. High traffic, high Intel |
| 🟢 GREEN | U-Bahn — Kreuzberg, Gesundbrunnen, Bernauer | Sparse but tunnel-linked across the map. Also **escape destinations** (§8.3) |

**Edge types:**

1. **Street (solid).** Normal movement. Free.
2. **Tunnel (dashed green).** Connects any two U-Bahn stations regardless of map distance. Costs 1 Intel unless the agent spends a GREEN card or holds *Forged Papers*. Produces **no adjacency chatter** — the quiet way across the city, and why GREEN loadouts are hard to track.
3. **Checkpoint (double line).** Crosses between RED and BLUE territory. Costs 1 Intel and always emits a **public Border Crossing signal** naming the checkpoint but not the player. Everyone learns someone crossed; nobody learns who.

Crossing the Wall is the one movement that can't be hidden. That's deliberate.

### 3.2 Agents

Each player controls **1 or 2 agents** per the host setting. An agent has a hidden node position and may carry up to 3 dossiers. Each agent acts independently but draws on the player's shared Intel pool and shared card cooldowns.

### 3.3 Intel

The universal resource — abilities, extra movement, traps, silencers, checkpoint tolls.

* **Start:** 4 🔧
* **Income at upkeep:** +2 base, **+1 per agent beyond the first**, +1 per owned informant, +1 for *Bagman*
* **Cap:** 15 🔧

Unspent Intel carries over. Hoarding is legitimate and telegraphs a big play, which is a feature.

### 3.4 Dossiers & the Safehouse

**Dossiers.** Three sit on random neutral nodes at match start. Moving onto one picks it up automatically — and emits a **public Dossier Taken** signal naming the node. You're visible for a round and carrying something everyone wants. A taken dossier respawns elsewhere 2 rounds later. A burned agent drops everything it carried on its node.

**Safehouse.** Each **player** has exactly **one safehouse**, placeable on any node and **known only to you**. It is your escape destination, your blockade shelter, and the tiebreaker that decides contested nodes (§8.4). It can be relocated with the 🏛️ op. It is the single most valuable piece of hidden information you own — and unlike your agents, it never moves on its own, so an opponent who deduces it has a permanent read on you.

---

## 4. Actions — two per agent, per round

Each agent gets **2 actions** per round. An action is one of:

| Action | Cost | Effect |
| :--- | :--- | :--- |
| **Move** | free | Move 1 edge (plus Intel tolls for tunnels/checkpoints) |
| **Sprint** | 1 action + 1 Intel 🔧 | Move 2 edges. Max one Sprint per agent per round |
| **Play a card** | 1 action + the card's Intel cost | See §5 |
| **Ambush** | **0 actions** + 3 Intel 🔧 | Lay a trap on your own node. See §5.1 |
| **Hold** | — | Bank the action. +1 Intel per unspent action 🔧 |

**Movement is declared first.** Within an agent's two actions, any movement is
chosen before a strike or a bribe. Those two resolve from where the agent *ends
up* (§7.2), so a strike picked first would silently go out of range once a move
was added after it. Safehouses, ambushes, and decoys resolve *before* movement
and are placed from where the agent *started*, so they can be chosen at any
point — and wiretaps can target anywhere.

With 2 agents that's four actions a round from a shared Intel pool, which is the real constraint — you will routinely have more you *want* to do than Intel to do it with.

Holding is a real move. Against a good opponent, doing nothing while they burn Intel looking for you is often correct.

---

## 5. The Six Operations

Six icons, four colors. **Active cards are reusable for the whole match** — what limits them is Intel cost and a cooldown in rounds. Cooldowns are **per card, per player**, shared across both your agents; two agents can't double-tap the same ability in one round.

| Icon | Op | Intel | CD 🔧 | Effect |
| :---: | :--- | :---: | :---: | :--- |
| 🕵️ | **Agent** | 0 | — | Move. Free, always available, needs no card |
| 🎙️ | **Wiretap** | 2 | 1 | Scan a node. Reports `OCCUPIED` / `CLEAR` after movement. Doesn't name who. Decoys read as `OCCUPIED` |
| 💰 | **Bribe** | 2 | 2 | Claim the informant on your agent's node. +1 Intel/round, and privately reports whenever any agent *enters* that node |
| 🎭 | **Decoy** | 3 | 2 | Place a false signal within 2 edges that reads as a real agent to wiretaps and informants. Max 2 active |
| 🏛️ | **Safehouse** | 2 | 3 | Place or relocate your one safehouse to your agent's node |
| 🎯 | **Strike** | 3 | 2 | Two modes — see below |

### 5.1 Strike has two modes

The 🎯 card is your violence budget, and it buys either aggression or patience:

**Mode A — Strike.** Target your agent's node or an adjacent one. Your agent **advances into the target node** as part of the action. Any rival agent standing there at end of movement is **burned**.

**Mode B — Ambush.** Cost **3 Intel and no action** 🔧. Set a hidden trap on your agent's current node. It persists until triggered or until 3 rounds 🔧 pass. Any rival agent entering that node is **burned** — see §8.3 for escapes.

Mode A is a guess you make loudly. Mode B is a guess you make quietly and then wait on.

Because Mode B costs no action, laying a trap never competes with moving or
striking — you can seed the ground you're standing on and walk away the same
round. Intel and the Strike card's cooldown are its only brakes, and an agent
can only trap the node it occupies (and not one it has already trapped), so the
practical ceiling is one new trap per agent per round.

### 5.2 Strike noise — who hears the shot

A Strike is loud, but not equally loud everywhere. This replaces v2's map-wide reveal:

| Who | What they learn |
| :--- | :--- |
| Agents in **adjacent nodes** | The **exact node** the strike happened in |
| **Everyone else** | The **general vicinity** — the sector it happened in, nothing finer |
| Owner of a decoy that was struck | The striker's exact node, privately, one round before anyone else |

**Silencers.** Bought with **2 Intel 🔧, no action**, held up to 2 at a time, consumed by your next Strike. A silenced strike suppresses the map-wide vicinity broadcast entirely — but agents in adjacent nodes still notice, because they are standing right there. 🔧

Ambushes (Mode B) make **no noise at all** when set. When one triggers, it's reported exactly like a strike.

### 5.3 Color affinity

Playing a card on a node matching its color triggers a bonus:

| Color | Synergy |
| :--- | :--- |
| 🔴 RED | **Strike** refunds 2 Intel on a confirmed burn |
| 🔵 BLUE | **Wiretap** also scans every adjacent node. **Safehouse** relocation costs no action |
| 🟡 GOLD | **Bribe** grants +2 Intel immediately on capture |
| 🟢 GREEN | **Decoy** can be swapped with — teleport to it, it takes your old position |

Affinity is checked against the node where the effect *originates* (your agent's node for Bribe/Safehouse/Strike, the target node for Wiretap/Decoy).

---

## 6. The Loadout — 10 cards, actives and passives

**There is no deck, no draw, and no hand.** A shuffled hand in a deduction game means losing to a bad draw in a genre about reading people. Instead, before the match each player assembles a **Dossier of 10 cards**, all visible to you and all available from round one.

Two kinds of card, and the split between them is the central deckbuilding decision:

* **Active cards** — the six operations. **Reusable all match**, gated by Intel and cooldown. These are your tools.
* **Passive cards** — never played, never cost an action. They trigger automatically when their condition is met. Most are **consumed** when they save you; a few are permanent. These are your insurance.

Ten slots. Every passive you take is an active you don't have. A loadout of nine actives is a scalpel with no armour; four passives means you'll survive things but struggle to make anything happen.

### 6.1 Construction rules

* Exactly **10 cards**
* Maximum **3 of any one icon** (passives count against their icon)
* At least **2 different colors**
* Total **Budget Points ≤ 26** 🔧 — the main balance lever, see `packages/engine/src/content/`.
  (Opened at 20, raised once the cards were actually costed: the ten cheapest
  legal cards come to 17, so at 20 almost every interesting deck was illegal.)

### 6.2 The Passive cards

| Card | Color | Trigger | Effect | Use |
| :--- | :---: | :--- | :--- | :---: |
| **Dead Drop** | 🟢 | Ambushed | Survive. Relocate to your safehouse or the nearest U-Bahn station, whichever is closer | Once |
| **K9 Unit** | 🔴 | Contested neutral node | +25% to win the roll (50% → 75%) | Once |
| **Ghost Protocol** | 🟢 | Struck | The strike misses | Once |
| **Tunnel Rat** | 🟢 | Caught in a blockade | Relocate instead of burning; still lose 1 action next round | Once |
| **Counter-Surveillance** | 🔵 | Wiretapped | The scan returns `CLEAR` | Once |
| **Kontrolle Schedule** | 🟡 | Match start | You see **every future blockade** and its round | Permanent |
| **Forged Papers** | 🟡 | Crossing | Checkpoint crossings are free and emit no Border Crossing signal | Permanent |
| **Cutout** | 🔵 | Card use | Your first 3 Burn Track entries show icon only, no color | Permanent |
| **Sleeper Cell** | 🔴 | Agent burned | You immediately learn the killer's exact node | Permanent |
| **Bagman** | 🟡 | Upkeep | +1 Intel per round | Permanent |

Consumed passives are announced on your Burn Track when they fire — surviving an ambush tells the whole table you had a *Dead Drop* and no longer do.

### 6.3 The Burn Track — public information about capability

Your agents' positions are secret. Your **card usage** is not. Every time you play an active or a passive fires, its icon and color are appended to a **Burn Track** every player can see, including you.

> **You can always see your own Burn Track exactly as opponents see it.** The UI has a "what they know" panel showing the public record of you. You should be able to audit your own tells.

Because actives are reusable, the Burn Track isn't an exhaustion counter — it's a **capability profile**. Four rounds in, an opponent knows you've used GREEN Decoys twice and a BLUE Wiretap. They don't know where you are, but they know what you're built to do, they know your cooldown state, and they know a GREEN loadout means you're one tunnel hop from somewhere inconvenient.

Bluffing your loadout is a real strategy: spending Intel on a card you didn't need, early, to sell a deck you aren't playing. *Cutout* exists precisely to muddy this.

### 6.4 Starter loadouts

| Archetype | Composition | Plays like |
| :--- | :--- | :--- |
| **The Phantom** 🟢🔵 | 3× Decoy, 2× Wiretap, 1× Safehouse, + Dead Drop, Ghost Protocol, Tunnel Rat, Forged Papers | Never gets caught, rarely kills, wins on dossiers |
| **The Hunter** 🔴🔵 | 3× Strike, 3× Wiretap, 1× Decoy, + K9 Unit, Sleeper Cell, Counter-Surveillance | Finds you, then makes the noise worth it |
| **The Oligarch** 🟡🔴 | 3× Bribe, 2× Strike, 1× Safehouse, 1× Wiretap, + Bagman, Forged Papers, Kontrolle Schedule | Owns the map's income and its schedule, wins long |
| **The Spider** 🔴🟢 | 3× Strike (ambush-leaning), 2× Safehouse, 1× Decoy, 1× Bribe, + K9 Unit, Dead Drop, Cutout | Baits you into ground it already owns |

---

## 7. Round Structure

Turns are **simultaneous**. Everyone commits in secret, then everything resolves at once. Sequential turns in a 4-player hidden-movement game mean 75% of your time is spent watching, and the last player to act has perfect information, which makes bluffing impossible.

```
┌────────────────┐   ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│  1. SIGNALS    │──▶│  2. ORDERS     │──▶│  3. RESOLUTION │──▶│  4. UPKEEP     │
│                │   │                │   │                │   │                │
│ Intercepts,    │   │ 2 actions per  │   │ Fixed priority │   │ Intel income,  │
│ informant      │   │ agent, secret. │   │ order, played  │   │ cooldowns tick,│
│ reports,       │   │ 60s timer,     │   │ back as one    │   │ dossiers &     │
│ chatter,       │   │ pausable by    │   │ report         │   │ blockades      │
│ blockade calls │   │ unanimity      │   │                │   │ update, victory│
└────────────────┘   └────────────────┘   └────────────────┘   └────────────────┘
```

### 7.1 The clock and the pause

The Orders phase runs a **60-second timer** 🔧 (host-configurable). When it expires, any agent without submitted actions **Holds** — banking the action and its +1 Intel, so a timeout is never catastrophic, just wasteful.

**Pause** requires **unanimous consent.** Any player may request one; every other player must click through before the clock stops. It runs up to 3 minutes 🔧 and each player gets 3 pauses per match by default. Unanimity is the point — a pause that one player can force is a griefing tool, and in a timed deduction game the clock is part of the pressure.

Bots always accept a pause request immediately.

### 7.2 Resolution Priority

Resolution order is **fixed and published to players**. Predictable resolution is what makes planning possible; hidden ordering would just be a second layer of randomness.

| # | Step | Why here |
| :---: | :--- | :--- |
| 1 | Passives arm; safehouses placed/relocated | Must exist before anything can test against them |
| 2 | **Ambushes set** | A trap laid this round is live this round |
| 3 | Decoys placed | Must be scannable this round to be worth 3 Intel |
| 4 | **Movement** (all agents, simultaneous) | Includes Sprints, tunnels, checkpoint tolls |
| 5 | **Ambush triggers** | Anyone who walked into a trap |
| 6 | **Blockade sweep** | Anyone standing in a node that closed |
| 7 | Bribes / informant captures | From post-move positions |
| 8 | **Wiretaps** | After movement — you scan where they *arrived* |
| 9 | **Strikes** | After scans — you hit where they *arrived* |
| 10 | **Contested nodes resolved** | Strike-vs-ambush, mutual traps (§8.4) |
| 11 | Dossier pickup & extraction | Last, so a burned agent can't extract |

The consequence players internalize by round three: **shoot where they're going, not where they are.** A strike aimed at the node someone is currently standing in hits nothing if they moved. That is the skill ceiling of this game.

---

## 8. Death, Traps, and Contested Ground

### 8.1 Burning is permanent

**Agents do not respawn.** A burned agent is out for the match. It drops all carried dossiers on its node, and its player keeps playing with whatever agents remain. Lose your last agent and you are eliminated.

Eliminated players stay in the room as spectators, seeing only what their own fog allowed them to see while alive. Their informants go neutral; their safehouse and decoys are removed; their dossiers stay where they fell. In 2v2, their partner plays on alone.

### 8.2 Co-location is safe

Two rival agents ending movement on the same node with no trap and no strike **do nothing to each other.** Both are privately told *"you are not alone here"* — no identity, no count.

This is a deliberate reversal of the v2 auto-ambush. Random death for walking into someone by accident is frustrating and unteachable, and it makes hiding in busy nodes irrational. Now the crowd is cover, and that private "not alone" whisper is one of the best deduction signals in the game.

### 8.3 Walking into an ambush

A rival agent enters a node holding your trap. It triggers immediately:

1. **The entering agent is burned** — unless it holds **Dead Drop**.
2. **Dead Drop fires** (consumed): the agent survives and relocates to **its player's safehouse or the nearest U-Bahn station, whichever is fewer edges away.** It arrives with 0 actions remaining this round and its Burn Track shows the card.
3. **Unless both players trapped the same node.** Mutual traps seal the ground: escape passives do not function, and any agent entering is burned outright.

Traps are consumed when they trigger and expire after 3 rounds 🔧.

### 8.4 Contested node resolution

When a node is contested — a trap and a strike land on it in the same round, or two strikes collide — resolution runs this ladder in order:

| # | Condition | Outcome |
| :---: | :--- | :--- |
| 1 | **Mutual traps** on the node | Any agent entering is burned. No escapes, no rolls |
| 2 | **One player owns a safehouse on the node** | That player **wins outright**. Their agent survives, the rival's is burned |
| 3 | **Neutral node** (no safehouse) | **50/50 roll** from the match's seeded PRNG |
| 4 | Neutral, one side holds **K9 Unit** | Roll shifts to **75/25** in their favour. Card is consumed either way |
| 5 | Both hold K9 Unit | Both consumed, back to 50/50 |

Your safehouse being the tiebreaker is why its location is worth hiding, and why the 🏛️ op is worth an action. Fighting on your own ground is the only way to make violence *safe* — everywhere else, killing someone is a coin flip you might lose.

---

## 9. Blockades — the city closes

From round **7** 🔧 onward, the Volkspolizei start sealing nodes. Blockades are the pressure valve that stops long matches from stalling into mutual hiding.

**Mechanics.** A blockade closes a node for **2–3 rounds** 🔧. While closed: no agent may enter, no ability may target it, and informants there generate nothing. Traps and decoys inside it are destroyed. It cannot close an extraction point or a node holding the match's last dossier.

**Frequency.** From round 7, a **35% chance 🔧 per round** of one blockade falling. Host-configurable:

| Setting | Behaviour |
| :--- | :--- |
| **Off** | No blockades |
| **Announced** | Every blockade is publicly declared **1 round before** it lands |
| **Random** | No warning. It just closes |
| **Mixed** (default) | Roughly half announced, half not |

**Getting caught.** An agent in a node when it closes is **burned** — unless one of these saves it:

* **Your safehouse is on that node** — you know the ground, you have a way out. You survive, relocate to the nearest open adjacent node, and **lose 1 action next round**.
* **Tunnel Rat** (consumed) — same outcome, from anywhere.

Otherwise the agent is gone. Blockades don't negotiate.

**Foreknowledge is power.** *Kontrolle Schedule* (🟡, permanent) reveals **every blockade for the whole match at setup** — round and node. It is the most expensive passive in the game in Budget Points 🔧 and it is worth it, because it converts the match's chief random element into a map only you can read. In *Announced* mode it's near-worthless, which is exactly the kind of loadout-vs-lobby-settings tension the host controls.

---

## 10. Information — what you actually see

Complete fog is a design trap. With no information, players flail for five rounds and the game feels like guessing. Berlin 1988 leaks a controlled trickle every round.

Each Signals phase, a player receives:

1. **Own vision** — each of your agents' nodes and every node adjacent to them.
2. **Adjacency chatter** — for each node adjacent to one of your agents: did *any* agent pass through it last round? Yes/no. No identity, no direction. Tunnel movement is exempt.
3. **"You are not alone"** — private, if one of your agents shares a node with a rival (§8.2).
4. **Informant reports** — every node you've bribed tells you privately when an agent enters it.
5. **One Radio Intercept** — a guaranteed-true statement about one randomly chosen rival agent, from a rotating pool: *"…operating in a BLUE sector." "…within two nodes of Alexanderplatz." "…did not move last round." "…is carrying a dossier." "…has crossed a checkpoint this match."*
6. **Public events** — border crossings, dossier pickups, burns, blockade announcements, and strike vicinity reports (§5.2).
7. **The Burn Track** — everyone's, including your own.

The intercept pool width is the main dial for match pacing. Wider = longer, more paranoid games. 🔧

---

## 11. Victory

Checked at Upkeep, in this order:

1. **Extraction** — one agent carries 3 dossiers to your faction's extraction point. Immediate win.
2. **Elimination** — every rival agent burned. Immediate win.
3. **Round limit** 🔧 — highest score wins: `dossiers × 3 + informants × 1 + agents burned × 2`. Ties broken by remaining Intel, then by surviving agents.

Every match ends. No draws, no infinite stalemates — and with blockades closing the map from round 7, hiding stops being viable long before the round limit.

---

## 12. Open Decisions

| # | Question | Current default | Note |
| :---: | :--- | :--- | :--- |
| 1 | ~~Does setting an **Ambush** cost an action?~~ **DECIDED** | **Intel only, no action** | Traps no longer compete with movement or strikes. The spam concern is bounded by the one-trap-per-agent-per-node rule, Intel cost, and the Strike cooldown — but this is now the most likely number to need raising, so the sim harness sweeps `ambushIntelCost` and the `ambushCostsAction` flag both ways |
| 2 | Blockade text said "burned **and** lose 1 movement" | Read as: burned outright, *unless* saved by safehouse or *Tunnel Rat*, in which case you survive and lose 1 action | Say the word if you meant everyone survives and only loses an action |
| 3 | Does a **silencer** hide the strike from adjacent agents too? | No — adjacent still hear it | Full suppression makes Strike nearly free of consequence |
| 4 | Should **Sprint** be capped at once per agent per round? | Yes | Otherwise 2 agents × 2 Sprints = 8 nodes of movement for 4 Intel |
| 5 | FFA with **1 agent** and no respawn puts players on the bench early | Default FFA to 2 agents | Host can still choose 1 |

---

## 13. Balance Levers

Ranked by expected impact. Turn these before touching anything else.

1. **Strike Intel cost (3) and cooldown (2)** — the most sensitive pair in the game. Reusable strikes plus permanent death is a lethal combination; these two numbers are the only brakes.
2. **Intel income** (+2 base, +1/extra agent) — sets tempo, and must scale correctly with the agent-count setting or 2-agent games starve.
3. **Ambush Intel cost and duration** — now the sharpest lever in the game, because ambushes cost no action. If the map turns into a minefield, this is the number to raise first (or flip `ambushCostsAction` back on).
4. **Blockade start round and frequency** — sets how hard the endgame squeezes.
5. **Radio Intercept pool width** — sets how fast fog burns off.
6. **Budget Points (26)** and passive BP costs — sets the actives-vs-insurance ratio.
7. **Round limit (14)** — decides whether extraction or scoring is the realistic win path.

All of these live in one tunable ruleset object so the sim harness (`packages/ai/sim/`) can sweep them. **Every balance claim in this document is a hypothesis until that harness confirms it** — and the two that most need confirming are whether reusable strikes plus permanent death end matches too fast, and whether a 2-agent, 4-action round fits in 60 seconds.

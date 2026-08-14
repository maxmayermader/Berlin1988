 I will just do two spies which can be played with 1-4 players. users can also configure card deck with additional abilties. there will be 6 different icons with 4 different colors. Name will be Berlin 1988.

Berlin 1988 takes the tense, hidden-movement core of Two Spies and expands it into a customizable 1–4 player Cold War thriller set across the divided sectors of East and West Berlin.
1. Icon & Color Matrix

The 6 icons represent Operations, while the 4 colors represent Sectors & Faction Networks.
Icon	Ability Action	Color Affinity Bonus
🕵️ Agent (Move)	Move 1 node without breaking cover.	Red (East / Stasi): Free movement in East Berlin.
🎙️ Wiretap (Ping)	Scan a node. If an enemy is there, reveal them.	Blue (West / CIA): Reveals adjacent connected nodes as well.
💰 Bribe (Intel)	Claim a neutral Informant node to generate +1 Intel/turn.	Gold (Neutral / Diplomatic): Instant +2 Intel bonus on capture.
🎭 Decoy (Bluff)	Spawn a fake signal on a node to mislead enemy pings.	Green (Underground Tunnels): Swap places with the decoy.
🏛️ Safehouse (Fortify)	Shield a node from enemy strikes for 1 round.	Blue (West / CIA): Safehouse remains active for 2 turns.
🎯 Strike (Eliminate)	Target a node. If an enemy agent is there, eliminate them.	Red (East / Stasi): Refunds Intel cost if the strike lands.
2. Deck Customization & Loadouts

Instead of fixed moves, each player constructs a 10-Card Operation Loadout before the match starts.

    Matching Sector Synergy: Playing a Red Wiretap in a Red Sector costs 1 less Intel and grants bonus vision.

    Deck Archetypes:

        The Phantom (Green/Decoy heavy): Focuses on mobility, tunnel escapes, and false pings.

        The Hunter (Red/Strike heavy): Focuses on aggressive scanning and quick eliminations.

        The Oligarch (Gold/Bribe heavy): Focuses on choking out the map's Intel supply.

3. Scaling: 1 to 4 Players

1 Player  ---> Solo vs. "Stasi Automaton" AI (tracks movement patterns deterministically)
2 Players ---> Classic 1v1 Cat-and-Mouse Duel across Checkpoint Charlie
3-4 Players -> 4-Player Free-For-All OR 2v2 Spy Ring (Teammates share fog of war)

    Handling Multi-Spy Fog of War: Multiple spies can occupy the same node simultaneously without knowing it unless an Agent ends their turn in an unfortified node occupied by another spy, triggering an automatic ambush.

4. Next.js / React Data Architecture

To store card decks, sector colors, and player hands cleanly in React, use typed data structures:
TypeScript

type Color = 'RED' | 'BLUE' | 'GOLD' | 'GREEN';
type Icon = 'AGENT' | 'WIRETAP' | 'BRIBE' | 'DECOY' | 'SAFEHOUSE' | 'STRIKE';

interface Card {
  id: string;
  name: string;
  icon: Icon;
  color: Color;
  intelCost: number;
}

interface Player {
  id: string;
  name: string;
  intel: number;
  currentSectorId: string;
  isCovered: boolean;
  deck: Card[];
  hand: Card[];
}

interface SectorNode {
  id: string;
  name: string; // e.g., "Checkpoint Charlie", "Alexanderplatz"
  color: Color;
  x: number; // For SVG rendering (%)
  y: number; 
  connectedNodeIds: string[];
  fortifiedByPlayerId?: string;
}

How would you like to build Berlin 1988?

This is good. Dont worry about code. consolidate and expand game. Put it in an .md file

   [ Tempelhof ] (Blue)
         |
   [ Kreuzberg ] (Green) ====== (Subway Tunnel) ====== [ Alexanderplatz ] (Red)
         |                                                    |

[ Checkpoint Charlie ] (Gold) ---------------------- [ Friedrichstraße ] (Gold)
|                                                    |
[ Tiergarten ] (Blue) -------------------------- [ Prenzlauer Berg ] (Red)


### Node Attributes
Each node on the map contains the following state attributes:
* `id`: Unique string identifier (e.g., `"checkpoint_charlie"`).
* `name`: Display name.
* `sectorColor`: Red, Blue, Gold, or Green.
* `control`: `Unclaimed`, `Player1`, `Player2`, `Player3`, `Player4`.
* `informantActive`: Boolean (generates +1 Intel/turn if claimed).
* `fortified`: Boolean or Player ID (protects occupant from strikes).
* `decoyPresent`: Array of active decoy tokens.
* `x, y`: Coordinate percentages for responsive SVG rendering.

### Edge Types
1. **Standard Routes (Solid Line):** Normal movement between adjacent nodes.
2. **Underground Tunnels (Dashed Green Line):** Require Green cards or special abilities to traverse instantly across distant nodes.
3. **Border Checkpoints (Double Red/Blue Line):** Moving across requires spending +1 Intel unless holding a matching Sector card or Diplomatic Pass.

---

## 4. The Icon & Color Matrix

The game revolves around **6 Core Icons** (Operations) paired with **4 Sector Colors**.

### 4.1 The 6 Operation Icons

| Icon | Operation Name | Primary Action | Intel Cost | Default Effect |
| :---: | :--- | :--- | :---: | :--- |
| 🕵️ | **Agent** | Move | 0 | Move 1 node secretly. If breaking cover, reveals start node. |
| 🎙️ | **Wiretap** | Scan / Ping | 1 | Select any node. Reveals if an enemy agent or decoy is present. |
| 💰 | **Bribe** | Infiltrate | 1 | Capture a neutral node/informant to generate +1 Intel per turn. |
| 🎭 | **Decoy** | Misdirect | 2 | Spawn a false signal on a node. Appears as a real player during pings. |
| 🏛️ | **Safehouse** | Fortify | 2 | Shield a node. Occupant cannot be eliminated by Strikes for 1 round. |
| 🎯 | **Strike** | Eliminate | 3 | Target a node. If an enemy is present and unfortified, they lose 1 Agent. |

### 4.2 The 4 Sector Colors & Faction Affinities

Cards belong to one of four color factions. When played in a node matching its color, the card gains a **Synergy Bonus**:

+-----------------------------------------------------------------------+
|  COLOR FACTION  | AFFINITY / SPECIALTY     | MATCHING SECTOR BONUS    |
+-----------------+--------------------------+--------------------------+
|  RED (Stasi)    | Aggression & Counter-Spy | Strike refunds 1 Intel.  |
|  BLUE (CIA)     | Long-Range Surveillance  | Wiretap scans adjacent   |
|                 |                          | nodes as well.           |
|  GOLD (Diplomat)| Economy & Immunity       | Bribe grants +2 instant  |
|                 |                          | bonus Intel on capture.  |
|  GREEN (Tunnel) | Mobility & Deception     | Decoy allows instant     |
|                 |                          | position swap.           |
+-----------------------------------------------------------------------+


---

## 5. Deck Customization & Loadouts

Before match start, each player selects or customizes a **10-Card Operation Loadout**.

### 5.1 Card Structure
Each card in the deck has:
* **Name:** e.g., *"Stasi Surveillance Net"*, *"CIA Black Site"*, *"U-Bahn Escape"*.
* **Icon Type:** Agent, Wiretap, Bribe, Decoy, Safehouse, or Strike.
* **Color:** Red, Blue, Gold, or Green.
* **Cost:** 0 to 4 Intel.
* **Text Ability:** Special trigger (e.g., *"If this Wiretap finds no enemy, draw 1 card"*).

### 5.2 Deckbuilding Constraints
* **Total Cards:** Exactly 10 cards.
* **Icon Max:** Maximum 3 cards of any single Icon type.
* **Color Distribution:** Must include at least 2 different colors.
* **Starter Decks:**
  1. **The Phantom (Green/Blue):** 3x Decoy, 3x Agent, 2x Wiretap, 1x Safehouse, 1x Strike. High mobility, stealth swaps.
  2. **The Hunter (Red/Blue):** 3x Strike, 3x Wiretap, 2x Agent, 1x Bribe, 1x Safehouse. Fast scanning and quick eliminations.
  3. **The Oligarch (Gold/Red):** 3x Bribe, 2x Safehouse, 2x Agent, 2x Strike, 1x Wiretap. Resource chokehold, defensive turtling.

---

## 6. Turn Structure & Action Economy

The game is turn-based. Each turn consists of **3 Phases**:

[ PHASE 1: INTEL GENERATION ] ---> [ PHASE 2: ACTION PHASE ] ---> [ PHASE 3: END PHASE ]
Gain +1 base Intel +1 for       Play 1-2 Cards or Pass         Draw back to hand limit (3)
each owned Informant node.                                      Check victory conditions.


### 6.1 Action Phase Mechanics
On a player's turn, they have **2 Action Points (AP)**:
* Playing a Card costs its **Intel Cost** + **1 AP**.
* Standard Uncarded Move (Agent) costs **0 Intel** + **1 AP**.
* Passing costs **0 AP** and grants **+1 Intel**.

### 6.2 The Reaction & Interrupt Window
When an action targets another player (e.g., a **Strike** or **Wiretap**), the target player gets a **3-to-5 second Silent Reaction Window** on their screen:

+-----------------------------------------------------------------------+
|  ACTION DETECTED: Player 1 launched STRIKE on [Alexanderplatz]!       |
|  Time Remaining: [||||||||||||||..........] 3.2s                       |
|                                                                       |
|  [ PLAY SAFEHOUSE ]      [ REVEAL DECOY ]      [ ACCEPT / NO ACTION ] |
+-----------------------------------------------------------------------+


* **Play Safehouse:** Negates the strike if played in time.
* **Reveal Decoy:** If the target on that node was a Decoy, it destroys the decoy and wastes Player 1's Intel and AP.

---

## 7. Game Modes & Player Rules (1 to 4 Players)

### 7.1 Solo Mode: The "Stasi Automaton" AI
In 1-Player mode, the player faces an automated counter-intelligence AI operating on a deterministic behavior tree:

                 [ START AUTOMATON TURN ]
                            |
               Has player location been pinged?
                   /                 \\
                (YES)               (NO)
                 /                     \\
  Is Player within 2 nodes?        Scan node with highest
      /            \\               connected edge degree.
   (YES)          (NO)                   |
    /                \\             Place Wiretap / Bribe.

Launch Strike.    Move towards
last known ping.


* **Movement Rules:** The Automaton does not cheat—it maintains internal probability weights for every node based on sound pings, informant captures, and recent player card usage.

### 7.2 1v1 Classic Duel
* **Objective:** Eliminate the enemy Agent OR capture 4 out of 6 major Sector Capital nodes.
* **Fog of War:** Complete fog. You only see nodes where you have an Agent, an active Wiretap, or a captured Informant.

### 7.3 3–4 Player Free-For-All
* **Objective:** Last Agent standing OR first player to reach 15 Intel.
* **Bounty System:** Eliminating another player transfers all their current Intel to you.
* **Multi-Occupancy:** Nodes can hold multiple hidden agents. If two agents end their turn on the same unfortified node without decoys, an **Ambush Combat** triggers immediately.

### 7.4 2v2 Spy Ring (Team Play)
* **Team Structure:** Team Alpha (West/Blue & Gold) vs. Team Bravo (East/Red & Green).
* **Shared Vision:** Teammates share Fog of War vision and Wiretap ping results.
* **Pass Cards:** Once per round, a player can spend 1 Intel to pass 1 card from their hand to their partner.

---

## 8. Combat, Detection & Deception Systems

### 8.1 Ambush Resolution Engine
When two opposing agents occupy the exact same node:
1. Both players receive a confidential pop-up: *"AGENT ENCOUNTER AT [NODE NAME]"*.
2. Both secret choices are locked in simultaneously:
   * **Option A (Attack):** Spend 2 Intel to strike immediately.
   * **Option B (Evade):** Spend 1 Intel to retreat to an adjacent connected node.
   * **Option C (Counter-Bluff):** Reveal a Red or Green card to force opponent to misfire.
3. If both Attack, the player with higher Intel wins; ties result in mutual retreat.

### 8.2 Decoy Mechanics
* Decoys are placed face-down on a node.
* To all opponents, a Decoy looks identical to a real Agent token under Wiretaps/Pings.
* If an opponent launches a **Strike** against a Decoy:
  * The Decoy is destroyed.
  * The attacker loses their 3 Intel and AP.
  * The attacker's location is revealed to the Decoy owner.

---

## 9. Technical Architecture & Next.js Implementation Guide

### 9.1 Recommended Tech Stack
* **Framework:** Next.js 14+ (App Router).
* **Language:** TypeScript.
* **UI & Animation:** Tailwind CSS + Framer Motion (for smooth node glowing and card plays).
* **Rendering Engine:** Native SVG for the network map (scalable, accessible, responsive).
* **State Engine:** React `useReducer` with custom Finite State Machine pattern (or XState).
* **Networking (Multiplayer):** PartyKit / Supabase Realtime WebSockets.
* **Hosting:** Vercel.

### 9.2 Key Data Schemas (TypeScript Interfaces)

```typescript
// Core Data Types for Berlin 1988

export type ColorSector = 'RED' | 'BLUE' | 'GOLD' | 'GREEN';
export type IconType = 'AGENT' | 'WIRETAP' | 'BRIBE' | 'DECOY' | 'SAFEHOUSE' | 'STRIKE';

export interface Card {
  id: string;
  name: string;
  icon: IconType;
  color: ColorSector;
  intelCost: number;
  description: string;
  synergyText?: string;
}

export interface NodeState {
  id: string;
  name: string;
  sectorColor: ColorSector;
  x: number; // SVG % offset x
  y: number; // SVG % offset y
  connectedNodeIds: string[];
  ownerPlayerId?: string;
  isFortified: boolean;
  hasWiretapByPlayerId?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  colorFaction: ColorSector;
  intel: number;
  actionPoints: number;
  currentNodId: string; // Hidden from opponents
  isCovered: boolean;
  deck: Card[];
  hand: Card[];
  discard: Card[];
  eliminated: boolean;
}

export interface GameState {
  gameId: string;
  mode: 'SOLO' | 'DUEL_1V1' | 'FFA_4P' | 'TEAMS_2V2';
  turnNumber: number;
  activePlayerIndex: number;
  phase: 'INTEL_GEN' | 'ACTION_PHASE' | 'REACTION_WINDOW' | 'END_PHASE';
  nodes: Record<string, NodeState>;
  players: PlayerState[];
  reactionTimerRemaining: number;
  lastActionSummary?: string;
}

9.3 State Machine Flow Diagram

 +-----------------------------------------------------------------------+
 |                         [ INITIALIZE GAME ]                           |
 +-----------------------------------------------------------------------+
                                     |
                                     v
 +-----------------------------------------------------------------------+
 |                       [ START PLAYER TURN ]                           |
 |  - Collect Intel (+1 base, +1 per Informant)                          |
 |  - Reset Action Points (AP = 2)                                       |
 +-----------------------------------------------------------------------+
                                     |
                                     v
 +-----------------------------------------------------------------------+
 |                         [ ACTION PHASE ]                              |
 |  Options: Play Card / Move Agent / Bribe / Pass                       |
 +-----------------------------------------------------------------------+
                                     |
                +--------------------+--------------------+
                |                                         |
     (Targeted Action Played)                     (Non-Targeted Action)
                |                                         |
                v                                         v
 +----------------------------+             +----------------------------+
 |   [ REACTION WINDOW ]      |             |     [ RESOLVE ACTION ]     |
 | - 4s Timer for Opponent    |             | - Update Node/Player State |
 | - Options: Block / Shield  |             +----------------------------+
 +----------------------------+                           |
                |                                         |
                +--------------------+--------------------+
                                     |
                                     v
 +-----------------------------------------------------------------------+
 |                          [ END PHASE ]                                |
 |  - Check Victory Conditions (Eliminations / Intel Target / Capitals)  |
 |  - Refill Hand to 3 Cards                                             |
 |  - Pass Turn to Next Player / Automaton AI                            |
 +-----------------------------------------------------------------------+

10. Summary & Next Steps for Development

Berlin 1988 brings together the strategic depth of node-based movement, the intrigue of deck-building, and the adrenaline of silent deception into a compact, web-ready package.
Quick Start Checklist for Vercel Deployment:

    npx create-next-app@latest berlin-1988 --typescript --tailwind

    Create the SVG network map component rendering the 12 primary Berlin nodes.

    Implement the useReducer engine using the TypeScript interfaces defined above.

    Add card drawing, hand management, and fog-of-war filter functions.

    Deploy to Vercel via git push origin main.
    """

with open("berlin_1988_game_design.md", "w", encoding="utf-8") as f:
f.write(md_text)

print("File written successfully.")


```text?code_stdout&code_event_index=1
File written successfully.

Your Markdown file is ready
MD icon
berlin_1988_game_design
 MD 
Berlin 1988: Shadows of the Wall
Game Design Document & Official Rulebook Overview

The complete game design document for Berlin 1988 has been generated and consolidated into berlin_1988_game_design.md. It covers everything from thematic design and player scaling to full technical specifications for building and deploying on Vercel.
Highlights Included in the Document

    Setting & Atmosphere:

        Divided Cold War Berlin (Autumn 1988) across East/Stasi, West/CIA, Diplomatic, and Underground Subway Tunnel sectors.

        Grainy CRT monitor aesthetic, phosphor green terminal styling, and dark rain-slicked city aesthetics.

    The 6 Icon & 4 Color Matrix:

        Icons: 🕵️ Agent (Move), 🎙️ Wiretap (Scan/Ping), 💰 Bribe (Informants), 🎭 Decoy (Bluff/Swap), 🏛️ Safehouse (Shield/Fortify), and 🎯 Strike (Eliminate).

        Colors: Red (Stasi), Blue (CIA), Gold (Diplomatic), Green (Tunnel).

        Matching Sector Synergies: Playing a card on a node matching its color grants instant cost discounts, bonus vision, or location swaps.

    10-Card Deckbuilding Engine:

        Custom deck configuration rules with starter archetypes (The Phantom, The Hunter, and The Oligarch).

        Intel economy balancing and hand limits.

    Silent Reaction Windows:

        Textless, timer-based reaction system (3–5 second interrupt windows) allowing defenders to deploy Safehouses or reveal Decoys when targeted by enemy Strikes or Wiretaps.

    Dynamic 1–4 Player Scaling:

        Solo Mode: Features a deterministic decision-tree AI (Stasi Automaton) that hunts the player using weighted probability models based on pings, informant captures, and played cards.

        1v1 Classic Duel: High-tension cat-and-mouse hunt.

        3–4 Player FFA: Bounty system, multi-agent node occupancy, and instantaneous ambush combat.

        2v2 Team Spy Ring: Shared fog of war, joint vision, and card passing mechanics.

    Full Vercel Tech Specification:

        Next.js 14 (App Router) + Tailwind CSS + Framer Motion.

        Complete TypeScript interfaces for Card, NodeState, PlayerState, and GameState.

        Finite State Machine (FSM) flowcharts for turn execution, reaction windows, and game resolution.

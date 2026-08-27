import type {
  BlockadeEvent,
  GameState,
  NodeRuntime,
  OpponentPublicInfo,
  PlayerId,
  PlayerView,
  SelfView,
} from '@berlin/shared';
import { visibleNodesFor } from './visibility.js';
import { filterEvents } from './filterEvents.js';
import { hasPassive } from '../passives.js';
import { scoreOf } from '../victory.js';

/**
 * THE fog boundary. The only sanctioned way for state to leave the engine
 * toward a client. Changes here are reviewed as security changes.
 *
 * Views are built BY CONSTRUCTION, never by cloning GameState and deleting
 * fields. Start from nothing, add what the player has earned. The day someone
 * adds a new secret to PlayerSecrets, the deletion approach leaks it silently
 * and this approach simply omits it.
 */
export function projectView(state: GameState, viewer: PlayerId): PlayerView {
  const me = state.players[viewer as string];
  if (!me) throw new Error(`Unknown player: ${viewer}`);

  const visible = visibleNodesFor(state, viewer);
  const visibleNodes: Record<string, NodeRuntime> = {};
  for (const key of visible) {
    const n = state.nodes[key];
    if (n) visibleNodes[key] = { ...n };
  }

  // Blockades are public once active, and once announced a round ahead.
  const activeBlockades: Record<string, number> = {};
  for (const [key, n] of Object.entries(state.nodes)) {
    if (n.blockadedUntil !== null && n.blockadedUntil > state.round) {
      activeBlockades[key] = n.blockadedUntil;
    }
  }
  const announcedBlockades = state.blockadeSchedule.filter(
    (b) => b.announced && b.round === state.round + 1,
  );

  // Kontrolle Schedule is the one legitimate way to see the future.
  const knownBlockades: BlockadeEvent[] = hasPassive(me, 'KONTROLLE_SCHEDULE')
    ? state.blockadeSchedule.filter((b) => b.round >= state.round)
    : [];

  const self: SelfView = {
    id: me.id,
    name: me.name,
    faction: me.faction,
    team: me.team,
    agents: me.agents.map((a) => ({ ...a })),
    intel: me.intel,
    safehouse: me.safehouse,
    loadout: [...me.loadout],
    passivesAvailable: [...me.passivesAvailable],
    cooldowns: { ...me.cooldowns },
    silencers: me.silencers,
    traps: state.traps.filter((t) => t.ownerId === viewer).map((t) => ({ ...t })),
    decoys: state.decoys.filter((d) => d.ownerId === viewer).map((d) => ({ ...d })),
    burnsInflicted: me.burnsInflicted,
    dossiersExtracted: me.dossiersExtracted,
    // Same call, same value opponents already see (SelfView.score's own
    // doc comment) — the viewer's score can never drift from what everyone
    // else is shown for them.
    score: scoreOf(state, viewer),
    eliminated: me.eliminated,
    knownBlockades,
  };

  const opponents: OpponentPublicInfo[] = [];
  for (const id of state.playerOrder) {
    if (id === viewer) continue;
    const p = state.players[id as string]!;
    opponents.push({
      id: p.id,
      name: p.name,
      faction: p.faction,
      team: p.team,
      isBot: p.isBot,
      intel: p.intel,
      agentsAlive: p.agents.filter((a) => a.alive).length,
      agentsTotal: p.agents.length,
      score: scoreOf(state, p.id),
      eliminated: p.eliminated,
      committedAgents: p.agents.filter(
        (a) => a.alive && state.pendingOrders[a.id as string] !== undefined,
      ).length,
    });
  }

  const burnTracks: Record<string, PlayerView['burnTracks'][string]> = {};
  for (const id of state.playerOrder) {
    burnTracks[id as string] = (state.burnTracks[id as string] ?? []).map((e) => ({ ...e }));
  }

  return {
    matchId: state.matchId as string,
    round: state.round,
    phase: state.phase,
    settings: state.settings,
    ruleset: state.ruleset,
    map: state.map,
    self,
    opponents,
    visibleNodes,
    activeBlockades,
    announcedBlockades,
    signals: (state.signals[viewer as string] ?? []).map((s) => ({ ...s })),
    burnTracks,
    lastRound: filterEvents(state, state.lastRoundLog, viewer),
    clock: {
      deadlineAt: null, // owned by the room, not the engine
      paused: false,
      pausesRemaining: me.pausesRemaining,
    },
    outcome: state.outcome,
  };
}

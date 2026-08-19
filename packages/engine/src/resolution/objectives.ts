import { emit, posOf, type RoundContext } from './ctx.js';
import { nodeOf } from '../graph.js';

/**
 * Step 11 — dossier pickup and extraction.
 *
 * Last in the pipeline, deliberately: a burned agent cannot extract. Winning by
 * carrying three dossiers home should require surviving the round you did it in.
 */
export function stepObjectives(ctx: RoundContext): void {
  const state = ctx.state;
  const rs = state.ruleset;

  for (const pid of state.playerOrder) {
    const player = state.players[pid as string]!;
    if (player.eliminated) continue;

    for (const agent of player.agents) {
      if (!agent.alive || ctx.burned.has(agent.id as string)) continue;

      const nodeKey = posOf(ctx, agent);
      const runtime = state.nodes[nodeKey]!;

      // Pickup. Taking one is loud — it names the node publicly.
      while (runtime.dossiers > 0 && agent.dossiers < rs.maxDossiersCarried) {
        runtime.dossiers -= 1;
        agent.dossiers += 1;
        state.dossierRespawns.push(state.round + rs.dossierRespawnDelay);
        emit(ctx, {
          type: 'DOSSIER_TAKEN',
          playerId: player.id,
          agentId: agent.id,
          nodeId: agent.nodeId,
        });
      }

      // Extraction — your own faction's point, carrying the full set.
      const mapNode = nodeOf(state.map, agent.nodeId);
      if (mapNode.extractionFor === player.faction && agent.dossiers >= rs.dossiersToExtract) {
        player.dossiersExtracted += agent.dossiers;
        agent.dossiers = 0;
        emit(ctx, {
          type: 'EXTRACTION',
          playerId: player.id,
          agentId: agent.id,
          nodeId: agent.nodeId,
        });
      }
    }
  }
}

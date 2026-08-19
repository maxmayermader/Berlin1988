import { claim, collect, emit, nextId, playCard, spend, type RoundContext } from './ctx.js';

/**
 * Step 2 — ambushes set (Strike Mode B).
 *
 * Laid on the agent's start-of-round node, before movement, so a trap laid this
 * round is live this round. That is the whole point of Mode B: you prepare the
 * ground you are standing on, and then you are free to walk away from it.
 *
 * Setting a trap makes no noise at all. It is only heard when it fires.
 */
export function stepTraps(ctx: RoundContext): void {
  const rs = ctx.state.ruleset;

  for (const { player, agent, action } of collect(ctx, 'AMBUSH')) {
    if (!spend(player, rs.ambushIntelCost)) continue;

    ctx.state.traps.push({
      id: nextId(ctx.state, 'trap'),
      ownerId: player.id,
      nodeId: agent.nodeId,
      expiresAfterRound: ctx.state.round + rs.ambushDurationRounds - 1,
    });

    playCard(ctx, player, action.cardId);
    emit(ctx, { type: 'AMBUSH_SET', playerId: player.id, nodeId: agent.nodeId });

    // A trap is a claim on the node — the contested step needs it to detect
    // mutual traps and trap-versus-strike collisions.
    claim(ctx, agent.nodeId as string, player.id);
  }
}

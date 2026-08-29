import type { GameState, PlayerId, ResolutionEvent } from '@berlin/shared';
import { audibilityFor } from './strikeNoise.js';
import { hasPassive } from '../passives.js';
import { visionGroup } from './visibility.js';

/**
 * Reduce the truth log to what one player is entitled to have seen.
 *
 * Events are dropped, not blanked, so a client cannot infer that something
 * happened from a placeholder. The one exception is AGENT_BURNED, where the
 * fact is public but the killer's identity is not — that one is rewritten.
 */
export function filterEvents(
  state: GameState,
  events: readonly ResolutionEvent[],
  viewer: PlayerId,
): ResolutionEvent[] {
  const group = new Set(visionGroup(state, viewer).map((p) => p as string));
  const mine = (id: PlayerId) => group.has(id as string);
  const out: ResolutionEvent[] = [];

  for (const ev of events) {
    switch (ev.type) {
      // Public, always.
      case 'ROUND_START':
      case 'BLOCKADE_ANNOUNCED':
      case 'BLOCKADE_CLOSED':
      case 'BLOCKADE_LIFTED':
      case 'DOSSIER_SPAWNED':
      case 'INFORMANT_CLAIMED':
      case 'CARD_PLAYED':
      case 'PASSIVE_FIRED':
      case 'PLAYER_ELIMINATED':
      case 'MATCH_ENDED':
        out.push(ev);
        break;

      // Public that it happened, but never WHICH agent. Agent ids are stable
      // for the whole match, so handing one out lets an opponent correlate
      // sightings across rounds for free — a much bigger leak than the event.
      case 'DOSSIER_TAKEN':
      case 'EXTRACTION':
        out.push(mine(ev.playerId) ? ev : { ...ev, agentId: null });
        break;

      // Private to the acting player (and teammates).
      case 'SAFEHOUSE_PLACED':
      case 'AMBUSH_SET':
      case 'DECOY_PLACED':
      case 'AGENT_MOVED':
      case 'WIRETAP_RESULT':
      case 'SILENCER_BOUGHT':
      case 'INTEL_GAINED':
        if (mine(ev.playerId)) out.push(ev);
        break;

      // Public that it happened, private who did it. The signals layer emits
      // the anonymous version; here we only surface it to the crosser.
      case 'CHECKPOINT_CROSSED':
        if (mine(ev.playerId)) out.push(ev);
        break;

      // Both sides of an ambush learn what happened — but the owner only learns
      // that someone walked in and where, never which agent.
      case 'AMBUSH_TRIGGERED':
        if (mine(ev.victimId)) out.push(ev);
        else if (mine(ev.ownerId)) out.push({ ...ev, victimAgentId: null });
        break;

      case 'BLOCKADE_CAUGHT':
        if (mine(ev.playerId)) out.push(ev);
        break;

      case 'STRIKE_FIRED': {
        const audibility = audibilityFor(state, ev, viewer);
        // Only agents standing next to it learn the node. Everyone else gets
        // the sector, and that arrives as a STRIKE_VICINITY signal rather than
        // a half-redacted event — a node id typed NodeId has no honest "blurred"
        // value, so the event is dropped instead of faked.
        if (audibility !== 'EXACT') break;
        out.push(mine(ev.playerId) ? ev : { ...ev, agentId: null });
        break;
      }

      case 'CONTEST':
        if (ev.claimants.some((c) => mine(c))) out.push(ev);
        break;

      case 'AGENT_BURNED': {
        // A burn is public. The killer's identity is not, unless you are the
        // killer, or the victim holding Sleeper Cell.
        const victim = state.players[ev.playerId as string];
        const knowsKiller =
          (ev.byPlayerId !== null && mine(ev.byPlayerId)) ||
          (mine(ev.playerId) && victim !== undefined && hasPassive(victim, 'SLEEPER_CELL'));
        out.push({
          ...ev,
          agentId: mine(ev.playerId) ? ev.agentId : null,
          byPlayerId: knowsKiller ? ev.byPlayerId : null,
        });
        break;
      }
    }
  }

  return out;
}

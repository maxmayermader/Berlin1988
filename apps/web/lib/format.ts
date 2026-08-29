import type { ResolutionEvent } from '@berlin/shared';
import { CODENAME_MAX_LENGTH } from './identity.js';

/**
 * The single source of human-readable event/label text — apps/web/lib/CLAUDE.md
 * rule 5: keeping this in one place means the visual string and the
 * screen-reader announcement can never drift apart.
 */

/**
 * 01-UI-SPEC.md's exact copy for a server-rejected order, with `{reason}`
 * filled from the server's own rejection message — never a raw stack trace.
 */
export function orderRejectionText(reason: string): string {
  return `Your order couldn't be submitted — ${reason}. Fix it and resubmit before the timer runs out.`;
}

/** The 20-character ellipsis rule (01-UI-SPEC.md overflow row), applied
 *  anywhere a codename renders as a label. Codenames are already capped at
 *  entry (apps/web/lib/identity.ts), so this is a defensive backstop for
 *  any value that reaches this module some other way. */
export function truncateCodename(name: string): string {
  if (name.length <= CODENAME_MAX_LENGTH) return name;
  return `${name.slice(0, CODENAME_MAX_LENGTH - 1)}…`;
}

/** How a contested node was decided, in prose — apps/web/components/board/CLAUDE.md
 *  rule 3: a player who loses a 50/50 needs to see it was a 50/50. */
const CONTEST_METHOD_TEXT: Record<string, string> = {
  MUTUAL_TRAP: 'a mutual trap',
  SAFEHOUSE: 'a safehouse tiebreak',
  COIN_FLIP: 'a coin flip',
  K9_ROLL: 'a K9 roll',
};

/**
 * The single source of prose for a resolution event — the same string feeds
 * the visible row and its accessible announcement, so the two cannot drift
 * (apps/web/lib/CLAUDE.md rule 5). A case per `ResolutionEvent` member, no
 * default branch: `noFallthroughCasesInSwitch` and exhaustiveness checking
 * make a new event type a compile error rather than a blank row. Every
 * numeric field renders as the engine's exact integer with no client-side
 * rounding, truncation, or unit conversion. An event whose agent id was
 * nulled by fog (`packages/shared/src/orders.ts`) renders as prose about an
 * unnamed agent, never as an empty slot or a crash — T-1-26.
 */
export function eventText(event: ResolutionEvent): string {
  switch (event.type) {
    case 'ROUND_START':
      return `Round ${event.round} begins.`;
    case 'SAFEHOUSE_PLACED':
      return `A safehouse was placed at ${event.nodeId}.`;
    case 'AMBUSH_SET':
      return `An ambush was set at ${event.nodeId}.`;
    case 'DECOY_PLACED':
      return `A decoy was placed at ${event.nodeId}.`;
    case 'AGENT_MOVED': {
      const via = event.viaTunnel
        ? ' through a tunnel'
        : event.viaCheckpoint
          ? ' through a checkpoint'
          : '';
      const sprint = event.sprint ? ', sprinting' : '';
      return `An agent moved from ${event.from} to ${event.to}${via}${sprint}.`;
    }
    case 'CHECKPOINT_CROSSED':
      return event.silent
        ? `An agent crossed the checkpoint at ${event.nodeId} without being noticed.`
        : `An agent crossed the checkpoint at ${event.nodeId}.`;
    case 'AMBUSH_TRIGGERED': {
      const who = event.victimAgentId ? 'An agent' : 'Someone';
      if (event.escaped) {
        const to = event.escapedTo ? ` to ${event.escapedTo}` : '';
        return `${who} triggered a trap at ${event.nodeId} and escaped${to}.`;
      }
      const sealed = event.sealed ? ' and was sealed in' : '';
      return `${who} triggered a trap at ${event.nodeId}${sealed}.`;
    }
    case 'BLOCKADE_ANNOUNCED':
      return `A blockade at ${event.nodeId} was announced for round ${event.round}.`;
    case 'BLOCKADE_CLOSED':
      return `${event.nodeId} was sealed by a blockade until round ${event.until}.`;
    case 'BLOCKADE_LIFTED':
      return `The blockade at ${event.nodeId} was lifted.`;
    case 'BLOCKADE_CAUGHT': {
      if (!event.survived) {
        return `An agent was caught and burned in the blockade at ${event.nodeId}.`;
      }
      const to = event.relocatedTo ? `, relocated to ${event.relocatedTo}` : '';
      return `An agent was caught in the blockade at ${event.nodeId}${to}.`;
    }
    case 'INFORMANT_CLAIMED':
      return `An informant was claimed at ${event.nodeId}.`;
    case 'WIRETAP_RESULT': {
      const n = event.results.length;
      return `A wiretap on ${event.target} reported ${n} node${n === 1 ? '' : 's'}.`;
    }
    case 'STRIKE_FIRED': {
      const who = event.agentId ? 'An agent' : 'Someone';
      const silenced = event.silenced ? ', silenced' : '';
      return `${who} struck ${event.target} from ${event.from}${silenced}.`;
    }
    case 'CONTEST': {
      const method = CONTEST_METHOD_TEXT[event.method] ?? event.method;
      return event.winner
        ? `${event.nodeId} was contested and decided by ${method}.`
        : `${event.nodeId} was contested by ${method}, with no winner.`;
    }
    case 'AGENT_BURNED': {
      const dropped =
        event.dossiersDropped > 0
          ? `, dropping ${event.dossiersDropped} dossier${event.dossiersDropped === 1 ? '' : 's'}`
          : '';
      return `An agent was burned at ${event.nodeId}${dropped}.`;
    }
    case 'DOSSIER_TAKEN':
      return `A dossier was taken at ${event.nodeId}.`;
    case 'DOSSIER_SPAWNED':
      return `A dossier appeared at ${event.nodeId}.`;
    case 'EXTRACTION':
      return `An agent extracted at ${event.nodeId}.`;
    case 'PASSIVE_FIRED':
      return `A passive card fired${event.consumed ? ' and was consumed' : ''}.`;
    case 'CARD_PLAYED':
      return 'A card was played.';
    case 'SILENCER_BOUGHT':
      return `${event.count} silencer${event.count === 1 ? '' : 's'} were bought.`;
    case 'INTEL_GAINED':
      return `${event.amount} Intel was gained.`;
    case 'PLAYER_ELIMINATED':
      return 'A player was eliminated.';
    case 'MATCH_ENDED':
      return `The match ended — ${event.reason.toLowerCase().replace(/_/g, ' ')}.`;
  }
}

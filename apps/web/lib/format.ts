import type { Action, MapDefinition, NodeId, ResolutionEvent } from '@berlin/shared';
import { tryGetCard } from '@berlin/engine';
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
/**
 * A node's display name, from the map. Falls back to the raw id so a node
 * the map somehow doesn't carry still renders something a player can report,
 * rather than an empty string.
 */
export function nodeName(map: MapDefinition, id: NodeId): string {
  return map.nodes.find((n) => n.id === id)?.name ?? (id as string);
}

/**
 * One composed action in plain language, using node names rather than ids —
 * "Strike Alexanderplatz", not "Strike alexanderplatz". Kept here with the
 * rest of the human-readable text so the composer and the resolution log
 * cannot drift apart (apps/web/lib/CLAUDE.md rule 5).
 */
export function actionText(map: MapDefinition, action: Action): string {
  switch (action.type) {
    case 'HOLD':
      return 'Hold';
    case 'MOVE':
      return `Move to ${nodeName(map, action.to)}`;
    case 'SPRINT':
      return `Sprint via ${nodeName(map, action.via)} to ${nodeName(map, action.to)}`;
    case 'WIRETAP':
      return `Wiretap ${nodeName(map, action.target)}`;
    case 'BRIBE':
      return 'Bribe the informant here';
    case 'DECOY':
      return `Decoy at ${nodeName(map, action.target)}`;
    case 'SAFEHOUSE':
      return 'Establish safehouse here';
    case 'STRIKE':
      return `Strike ${nodeName(map, action.target)}`;
    case 'AMBUSH':
      return 'Set an ambush here';
  }
}

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
 * The round number a stored (or live) log belongs to — read from the log's
 * own `ROUND_START` event rather than trusting a caller-supplied index.
 * `ROUND_START` is in the always-public branch of
 * `packages/engine/src/fog/filterEvents.ts`, so it survives fog reduction
 * for every viewer and every stored history entry; `fallback` only matters
 * for a malformed or empty log, never the normal path. Mirrors the
 * round-derivation `apps/web/app/match/[code]/page.tsx` already performs for
 * the live step-through, so that logic stops being duplicated.
 */
export function roundNumberOf(log: readonly ResolutionEvent[], fallback: number): number {
  const first = log[0];
  return first?.type === 'ROUND_START' ? first.round : fallback;
}

/**
 * A round-history row's headline — a bounded template (counts plus fixed
 * nouns, capped at two clauses) rather than free event prose, which is what
 * lets the long-text overflow row in 04-UI-SPEC.md's UI Considerations table
 * need no truncation rule. Follows `eventText()`'s existing count-and-
 * pluralize idiom (its `WIRETAP_RESULT` branch) instead of inventing a new
 * one.
 *
 * Source reconciliation (recorded here so the next reader doesn't
 * re-litigate it): 04-UI-SPEC.md's Copywriting Contract says "dossiers
 * extracted," while 04-PATTERNS.md's sketch suggested counting the
 * pickup event instead. Those are different game facts — the pickup event
 * fires when an agent lifts a dossier off a node; `EXTRACTION` fires when
 * that agent reaches an extraction point and banks it, which is the
 * scoring event and the one the copy describes. `EXTRACTION` wins; the
 * pickup event type is deliberately not counted here.
 */
export function roundHeadline(log: readonly ResolutionEvent[]): string {
  let extractions = 0;
  let burns = 0;
  let contests = 0;
  for (const event of log) {
    switch (event.type) {
      case 'EXTRACTION':
        extractions++;
        break;
      case 'AGENT_BURNED':
        burns++;
        break;
      case 'CONTEST':
        contests++;
        break;
      default:
        break;
    }
  }

  const clauses: string[] = [];
  if (extractions > 0) {
    clauses.push(`${extractions} dossier${extractions === 1 ? '' : 's'} extracted`);
  }
  if (burns > 0) {
    clauses.push(`${burns} agent${burns === 1 ? '' : 's'} burned`);
  }
  if (contests > 0) {
    clauses.push(`${contests} contested node${contests === 1 ? '' : 's'}`);
  }

  if (clauses.length === 0) return 'quiet round';
  return clauses.slice(0, 2).join('; ');
}

/**
 * Who and where, for event prose. Every field is optional: with no context
 * the prose falls back to anonymous wording and raw node ids, which is what
 * the unit tests exercise and what a malformed frame degrades to.
 *
 * Names come only from the viewer's own PlayerView (`self.name`,
 * `opponents[].name`) and agent labels only from the viewer's own agent
 * list, so the context can make prose more readable but never more
 * informative than the fog-filtered event already is — an event whose
 * `agentId` or `byPlayerId` was nulled by `filterEvents()` still reads as
 * an unnamed agent or an unknown killer.
 */
export interface EventContext {
  readonly map?: MapDefinition;
  /** playerId → display name. */
  readonly names?: Readonly<Record<string, string>>;
  /** The viewer's own player id, so their events read in the second person. */
  readonly selfId?: string;
  /** The viewer's own agent ids → "Agent 1" / "Agent 2". */
  readonly agentLabels?: Readonly<Record<string, string>>;
}

/** Builds the context once per render from fields the viewer already holds. */
export function eventContextFor(view: {
  readonly map: MapDefinition;
  readonly self: { readonly id: string; readonly name: string; readonly agents: readonly { readonly id: string }[] };
  readonly opponents: readonly { readonly id: string; readonly name: string }[];
}): EventContext {
  const names: Record<string, string> = { [view.self.id]: view.self.name };
  for (const o of view.opponents) names[o.id] = o.name;
  const agentLabels: Record<string, string> = {};
  view.self.agents.forEach((a, i) => {
    agentLabels[a.id] = view.self.agents.length > 1 ? `Agent ${i + 1}` : 'Your agent';
  });
  return { map: view.map, names, selfId: view.self.id, agentLabels };
}

function placeOf(ctx: EventContext, id: NodeId): string {
  return ctx.map ? nodeName(ctx.map, id) : (id as string);
}

/** "You", a codename, or "A rival" when the player is unknown. */
function whoOf(ctx: EventContext, playerId: string | null): string {
  if (playerId === null) return 'Someone';
  if (ctx.selfId !== undefined && playerId === ctx.selfId) return 'You';
  return ctx.names?.[playerId] ?? 'A rival';
}

/** "Your", "Marek's", or "A rival's". */
function whoseOf(ctx: EventContext, playerId: string): string {
  if (ctx.selfId !== undefined && playerId === ctx.selfId) return 'Your';
  const name = ctx.names?.[playerId];
  return name ? `${name}'s` : "A rival's";
}

/** "Agent 2" for one of the viewer's own agents when the id survived fog,
 *  otherwise "<whose> agent". */
function agentOf(ctx: EventContext, playerId: string, agentId: string | null): string {
  if (agentId !== null) {
    const label = ctx.agentLabels?.[agentId];
    if (label) return label;
  }
  return `${whoseOf(ctx, playerId)} agent`;
}

function cardNameOf(cardId: string): string {
  return tryGetCard(cardId as never)?.name ?? 'a card';
}

const BURN_CAUSE_TEXT: Record<string, string> = {
  STRIKE: 'by a strike',
  AMBUSH: 'in an ambush',
  BLOCKADE: 'in a blockade',
  CONTEST: 'losing a contested node',
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
export function eventText(event: ResolutionEvent, ctx: EventContext = {}): string {
  const at = (id: NodeId) => placeOf(ctx, id);
  switch (event.type) {
    case 'ROUND_START':
      return `Round ${event.round} begins.`;
    case 'SAFEHOUSE_PLACED':
      return `${whoOf(ctx, event.playerId)} established a safehouse at ${at(event.nodeId)}.`;
    case 'AMBUSH_SET':
      return `${whoOf(ctx, event.playerId)} set an ambush at ${at(event.nodeId)}.`;
    case 'DECOY_PLACED':
      return `${whoOf(ctx, event.playerId)} planted a decoy at ${at(event.nodeId)}.`;
    case 'AGENT_MOVED': {
      const via = event.viaTunnel
        ? ' through a tunnel'
        : event.viaCheckpoint
          ? ' through a checkpoint'
          : '';
      const verb = event.sprint ? 'sprinted' : 'moved';
      return `${agentOf(ctx, event.playerId, event.agentId)} ${verb} from ${at(event.from)} to ${at(event.to)}${via}.`;
    }
    case 'CHECKPOINT_CROSSED':
      return event.silent
        ? `${whoOf(ctx, event.playerId)} crossed the checkpoint at ${at(event.nodeId)} without being noticed.`
        : `${whoOf(ctx, event.playerId)} crossed the checkpoint at ${at(event.nodeId)}. The crossing was reported.`;
    case 'AMBUSH_TRIGGERED': {
      const victimIsSelf = ctx.selfId !== undefined && event.victimId === ctx.selfId;
      const ownerIsSelf = ctx.selfId !== undefined && event.ownerId === ctx.selfId;
      const outcome = event.escaped
        ? ` and escaped${event.escapedTo ? ` to ${at(event.escapedTo)}` : ''}`
        : event.sealed
          ? ' and was sealed in'
          : '';
      if (victimIsSelf) {
        return `${agentOf(ctx, event.victimId, event.victimAgentId)} walked into a trap at ${at(event.nodeId)}${outcome}.`;
      }
      if (ownerIsSelf) {
        return `${whoOf(ctx, event.victimId)} walked into your trap at ${at(event.nodeId)}${outcome}.`;
      }
      const who = event.victimAgentId ? 'An agent' : 'Someone';
      return `${who} triggered a trap at ${at(event.nodeId)}${outcome}.`;
    }
    case 'BLOCKADE_ANNOUNCED':
      return `Blockade announced: ${at(event.nodeId)} closes in round ${event.round}.`;
    case 'BLOCKADE_CLOSED':
      return `${at(event.nodeId)} was sealed by a blockade until round ${event.until}.`;
    case 'BLOCKADE_LIFTED':
      return `The blockade at ${at(event.nodeId)} was lifted.`;
    case 'BLOCKADE_CAUGHT': {
      const agent = agentOf(ctx, event.playerId, event.agentId);
      if (!event.survived) {
        return `${agent} was caught and burned in the blockade at ${at(event.nodeId)}.`;
      }
      const to = event.relocatedTo ? `, slipping out to ${at(event.relocatedTo)}` : '';
      return `${agent} was caught in the blockade at ${at(event.nodeId)}${to}.`;
    }
    case 'INFORMANT_CLAIMED':
      return `${whoOf(ctx, event.playerId)} bought the informant at ${at(event.nodeId)}.`;
    case 'WIRETAP_RESULT': {
      const n = event.results.length;
      const occupied = event.results.filter((r) => r.occupied).map((r) => at(r.nodeId));
      const finding =
        occupied.length === 0 ? 'all clear' : `occupied: ${occupied.join(', ')}`;
      return `Wiretap on ${at(event.target)} checked ${n} node${n === 1 ? '' : 's'} — ${finding}.`;
    }
    case 'STRIKE_FIRED': {
      const who =
        event.agentId !== null
          ? agentOf(ctx, event.playerId, event.agentId)
          : ctx.names
            ? whoOf(ctx, event.playerId)
            : 'Someone';
      const silenced = event.silenced ? ', silenced' : '';
      return `${who} struck ${at(event.target)} from ${at(event.from)}${silenced}.`;
    }
    case 'CONTEST': {
      const method = CONTEST_METHOD_TEXT[event.method] ?? event.method;
      return event.winner
        ? `${at(event.nodeId)} was contested — ${whoOf(ctx, event.winner)} held it on ${method}.`
        : `${at(event.nodeId)} was contested, decided by ${method}, with no winner.`;
    }
    case 'AGENT_BURNED': {
      const dropped =
        event.dossiersDropped > 0
          ? `, dropping ${event.dossiersDropped} dossier${event.dossiersDropped === 1 ? '' : 's'}`
          : '';
      const cause = BURN_CAUSE_TEXT[event.cause] ?? '';
      const by =
        event.byPlayerId !== null && event.cause !== 'BLOCKADE'
          ? ` — ${whoOf(ctx, event.byPlayerId) === 'You' ? 'your work' : `the work of ${whoOf(ctx, event.byPlayerId)}`}`
          : '';
      const agent = ctx.names || ctx.selfId ? agentOf(ctx, event.playerId, event.agentId) : 'An agent';
      return `${agent} was burned at ${at(event.nodeId)}${cause ? ` ${cause}` : ''}${dropped}${by}.`;
    }
    case 'DOSSIER_TAKEN':
      return ctx.names
        ? `${agentOf(ctx, event.playerId, event.agentId)} took a dossier at ${at(event.nodeId)}.`
        : `A dossier was taken at ${at(event.nodeId)}.`;
    case 'DOSSIER_SPAWNED':
      return `A dossier surfaced at ${at(event.nodeId)}.`;
    case 'EXTRACTION':
      return ctx.names
        ? `${agentOf(ctx, event.playerId, event.agentId)} extracted dossiers at ${at(event.nodeId)}.`
        : `An agent extracted at ${at(event.nodeId)}.`;
    case 'PASSIVE_FIRED':
      return ctx.names
        ? `${whoseOf(ctx, event.playerId)} ${cardNameOf(event.cardId)} fired${event.consumed ? ' and was spent' : ''}.`
        : `A passive card fired${event.consumed ? ' and was consumed' : ''}.`;
    case 'CARD_PLAYED':
      return ctx.names
        ? `${whoOf(ctx, event.playerId)} played ${cardNameOf(event.cardId)}.`
        : 'A card was played.';
    case 'SILENCER_BOUGHT':
      return `${whoOf(ctx, event.playerId) === 'You' ? 'You' : 'Someone'} bought ${event.count} silencer${event.count === 1 ? '' : 's'}.`;
    case 'INTEL_GAINED':
      return `${whoOf(ctx, event.playerId) === 'You' ? 'You' : 'Someone'} gained ${event.amount} Intel.`;
    case 'PLAYER_ELIMINATED':
      return ctx.names
        ? `${whoOf(ctx, event.playerId)} ${whoOf(ctx, event.playerId) === 'You' ? 'are' : 'is'} eliminated.`
        : 'A player was eliminated.';
    case 'MATCH_ENDED':
      return `The match ended — ${event.reason.toLowerCase().replace(/_/g, ' ')}.`;
  }
}

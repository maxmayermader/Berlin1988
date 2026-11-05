import type { Signal, SignalKind } from '@berlin/shared';

/**
 * INTEL-02..05: the signals log as pure data — classification, labels,
 * per-round grouping and the round digest. No React, so the node vitest run
 * can import it.
 *
 * Fog: every function here is a pure function of `Signal` values the room
 * already sent this player (`view.signals`, generated per player by
 * `generateSignals()`). Nothing cross-references two signals to sharpen
 * either one, and grouping is by the signal's own round field — so the log
 * can never say more than the signals individually did (PITFALLS.md 2).
 */

/** Who else knows this. `public` facts reached every player; `eyes-only`
 *  facts reached only this one — and the UI must keep the two visibly
 *  distinct (INTEL-05). */
export type SignalAudience = 'public' | 'eyes-only';

const AUDIENCE: Record<SignalKind, SignalAudience> = {
  CHATTER: 'eyes-only',
  NOT_ALONE: 'eyes-only',
  INFORMANT_REPORT: 'eyes-only',
  RADIO_INTERCEPT: 'eyes-only',
  STRIKE_EXACT: 'eyes-only',
  STRIKE_VICINITY: 'public',
  BORDER_CROSSING: 'public',
  DOSSIER_TAKEN: 'public',
  BURN: 'public',
  BLOCKADE_ANNOUNCED: 'public',
  BLOCKADE_ACTIVE: 'public',
};

export function audienceOf(kind: SignalKind): SignalAudience {
  return AUDIENCE[kind];
}

/** The teleprinter slug for each kind. */
const LABEL: Record<SignalKind, string> = {
  CHATTER: 'Chatter',
  NOT_ALONE: 'Not alone',
  INFORMANT_REPORT: 'Informant',
  RADIO_INTERCEPT: 'Radio intercept',
  STRIKE_EXACT: 'Strike heard',
  STRIKE_VICINITY: 'Strike reported',
  BORDER_CROSSING: 'Border crossing',
  DOSSIER_TAKEN: 'Dossier taken',
  BURN: 'Agent burned',
  BLOCKADE_ANNOUNCED: 'Blockade notice',
  BLOCKADE_ACTIVE: 'Blockade',
};

export function signalLabel(kind: SignalKind): string {
  return LABEL[kind];
}

/** Kinds whose wording carries danger — rendered in stamp red. */
const ALARMING: ReadonlySet<SignalKind> = new Set<SignalKind>([
  'NOT_ALONE',
  'STRIKE_EXACT',
  'STRIKE_VICINITY',
  'BURN',
  'BLOCKADE_ACTIVE',
]);

export function isAlarming(kind: SignalKind): boolean {
  return ALARMING.has(kind);
}

/**
 * INTEL-04: a signal that deliberately withholds the exact node — a strike
 * reported by sector only — shows the withheld detail as a redaction bar
 * rather than as an unexplained gap. The engine marks that case by sending
 * the sector and nulling the node (packages/engine/src/fog/signals.ts).
 */
export function isRedacted(signal: Signal): boolean {
  return signal.kind === 'STRIKE_VICINITY' && signal.nodeId === null;
}

/**
 * What a click on the signal can highlight on the map, if anything — the
 * node or sector the signal itself names. A Radio Intercept carries its
 * fact structurally (`intercept`), which names at most one sector or one
 * anchor node: exactly what its sentence says, nothing more.
 */
export function highlightOf(signal: Signal): { nodeId: Signal['nodeId']; sector: Signal['sector'] } | null {
  if (signal.nodeId !== null) return { nodeId: signal.nodeId, sector: null };
  if (signal.sector !== null) return { nodeId: null, sector: signal.sector };
  const fact = signal.intercept;
  if (fact?.kind === 'IN_SECTOR') return { nodeId: null, sector: fact.sector };
  if (fact?.kind === 'NEAR_NODE') return { nodeId: fact.nodeId, sector: null };
  return null;
}

/** Stable identity for de-duplication and React keys. Signals have no id
 *  of their own; the same round's frame can arrive twice (VIEW then
 *  ROUND_RESOLVED, or a reconnect), and must not double-log. */
export function signalKey(signal: Signal): string {
  return [signal.round, signal.kind, signal.nodeId ?? '', signal.sector ?? '', signal.playerId ?? '', signal.text].join('|');
}

/**
 * Merges a fresh frame's signals into the accumulated log. The log is
 * append-only by key: a signal already held is never replaced or edited, so
 * a later frame cannot rewrite what an earlier round told the player.
 */
export function mergeSignals(log: readonly Signal[], incoming: readonly Signal[]): Signal[] {
  const seen = new Set(log.map(signalKey));
  const out = log.slice();
  for (const signal of incoming) {
    const key = signalKey(signal);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

export interface SignalRound {
  readonly round: number;
  readonly signals: readonly Signal[];
}

/** Grouped by the signal's own round, newest round first; within a round,
 *  the engine's own order is kept. */
export function groupByRound(log: readonly Signal[]): SignalRound[] {
  const byRound = new Map<number, Signal[]>();
  for (const signal of log) {
    const list = byRound.get(signal.round) ?? [];
    list.push(signal);
    byRound.set(signal.round, list);
  }
  return [...byRound.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([round, signals]) => ({ round, signals }));
}

/**
 * A one-line digest of what a round revealed (INTEL-03) — counts per kind,
 * in a fixed order, never a re-statement of any signal's content.
 */
export function roundDigest(signals: readonly Signal[]): string {
  if (signals.length === 0) return 'Nothing on the wire.';
  const order: SignalKind[] = [
    'BURN',
    'NOT_ALONE',
    'STRIKE_EXACT',
    'STRIKE_VICINITY',
    'RADIO_INTERCEPT',
    'INFORMANT_REPORT',
    'CHATTER',
    'BORDER_CROSSING',
    'DOSSIER_TAKEN',
    'BLOCKADE_ACTIVE',
    'BLOCKADE_ANNOUNCED',
  ];
  const counts = new Map<SignalKind, number>();
  for (const s of signals) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  const parts: string[] = [];
  for (const kind of order) {
    const n = counts.get(kind);
    if (!n) continue;
    parts.push(`${n} ${LABEL[kind].toLowerCase()}${n === 1 ? '' : plural(kind)}`);
  }
  return parts.join(' · ');
}

function plural(kind: SignalKind): string {
  switch (kind) {
    case 'NOT_ALONE':
    case 'CHATTER':
      return '';
    case 'BURN':
      return '';
    default:
      return 's';
  }
}

import type { Action, AgentId, AgentOrder, NodeId, PlayerView } from '@berlin/shared';
import { legalOrders } from '@berlin/engine';

/**
 * MATCH-02's rules as a pure reducer — apps/web/lib/CLAUDE.md rule 2 (no
 * React, no DOM, no network). The slot tuple is fixed at exactly two: that
 * is what makes a third action structurally unrepresentable, not merely
 * rejected after the fact.
 *
 * Slot order matters only for movement. Quoting packages/shared/src/orders.ts's
 * own header comment on the Action union: "the order actions are listed in
 * only matters for movement. Every other action resolves in its fixed
 * pipeline slot (docs/GAME_DESIGN.md §7.2), so listing STRIKE before MOVE
 * does not make the strike happen first." This module's job is to transmit
 * the composed pair faithfully, in the order the player built it; the
 * resolution pipeline alone decides when each action actually fires.
 */

export const ACTIONS_PER_AGENT = 2;

export interface OrderDraft {
  readonly slots: readonly [Action | null, Action | null];
}

export function emptyDraft(): OrderDraft {
  return { slots: [null, null] };
}

function isValidSlotIndex(index: number): index is 0 | 1 {
  return index === 0 || index === 1;
}

/**
 * Fills `slotIndex` with `action`, but only when that slot is currently
 * empty. A full draft (both slots already occupied) or an out-of-range
 * index returns the draft unchanged — a third action for this agent never
 * reaches toAgentOrder, and therefore never reaches the socket. Re-choosing
 * an already-filled slot goes through clearSlot first, by design: this
 * keeps "assign" a total, side-effect-free guard rather than a silent
 * overwrite.
 */
export function assignAction(draft: OrderDraft, slotIndex: number, action: Action): OrderDraft {
  if (!isValidSlotIndex(slotIndex)) return draft;
  if (draft.slots[slotIndex] !== null) return draft;
  const slots: [Action | null, Action | null] = [draft.slots[0], draft.slots[1]];
  slots[slotIndex] = action;
  return { slots };
}

/** Clears one slot, leaving the other untouched — re-choosing slot 1 never
 *  silently reorders or drops slot 2's action. */
export function clearSlot(draft: OrderDraft, slotIndex: number): OrderDraft {
  if (!isValidSlotIndex(slotIndex)) return draft;
  const slots: [Action | null, Action | null] = [draft.slots[0], draft.slots[1]];
  slots[slotIndex] = null;
  return { slots };
}

export function isSubmittable(draft: OrderDraft): boolean {
  return draft.slots[0] !== null && draft.slots[1] !== null;
}

/** Preserves slot order into `actions`: the action assigned to slot 1 is at
 *  index 0, the action assigned to slot 2 is at index 1. */
export function toAgentOrder(agentId: AgentId, draft: OrderDraft): AgentOrder {
  const actions = draft.slots.filter((a): a is Action => a !== null);
  return { agentId, actions };
}

// --- Composer view helpers --------------------------------------------------
// Used by app/match/[code]/page.tsx to drive Board's legal-target highlight
// and node-click handling from the exact same legalOrders() answer the
// composer itself renders for its slot affordances — one implementation,
// called from more than one place, never a second guess at legality.

export interface ComposerTargets {
  readonly nextSlotIndex: number;
  readonly legalForSlot: readonly Action[];
  readonly moveTargets: readonly NodeId[];
  readonly strikeTargets: readonly NodeId[];
}

export function composerTargets(
  view: PlayerView,
  agentId: AgentId | null,
  draft: OrderDraft,
): ComposerTargets {
  const nextSlotIndex = draft.slots.findIndex((slot) => slot === null);
  if (!agentId || nextSlotIndex === -1) {
    return { nextSlotIndex, legalForSlot: [], moveTargets: [], strikeTargets: [] };
  }
  const prefix = draft.slots.filter((a): a is Action => a !== null);
  const legalForSlot = legalOrders(view, agentId, prefix);
  const moveTargets = legalForSlot
    .filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE')
    .map((a) => a.to);
  const strikeTargets = legalForSlot
    .filter((a): a is Extract<Action, { type: 'STRIKE' }> => a.type === 'STRIKE')
    .map((a) => a.target);
  return { nextSlotIndex, legalForSlot, moveTargets, strikeTargets };
}

/** The action a board click resolves to, or null if the node isn't a legal
 *  target for the active slot at all. MOVE wins over STRIKE when a node
 *  happens to be a legal target for both, since MOVE is the tracer-scope
 *  default interaction and STRIKE requires deliberate card selection this
 *  phase has no separate UI toggle for. */
export function actionForNodeClick(legalForSlot: readonly Action[], nodeId: NodeId): Action | null {
  const move = legalForSlot.find((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE' && a.to === nodeId);
  if (move) return move;
  const strike = legalForSlot.find(
    (a): a is Extract<Action, { type: 'STRIKE' }> => a.type === 'STRIKE' && a.target === nodeId,
  );
  return strike ?? null;
}

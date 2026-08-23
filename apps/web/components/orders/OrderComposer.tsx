'use client';

import type { Action, AgentId, PlayerView } from '@berlin/shared';
import { legalOrders } from '@berlin/engine';
import type { OrderStatus } from '../../lib/matchStore.js';
import { orderRejectionText } from '../../lib/format.js';
import { type OrderDraft, isSubmittable } from '../../lib/orderDraft.js';
import { Button } from '../ui/Button.js';
import { ActionSlot } from './ActionSlot.js';
import { AgentSwitcher } from './AgentSwitcher.js';

export interface OrderComposerProps {
  view: PlayerView;
  selectedAgentId: AgentId | null;
  onSelectAgent: (agentId: AgentId) => void;
  draft: OrderDraft;
  orderStatus: OrderStatus | undefined;
  onAssign: (slotIndex: number, action: Action) => void;
  onClearSlot: (slotIndex: number) => void;
  onSubmit: () => void;
}

/**
 * Two action slots for the selected living agent. Every option offered here
 * is exactly what legalOrders() returned for this slot — never a locally
 * assembled list of the nine action type names (apps/web/components/CLAUDE.md,
 * packages/engine/CLAUDE.md: "legalOrders stops offering MOVE/SPRINT once an
 * operation is in the prefix"). Submission is a server-ack state machine:
 * "pending" leaves only on an explicit ORDER_ACK/ORDER_REJECTED frame, never
 * a local flag set at click time (01-RESEARCH.md Pitfall 2/2b).
 */
export function OrderComposer({
  view,
  selectedAgentId,
  onSelectAgent,
  draft,
  orderStatus,
  onAssign,
  onClearSlot,
  onSubmit,
}: OrderComposerProps) {
  const living = view.self.agents.filter((a) => a.alive);

  if (living.length === 0) {
    return <p className="text-sm">No living agents — nothing to order.</p>;
  }

  const activeAgentId = selectedAgentId ?? living[0]!.id;
  const prefix = draft.slots.filter((a): a is Action => a !== null);
  const nextSlotIndex = draft.slots.findIndex((slot) => slot === null);
  const legalForSlot: readonly Action[] =
    nextSlotIndex === -1 ? [] : legalOrders(view, activeAgentId, prefix);
  const canHold = legalForSlot.some((a) => a.type === 'HOLD');

  const locked = orderStatus?.state === 'pending' || orderStatus?.state === 'accepted';

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[20px] font-semibold leading-[1.2]">Orders</h2>

      <AgentSwitcher agents={living} selectedAgentId={activeAgentId} onSelect={onSelectAgent} />

      <div className="flex flex-col gap-2">
        {draft.slots.map((action, index) => (
          <ActionSlot
            key={index}
            index={index}
            action={action}
            isActive={index === nextSlotIndex && !locked}
            canHold={canHold}
            onHold={() => onAssign(index, { type: 'HOLD' })}
            onClear={() => onClearSlot(index)}
          />
        ))}
      </div>

      <Button
        onClick={onSubmit}
        pending={orderStatus?.state === 'pending'}
        disabled={!isSubmittable(draft) || locked}
      >
        Submit Orders
      </Button>

      {orderStatus?.state === 'accepted' && (
        <p className="text-sm font-semibold text-[#2563eb]">Order locked in.</p>
      )}
      {orderStatus?.state === 'rejected' && orderStatus.message && (
        <p className="text-sm text-[#dc2626]">{orderRejectionText(orderStatus.message)}</p>
      )}
    </div>
  );
}

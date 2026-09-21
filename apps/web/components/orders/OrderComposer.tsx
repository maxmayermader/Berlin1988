'use client';

import { actionIntelCost } from '@berlin/engine';
import type { Action, AgentId, PlayerView } from '@berlin/shared';
import {
  actionOptions,
  positionAfter,
  unavailableOptions,
  type ActionOption,
} from '../../lib/actionMenu.js';
import { orderRejectionText } from '../../lib/format.js';
import type { OrderStatus } from '../../lib/matchStore.js';
import { type OrderDraft, isSubmittable } from '../../lib/orderDraft.js';
import { Button } from '../ui/Button.js';
import { ActionPicker } from './ActionPicker.js';
import { ActionSlot } from './ActionSlot.js';
import { AgentSwitcher } from './AgentSwitcher.js';

export interface OrderComposerProps {
  view: PlayerView;
  selectedAgentId: AgentId | null;
  onSelectAgent: (agentId: AgentId) => void;
  draft: OrderDraft;
  orderStatus: OrderStatus | undefined;
  /** Intel left after the player's other agents' submitted orders (ORDER-05). */
  intelAvailable: number;
  pendingOptionKey: string | null;
  onChooseOption: (option: ActionOption) => void;
  onCancelOption: () => void;
  onClearSlot: (slotIndex: number) => void;
  onSubmit: () => void;
  onRetract: () => void;
}

/**
 * Two action slots for the selected living agent, and a picker offering
 * every action `legalOrders()` returns for the active slot — never a locally
 * assembled list of action names (apps/web/components/CLAUDE.md,
 * packages/engine/CLAUDE.md: "legalOrders stops offering MOVE/SPRINT once an
 * operation is in the prefix").
 *
 * Submission is a server-ack state machine: "pending" leaves only on an
 * explicit ORDER_ACK/ORDER_REJECTED frame, never a local flag set at click
 * time (01-RESEARCH.md Pitfall 2/2b).
 */
export function OrderComposer({
  view,
  selectedAgentId,
  onSelectAgent,
  draft,
  orderStatus,
  intelAvailable,
  pendingOptionKey,
  onChooseOption,
  onCancelOption,
  onClearSlot,
  onSubmit,
  onRetract,
}: OrderComposerProps) {
  const living = view.self.agents.filter((a) => a.alive);

  if (living.length === 0) {
    return <p className="text-sm">No living agents — nothing to order.</p>;
  }

  const activeAgentId = selectedAgentId ?? living[0]!.id;
  const prefix = draft.slots.filter((a): a is Action => a !== null);
  const nextSlotIndex = draft.slots.findIndex((slot) => slot === null);

  const locked = orderStatus?.state === 'pending' || orderStatus?.state === 'accepted';

  const options = locked ? [] : actionOptions(view, activeAgentId, prefix);
  const unavailable = locked ? [] : unavailableOptions(view, activeAgentId, intelAvailable, prefix);

  // Each composed slot is priced from where the agent stands when it
  // resolves — slot 2 from wherever slot 1's movement ended, not from the
  // start node.
  const slotCosts = draft.slots.map((action, index) => {
    if (!action) return null;
    const before = draft.slots.slice(0, index).filter((a): a is Action => a !== null);
    return actionIntelCost(view, action, positionAfter(view, activeAgentId, before));
  });

  const committedIntel = slotCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[20px] font-semibold leading-[1.2]">Orders</h2>
        <span className="text-sm text-[#475569]">
          {intelAvailable} Intel{committedIntel > 0 ? ` · spending ${committedIntel}` : ''}
        </span>
      </div>

      <AgentSwitcher agents={living} selectedAgentId={activeAgentId} onSelect={onSelectAgent} />

      <div className="flex flex-col gap-2">
        {draft.slots.map((action, index) => (
          <ActionSlot
            key={index}
            index={index}
            action={action}
            isActive={index === nextSlotIndex && !locked}
            map={view.map}
            intelCost={slotCosts[index] ?? null}
            onClear={() => onClearSlot(index)}
          />
        ))}
      </div>

      {!locked && nextSlotIndex !== -1 && (
        <ActionPicker
          options={options}
          unavailable={unavailable}
          pendingKey={pendingOptionKey}
          intelAvailable={intelAvailable}
          disabled={locked}
          onChoose={onChooseOption}
          onCancel={onCancelOption}
        />
      )}

      <Button
        onClick={onSubmit}
        pending={orderStatus?.state === 'pending'}
        disabled={!isSubmittable(draft) || locked}
      >
        Submit Orders
      </Button>

      {orderStatus?.state === 'accepted' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-[#2563eb]">Order locked in.</p>
          {/* ORDER-09: a submitted order can be withdrawn until the round
              actually closes. The room re-opens the agent by accepting a
              replacement, so this is a local un-lock plus a fresh draft. */}
          <button
            type="button"
            onClick={onRetract}
            className="h-11 self-start rounded border border-[#e2e8f0] px-3 text-sm font-semibold"
          >
            Change order
          </button>
        </div>
      )}
      {orderStatus?.state === 'rejected' && orderStatus.message && (
        <p className="text-sm text-[#dc2626]">{orderRejectionText(orderStatus.message)}</p>
      )}
    </div>
  );
}

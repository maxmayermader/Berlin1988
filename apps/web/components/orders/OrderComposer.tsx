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
import { Stamp } from '../ui/Stamp.js';
import { ActionPicker } from './ActionPicker.js';
import { ActionSlot } from './ActionSlot.js';
import { AgentSwitcher } from './AgentSwitcher.js';

export interface OrderComposerProps {
  view: PlayerView;
  selectedAgentId: AgentId | null;
  onSelectAgent: (agentId: AgentId) => void;
  draft: OrderDraft;
  orderStatus: OrderStatus | undefined;
  /** Agent ids whose order the room has acknowledged this round. */
  lockedIds: ReadonlySet<string>;
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
  lockedIds,
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
  const agentNumber = view.self.agents.findIndex((a) => a.id === activeAgentId) + 1;
  const outstanding = living.filter((a) => !lockedIds.has(a.id as string)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-caps text-ink-muted">Two actions per agent</span>
        <span className="text-sm tabular-nums">
          <b>{intelAvailable}</b> Intel{committedIntel > 0 ? <span className="text-warn"> · spending {committedIntel}</span> : ''}
        </span>
      </div>

      <AgentSwitcher
        agents={view.self.agents}
        selectedAgentId={activeAgentId}
        onSelect={onSelectAgent}
        map={view.map}
        faction={view.self.faction}
        lockedIds={lockedIds}
      />

      <div className="paper relative flex flex-col rounded-[3px] border border-rule px-3 pb-2 pt-1.5 shadow-[1px_1px_0_0_var(--color-rule)]">
        <span className="label-caps pb-0.5 text-[0.6rem] text-ink-muted">
          Order form · Agent {agentNumber} · Round {view.round}
        </span>
        {draft.slots.map((action, index) => (
          <ActionSlot
            key={index}
            index={index}
            action={action}
            isActive={index === nextSlotIndex && !locked}
            map={view.map}
            intelCost={slotCosts[index] ?? null}
            editable={!locked}
            onClear={() => onClearSlot(index)}
          />
        ))}
        {orderStatus?.state === 'accepted' && (
          <div className="pointer-events-none absolute right-3 top-2">
            <Stamp tone="ok" tilt={-7} animate className="text-base">
              Locked in
            </Stamp>
          </div>
        )}
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

      {orderStatus?.state !== 'accepted' && (
        <Button
          onClick={onSubmit}
          pending={orderStatus?.state === 'pending'}
          disabled={!isSubmittable(draft) || locked}
          size="lg"
          block
        >
          Submit Orders
        </Button>
      )}

      {orderStatus?.state === 'accepted' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold text-ok">Order locked in.</p>
          {outstanding > 0 && (
            <p className="text-sm text-ink-muted">
              {outstanding} agent{outstanding === 1 ? '' : 's'} still waiting for orders — switch above.
            </p>
          )}
          {/* ORDER-09: a submitted order can be withdrawn until the round
              actually closes. The room re-opens the agent by accepting a
              replacement, so this is a local un-lock plus a fresh draft. */}
          <Button variant="ghost" onClick={onRetract}>
            Change order
          </Button>
        </div>
      )}
      {orderStatus?.state === 'rejected' && orderStatus.message && (
        <p className="border-l-4 border-stamp bg-stamp-wash px-3 py-2 text-sm text-stamp">
          {orderRejectionText(orderStatus.message)}
        </p>
      )}
    </div>
  );
}

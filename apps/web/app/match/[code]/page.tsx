'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Action, AgentId, NodeId, ServerMessage } from '@berlin/shared';
import { Board } from '../../../components/board/Board.js';
import { LockedInRow } from '../../../components/hud/LockedInRow.js';
import { RoundClock } from '../../../components/hud/RoundClock.js';
import { SubmittedCount } from '../../../components/hud/SubmittedCount.js';
import { MatchChat } from '../../../components/match/MatchChat.js';
import { MatchIntelDrawer } from '../../../components/match/MatchIntelDrawer.js';
import { OrderComposer } from '../../../components/orders/OrderComposer.js';
import { ResultScreen } from '../../../components/result/ResultScreen.js';
import { StepThrough } from '../../../components/resolution/StepThrough.js';
import { PageTransition } from '../../../components/ui/PageTransition.js';
import { useChatStore } from '../../../lib/chatStore.js';
import { loadIdentity } from '../../../lib/identity.js';
import { useMatchStore } from '../../../lib/matchStore.js';
import { intelAvailableFor, viewForComposing } from '@berlin/engine';
import {
  actionForTarget,
  actionOptions,
  type ActionOption,
} from '../../../lib/actionMenu.js';
import {
  assignAction,
  clearSlot,
  emptyDraft,
  toAgentOrder,
} from '../../../lib/orderDraft.js';
import { sendChat, sendChatPrompt, submitOrder, useRoomSocket } from '../../../lib/socket.js';
import { useUiStore } from '../../../lib/uiStore.js';

/** 01-UI-SPEC.md's exact copy for a dropped mid-match connection — an
 *  explicit terminal state, never a silent hang (D-11's accepted gap). */
const CONNECTION_LOST_COPY =
  "Connection lost. Refresh to try rejoining — you'll lose your current place in this match.";

/**
 * The match route. Connects through lib/socket.ts, holds the current
 * PlayerView from matchStore, and renders the board plus the order composer.
 * Match state never comes from an RSC (apps/web/app/CLAUDE.md) — this is a
 * client component end to end.
 */
export default function MatchPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase();
  const [identity] = useState(() => loadIdentity());

  const view = useMatchStore((s) => s.view);
  const orderStatus = useMatchStore((s) => s.orderStatus);
  const acceptedOrdersRecord = useMatchStore((s) => s.acceptedOrders);
  const recordAccepted = useMatchStore((s) => s.recordAccepted);
  const forgetAccepted = useMatchStore((s) => s.forgetAccepted);
  const clearOrderStatus = useMatchStore((s) => s.clearOrderStatus);

  const selectedAgentId = useUiStore((s) => s.selectedAgentId);
  const selectAgent = useUiStore((s) => s.selectAgent);
  const draftByAgent = useUiStore((s) => s.draftByAgent);
  const setDraft = useUiStore((s) => s.setDraft);
  const pendingOptionKey = useUiStore((s) => s.pendingOptionKey);
  const setPendingOption = useUiStore((s) => s.setPendingOption);
  const connectionStatus = useUiStore((s) => s.connectionStatus);
  const setConnectionStatus = useUiStore((s) => s.setConnectionStatus);
  const matchSubState = useUiStore((s) => s.matchSubState);

  const clockDeadline = useMatchStore((s) => s.clock.deadlineAt);
  const matchChat = useChatStore((s) => s.messages.MATCH);
  // Set from a CHAT_REJECTED frame, cleared on the next accepted
  // CHAT_MESSAGE — mirrors the lobby route's own chatError discipline.
  const [chatError, setChatError] = useState<string | null>(null);

  const socket = useRoomSocket(code, identity.codename, (message: ServerMessage) => {
    // VIEW / ROUND_RESOLVED / OPPONENT_COMMITTED / ORDER_ACK / ORDER_REJECTED /
    // CLOCK / CHAT_MESSAGE / CHAT_HISTORY are already routed into their
    // stores by useRoomSocket itself; this route only needs CHAT_REJECTED,
    // which carries no store of its own.
    if (message.type === 'CHAT_REJECTED') setChatError(message.message);
    if (message.type === 'CHAT_MESSAGE') setChatError(null);
  });

  useEffect(() => {
    function onOpen() {
      setConnectionStatus('open');
    }
    function onClose() {
      setConnectionStatus('lost');
    }
    socket.addEventListener('open', onOpen);
    socket.addEventListener('close', onClose);
    return () => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('close', onClose);
    };
  }, [socket, setConnectionStatus]);

  const livingAgents = view ? view.self.agents.filter((a) => a.alive) : [];
  const firstAgentId: AgentId | null = livingAgents[0]?.id ?? null;

  useEffect(() => {
    if (!selectedAgentId && firstAgentId) selectAgent(firstAgentId);
  }, [selectedAgentId, firstAgentId, selectAgent]);

  const activeAgentId = selectedAgentId ?? firstAgentId;
  const draft = activeAgentId ? (draftByAgent[activeAgentId as string] ?? emptyDraft()) : emptyDraft();

  const activeAgent = livingAgents.find((a) => a.id === activeAgentId) ?? null;
  const prefix = draft.slots.filter((a): a is Action => a !== null);
  const nextSlotIndex = draft.slots.findIndex((slot) => slot === null);
  const acceptedOrders = new Map(Object.entries(acceptedOrdersRecord));

  /**
   * ORDER-05: the player's agents share one Intel pool but submit
   * separately, so the Intel offered to this agent must already account for
   * what the other agent's accepted order will spend. `acceptedOrders` is
   * the client's own record of what the room acked this round — the view's
   * Intel figure does not reflect it, because Intel is charged during
   * resolution, not at submission. The engine does the arithmetic; this
   * passes it what the client legitimately knows.
   */
  const intelAvailable = view && activeAgentId
    ? intelAvailableFor(view, activeAgentId, acceptedOrders, prefix)
    : 0;

  /**
   * The view every legality question about this agent's order is asked
   * against. It carries the Intel left after the OTHER agents' committed
   * orders, so `legalOrders` stops offering a card whose Intel is already
   * spoken for — the client-side mirror of the room's own viewForOrdering.
   * Everything else on screen (board, result, intel drawer) keeps the real
   * view; only order composition uses this one.
   */
  const composingView =
    view && activeAgentId ? viewForComposing(view, activeAgentId, acceptedOrders) : view;

  // The option currently awaiting a target, resolved fresh each render from
  // the same legalOrders answer the picker rendered — never cached, so it
  // cannot outlive the legality that produced it.
  const pendingOption: ActionOption | null =
    composingView && activeAgentId && pendingOptionKey
      ? (actionOptions(composingView, activeAgentId, prefix).find((o) => o.key === pendingOptionKey) ??
        null)
      : null;

  function handleAssign(slotIndex: number, action: Action) {
    if (!activeAgentId) return;
    setDraft(activeAgentId, assignAction(draft, slotIndex, action));
  }

  function handleClearSlot(slotIndex: number) {
    if (!activeAgentId) return;
    setDraft(activeAgentId, clearSlot(draft, slotIndex));
  }

  /** An option with no target commits immediately; one with targets puts the
   *  board into targeting mode instead (ORDER-07). */
  function handleChooseOption(option: ActionOption) {
    if (option.immediate) {
      handleAssign(nextSlotIndex, option.immediate);
      return;
    }
    setPendingOption(option.key);
  }

  function handleSelectNode(nodeId: NodeId) {
    if (!composingView || !activeAgentId || !pendingOption) return;
    const action = actionForTarget(composingView, activeAgentId, pendingOption, nodeId, prefix);
    if (action) handleAssign(nextSlotIndex, action);
  }

  function handleSubmit() {
    if (!view || !activeAgentId) return;
    const order = toAgentOrder(activeAgentId, draft);
    recordAccepted(activeAgentId, order.actions);
    submitOrder(socket, view.round, activeAgentId, order.actions);
  }

  /** ORDER-09: withdraw a submitted order and compose a replacement. The
   *  room accepts a fresh SUBMIT_ORDER for an already-committed agent while
   *  the round is still open, so this clears the local lock and the draft. */
  function handleRetract() {
    if (!activeAgentId) return;
    forgetAccepted(activeAgentId);
    clearOrderStatus(activeAgentId);
    setDraft(activeAgentId, emptyDraft());
  }

  function handleSendChat(text: string) {
    sendChat(socket, text);
  }

  function handleSendChatPrompt(promptId: number) {
    sendChatPrompt(socket, promptId);
  }

  if (connectionStatus === 'lost') {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
        <p className="text-base">{CONNECTION_LOST_COPY}</p>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
        <p className="text-sm">Connecting…</p>
      </main>
    );
  }

  // The terminal sub-state: reaching it is automatic — once view.outcome is
  // non-null the composer and the step-through are gone, replaced entirely
  // by the result screen (this plan's <behavior>). No victory, score, or
  // tie-break logic is computed here; ResultScreen reads only view.outcome.
  if (view.outcome !== null) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
        <ResultScreen view={view} />
        <MatchIntelDrawer view={view} />
      </main>
    );
  }

  // The round the step-through is replaying — read from the log's own
  // ROUND_START event rather than `view.round`, because resolveRound's
  // upkeep already advances `view.round` to the *next* round by the time
  // this client sees it (packages/engine/src/resolution/index.ts).
  const firstEvent = view.lastRound[0];
  const resolvedRound = firstEvent?.type === 'ROUND_START' ? firstEvent.round : view.round;

  return (
    <PageTransition className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 md:flex-row">
      <div className="md:w-3/5">
        <h2 className="mb-2 text-[20px] font-semibold leading-[1.2]">Berlin</h2>
        <Board
          map={view.map}
          agents={livingAgents}
          visibleNodes={view.visibleNodes}
          activeBlockades={view.activeBlockades}
          selectedNodeId={activeAgent?.nodeId ?? null}
          // Only the pending option's own targets are highlighted, so the
          // board never offers a node whose meaning is ambiguous (ORDER-07).
          legalTargets={pendingOption && pendingOption.kind !== 'STRIKE' ? pendingOption.targets : []}
          strikeTargets={pendingOption?.kind === 'STRIKE' ? pendingOption.targets : []}
          onSelectNode={handleSelectNode}
        />
      </div>
      <div className="md:w-2/5">
        {matchSubState === 'RESOLUTION' ? (
          <StepThrough
            key={resolvedRound}
            log={view.lastRound}
            round={resolvedRound}
            // Always false here — the outcome !== null case already
            // returned the ResultScreen above, before this branch renders.
            isFinal={false}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <SubmittedCount view={view} />
              <RoundClock deadlineAt={clockDeadline} />
            </div>
            <LockedInRow view={view} />
            <OrderComposer
              view={composingView ?? view}
              selectedAgentId={activeAgentId}
              onSelectAgent={selectAgent}
              draft={draft}
              orderStatus={activeAgentId ? orderStatus[activeAgentId as string] : undefined}
              intelAvailable={intelAvailable}
              pendingOptionKey={pendingOptionKey}
              onChooseOption={handleChooseOption}
              onCancelOption={() => setPendingOption(null)}
              onClearSlot={handleClearSlot}
              onSubmit={handleSubmit}
              onRetract={handleRetract}
            />
          </div>
        )}
      </div>
      <MatchChat
        messages={matchChat}
        onSend={handleSendChat}
        onSendPrompt={handleSendChatPrompt}
        error={chatError}
      />
      <MatchIntelDrawer view={view} />
    </PageTransition>
  );
}

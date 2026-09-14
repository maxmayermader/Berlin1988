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
import {
  actionForNodeClick,
  assignAction,
  clearSlot,
  composerTargets,
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

  const selectedAgentId = useUiStore((s) => s.selectedAgentId);
  const selectAgent = useUiStore((s) => s.selectAgent);
  const draftByAgent = useUiStore((s) => s.draftByAgent);
  const setDraft = useUiStore((s) => s.setDraft);
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

  const targets = view
    ? composerTargets(view, activeAgentId, draft)
    : { nextSlotIndex: -1, legalForSlot: [], moveTargets: [], strikeTargets: [] };

  const activeAgent = livingAgents.find((a) => a.id === activeAgentId) ?? null;

  function handleAssign(slotIndex: number, action: Action) {
    if (!activeAgentId) return;
    setDraft(activeAgentId, assignAction(draft, slotIndex, action));
  }

  function handleClearSlot(slotIndex: number) {
    if (!activeAgentId) return;
    setDraft(activeAgentId, clearSlot(draft, slotIndex));
  }

  function handleSelectNode(nodeId: NodeId) {
    const action = actionForNodeClick(targets.legalForSlot, nodeId);
    if (action) handleAssign(targets.nextSlotIndex, action);
  }

  function handleSubmit() {
    if (!view || !activeAgentId) return;
    const order = toAgentOrder(activeAgentId, draft);
    submitOrder(socket, view.round, activeAgentId, order.actions);
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
          legalTargets={targets.moveTargets}
          strikeTargets={targets.strikeTargets}
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
              view={view}
              selectedAgentId={activeAgentId}
              onSelectAgent={selectAgent}
              draft={draft}
              orderStatus={activeAgentId ? orderStatus[activeAgentId as string] : undefined}
              onAssign={handleAssign}
              onClearSlot={handleClearSlot}
              onSubmit={handleSubmit}
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

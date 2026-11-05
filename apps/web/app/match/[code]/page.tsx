'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Action, AgentId, NodeId, ServerMessage } from '@berlin/shared';
import { Board } from '../../../components/board/Board.js';
import type { TokenSpec } from '../../../components/board/AgentToken.js';
import { MatchHeader } from '../../../components/hud/MatchHeader.js';
import { OwnKitPanel } from '../../../components/intel/OwnKitPanel.js';
import { RosterPanel } from '../../../components/intel/RosterPanel.js';
import { CasualtyReport } from '../../../components/match/CasualtyReport.js';
import { MatchChat } from '../../../components/match/MatchChat.js';
import { MatchFile } from '../../../components/match/MatchFile.js';
import { NodeInspector } from '../../../components/match/NodeInspector.js';
import { SpectatorPanel } from '../../../components/match/SpectatorPanel.js';
import { OrderComposer } from '../../../components/orders/OrderComposer.js';
import { ResultScreen } from '../../../components/result/ResultScreen.js';
import { StepThrough } from '../../../components/resolution/StepThrough.js';
import { Folder } from '../../../components/ui/Folder.js';
import { PageTransition } from '../../../components/ui/PageTransition.js';
import { Stamp } from '../../../components/ui/Stamp.js';
import { useChatStore } from '../../../lib/chatStore.js';
import { eventContextFor } from '../../../lib/format.js';
import { loadIdentity } from '../../../lib/identity.js';
import { useMatchStore } from '../../../lib/matchStore.js';
import { agentPlans } from '../../../lib/plannedPaths.js';
import { beatFor, ownAgentsAt } from '../../../lib/replay.js';
import { ownBurnsIn } from '../../../lib/roster.js';
import { useSignalStore } from '../../../lib/signalStore.js';
import { initialReveal, isComplete } from '../../../lib/stepThrough.js';
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
  const reveal = useUiStore((s) => s.reveal);
  const highlight = useSignalStore((s) => s.highlight);
  const [inspectedNodeId, setInspectedNodeId] = useState<NodeId | null>(null);

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
        <Folder tab="Line dead" surface="paper">
          <p className="text-base">{CONNECTION_LOST_COPY}</p>
        </Folder>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-24 text-center">
        <p className="font-display text-2xl tracking-[0.1em] text-on-desk">BERLIN 1988</p>
        <p className="label-caps text-on-desk-muted">Connecting to the network…</p>
      </main>
    );
  }

  const ctx = eventContextFor(view);
  const agentLabels = ctx.agentLabels ?? {};

  // The terminal sub-state: reaching it is automatic — once view.outcome is
  // non-null the composer and the step-through are gone, replaced entirely
  // by the result screen. No victory, score, or tie-break logic is computed
  // here; ResultScreen reads only view.outcome. The roster and the history
  // stay available, so the table can read back how it ended.
  if (view.outcome !== null) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
        <ResultScreen view={view} />
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <RosterPanel view={view} />
          <MatchFile view={view} ctx={ctx} />
        </div>
      </main>
    );
  }

  // The round the step-through is replaying — read from the log's own
  // ROUND_START event rather than `view.round`, because resolveRound's
  // upkeep already advances `view.round` to the *next* round by the time
  // this client sees it (packages/engine/src/resolution/index.ts).
  const firstEvent = view.lastRound[0];
  const resolvedRound = firstEvent?.type === 'ROUND_START' ? firstEvent.round : view.round;
  const replaying = matchSubState === 'RESOLUTION';
  const spectating = view.self.eliminated || livingAgents.length === 0;

  // REPLAY-01: the board follows the same reveal cursor as the report, so
  // the beat on the map is always the last line in the list.
  const revealState = reveal ?? initialReveal(view.lastRound);
  const revealedCount = revealState.revealed;
  const currentEvent = replaying ? view.lastRound[revealedCount - 1] : undefined;
  const beat = currentEvent ? beatFor(currentEvent) : null;
  const replayComplete = isComplete(view.lastRound, revealState);

  const tokens: TokenSpec[] = replaying
    ? ownAgentsAt(view.self.agents, view.lastRound, revealedCount).map((r) => ({
        id: r.agent.id,
        index: view.self.agents.indexOf(r.agent),
        nodeId: r.nodeId,
        alive: r.alive,
        dossiers: r.alive ? r.agent.dossiers : 0,
      }))
    : view.self.agents.flatMap((agent, index) =>
        agent.alive ? [{ id: agent.id, index, nodeId: agent.nodeId, alive: true, dossiers: agent.dossiers }] : [],
      );

  // ORDER-08: every agent's composed or locked order, drawn on the map.
  const drafts: Record<string, readonly (Action | null)[]> = {};
  for (const [agentId, d] of Object.entries(draftByAgent)) drafts[agentId] = d.slots;
  const plans = replaying || spectating ? [] : agentPlans(view.self.agents, drafts, acceptedOrdersRecord);
  const lockedIds = new Set(
    Object.entries(orderStatus)
      .filter(([, status]) => status.state === 'accepted')
      .map(([agentId]) => agentId),
  );

  const ownBurns = replaying && replayComplete ? ownBurnsIn(view.lastRound, view.self.id) : [];
  const playersLeft = [view.self, ...view.opponents].filter((p) => !p.eliminated).length;

  return (
    <div className="flex min-h-dvh flex-col">
      <MatchHeader
        view={view}
        displayRound={replaying ? resolvedRound : view.round}
        clockDeadline={clockDeadline}
        replaying={replaying}
      />

      <PageTransition className="mx-auto grid w-full max-w-[1680px] gap-5 px-3 py-5 sm:px-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[300px_minmax(0,1fr)_400px]">
        {/* The city plan: the board, the node inspector, and the working file. */}
        <section aria-label="Map" className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1 xl:col-start-2">
          <div className="paper relative rounded-[4px] p-2 shadow-sheet sm:p-3">
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <h2 className="font-display text-base leading-none tracking-[0.06em]">
                Stadtplan · {view.map.name}
              </h2>
              <span className="flex items-center gap-3">
                <span className="label-caps text-[0.6rem] text-ink-muted">
                  {replaying ? `Replay · round ${resolvedRound}` : spectating ? 'Watching' : `Round ${view.round}`}
                </span>
                <Stamp tilt={-3} className="hidden text-[0.65rem] opacity-70 sm:inline-block">
                  Streng geheim
                </Stamp>
              </span>
            </div>
            <Board
              map={view.map}
              tokens={tokens}
              faction={view.self.faction}
              activeAgentId={replaying ? null : activeAgentId}
              visibleNodes={view.visibleNodes}
              activeBlockades={view.activeBlockades}
              announcedBlockades={view.announcedBlockades}
              round={view.round}
              selfId={view.self.id}
              safehouse={view.self.safehouse}
              traps={view.self.traps}
              decoys={view.self.decoys}
              selectedNodeId={replaying ? null : (activeAgent?.nodeId ?? null)}
              // Only the pending option's own targets are highlighted, so the
              // board never offers a node whose meaning is ambiguous (ORDER-07).
              legalTargets={!replaying && pendingOption && pendingOption.kind !== 'STRIKE' ? pendingOption.targets : []}
              strikeTargets={!replaying && pendingOption?.kind === 'STRIKE' ? pendingOption.targets : []}
              plans={plans}
              highlight={highlight}
              beat={beat}
              beatKey={revealedCount}
              onSelectNode={handleSelectNode}
              onInspectNode={setInspectedNodeId}
            />
          </div>
          <NodeInspector view={view} nodeId={inspectedNodeId ?? activeAgent?.nodeId ?? null} />
          <MatchFile view={view} ctx={ctx} />
        </section>

        {/* Orders, the replay, or the spectator's desk. Sticky beside the map. */}
        <aside
          aria-label={replaying ? 'Round report' : 'Orders'}
          className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-3 xl:row-span-1"
        >
          <div className="lg:sticky lg:top-4">
            <Folder tab={replaying ? 'Round report' : spectating ? 'Observer' : 'Orders'} as="h2" bodyClassName="flex flex-col gap-4">
              {replaying ? (
                <>
                  <StepThrough
                    key={resolvedRound}
                    log={view.lastRound}
                    round={resolvedRound}
                    // Always false here — the outcome !== null case already
                    // returned the ResultScreen above, before this branch renders.
                    isFinal={false}
                    ctx={ctx}
                  />
                  <CasualtyReport map={view.map} burns={ownBurns} agentLabels={agentLabels} />
                </>
              ) : spectating ? (
                <SpectatorPanel playersLeft={playersLeft} />
              ) : (
                <OrderComposer
                  view={composingView ?? view}
                  selectedAgentId={activeAgentId}
                  onSelectAgent={selectAgent}
                  draft={draft}
                  orderStatus={activeAgentId ? orderStatus[activeAgentId as string] : undefined}
                  lockedIds={lockedIds}
                  intelAvailable={intelAvailable}
                  pendingOptionKey={pendingOptionKey}
                  onChooseOption={handleChooseOption}
                  onCancelOption={() => setPendingOption(null)}
                  onClearSlot={handleClearSlot}
                  onSubmit={handleSubmit}
                  onRetract={handleRetract}
                />
              )}
            </Folder>
          </div>
        </aside>

        {/* The dossier: who is still standing, and what the player holds. */}
        <aside
          aria-label="Dossier"
          className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-2 xl:col-start-1 xl:row-start-1"
        >
          <RosterPanel view={view} />
          {!spectating && <OwnKitPanel view={view} />}
        </aside>
      </PageTransition>
      <MatchChat
        messages={matchChat}
        onSend={handleSendChat}
        onSendPrompt={handleSendChatPrompt}
        error={chatError}
      />
    </div>
  );
}

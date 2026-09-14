'use client';

import { ALL_CARDS } from '@berlin/engine';
import { clientMessageSchema } from '@berlin/shared';
import type { ClientMessage, LobbySnapshot, ServerMessage } from '@berlin/shared';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Deckbuilder } from '../../../components/deck/Deckbuilder.js';
import { ChatPanel } from '../../../components/lobby/ChatPanel.js';
import { CodenameEditor } from '../../../components/lobby/CodenameEditor.js';
import { ReadyCountdown } from '../../../components/lobby/ReadyCountdown.js';
import { SeatCountControl } from '../../../components/lobby/SeatCountControl.js';
import { SeatList } from '../../../components/lobby/SeatList.js';
import { Button } from '../../../components/ui/Button.js';
import { PageTransition } from '../../../components/ui/PageTransition.js';
import { useChatStore } from '../../../lib/chatStore.js';
import { loadIdentity } from '../../../lib/identity.js';
import { loadoutsDiverge, useLoadoutStore } from '../../../lib/loadoutStore.js';
import { sendChat, sendChatPrompt, submitLoadout, useRoomSocket } from '../../../lib/socket.js';

export default function LobbyPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [identity] = useState(() => loadIdentity());
  const loadout = useLoadoutStore((s) => s.loadout);
  const hydrated = useLoadoutStore((s) => s.hydrated);
  const hydrate = useLoadoutStore((s) => s.hydrate);
  const addCard = useLoadoutStore((s) => s.add);
  const removeCard = useLoadoutStore((s) => s.remove);
  const loadPreset = useLoadoutStore((s) => s.loadPreset);
  const saveStatus = useLoadoutStore((s) => s.saveStatus);
  const lastAcceptedCards = useLoadoutStore((s) => s.lastAcceptedCards);
  const hasSubmittedLoadout = useRef(false);
  // True only for the interval between clicking Save and the room's own
  // LOADOUT_ACK/LOADOUT_REJECTED reply — never inferred from saveStatus
  // alone, since that field also holds the once-per-join submit's stale
  // 'accepted' value long after this editor has closed and reopened.
  const awaitingSaveCloseRef = useRef(false);
  const [editingLoadout, setEditingLoadout] = useState(false);
  // Set from a SET_SEAT_COUNT_REJECTED frame, cleared on the next ROOM_STATE
  // — mirrors the room's own "the next authoritative frame wins" discipline
  // rather than a client-side timeout.
  const [seatCountError, setSeatCountError] = useState<string | null>(null);
  // A kick rejection is a generic ERROR frame (no dedicated KICK_REJECTED
  // type — the plan's own reasoning is that a rare race is not worth a new
  // message type), cleared the same way as seatCountError.
  const [kickError, setKickError] = useState<string | null>(null);
  // Set from a CHAT_REJECTED frame, cleared on the next accepted
  // CHAT_MESSAGE — mirrors seatCountError/kickError's "the next
  // authoritative frame wins" discipline.
  const [chatError, setChatError] = useState<string | null>(null);
  const lobbyChat = useChatStore((s) => s.messages.LOBBY);

  const socket = useRoomSocket(code, identity.codename, (message: ServerMessage) => {
    if (message.type === 'ROOM_STATE') {
      setSnapshot(message.snapshot);
      setSeatCountError(null);
      setKickError(null);
    }
    if (message.type === 'JOINED') setPlayerId(message.playerId);
    if (message.type === 'SET_SEAT_COUNT_REJECTED') setSeatCountError(message.message);
    // The lobby page's only ERROR source once joined is a rejected KICK
    // (order-related ERROR codes never fire pre-match) — shown as the
    // UI-SPEC's kick-rejected copy rather than the server's own message,
    // since a rare race (target already left) is the one case this covers.
    if (message.type === 'ERROR') {
      setKickError("Couldn't remove that player — they may have already left.");
    }
    // Mirrors the existing IN_GAME redirect below — driven from a server
    // frame rather than a locally guessed condition. socket.ts already
    // called markKicked() before this callback runs.
    if (message.type === 'KICKED') {
      router.push('/');
    }
    if (message.type === 'CHAT_REJECTED') setChatError(message.message);
    if (message.type === 'CHAT_MESSAGE') setChatError(null);
  });

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Fires once per join, as soon as both JOINED has landed and the stored
  // loadout is hydrated — this is what makes the pipe work for a player who
  // built their deck on /deck and never opens the in-lobby editor (Plan
  // 02-04). Without this, Success Criterion 5 fails even though the
  // deckbuilder itself is perfect.
  useEffect(() => {
    if (!playerId || !hydrated || hasSubmittedLoadout.current) return;
    hasSubmittedLoadout.current = true;
    submitLoadout(socket, loadout);
  }, [playerId, hydrated, loadout, socket]);

  // Closes the editor on the room's acceptance of a save this component
  // itself triggered; a rejection leaves the editor open (02-UI-SPEC.md
  // error state) so the player can act on the message.
  useEffect(() => {
    if (!awaitingSaveCloseRef.current) return;
    if (saveStatus.state === 'accepted') {
      awaitingSaveCloseRef.current = false;
      setEditingLoadout(false);
    } else if (saveStatus.state === 'rejected') {
      awaitingSaveCloseRef.current = false;
    }
  }, [saveStatus.state]);

  // The room's own snapshot is the sole trigger — never a locally guessed
  // "the countdown display hit zero", which could fire before the room
  // actually has a GameState and land the player on an empty board.
  useEffect(() => {
    if (snapshot?.phase === 'IN_GAME') {
      router.push(`/match/${code}`);
    }
  }, [snapshot?.phase, code, router]);

  const mySeat = snapshot?.seats.find((seat) => seat.playerId === playerId) ?? null;
  const isHost = snapshot !== null && snapshot.hostPlayerId === playerId;
  // UX mirror only — apps/party/src/state.ts's canSetSeatCount is the
  // authority. This exists solely to grey a control the server would refuse
  // anyway, computed identically from the public snapshot the client
  // already has (highest non-OPEN seat index + 1, or 1).
  const minAllowed = (() => {
    if (!snapshot) return 1;
    let highestOccupied = -1;
    for (const seat of snapshot.seats) {
      if (seat.kind !== 'OPEN' && seat.index > highestOccupied) highestOccupied = seat.index;
    }
    return highestOccupied === -1 ? 1 : highestOccupied + 1;
  })();

  function send(message: ClientMessage) {
    socket.send(JSON.stringify(clientMessageSchema.parse(message)));
  }

  function toggleReady() {
    if (!mySeat) return;
    send({ type: 'SET_READY', ready: !mySeat.ready });
  }

  function selectSeatCount(count: number) {
    send({ type: 'SET_SEAT_COUNT', count });
  }

  function kickSeat(seatIndex: number) {
    send({ type: 'KICK', seatIndex });
  }

  function renameCodename(codename: string) {
    send({ type: 'SET_CODENAME', codename });
  }

  // D-05: sent unconditionally, not only when the seat happens to be ready
  // — the ready-cleared banner is shown on every open with no condition of
  // its own, and an unconditional clear is what makes that literally true.
  // setReady is an idempotent per-seat write, so clearing an already-clear
  // seat costs a broadcast and nothing else.
  function openEditor() {
    setEditingLoadout(true);
    send({ type: 'SET_READY', ready: false });
  }

  // The always-enabled second exit. D-01's autosave already persisted the
  // draft locally, so backing out loses nothing — the room simply keeps the
  // last deck it accepted.
  function closeEditor() {
    setEditingLoadout(false);
  }

  function handleSave() {
    awaitingSaveCloseRef.current = true;
    submitLoadout(socket, loadout);
  }

  function handleSendChat(text: string) {
    sendChat(socket, text);
  }

  function handleSendChatPrompt(promptId: number) {
    sendChatPrompt(socket, promptId);
  }

  const showDivergenceNotice = !editingLoadout && loadoutsDiverge(loadout, lastAcceptedCards);

  return (
    <PageTransition className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
      <h2 className="text-[20px] font-semibold leading-[1.2]">Seats</h2>

      {!snapshot ? (
        <p className="text-sm">Connecting…</p>
      ) : editingLoadout ? (
        <Deckbuilder
          loadout={loadout}
          cards={ALL_CARDS}
          onAdd={addCard}
          onRemove={removeCard}
          onLoadPreset={loadPreset}
          saveStatus={saveStatus}
          showReadyClearedBanner
          onSave={handleSave}
          onClose={closeEditor}
        />
      ) : (
        <>
          {mySeat && (
            <CodenameEditor
              value={mySeat.codename ?? ''}
              ready={mySeat.ready}
              onSubmit={renameCodename}
            />
          )}
          <div className="flex flex-col gap-4">
            <SeatCountControl
              current={snapshot.seats.length}
              minAllowed={minAllowed}
              isHost={isHost}
              error={seatCountError}
              onSelect={selectSeatCount}
            />
            <SeatList
              snapshot={snapshot}
              onToggleReady={toggleReady}
              myPlayerId={playerId}
              onKick={isHost ? kickSeat : undefined}
            />
            {kickError && <p className="text-sm text-[#dc2626]">{kickError}</p>}
          </div>
          {mySeat && (
            <div className="flex gap-2">
              <Button onClick={toggleReady}>{mySeat.ready ? 'Ready ✓' : 'Ready Up'}</Button>
              <Button variant="ghost" onClick={openEditor}>
                Edit Loadout
              </Button>
            </div>
          )}
          {showDivergenceNotice && (
            <p className="text-sm text-[#64748b]">
              Your loadout has unsaved changes — this match will use your last saved loadout.
            </p>
          )}
          <ReadyCountdown snapshot={snapshot} />
          <ChatPanel
            messages={lobbyChat}
            onSend={handleSendChat}
            onSendPrompt={handleSendChatPrompt}
            error={chatError}
          />
        </>
      )}
    </PageTransition>
  );
}

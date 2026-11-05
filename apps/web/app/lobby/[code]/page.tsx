'use client';

import { ALL_CARDS } from '@berlin/engine';
import { clientMessageSchema } from '@berlin/shared';
import type { ClientMessage, LobbySettings, LobbySnapshot, ServerMessage } from '@berlin/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Deckbuilder } from '../../../components/deck/Deckbuilder.js';
import { ChatPanel } from '../../../components/lobby/ChatPanel.js';
import { CodenameEditor } from '../../../components/lobby/CodenameEditor.js';
import { MatchSettingsPanel } from '../../../components/lobby/MatchSettingsPanel.js';
import { ReadyCountdown } from '../../../components/lobby/ReadyCountdown.js';
import { SeatCountControl } from '../../../components/lobby/SeatCountControl.js';
import { SeatList } from '../../../components/lobby/SeatList.js';
import { Button } from '../../../components/ui/Button.js';
import { Folder } from '../../../components/ui/Folder.js';
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
  // Set from a SET_SETTINGS_REJECTED frame, cleared on the next ROOM_STATE —
  // the same "next authoritative frame wins" discipline as seatCountError.
  // `field` lets the panel mark the one offending control (LOBBY-14).
  const [settingsError, setSettingsError] = useState<{ field: string | null; message: string } | null>(
    null,
  );
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
      setSettingsError(null);
    }
    if (message.type === 'JOINED') setPlayerId(message.playerId);
    if (message.type === 'SET_SEAT_COUNT_REJECTED') setSeatCountError(message.message);
    if (message.type === 'SET_SETTINGS_REJECTED') {
      setSettingsError({ field: message.field, message: message.message });
    }
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

  function changeSettings(settings: LobbySettings) {
    send({ type: 'SET_SETTINGS', settings });
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
    <PageTransition className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/" className="label-caps text-on-desk-muted hover:text-on-desk">
            ← Berlin 1988
          </Link>
          <h1 className="font-display text-3xl leading-none text-on-desk sm:text-4xl">Briefing room</h1>
        </div>
        <InviteCode code={code} />
      </header>

      {!snapshot ? (
        <p className="label-caps text-on-desk-muted">Connecting…</p>
      ) : editingLoadout ? (
        <div className="manila rounded-[4px] p-4 shadow-sheet sm:p-6">
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
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Folder tab="Seats" as="h2" bodyClassName="flex flex-col gap-4 p-5">
            {mySeat && (
              <div className="flex flex-col gap-1.5">
                <span className="label-caps text-ink-muted">Your codename</span>
                <CodenameEditor
                  value={mySeat.codename ?? ''}
                  ready={mySeat.ready}
                  onSubmit={renameCodename}
                />
              </div>
            )}
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
            {kickError && <p className="border-l-4 border-stamp px-3 py-1.5 text-sm text-stamp">{kickError}</p>}
            {mySeat && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={toggleReady} size="lg" variant={mySeat.ready ? 'ghost' : 'primary'}>
                  {mySeat.ready ? 'Ready ✓' : 'Ready Up'}
                </Button>
                <Button variant="ghost" size="lg" onClick={openEditor}>
                  Edit Loadout
                </Button>
              </div>
            )}
            {showDivergenceNotice && (
              <p className="text-sm text-ink-muted">
                Your loadout has unsaved changes — this match will use your last saved loadout.
              </p>
            )}
            <ReadyCountdown snapshot={snapshot} />
            <p className="text-xs text-ink-muted">
              The match starts once at least half of the filled seats are ready. Open seats are filled by AI
              opponents.
            </p>
          </Folder>

          <div className="flex flex-col gap-6">
            <Folder tab="Operation parameters" bodyClassName="p-5">
              <MatchSettingsPanel
                settings={snapshot.settings}
                seatCount={snapshot.seats.length}
                isHost={isHost}
                errorField={settingsError?.field ?? null}
                error={settingsError?.message ?? null}
                onChange={changeSettings}
              />
            </Folder>
            <ChatPanel
              messages={lobbyChat}
              onSend={handleSendChat}
              onSendPrompt={handleSendChatPrompt}
              error={chatError}
            />
          </div>
        </div>
      )}
    </PageTransition>
  );
}

/** The join code, large enough to read aloud, with a copy-the-invite-link
 *  button — the whole way a friend gets into this room. */
function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/lobby/${code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="paper flex items-center gap-3 rounded-[3px] px-4 py-2 shadow-sheet">
      <span className="flex flex-col leading-tight">
        <span className="label-caps text-[0.6rem] text-ink-muted">Join code</span>
        <span className="font-display text-2xl tracking-[0.3em]">{code}</span>
      </span>
      <button
        type="button"
        onClick={copy}
        className="label-caps min-h-11 rounded-[2px] border-2 border-ink/40 px-3 text-[0.65rem] hover:bg-ink/10"
      >
        {copied ? 'Link copied' : 'Copy invite link'}
      </button>
    </div>
  );
}

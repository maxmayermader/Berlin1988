'use client';

const SEAT_OPTIONS = [1, 2, 3, 4] as const;

export interface SeatCountControlProps {
  current: number;
  minAllowed: number;
  isHost: boolean;
  error: string | null;
  onSelect: (count: number) => void;
}

/**
 * A host-only seat-count control (LOBBY-01, D-04). Renders nothing at all
 * when `isHost` is false — the server's canSetSeatCount is the sole
 * authority (apps/party/src/state.ts); this component decides nothing
 * beyond mapping its props onto markup (apps/web/components/CLAUDE.md).
 * Every option is at least 44px in its click dimension (03-UI-SPEC.md's
 * hit-target exception).
 */
export function SeatCountControl({ current, minAllowed, isHost, error, onSelect }: SeatCountControlProps) {
  if (!isHost) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base">Seats</span>
      <div className="flex gap-2">
        {SEAT_OPTIONS.map((count) => {
          const selected = count === current;
          const disabled = count < minAllowed;
          return (
            <button
              key={count}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(count)}
              title={
                disabled
                  ? `Can't go below ${minAllowed} — ${minAllowed} seats are filled`
                  : undefined
              }
              className={`h-11 min-w-11 rounded border px-3 text-sm font-semibold ${
                disabled
                  ? 'cursor-not-allowed border-[#e2e8f0] text-[#64748b]'
                  : selected
                    ? 'border-[#2563eb] text-[#2563eb]'
                    : 'border-[#e2e8f0] text-[#0f172a]'
              }`}
            >
              {count}
            </button>
          );
        })}
      </div>
      {error !== null && <p className="text-sm text-[#64748b]">{error}</p>}
    </div>
  );
}

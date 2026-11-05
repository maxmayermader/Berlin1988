'use client';

import type { ActionKind, ActionOption, UnavailableOption } from '../../lib/actionMenu.js';

export interface ActionPickerProps {
  options: readonly ActionOption[];
  unavailable: readonly UnavailableOption[];
  /** The option awaiting a board target, if any. */
  pendingKey: string | null;
  intelAvailable: number;
  disabled: boolean;
  onChoose: (option: ActionOption) => void;
  onCancel: () => void;
}

/** A one-glyph pictogram per operation, so a long menu scans by shape. */
const KIND_GLYPH: Record<ActionKind, string> = {
  MOVE: '→',
  SPRINT: '⇉',
  STRIKE: '✕',
  AMBUSH: '⌇',
  WIRETAP: '☏',
  BRIBE: '¤',
  DECOY: '◌',
  SAFEHOUSE: '⌂',
  HOLD: '❚❚',
};

/**
 * Every operation `legalOrders()` offers for the active slot (ORDER-01),
 * with its Intel price (ORDER-03) and card text (ORDER-06) visible before
 * the player commits.
 *
 * An option that needs a board target puts the picker into targeting mode
 * rather than assigning immediately — which is what makes a node click
 * unambiguous when the same node is legal for two different operations
 * (ORDER-07).
 *
 * Nothing here decides legality or price. Both arrive as props derived from
 * the engine (apps/web/components/CLAUDE.md: components take props and
 * callbacks).
 */
export function ActionPicker({
  options,
  unavailable,
  pendingKey,
  intelAvailable,
  disabled,
  onChoose,
  onCancel,
}: ActionPickerProps) {
  const pending = options.find((o) => o.key === pendingKey) ?? null;

  if (pending) {
    const lethal = pending.kind === 'STRIKE';
    return (
      <div
        className={`flex flex-col gap-2 rounded-[3px] border-2 border-dashed p-3 ${
          lethal ? 'border-stamp bg-stamp-wash' : 'border-accent bg-accent-wash'
        }`}
        role="status"
      >
        <p className={`flex items-center gap-2 font-bold ${lethal ? 'text-stamp' : 'text-accent'}`}>
          <span aria-hidden="true" className="text-lg leading-none">
            {KIND_GLYPH[pending.kind]}
          </span>
          {pending.label}
        </p>
        <p className="text-sm">
          Choose a target on the map — {pending.targets.length} available. Marked nodes are legal; arrow keys and Enter
          work too.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="label-caps min-h-11 self-start rounded-[3px] border-2 border-current/50 px-3 text-xs hover:bg-ink/10"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (options.length === 0) {
    return <p className="text-sm italic text-ink-muted">No legal actions for this slot.</p>;
  }

  const free = options.filter((o) => o.free);
  const slotted = options.filter((o) => !o.free);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="label-caps">Choose an action</span>
        <span className="text-sm font-bold tabular-nums">{intelAvailable} Intel available</span>
      </div>

      <ul className="grid grid-cols-1 gap-1.5">
        {slotted.map((option) => (
          <OptionRow key={option.key} option={option} disabled={disabled} onChoose={onChoose} />
        ))}
      </ul>

      {free.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="label-caps text-ink-muted">Costs no action</span>
          <ul className="grid grid-cols-1 gap-1.5">
            {free.map((option) => (
              <OptionRow key={option.key} option={option} disabled={disabled} onChoose={onChoose} />
            ))}
          </ul>
        </div>
      )}

      {unavailable.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted">
            {unavailable.length} card{unavailable.length === 1 ? '' : 's'} unavailable
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1 border-l-2 border-rule pl-2">
            {unavailable.map((item) => (
              <li key={item.cardId as string} className="text-ink-muted">
                <span className="font-bold text-ink line-through decoration-ink-muted/60">{item.label}</span> — {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function OptionRow({
  option,
  disabled,
  onChoose,
}: {
  option: ActionOption;
  disabled: boolean;
  onChoose: (option: ActionOption) => void;
}) {
  const lethal = option.kind === 'STRIKE';
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChoose(option)}
        className={`paper group flex w-full items-start gap-2.5 rounded-[3px] border px-2.5 py-2 text-left shadow-[1px_1px_0_0_var(--color-rule)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          lethal ? 'border-stamp/50 enabled:hover:border-stamp enabled:hover:bg-stamp-wash' : 'border-rule enabled:hover:border-ink enabled:hover:bg-paper-2'
        }`}
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
            lethal ? 'border-stamp text-stamp' : 'border-ink/50 text-ink'
          }`}
        >
          {KIND_GLYPH[option.kind]}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className={`text-sm font-bold ${lethal ? 'text-stamp' : 'text-ink'}`}>{option.label}</span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-ink-muted">{priceLabel(option)}</span>
          </span>
          <span className="text-xs leading-snug text-ink-muted">{option.text}</span>
        </span>
      </button>
    </li>
  );
}

function priceLabel(option: ActionOption): string {
  if (option.intelCost === 0 && !option.costVaries) return 'Free';
  const prefix = option.costVaries ? 'from ' : '';
  return `${prefix}${option.intelCost} Intel`;
}

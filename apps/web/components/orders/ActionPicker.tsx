'use client';

import type { ActionOption, UnavailableOption } from '../../lib/actionMenu.js';

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
    return (
      <div className="flex flex-col gap-2 rounded border border-[#2563eb] bg-[#eff6ff] p-3">
        <p className="text-sm font-semibold text-[#1d4ed8]">{pending.label}</p>
        <p className="text-sm text-[#1e3a8a]">
          Choose a target on the map — {pending.targets.length} available.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="h-11 self-start rounded border border-[#2563eb] px-3 text-sm font-semibold text-[#2563eb]"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (options.length === 0) {
    return <p className="text-sm text-[#64748b]">No legal actions for this slot.</p>;
  }

  const free = options.filter((o) => o.free);
  const slotted = options.filter((o) => !o.free);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">Choose an action</span>
        <span className="text-sm text-[#475569]">{intelAvailable} Intel</span>
      </div>

      <ul className="flex flex-col gap-2">
        {slotted.map((option) => (
          <OptionRow key={option.key} option={option} disabled={disabled} onChoose={onChoose} />
        ))}
      </ul>

      {free.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#475569]">
            Costs no action
          </span>
          <ul className="flex flex-col gap-2">
            {free.map((option) => (
              <OptionRow key={option.key} option={option} disabled={disabled} onChoose={onChoose} />
            ))}
          </ul>
        </div>
      )}

      {unavailable.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-[#475569]">
            {unavailable.length} card{unavailable.length === 1 ? '' : 's'} unavailable
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {unavailable.map((item) => (
              <li key={item.cardId as string} className="text-[#64748b]">
                <span className="font-semibold">{item.label}</span> — {item.reason}
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
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChoose(option)}
        className="flex w-full flex-col gap-1 rounded border border-[#e2e8f0] p-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-[#0f172a]">{option.label}</span>
          <span className="shrink-0 text-xs text-[#475569]">{priceLabel(option)}</span>
        </span>
        <span className="text-xs text-[#64748b]">{option.text}</span>
      </button>
    </li>
  );
}

function priceLabel(option: ActionOption): string {
  if (option.intelCost === 0 && !option.costVaries) return 'Free';
  const prefix = option.costVaries ? 'from ' : '';
  return `${prefix}${option.intelCost} Intel`;
}

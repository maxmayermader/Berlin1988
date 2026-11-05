'use client';

import type { AgentId, AgentState, MapDefinition, Sector } from '@berlin/shared';
import { nodeName } from '../../lib/format.js';
import { SECTOR_COLOR } from '../../lib/sectors.js';

export interface AgentSwitcherProps {
  /** A list, never a singleton — apps/web/components/CLAUDE.md: "Two agents
   *  is the default, one is a setting." Every agent the player fielded, so
   *  numbering stays stable after one burns. */
  agents: readonly AgentState[];
  selectedAgentId: AgentId | null;
  onSelect: (agentId: AgentId) => void;
  map: MapDefinition;
  faction: Sector;
  /** Agent ids whose order the room has acknowledged this round. */
  lockedIds: ReadonlySet<string>;
}

export function AgentSwitcher({ agents, selectedAgentId, onSelect, map, faction, lockedIds }: AgentSwitcherProps) {
  if (agents.length === 0) return null;

  return (
    <div className="flex gap-1.5" role="tablist" aria-label="Your agents">
      {agents.map((agent, index) => {
        const selected = agent.id === selectedAgentId;
        const locked = lockedIds.has(agent.id as string);
        return (
          <button
            key={agent.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={!agent.alive}
            onClick={() => onSelect(agent.id)}
            className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[3px] border-2 px-2.5 py-1 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
              selected ? 'border-ink bg-paper shadow-[2px_2px_0_0_var(--color-ink)]' : 'border-rule bg-paper-2 enabled:hover:border-ink-muted'
            }`}
          >
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                agent.alive ? 'text-paper' : 'border-2 border-stamp/70 text-stamp'
              }`}
              style={agent.alive ? { backgroundColor: SECTOR_COLOR[faction] } : undefined}
            >
              {agent.alive ? index + 1 : '✕'}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-sm font-bold">Agent {index + 1}</span>
              <span className="truncate text-[0.7rem] text-ink-muted">
                {agent.alive ? nodeName(map, agent.nodeId) : 'Burned'}
              </span>
            </span>
            {locked && agent.alive && (
              <span className="label-caps ml-auto text-[0.58rem] text-ok" aria-label="Order locked in">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

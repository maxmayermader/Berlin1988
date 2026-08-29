'use client';

import type { AgentId, AgentState } from '@berlin/shared';

export interface AgentSwitcherProps {
  /** A list, never a singleton — apps/web/components/CLAUDE.md: "Two agents
   *  is the default, one is a setting." Already filtered to living agents
   *  by the caller; an eliminated player passes an empty list. */
  agents: readonly AgentState[];
  selectedAgentId: AgentId | null;
  onSelect: (agentId: AgentId) => void;
}

export function AgentSwitcher({ agents, selectedAgentId, onSelect }: AgentSwitcherProps) {
  if (agents.length === 0) return null;

  return (
    <div className="flex gap-2" role="tablist" aria-label="Your agents">
      {agents.map((agent, index) => (
        <button
          key={agent.id}
          type="button"
          role="tab"
          aria-selected={agent.id === selectedAgentId}
          onClick={() => onSelect(agent.id)}
          className={
            agent.id === selectedAgentId
              ? 'rounded border border-[#2563eb] px-3 py-1 text-sm font-semibold text-[#2563eb]'
              : 'rounded border border-[#e2e8f0] px-3 py-1 text-sm text-[#0f172a]'
          }
        >
          Agent {index + 1}
        </button>
      ))}
    </div>
  );
}

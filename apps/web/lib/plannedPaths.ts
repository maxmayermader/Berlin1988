import type { Action, AgentState, NodeId } from '@berlin/shared';

/**
 * ORDER-08: what an agent's composed (or submitted) order looks like on the
 * map — movement drawn as a route, operations as a marker on their target.
 *
 * Pure and fog-trivial: the input is the viewer's own agent and the
 * viewer's own actions, nothing else. No legality is decided here; the
 * actions already came out of `legalOrders()` via the composer.
 *
 * Positions follow the engine's resolution model (packages/engine/CLAUDE.md):
 * movement is declared first and operations resolve from the post-movement
 * node, except SAFEHOUSE, AMBUSH and DECOY, which resolve before movement and
 * so are placed from the START node.
 */

/** 'draft' is still in the composer; 'locked' is acknowledged by the room.
 *  The board inks the two differently (apps/web/components/CLAUDE.md:
 *  server truth vs optimistic preview stays visually distinct). */
export type PlanStatus = 'draft' | 'locked';

export type PlannedMark =
  | {
      readonly kind: 'route';
      readonly slot: number;
      /** Waypoints in order — two for a Move, three for a Sprint. */
      readonly nodes: readonly NodeId[];
    }
  | {
      readonly kind: 'strike' | 'wiretap' | 'decoy';
      readonly slot: number;
      readonly from: NodeId;
      readonly target: NodeId;
    }
  | {
      readonly kind: 'hold' | 'ambush' | 'safehouse' | 'bribe';
      readonly slot: number;
      readonly at: NodeId;
    };

export interface AgentPlan {
  readonly agentId: AgentState['id'];
  /** 0-based position in the viewer's agent list — agent "1" or "2". */
  readonly agentIndex: number;
  readonly status: PlanStatus;
  readonly marks: readonly PlannedMark[];
}

export function plannedMarks(start: NodeId, actions: readonly (Action | null)[]): PlannedMark[] {
  const marks: PlannedMark[] = [];
  let pos = start;
  actions.forEach((action, slot) => {
    if (!action) return;
    switch (action.type) {
      case 'MOVE':
        marks.push({ kind: 'route', slot, nodes: [pos, action.to] });
        pos = action.to;
        break;
      case 'SPRINT':
        marks.push({ kind: 'route', slot, nodes: [pos, action.via, action.to] });
        pos = action.to;
        break;
      case 'STRIKE':
        marks.push({ kind: 'strike', slot, from: pos, target: action.target });
        break;
      case 'WIRETAP':
        marks.push({ kind: 'wiretap', slot, from: pos, target: action.target });
        break;
      case 'DECOY':
        marks.push({ kind: 'decoy', slot, from: start, target: action.target });
        break;
      case 'HOLD':
        marks.push({ kind: 'hold', slot, at: pos });
        break;
      case 'BRIBE':
        marks.push({ kind: 'bribe', slot, at: pos });
        break;
      case 'AMBUSH':
        marks.push({ kind: 'ambush', slot, at: start });
        break;
      case 'SAFEHOUSE':
        marks.push({ kind: 'safehouse', slot, at: start });
        break;
    }
  });
  return marks;
}

/**
 * One plan per living agent: the room-acknowledged order if there is one,
 * otherwise whatever is in that agent's draft. An agent with neither gets
 * no plan.
 */
export function agentPlans(
  agents: readonly AgentState[],
  drafts: Readonly<Record<string, readonly (Action | null)[]>>,
  locked: Readonly<Record<string, readonly Action[]>>,
): AgentPlan[] {
  const plans: AgentPlan[] = [];
  agents.forEach((agent, agentIndex) => {
    if (!agent.alive) return;
    const lockedActions = locked[agent.id as string];
    const draftActions = drafts[agent.id as string];
    const actions = lockedActions ?? draftActions;
    if (!actions || actions.every((a) => a === null)) return;
    plans.push({
      agentId: agent.id,
      agentIndex,
      status: lockedActions ? 'locked' : 'draft',
      marks: plannedMarks(agent.nodeId, actions),
    });
  });
  return plans;
}

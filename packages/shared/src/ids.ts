/**
 * Branded id types. These are strings at runtime and distinct types at compile
 * time, so a NodeId can never be passed where a PlayerId is expected.
 */

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type PlayerId = Brand<string, 'PlayerId'>;
export type AgentId = Brand<string, 'AgentId'>;
export type NodeId = Brand<string, 'NodeId'>;
export type CardId = Brand<string, 'CardId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type TokenId = Brand<string, 'TokenId'>;

export const playerId = (s: string): PlayerId => s as PlayerId;
export const agentId = (s: string): AgentId => s as AgentId;
export const nodeId = (s: string): NodeId => s as NodeId;
export const cardId = (s: string): CardId => s as CardId;
export const matchId = (s: string): MatchId => s as MatchId;
export const tokenId = (s: string): TokenId => s as TokenId;

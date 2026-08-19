/** Sector colors. Both map territory and card affinity. */
export type Sector = 'RED' | 'BLUE' | 'GOLD' | 'GREEN';
export const SECTORS: readonly Sector[] = ['RED', 'BLUE', 'GOLD', 'GREEN'] as const;

/** The six operation icons. */
export type IconType = 'AGENT' | 'WIRETAP' | 'BRIBE' | 'DECOY' | 'SAFEHOUSE' | 'STRIKE';
export const ICONS: readonly IconType[] = [
  'AGENT',
  'WIRETAP',
  'BRIBE',
  'DECOY',
  'SAFEHOUSE',
  'STRIKE',
] as const;

/** Edge types on the map graph. */
export type EdgeType = 'STREET' | 'TUNNEL' | 'CHECKPOINT';

/** Match lifecycle. */
export type MatchPhase = 'LOBBY' | 'LOADOUT' | 'ORDERS' | 'RESOLVED' | 'FINISHED';

/** How blockades are surfaced to players. */
export type BlockadeMode = 'OFF' | 'ANNOUNCED' | 'RANDOM' | 'MIXED';

/** Why a match ended. */
export type OutcomeReason = 'EXTRACTION' | 'ELIMINATION' | 'ROUND_LIMIT';

/** AI difficulty tiers. Consumed by @berlin/ai; declared here so lobby types can reference them. */
export type Difficulty = 'RECRUIT' | 'FIELD_AGENT' | 'HANDLER' | 'SPYMASTER';

/** AI personalities. */
export type PersonalityId = 'VOGEL' | 'KATJA' | 'MAREK' | 'HALLORAN' | 'SABLE';

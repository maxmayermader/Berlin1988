import {
  ACTIVE_CARDS,
  ALL_CARDS,
  budgetPointsOf,
  DEFAULT_RULESET,
  HUNTER,
  isPassive,
  OLIGARCH,
  PHANTOM,
  SPIDER,
  STARTER_LOADOUTS,
  validateLoadout,
} from '@berlin/engine';
import { ICONS, SECTORS, type CardId, type IconType, type Sector } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import {
  loadLoadout,
  loadoutLegality,
  loadoutsDiverge,
  LOADOUT_STORAGE_KEY,
  saveLoadout,
  useLoadoutStore,
  type StorageLike,
} from './loadoutStore.js';

/** In-memory stand-in for localStorage — copies apps/web/lib/identity.test.ts's
 *  fixture rather than reaching for a DOM environment. Tracks a write count
 *  so the pure-read behavior can be asserted on the fixture itself, not a
 *  spy. */
class MemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>();
  writeCount = 0;
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    this.writeCount += 1;
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

/** A storage whose setItem always throws — the persistence-failure row
 *  (Safari private browsing, quota exceeded). */
class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    return null;
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

const PRESETS = { PHANTOM, HUNTER, OLIGARCH, SPIDER } as const;

describe('loadLoadout', () => {
  it('against empty storage returns a ten-card array deep-equal to PHANTOM, and persists it', () => {
    const storage = new MemoryStorage();
    const result = loadLoadout(storage);
    expect(result).toEqual([...PHANTOM]);
    expect(storage.getItem(LOADOUT_STORAGE_KEY)).not.toBeNull();
    expect(JSON.parse(storage.getItem(LOADOUT_STORAGE_KEY)!)).toEqual([...PHANTOM]);
  });

  it('called twice in a row against unchanged storage returns deep-equal arrays and performs no write on the second call', () => {
    const storage = new MemoryStorage();
    const first = loadLoadout(storage); // seeds storage — one write
    const writesAfterFirst = storage.writeCount;
    const second = loadLoadout(storage);
    expect(second).toEqual(first);
    expect(storage.writeCount).toBe(writesAfterFirst);
  });

  it('against a stored non-JSON string returns the Phantom seed instead of throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOADOUT_STORAGE_KEY, 'not-json{{{');
    let result: CardId[] | undefined;
    expect(() => {
      result = loadLoadout(storage) as CardId[];
    }).not.toThrow();
    expect(result).toEqual([...PHANTOM]);
  });

  it.each([
    ['an object', JSON.stringify({ not: 'an array' })],
    ['a number', JSON.stringify(42)],
    ['null', JSON.stringify(null)],
  ])('against stored valid JSON that is %s returns the Phantom seed', (_label, raw) => {
    const storage = new MemoryStorage();
    storage.setItem(LOADOUT_STORAGE_KEY, raw);
    expect(loadLoadout(storage)).toEqual([...PHANTOM]);
  });

  it('against a stored array containing a non-string entry returns the Phantom seed', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(['card-a', 42, 'card-b']));
    expect(loadLoadout(storage)).toEqual([...PHANTOM]);
  });

  it('against a stored array of ten unknown-but-string card ids returns those ids unchanged', () => {
    const storage = new MemoryStorage();
    const unknown = Array.from({ length: 10 }, (_, i) => `not_a_real_card_${i}`);
    storage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(unknown));
    expect(loadLoadout(storage)).toEqual(unknown);
  });

  it('against a stored array of four card ids returns those four unchanged', () => {
    const storage = new MemoryStorage();
    const partial = [...PHANTOM].slice(0, 4);
    storage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(partial));
    expect(loadLoadout(storage)).toEqual(partial);
  });

  it('against a null storage (the server-render case) does not throw and returns the Phantom seed', () => {
    expect(() => loadLoadout(null)).not.toThrow();
    expect(loadLoadout(null)).toEqual([...PHANTOM]);
  });
});

describe('saveLoadout / loadLoadout round trip', () => {
  it('round-trips the same array through storage', () => {
    const storage = new MemoryStorage();
    saveLoadout([...HUNTER] as CardId[], storage);
    expect(loadLoadout(storage)).toEqual([...HUNTER]);
  });

  it('against a storage whose setItem throws does not itself throw, and reports the failure to its caller', () => {
    const storage = new ThrowingStorage();
    let result: boolean | undefined;
    expect(() => {
      result = saveLoadout([...PHANTOM] as CardId[], storage);
    }).not.toThrow();
    expect(result).toBe(false);
  });

  it('against a null storage is a no-op and does not throw, reporting success', () => {
    let result: boolean | undefined;
    expect(() => {
      result = saveLoadout([...PHANTOM] as CardId[], null);
    }).not.toThrow();
    expect(result).toBe(true);
  });
});

describe('the four starter presets (loaded via saveLoadout as loadPreset would)', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    it(`${name}: replaces the entire stored array, deep-equal to the engine export, with no leftover from a previous deck`, () => {
      const storage = new MemoryStorage();
      saveLoadout([...OLIGARCH] as CardId[], storage); // a different deck already stored
      saveLoadout([...preset] as CardId[], storage); // D-02: full overwrite
      const result = loadLoadout(storage);
      expect(result).toEqual([...preset]);
      const leftoverFromPrevious = ([...OLIGARCH] as string[]).filter((id) => !preset.includes(id as never));
      for (const id of leftoverFromPrevious) {
        expect(result).not.toContain(id);
      }
    });

    it(`${name}: re-saving the already-loaded preset leaves the stored value deep-equal and does not grow or duplicate the array`, () => {
      const storage = new MemoryStorage();
      saveLoadout([...preset] as CardId[], storage);
      saveLoadout([...preset] as CardId[], storage);
      const result = loadLoadout(storage);
      expect(result).toEqual([...preset]);
      expect(result).toHaveLength(preset.length);
    });

    it(`${name}: yields zero violations from validateLoadout against DEFAULT_RULESET`, () => {
      expect(validateLoadout(preset, DEFAULT_RULESET)).toEqual([]);
    });
  }

  it('STARTER_LOADOUTS exposes exactly these four presets by name', () => {
    expect(new Set(Object.keys(STARTER_LOADOUTS))).toEqual(new Set(Object.keys(PRESETS)));
  });
});

/**
 * Builds a legal-except-for-what-we-name draft by filtering ALL_CARDS,
 * never by hand-typing ids (02-RESEARCH.md, and the drift risk it flags in
 * Budget Point costs). Greedily takes the cheapest cards while respecting
 * ruleset.maxPerIcon, so the result never trips ICON_LIMIT or (short of the
 * ruleset's own ceiling) OVER_BUDGET by construction.
 */
function cheapDiverseDraft(n: number): CardId[] {
  const perIcon = new Map<IconType, number>();
  const chosen: CardId[] = [];
  for (const card of [...ACTIVE_CARDS].sort((a, b) => a.budgetPoints - b.budgetPoints)) {
    if (chosen.length >= n) break;
    const count = perIcon.get(card.icon) ?? 0;
    if (count >= DEFAULT_RULESET.maxPerIcon) continue;
    chosen.push(card.id);
    perIcon.set(card.icon, count + 1);
  }
  return chosen;
}

/**
 * A ten-card draft drawn entirely from one sector — as close to "a single
 * sector" as the current 34-card pool allows. No sector actually has ten
 * cards (the richest, GOLD/GREEN, has nine — six actives, one per icon,
 * plus three same-sector passives), so this pads to size with a repeated
 * id. validateLoadout() has no duplicate-id rule at all (02-UI-SPEC.md), so
 * a repeat is still "every card in this draft is sector X" for the purpose
 * of the color-count rule under test, and the padded card is the sector's
 * cheapest so no icon or budget rule trips as a side effect.
 */
function monoSectorDraft(sector: Sector): CardId[] {
  const cards = ALL_CARDS.filter((c) => c.sector === sector);
  if (cards.length === 0) throw new Error(`No cards in sector ${sector} — fixture cannot be built`);
  const cheapest = [...cards].sort((a, b) => a.budgetPoints - b.budgetPoints)[0]!;
  const ids = cards.map((c) => c.id);
  while (ids.length < DEFAULT_RULESET.loadoutSize) ids.push(cheapest.id);
  return ids;
}

describe('loadoutLegality', () => {
  it.each(Object.entries(PRESETS))(
    '%s: violations are deep-equal to a direct validateLoadout() call, and isLegal is true',
    (_name, preset) => {
      const legality = loadoutLegality(preset);
      expect(legality.violations).toEqual(validateLoadout(preset, DEFAULT_RULESET));
      expect(legality.isLegal).toBe(true);
    },
  );

  const spreadOfDrafts: Record<string, CardId[]> = {
    empty: [],
    short: cheapDiverseDraft(3),
    'exact-size': cheapDiverseDraft(10),
    oversize: cheapDiverseDraft(11),
    'unknown-id': [...cheapDiverseDraft(9), 'not_a_real_card' as CardId],
    'single-sector': monoSectorDraft('GOLD'),
  };

  it.each(Object.entries(spreadOfDrafts))(
    '%s draft: violations, isLegal, and budgetPoints all agree with a direct engine call',
    (_label, draft) => {
      const legality = loadoutLegality(draft);
      const oracleViolations = validateLoadout(draft, DEFAULT_RULESET);
      expect(legality.violations).toEqual(oracleViolations);
      expect(legality.isLegal).toBe(oracleViolations.length === 0);
      expect(legality.budgetPoints).toBe(budgetPointsOf(draft));
    },
  );

  it('an empty draft reports WRONG_SIZE (an empty deck is an editable state that reports, not a crash) and matches the engine exactly', () => {
    const legality = loadoutLegality([]);
    // An empty draft also has zero distinct colors, which is independently
    // < minColors — validateLoadout() correctly reports both WRONG_SIZE and
    // TOO_FEW_COLORS for it, and the assertion is against that oracle
    // directly rather than a hand-predicted count.
    expect(legality.violations).toEqual(validateLoadout([], DEFAULT_RULESET));
    expect(legality.violations.map((v) => v.code)).toContain('WRONG_SIZE');
    expect(legality.isLegal).toBe(false);
  });

  it('a three-card draft (otherwise legal) yields WRONG_SIZE and nothing else', () => {
    const draft = cheapDiverseDraft(3);
    const legality = loadoutLegality(draft);
    expect(legality.violations.map((v) => v.code)).toEqual(['WRONG_SIZE']);
  });

  it(`a ten-card draft at exactly the ruleset's size/budget/icon/color thresholds yields zero violations (HUNTER: ${DEFAULT_RULESET.loadoutSize} cards, ${DEFAULT_RULESET.maxBudgetPoints} BP, ${DEFAULT_RULESET.maxPerIcon}-per-icon on two icons, ${DEFAULT_RULESET.minColors} colors)`, () => {
    expect(HUNTER).toHaveLength(DEFAULT_RULESET.loadoutSize);
    expect(budgetPointsOf(HUNTER)).toBe(DEFAULT_RULESET.maxBudgetPoints);
    const legality = loadoutLegality(HUNTER);
    expect(legality.iconCounts.WIRETAP).toBe(DEFAULT_RULESET.maxPerIcon);
    expect(Object.values(legality.colorsPresent).filter(Boolean)).toHaveLength(DEFAULT_RULESET.minColors);
    expect(legality.violations).toEqual([]);
  });

  it('one card past maxBudgetPoints (10 cards, otherwise legal) produces exactly one OVER_BUDGET violation, and removing it clears it', () => {
    // Swap HUNTER's cheapest AGENT card (ag_red, 1 BP) for a costlier same-icon
    // card (ag_green, 2 BP) — icon counts and colors are unaffected, only the
    // budget total moves, from exactly at the ceiling to one past it.
    const overBudget = HUNTER.map((id) => (id === 'ag_red' ? 'ag_green' : id)) as CardId[];
    expect(overBudget).toHaveLength(DEFAULT_RULESET.loadoutSize);
    expect(budgetPointsOf(overBudget)).toBe(DEFAULT_RULESET.maxBudgetPoints + 1);
    const legality = loadoutLegality(overBudget);
    expect(legality.violations.map((v) => v.code)).toEqual(['OVER_BUDGET']);

    const backToLegal = loadoutLegality(HUNTER);
    expect(backToLegal.violations).toEqual([]);
  });

  it('a fourth card of one icon (10 cards, otherwise legal) produces exactly one ICON_LIMIT violation naming that icon, and removing it clears it', () => {
    // Swap HUNTER's one DECOY card for a fourth WIRETAP — HUNTER already
    // carries three (wt_blue, wt_red, ps_counter_surv); dc_blue -> wt_gold
    // keeps the size and budget unchanged (both cost 2 BP) and colors intact
    // (RED/BLUE still present via other cards, GOLD is simply additional).
    const overLimit = HUNTER.map((id) => (id === 'dc_blue' ? 'wt_gold' : id)) as CardId[];
    expect(overLimit).toHaveLength(DEFAULT_RULESET.loadoutSize);
    expect(budgetPointsOf(overLimit)).toBe(budgetPointsOf(HUNTER));
    const legality = loadoutLegality(overLimit);
    expect(legality.violations).toHaveLength(1);
    expect(legality.violations[0]?.code).toBe('ICON_LIMIT');
    expect(legality.violations[0]?.message).toContain('WIRETAP');
    expect(legality.iconCounts.WIRETAP).toBe(DEFAULT_RULESET.maxPerIcon + 1);

    const backToLegal = loadoutLegality(HUNTER);
    expect(backToLegal.violations).toEqual([]);
  });

  it('a ten-card draft drawn from a single sector produces TOO_FEW_COLORS', () => {
    const draft = monoSectorDraft('GOLD');
    expect(draft).toHaveLength(DEFAULT_RULESET.loadoutSize);
    const legality = loadoutLegality(draft);
    expect(legality.violations.map((v) => v.code)).toEqual(['TOO_FEW_COLORS']);
  });

  it('a draft containing an unresolvable id produces UNKNOWN_CARD without throwing, and counts it as zero Budget Points', () => {
    const draft = [...cheapDiverseDraft(9), 'not_a_real_card' as CardId];
    let legality: ReturnType<typeof loadoutLegality> | undefined;
    expect(() => {
      legality = loadoutLegality(draft);
    }).not.toThrow();
    expect(legality!.violations.some((v) => v.code === 'UNKNOWN_CARD')).toBe(true);
    expect(legality!.budgetPoints).toBe(budgetPointsOf(cheapDiverseDraft(9)));
  });

  it('iconCounts has an entry for every ICONS member, including zero, and counts passives too', () => {
    const legality = loadoutLegality(HUNTER);
    for (const icon of ICONS) {
      expect(legality.iconCounts).toHaveProperty(icon);
      expect(typeof legality.iconCounts[icon]).toBe('number');
    }
    // ps_k9 (STRIKE, RED, passive) and ps_counter_surv (WIRETAP, BLUE,
    // passive) are both in HUNTER and already counted in the STRIKE/WIRETAP
    // totals asserted above (3 each) — passives are not a separate tally.
    expect(legality.iconCounts.AGENT).toBe(1);
  });

  it('colorsPresent has an entry for every SECTORS member, including absent colors', () => {
    const legality = loadoutLegality(HUNTER);
    for (const sector of SECTORS) {
      expect(legality.colorsPresent).toHaveProperty(sector);
    }
    expect(legality.colorsPresent.GOLD).toBe(false);
    expect(legality.colorsPresent.RED).toBe(true);
    expect(legality.colorsPresent.BLUE).toBe(true);
  });

  it('shuffling a draft leaves violations, budget points, icon counts, and colors identical', () => {
    const forward = loadoutLegality(HUNTER);
    const shuffled = [...HUNTER].reverse();
    const backward = loadoutLegality(shuffled);
    expect(backward.violations).toEqual(forward.violations);
    expect(backward.budgetPoints).toBe(forward.budgetPoints);
    expect(backward.iconCounts).toEqual(forward.iconCounts);
    expect(backward.colorsPresent).toEqual(forward.colorsPresent);
    expect(backward.isLegal).toBe(forward.isLegal);
  });

  it('calling loadoutLegality twice on the same unchanged draft returns deep-equal results and mutates nothing', () => {
    const draftSnapshot = [...HUNTER];
    const first = loadoutLegality(HUNTER);
    const second = loadoutLegality(HUNTER);
    expect(second).toEqual(first);
    expect(HUNTER).toEqual(draftSnapshot);
  });
});

describe('useLoadoutStore.add / .remove', () => {
  it('add never refuses: an eleventh card is accepted, growing the draft to eleven with WRONG_SIZE left to report it', () => {
    useLoadoutStore.setState({ loadout: [...HUNTER] as CardId[] });
    useLoadoutStore.getState().add('ag_gold' as CardId);
    const draft = useLoadoutStore.getState().loadout;
    expect(draft).toHaveLength(11);
    expect(validateLoadout(draft, DEFAULT_RULESET).map((v) => v.code)).toContain('WRONG_SIZE');
  });

  it('remove on a draft that does not contain the id leaves the draft deep-equal and unchanged', () => {
    useLoadoutStore.setState({ loadout: [...HUNTER] as CardId[] });
    useLoadoutStore.getState().remove('not_in_hunter' as CardId);
    expect(useLoadoutStore.getState().loadout).toEqual([...HUNTER]);
  });

  it('remove drops only the first matching entry', () => {
    useLoadoutStore.setState({ loadout: ['ag_red', 'ag_red', 'ag_blue'] as CardId[] });
    useLoadoutStore.getState().remove('ag_red' as CardId);
    expect(useLoadoutStore.getState().loadout).toEqual(['ag_red', 'ag_blue']);
  });
});

/**
 * The reachability guarantee (D-04, the phase's own prohibition against a
 * card silently missing a section): partitions ALL_CARDS the exact same
 * way CardGrid.tsx does — one bucket per ICONS member holding that icon's
 * actives, plus a final Passives bucket — and proves the union covers
 * every card exactly once. A card whose icon fell outside ICONS, or that
 * ended up in two buckets, would never surface as a rendering error; only
 * this assertion catches it.
 */
describe('card pool reachability (D-04 partition)', () => {
  it('every card in ALL_CARDS lands in exactly one section: an ICONS-grouped active bucket, or Passives', () => {
    const buckets: (typeof ALL_CARDS)[number][][] = ICONS.map((icon) =>
      ALL_CARDS.filter((c) => c.icon === icon && !isPassive(c)),
    );
    buckets.push(ALL_CARDS.filter(isPassive));

    const union = buckets.flat();
    expect(union).toHaveLength(ALL_CARDS.length);

    const seenIds = union.map((c) => c.id);
    expect(new Set(seenIds).size).toBe(ALL_CARDS.length); // no card placed twice
    expect(new Set(seenIds)).toEqual(new Set(ALL_CARDS.map((c) => c.id))); // no orphan left out
  });

  it('every ICONS member has at least one active card, so no section is ever empty today', () => {
    // If a future content edit ever drops an icon to zero actives, this
    // fails loudly here rather than the grid quietly rendering six section
    // headers over five populated sections — the section itself still
    // renders regardless (CardGrid.tsx maps unconditionally over ICONS),
    // but this pins the assumption that makes it currently unobservable.
    for (const icon of ICONS) {
      expect(ACTIVE_CARDS.filter((c) => c.icon === icon).length).toBeGreaterThan(0);
    }
  });
});

describe('loadoutLegality.violatingCardIds', () => {
  it('is empty for an over-budget draft that has no ICON_LIMIT or UNKNOWN_CARD violation', () => {
    const overBudget = HUNTER.map((id) => (id === 'ag_red' ? 'ag_green' : id)) as CardId[];
    const legality = loadoutLegality(overBudget);
    expect(legality.violations.map((v) => v.code)).toEqual(['OVER_BUDGET']);
    expect(legality.violatingCardIds).toEqual([]);
  });

  it('is empty for a too-few-colors draft that has no ICON_LIMIT or UNKNOWN_CARD violation', () => {
    const monoSector = monoSectorDraft('GOLD');
    const legality = loadoutLegality(monoSector);
    expect(legality.violations.map((v) => v.code)).toEqual(['TOO_FEW_COLORS']);
    expect(legality.violatingCardIds).toEqual([]);
  });

  it('for an over-limit icon, contains exactly the surplus entries in draft order — the first maxPerIcon are not flagged', () => {
    const overLimit = HUNTER.map((id) => (id === 'dc_blue' ? 'wt_gold' : id)) as CardId[];
    const legality = loadoutLegality(overLimit);
    expect(legality.violations.map((v) => v.code)).toEqual(['ICON_LIMIT']);
    // overLimit's WIRETAP entries in draft order: wt_blue, wt_red, ps_counter_surv, wt_gold
    // (HUNTER's order with dc_blue swapped in place for wt_gold) — the first
    // three are the pre-existing legal three, the fourth is the surplus.
    expect(legality.violatingCardIds).toEqual(['wt_gold']);
  });

  it('for an unresolvable id, contains that id', () => {
    const draft = [...cheapDiverseDraft(9), 'not_a_real_card' as CardId];
    const legality = loadoutLegality(draft);
    expect(legality.violations.map((v) => v.code)).toContain('UNKNOWN_CARD');
    expect(legality.violatingCardIds).toContain('not_a_real_card');
  });

  it('is non-empty only when validateLoadout reports ICON_LIMIT or UNKNOWN_CARD — never invents a violation the engine did not report', () => {
    const cases: CardId[][] = [
      [...HUNTER] as CardId[], // legal
      HUNTER.map((id) => (id === 'ag_red' ? 'ag_green' : id)) as CardId[], // OVER_BUDGET only
      monoSectorDraft('GOLD'), // TOO_FEW_COLORS only
      HUNTER.map((id) => (id === 'dc_blue' ? 'wt_gold' : id)) as CardId[], // ICON_LIMIT
      [...cheapDiverseDraft(9), 'not_a_real_card' as CardId], // UNKNOWN_CARD
    ];
    for (const draft of cases) {
      const legality = loadoutLegality(draft);
      const codes = new Set(legality.violations.map((v) => v.code));
      const shouldHaveAttribution = codes.has('ICON_LIMIT') || codes.has('UNKNOWN_CARD');
      expect(legality.violatingCardIds.length > 0).toBe(shouldHaveAttribution);
    }
  });
});

/**
 * The in-lobby save's status lifecycle and the room-vs-draft divergence it
 * makes visible (Plan 02-04, Task 2). Driven by calling the store's own
 * setters directly, mirroring the send/reply split apps/web/lib/CLAUDE.md
 * rule 4 requires: the send is optimistic and advisory, only the room's own
 * reply (recordAccepted for an ack, setSaveStatus for a rejection) may ever
 * move the status to 'accepted' or leave it at 'rejected'.
 */
describe('useLoadoutStore save-status lifecycle (Plan 02-04)', () => {
  it('starts idle', () => {
    useLoadoutStore.setState({ saveStatus: { state: 'idle' }, lastAcceptedCards: null });
    expect(useLoadoutStore.getState().saveStatus.state).toBe('idle');
  });

  it('a send marks the status pending — never accepted — until the room replies', () => {
    useLoadoutStore.setState({ saveStatus: { state: 'idle' } });
    useLoadoutStore.getState().setSaveStatus({ state: 'pending' });
    expect(useLoadoutStore.getState().saveStatus).toEqual({ state: 'pending' });
  });

  it('only the room-reply action moves the status to accepted; pending alone never does', () => {
    useLoadoutStore.setState({ saveStatus: { state: 'pending' }, lastAcceptedCards: null });
    // The send already happened (status is 'pending'); nothing further
    // moves it to 'accepted' except the room's own reply landing.
    expect(useLoadoutStore.getState().saveStatus.state).toBe('pending');
    useLoadoutStore.getState().recordAccepted([...HUNTER] as CardId[]);
    expect(useLoadoutStore.getState().saveStatus).toEqual({ state: 'accepted' });
  });

  it('a rejection records the room-own message text verbatim', () => {
    useLoadoutStore.setState({ saveStatus: { state: 'pending' } });
    useLoadoutStore.getState().setSaveStatus({ state: 'rejected', message: 'Loadout must contain exactly 10 cards, got 4.' });
    expect(useLoadoutStore.getState().saveStatus).toEqual({
      state: 'rejected',
      message: 'Loadout must contain exactly 10 cards, got 4.',
    });
  });

  it('a second save after a rejection returns the status to pending — a retry in flight, not a stuck failure', () => {
    useLoadoutStore.setState({ saveStatus: { state: 'rejected', message: 'nope' } });
    useLoadoutStore.getState().setSaveStatus({ state: 'pending' });
    expect(useLoadoutStore.getState().saveStatus).toEqual({ state: 'pending' });
  });

  it('an accepted save records the room-echoed card ids as lastAcceptedCards', () => {
    useLoadoutStore.setState({ lastAcceptedCards: null });
    useLoadoutStore.getState().recordAccepted([...OLIGARCH] as CardId[]);
    expect(useLoadoutStore.getState().lastAcceptedCards).toEqual([...OLIGARCH]);
  });

  it('the draft and lastAcceptedCards are equal immediately after an accepted save', () => {
    useLoadoutStore.setState({ loadout: [...SPIDER] as CardId[] });
    useLoadoutStore.getState().recordAccepted([...SPIDER] as CardId[]);
    const { loadout, lastAcceptedCards } = useLoadoutStore.getState();
    expect(loadoutsDiverge(loadout, lastAcceptedCards)).toBe(false);
  });

  it('editing after an accepted save diverges the draft from lastAcceptedCards, without touching lastAcceptedCards itself', () => {
    useLoadoutStore.setState({ loadout: [...HUNTER] as CardId[] });
    useLoadoutStore.getState().recordAccepted([...HUNTER] as CardId[]);
    useLoadoutStore.getState().add('ag_gold' as CardId);

    const { loadout, lastAcceptedCards } = useLoadoutStore.getState();
    expect(loadoutsDiverge(loadout, lastAcceptedCards)).toBe(true);
    // Divergence is a state to report, not an error to reset — the record
    // of what the room actually holds must survive the edit unchanged.
    expect(lastAcceptedCards).toEqual([...HUNTER]);
  });

  it('loadoutsDiverge never reports divergence before anything has ever been accepted', () => {
    expect(loadoutsDiverge([...HUNTER] as CardId[], null)).toBe(false);
    expect(loadoutsDiverge([], null)).toBe(false);
  });

  it('loadoutsDiverge is sensitive to order, not just set membership', () => {
    const forward = [...HUNTER] as CardId[];
    const reversed = [...HUNTER].reverse() as CardId[];
    expect(loadoutsDiverge(forward, reversed)).toBe(true);
  });
});

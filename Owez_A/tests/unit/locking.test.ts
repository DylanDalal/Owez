import { describe, it, expect } from 'vitest';
import {
  assertClaimAllowed,
  groupClaimsByUnit,
  initialsFromName,
  totalForGuest,
  validateNewClaim,
  type Claim,
  type ReceiptItem,
  type UnitState,
} from '@owez/shared';

function mkClaim(partial: Partial<Claim>): Claim {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    itemIndex: partial.itemIndex ?? 0,
    unitIndex: partial.unitIndex ?? 0,
    guestName: partial.guestName ?? 'Guest',
    initials: partial.initials ?? 'G',
    portions: partial.portions ?? 1,
    splitInto: partial.splitInto ?? 1,
    sessionId: partial.sessionId ?? 'sess',
    ownerUid: partial.ownerUid ?? null,
    photoURL: partial.photoURL ?? null,
    createdAt: partial.createdAt ?? Date.now(),
  };
}

const ITEMS: ReceiptItem[] = [
  { name: 'Fries', price: 10, quantity: 1 },
  { name: 'Drink', price: 6, quantity: 2 },
  { name: 'App', price: 20, quantity: 1 },
];

describe('initialsFromName', () => {
  it('takes first letter of each word, uppercased', () => {
    expect(initialsFromName('jane doe')).toBe('JD');
    expect(initialsFromName('Madonna')).toBe('M');
    expect(initialsFromName('Jane Mary Doe Smith')).toBe('JMD');
    expect(initialsFromName('   ')).toBe('');
    expect(initialsFromName('')).toBe('');
  });
});

describe('groupClaimsByUnit', () => {
  it('creates one bucket per (itemIndex, unitIndex) pair', () => {
    const map = groupClaimsByUnit(ITEMS, []);
    // 1 + 2 + 1 = 4 units total
    expect(map.size).toBe(4);
    expect(map.get('0:0')?.splitInto).toBe(1);
    expect(map.get('1:0')?.splitInto).toBe(1);
    expect(map.get('1:1')?.splitInto).toBe(1);
  });

  it('aggregates splitInto via max and sums portionsClaimed', () => {
    const claims = [
      mkClaim({ itemIndex: 2, unitIndex: 0, portions: 1, splitInto: 4 }),
      mkClaim({ itemIndex: 2, unitIndex: 0, portions: 2, splitInto: 4 }),
    ];
    const map = groupClaimsByUnit(ITEMS, claims);
    const appUnit = map.get('2:0')!;
    expect(appUnit.splitInto).toBe(4);
    expect(appUnit.portionsClaimed).toBe(3);
    expect(appUnit.claims).toHaveLength(2);
  });
});

describe('validateNewClaim', () => {
  const emptyUnit: UnitState = {
    itemIndex: 0,
    unitIndex: 0,
    splitInto: 1,
    portionsClaimed: 0,
    claims: [],
  };

  it('rejects 0 portions', () => {
    expect(validateNewClaim(emptyUnit, { portions: 0, splitInto: 1 })).toMatch(/at least 1/i);
  });

  it('lets a fresh unit set its own split denominator', () => {
    expect(validateNewClaim(emptyUnit, { portions: 1, splitInto: 4 })).toBeNull();
  });

  it('locks in the denominator once a claim exists', () => {
    const seeded: UnitState = {
      ...emptyUnit,
      splitInto: 4,
      portionsClaimed: 1,
      claims: [mkClaim({ portions: 1, splitInto: 4 })],
    };
    expect(validateNewClaim(seeded, { portions: 1, splitInto: 2 })).toMatch(/already split/);
    expect(validateNewClaim(seeded, { portions: 2, splitInto: 4 })).toBeNull();
  });

  it('rejects over-subscription', () => {
    const almost: UnitState = {
      ...emptyUnit,
      splitInto: 4,
      portionsClaimed: 3,
      claims: [mkClaim({ portions: 3, splitInto: 4 })],
    };
    expect(validateNewClaim(almost, { portions: 2, splitInto: 4 })).toMatch(/Only 1/);
    expect(validateNewClaim(almost, { portions: 1, splitInto: 4 })).toBeNull();
  });
});

describe('assertClaimAllowed (transaction guard)', () => {
  it('passes when there is room', () => {
    expect(() =>
      assertClaimAllowed([], { portions: 1, splitInto: 1 }),
    ).not.toThrow();
  });
  it('throws when over-subscribed', () => {
    const existing = [mkClaim({ portions: 1, splitInto: 1 })];
    expect(() =>
      assertClaimAllowed(existing, { portions: 1, splitInto: 1 }),
    ).toThrow();
  });
});

describe('totalForGuest', () => {
  it('charges full price when a single guest claims the whole item', () => {
    const claims = [mkClaim({ guestName: 'Jane', itemIndex: 0, unitIndex: 0 })];
    expect(totalForGuest({ items: ITEMS }, claims, 'Jane')).toBe(10);
  });

  it('splits a single unit 4 ways', () => {
    const claims = [
      mkClaim({ guestName: 'Jane', itemIndex: 2, unitIndex: 0, portions: 1, splitInto: 4 }),
      mkClaim({ guestName: 'Kim', itemIndex: 2, unitIndex: 0, portions: 3, splitInto: 4 }),
    ];
    // Item price 20 / 4 = 5 per portion. Jane=5, Kim=15
    expect(totalForGuest({ items: ITEMS }, claims, 'Jane')).toBe(5);
    expect(totalForGuest({ items: ITEMS }, claims, 'Kim')).toBe(15);
  });

  it('distributes tax+tip proportionally to each guest share', () => {
    const claims = [
      mkClaim({ guestName: 'Jane', itemIndex: 0, unitIndex: 0, portions: 1, splitInto: 1 }),
      mkClaim({ guestName: 'Kim', itemIndex: 2, unitIndex: 0, portions: 1, splitInto: 1 }),
    ];
    // Jane: 10, Kim: 20. Tax+tip = 6. Proportional split -> Jane 2, Kim 4.
    expect(totalForGuest({ items: ITEMS, tax: 3, tip: 3 }, claims, 'Jane')).toBe(12);
    expect(totalForGuest({ items: ITEMS, tax: 3, tip: 3 }, claims, 'Kim')).toBe(24);
  });

  it('returns 0 for a guest who claimed nothing', () => {
    expect(totalForGuest({ items: ITEMS }, [], 'Ghost')).toBe(0);
  });
});

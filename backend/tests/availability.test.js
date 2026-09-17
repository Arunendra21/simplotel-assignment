const { checkAvailability, validateRequest, nightsBetween } = require('../src/services/availability');

// A safely-future window so "not in the past" checks never flake with the clock.
const IN = '2099-06-10';
const OUT = '2099-06-13';

describe('availability validation', () => {
  test('accepts a well-formed request', () => {
    expect(validateRequest({ checkIn: IN, checkOut: OUT, adults: 2 })).toEqual([]);
  });

  test('flags missing fields with readable messages', () => {
    const problems = validateRequest({ checkIn: '', checkOut: '', adults: 0 });
    expect(problems).toContain('a valid check-in date');
    expect(problems).toContain('a valid check-out date');
    expect(problems).toContain('the number of guests');
  });

  test('rejects a check-out that is not after check-in', () => {
    const problems = validateRequest({ checkIn: OUT, checkOut: IN, adults: 2 });
    expect(problems).toContain('a check-out date after the check-in date');
  });

  test('rejects a check-in date in the past', () => {
    const problems = validateRequest({ checkIn: '2000-01-01', checkOut: '2000-01-03', adults: 2 });
    expect(problems).toContain('a check-in date that is not in the past');
  });

  test('rejects unreasonably large groups', () => {
    const problems = validateRequest({ checkIn: IN, checkOut: OUT, adults: 12 });
    expect(problems.join(' ')).toMatch(/8 guests or fewer/);
  });
});

describe('checkAvailability tool', () => {
  test('is deterministic for the same inputs', () => {
    const a = checkAvailability(IN, OUT, 2);
    const b = checkAvailability(IN, OUT, 2);
    expect(a).toEqual(b);
  });

  test('never offers a room that is too small for the party', () => {
    const result = checkAvailability(IN, OUT, 4);
    for (const room of result.rooms) {
      expect(room.maxAdults).toBeGreaterThanOrEqual(4);
    }
  });

  test('computes the number of nights and the stay total correctly', () => {
    expect(nightsBetween(IN, OUT)).toBe(3);
    const result = checkAvailability(IN, OUT, 2);
    for (const room of result.rooms) {
      expect(room.totalForStay).toBe(room.nightlyRate * 3);
    }
  });

  test('returns cheapest available room first', () => {
    const result = checkAvailability(IN, OUT, 2);
    const rates = result.rooms.map((r) => r.nightlyRate);
    const sorted = [...rates].sort((a, b) => a - b);
    expect(rates).toEqual(sorted);
  });
});

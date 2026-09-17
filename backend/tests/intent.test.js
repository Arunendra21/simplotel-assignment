const { classify, resolveSlots, missingSlots } = require('../src/services/intent');
const { findDates, findAdults } = require('../src/utils/parse');

describe('intent classification', () => {
  test('treats a plain FAQ as a general question', () => {
    expect(classify('what time is check-in?')).toBe('general');
    expect(classify('is breakfast included?')).toBe('general');
  });

  test('detects availability from booking language', () => {
    expect(classify('do you have rooms available next week?')).toBe('availability');
    expect(classify('I want to book a room')).toBe('availability');
  });

  test('detects availability from "rooms" plus a date', () => {
    expect(classify('any rooms for 12 March?')).toBe('availability');
  });

  test('honours an explicit structured availability intent from the frontend', () => {
    expect(classify('', { intent: 'availability' })).toBe('availability');
  });
});

describe('slot resolution', () => {
  test('parses two dates and a guest count from free text', () => {
    const slots = resolveSlots('rooms from 2099-06-10 to 2099-06-13 for 3 guests');
    expect(slots.checkIn).toBe('2099-06-10');
    expect(slots.checkOut).toBe('2099-06-13');
    expect(slots.adults).toBe(3);
    expect(missingSlots(slots)).toEqual([]);
  });

  test('reports what is still missing', () => {
    const slots = resolveSlots('do you have any rooms free?');
    expect(missingSlots(slots)).toEqual(['check-in date', 'check-out date', 'number of guests']);
  });

  test('structured input from the picker overrides parsed text', () => {
    const slots = resolveSlots('for 2 guests', { checkIn: '2099-07-01', checkOut: '2099-07-04', adults: 5 });
    expect(slots.checkIn).toBe('2099-07-01');
    expect(slots.adults).toBe(5);
  });

  test('remembers slots from an earlier turn and fills the gap', () => {
    const remembered = { checkIn: '2099-08-01', checkOut: '2099-08-03' };
    const slots = resolveSlots('actually make it 2 guests', {}, remembered);
    expect(slots.checkIn).toBe('2099-08-01');
    expect(slots.adults).toBe(2);
  });

  test('fresh dates in the new message override remembered dates', () => {
    // Regression: a previous booking left slots in memory; the guest now asks
    // about a completely different stay. The new dates must win, not the old ones.
    const remembered = { checkIn: '2099-09-17', checkOut: '2099-09-19', adults: 3 };
    const slots = resolveSlots('what about 2099-12-20 to 2099-12-23 for 2 guests?', {}, remembered);
    expect(slots.checkIn).toBe('2099-12-20');
    expect(slots.checkOut).toBe('2099-12-23');
    expect(slots.adults).toBe(2);
  });
});

describe('natural-language parsing', () => {
  test('reads "12 March" and "March 12" forms', () => {
    expect(findDates('arriving 12 March')[0]).toMatch(/-03-12$/);
    expect(findDates('leaving March 15')[0]).toMatch(/-03-15$/);
  });

  test('reads spelled-out guest counts', () => {
    expect(findAdults('a room for three guests')).toBe(3);
    expect(findAdults('party of 4')).toBe(4);
  });

  test('returns null when no guest count is stated', () => {
    expect(findAdults('is there parking?')).toBeNull();
  });
});

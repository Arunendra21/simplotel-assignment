// The mock "tool" the assistant calls for availability, plus the validation that
// guards it. In a real deployment checkAvailability would hit a PMS or channel
// manager; here it returns deterministic, repeatable results so the demo and the
// tests behave the same way every run.

const hotel = require('../data/hotel.json');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A stable hash so the same (room, date) pair always gives the same answer.
// No Math.random() — I want the tests and the live demo to agree.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function nightsBetween(checkIn, checkOut) {
  const a = new Date(`${checkIn}T00:00:00`);
  const b = new Date(`${checkOut}T00:00:00`);
  return Math.round((b - a) / MS_PER_DAY);
}

// Validate the request BEFORE we pretend to look anything up. Returns a list of
// human-readable problems; an empty list means the request is good to run.
function validateRequest({ checkIn, checkOut, adults }, today = new Date()) {
  const problems = [];
  const isoShape = /^\d{4}-\d{2}-\d{2}$/;

  if (!checkIn || !isoShape.test(checkIn)) problems.push('a valid check-in date');
  if (!checkOut || !isoShape.test(checkOut)) problems.push('a valid check-out date');
  if (!adults || !Number.isInteger(adults) || adults < 1) problems.push('the number of guests');

  if (problems.length) return problems;

  const inDate = new Date(`${checkIn}T00:00:00`);
  const outDate = new Date(`${checkOut}T00:00:00`);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) {
    problems.push('valid calendar dates');
    return problems;
  }
  if (inDate < startOfToday) problems.push('a check-in date that is not in the past');
  if (outDate <= inDate) problems.push('a check-out date after the check-in date');
  if (adults > 8) problems.push('a group of 8 guests or fewer (larger groups need our events team)');

  return problems;
}

// The mock tool itself. Deterministic: whether a room is "sold out" for a stay
// depends only on the room id and the check-in date.
function checkAvailability(checkIn, checkOut, adults) {
  const nights = nightsBetween(checkIn, checkOut);

  const rooms = hotel.room_types
    .filter((room) => room.max_adults >= adults)
    .map((room) => {
      const seed = hashString(`${room.id}|${checkIn}`);
      const isAvailable = seed % 10 >= 3; // ~70% of room/date combinations are open
      const roomsLeft = isAvailable ? (seed % 4) + 1 : 0;
      return {
        roomId: room.id,
        name: room.name,
        description: room.description,
        maxAdults: room.max_adults,
        available: isAvailable,
        roomsLeft,
        nightlyRate: room.nightly_rate,
        totalForStay: isAvailable ? room.nightly_rate * nights : null,
        breakfastIncluded: room.breakfast_included,
        currency: hotel.property.currency,
      };
    });

  const availableRooms = rooms.filter((r) => r.available);

  return {
    checkIn,
    checkOut,
    adults,
    nights,
    anyAvailable: availableRooms.length > 0,
    // Cheapest first so the frontend can lead with the best-value option.
    rooms: availableRooms.sort((a, b) => a.nightlyRate - b.nightlyRate),
    // Rooms that fit the party size but are sold out, so we can be transparent.
    soldOut: rooms.filter((r) => !r.available).map((r) => r.name),
  };
}

module.exports = { checkAvailability, validateRequest, nightsBetween };

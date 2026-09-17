// Decide what the guest is trying to do, and — for availability — gather the
// slots (check-in, check-out, adults) from three sources in priority order:
//   1. structured fields the frontend sent (from the date/guest picker)
//   2. slots we remembered earlier in this conversation
//   3. whatever we can parse out of the free-text message
//
// Intent detection here is deterministic keyword matching. It is cheap, it is
// testable, and it fails safe: if we are unsure, we treat it as a general
// question and answer from the knowledge base rather than firing the booking tool.

const { findDates, findAdults } = require('../utils/parse');

// Strong signals: these phrases only really come up when someone wants a room.
const STRONG_HINTS = [
  'availab', 'vacan', 'free room', 'rooms free', 'any room', 'a room for',
  'stay from', 'check in on', 'check-in on', 'do you have room', 'got any room',
  'rooms for', 'room for the',
];

// Booking verbs are ambiguous ("book a flight", "reserve a table"), so they only
// count when paired with lodging context (a room/stay/night word or a date).
const BOOKING_VERBS = ['book', 'booking', 'reserve', 'reservation'];
const LODGING_WORDS = /\b(room|rooms|suite|stay|night|nights|loft)\b/;

function looksLikeAvailability(message) {
  const lower = message.toLowerCase();
  if (STRONG_HINTS.some((h) => lower.includes(h))) return true;

  const hasDate = findDates(message).length > 0;
  const hasLodging = LODGING_WORDS.test(lower);

  // A booking verb only implies availability alongside lodging or a date.
  if (BOOKING_VERBS.some((v) => lower.includes(v)) && (hasLodging || hasDate)) return true;

  // "rooms" + a date is a strong signal even without an explicit booking word.
  return hasLodging && hasDate;
}

// Are we already in the middle of collecting availability slots? If a previous
// turn parked some slots and this message adds more slot data (a date or a guest
// count), keep treating it as an availability continuation rather than a fresh
// general question.
function continuesAvailability(message, remembered = {}) {
  const hasRemembered = remembered.checkIn || remembered.checkOut || remembered.adults;
  if (!hasRemembered) return false;
  const addsSlot = findDates(message).length > 0 || findAdults(message) !== null;
  return Boolean(addsSlot);
}

// Merge slots. `current` wins over `remembered` wins over nothing.
// Structured input from the frontend is passed in as `current`.
function resolveSlots(message, structured = {}, remembered = {}) {
  const parsedDates = findDates(message);
  const parsedAdults = findAdults(message);

  // Priority for every slot: an explicit structured value from the picker wins,
  // then whatever the guest just said in THIS message, and only then a value we
  // remembered from an earlier turn. Getting this order right matters: if a guest
  // gives brand-new dates now, they mean the new dates — memory must not shadow them.
  const checkIn = structured.checkIn || parsedDates[0] || remembered.checkIn || null;
  let checkOut = structured.checkOut || parsedDates[1] || remembered.checkOut || null;

  // If the guest just stated a fresh check-in but no new check-out, an old
  // remembered check-out could now be before it — drop it and ask again rather
  // than mixing a new arrival with a stale departure.
  if (parsedDates.length === 1 && remembered.checkOut && remembered.checkOut <= parsedDates[0]) {
    checkOut = null;
  }
  // Guard: never let check-out equal or precede check-in if the parse got confused.
  if (checkIn && checkOut && checkOut <= checkIn && parsedDates.length >= 2) {
    checkOut = parsedDates[1] > parsedDates[0] ? parsedDates[1] : null;
  }

  const adults = structured.adults || parsedAdults || remembered.adults || null;

  return { checkIn, checkOut, adults };
}

// The list of slots still missing, phrased for a follow-up question.
function missingSlots(slots) {
  const missing = [];
  if (!slots.checkIn) missing.push('check-in date');
  if (!slots.checkOut) missing.push('check-out date');
  if (!slots.adults) missing.push('number of guests');
  return missing;
}

function classify(message, structured = {}, remembered = {}) {
  // If the frontend explicitly submitted the availability form, trust it.
  if (structured.intent === 'availability') return 'availability';
  if (looksLikeAvailability(message)) return 'availability';
  if (continuesAvailability(message, remembered)) return 'availability';
  return 'general';
}

module.exports = { classify, resolveSlots, missingSlots, looksLikeAvailability, continuesAvailability };

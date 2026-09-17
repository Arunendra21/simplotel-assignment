// Deterministic extraction of the three things an availability check needs:
// a check-in date, a check-out date and a number of adults.
//
// This is intentionally kept OUT of the LLM. Parsing dates and counting guests
// is business logic where a wrong-but-confident model answer would be worse than
// a plain regex that either works or clearly gives up. When we cannot pull a slot
// out with confidence, we leave it null and let the assistant ask for it.

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  a: 1, an: 1, couple: 2, single: 1,
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function toIso(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Given a month/day but no year, pick the year that keeps the date in the future
// (or today). Guests almost always mean an upcoming stay.
function resolveYear(month, day, today = new Date()) {
  const thisYear = today.getFullYear();
  const candidate = new Date(`${toIso(thisYear, month, day)}T00:00:00`);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return candidate < startOfToday ? thisYear + 1 : thisYear;
}

// Returns every date-like token found in the text, in order, as ISO strings.
function findDates(text, today = new Date()) {
  const found = [];
  const seen = new Set();

  const push = (iso, index) => {
    if (!iso || seen.has(iso)) return;
    // basic sanity: reject impossible calendar dates
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    seen.add(iso);
    found.push({ iso, index });
  };

  // 1) ISO 2025-03-12
  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    push(toIso(+m[1], +m[2], +m[3]), m.index);
  }

  // 2) Numeric 12/03/2025 or 12-03-2025 (day first, common outside the US)
  for (const m of text.matchAll(/\b(\d{1,2})[/](\d{1,2})[/](\d{2,4})\b/g)) {
    let [_, d, mo, y] = m;
    d = +d; mo = +mo; y = +y;
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) push(toIso(y, mo, d), m.index);
  }

  // 3) "12 March" / "12th March" / "March 12"
  const monthNames = Object.keys(MONTHS).join('|');
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\b`, 'gi');
  for (const m of text.matchAll(dayFirst)) {
    const day = +m[1];
    const month = MONTHS[m[2].toLowerCase()];
    if (day >= 1 && day <= 31) push(toIso(resolveYear(month, day, today), month, day), m.index);
  }
  const monthFirst = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi');
  for (const m of text.matchAll(monthFirst)) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = +m[2];
    if (day >= 1 && day <= 31) push(toIso(resolveYear(month, day, today), month, day), m.index);
  }

  return found.sort((a, b) => a.index - b.index).map((x) => x.iso);
}

// Pull a guest/adult count out of phrases like "3 guests", "for two adults",
// "party of 4", "three people". Falls back to null when nothing is stated.
function findAdults(text) {
  const lower = text.toLowerCase();

  // numeric first: "3 guests", "party of 4", "for 2 adults"
  const numeric = lower.match(/\b(\d{1,2})\s*(?:guests?|adults?|people|persons?|pax|of us)\b/);
  if (numeric) {
    const n = +numeric[1];
    if (n >= 1 && n <= 20) return n;
  }
  const partyOf = lower.match(/\b(?:party|group|table)\s+of\s+(\d{1,2})\b/);
  if (partyOf) {
    const n = +partyOf[1];
    if (n >= 1 && n <= 20) return n;
  }

  // spelled-out: "three guests", "for two"
  const wordList = Object.keys(WORD_NUMBERS).join('|');
  const worded = lower.match(new RegExp(`\\b(${wordList})\\s+(?:guests?|adults?|people|persons?)\\b`));
  if (worded) return WORD_NUMBERS[worded[1]];

  return null;
}

module.exports = { findDates, findAdults, toIso, resolveYear };

// Turns the hotel JSON into a flat list of "facts", then scores those facts
// against a guest question. This is the retrieval half of a small retrieval-
// augmented setup: whatever we answer with, we can point back to a fact here,
// which is what keeps the assistant from inventing amenities or policies.

const hotel = require('../data/hotel.json');
const { findAdults } = require('../utils/parse');

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'do', 'does', 'you', 'your', 'i', 'we', 'to',
  'of', 'for', 'in', 'on', 'at', 'and', 'or', 'have', 'has', 'can', 'my', 'me',
  'what', 'whats', 'how', 'when', 'where', 'which', 'this', 'that', 'it', 'with',
  'please', 'hi', 'hello', 'there', 'about', 'any', 'some',
]);

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
}

// Build the fact list once at module load. Each fact carries the text a human
// (or the LLM) would read, plus a searchable keyword blob and a category.
function buildFacts() {
  const facts = [];
  const p = hotel.property;

  facts.push({
    id: 'property-overview',
    category: 'property',
    text: `${p.name} is a hotel in ${p.location.city}. ${p.location.landmark}. Address: ${p.location.address}. Reception is open ${p.contact.reception_hours}.`,
    keywords: `hotel name location address where situated fort kochi harbour reception front desk phone ${p.contact.phone} ${p.name}`,
  });

  const policy = hotel.policies;
  facts.push({ id: 'policy-checkin', category: 'policy', text: `Check-in starts at ${policy.check_in_time} and check-out is by ${policy.check_out_time}. ${policy.early_check_in} ${policy.late_check_out}`, keywords: 'check in check-in check out checkout time early late arrival departure' });
  facts.push({ id: 'policy-cancellation', category: 'policy', text: `Cancellation policy: ${policy.cancellation} ${policy.no_show}`, keywords: 'cancel cancellation refund policy no show change booking free' });
  facts.push({ id: 'policy-children', category: 'policy', text: `${policy.children} ${policy.extra_bed}`, keywords: 'children kids child extra bed infant baby age cot' });
  facts.push({ id: 'policy-pets', category: 'policy', text: policy.pets, keywords: 'pet pets dog cat animal service animal' });
  facts.push({ id: 'policy-smoking', category: 'policy', text: policy.smoking, keywords: 'smoking smoke cigarette non-smoking courtyard' });
  facts.push({ id: 'policy-payment', category: 'policy', text: `We accept ${policy.payment_methods.join(', ')}. ${policy.id_requirement}`, keywords: 'payment pay card visa mastercard upi cash id passport identification' });

  for (const a of hotel.amenities) {
    facts.push({
      id: `amenity-${a.name.toLowerCase().replace(/\s+/g, '-')}`,
      category: 'amenity',
      text: `${a.name}: ${a.detail}`,
      keywords: `amenity facility ${a.name} ${a.tags.join(' ')}`,
    });
  }

  for (const room of hotel.room_types) {
    facts.push({
      id: `room-${room.id}`,
      category: 'room',
      capacity: room.max_adults, // used to answer "room for N guests" correctly
      text: `${room.name} — ${room.description} Sleeps up to ${room.max_adults} adults (${room.beds}). ${room.size_sqm} sqm. From ${hotel.property.currency} ${room.nightly_rate} per night. Breakfast ${room.breakfast_included ? 'included' : 'not included'}.`,
      keywords: `room rooms suite accommodation stay bed beds ${room.name} sleeps guests adults ${room.max_adults} price rate cost per night`,
    });
  }

  for (const faq of hotel.faqs) {
    facts.push({
      id: faq.id,
      category: 'faq',
      text: faq.answer,
      keywords: faq.questions.join(' '),
    });
  }

  return facts;
}

const FACTS = buildFacts();

// Score a fact against the question tokens. A token that appears in the fact's
// keywords is worth more than one that only appears in the readable text.
function scoreFact(fact, queryTokens) {
  const kw = fact.keywords.toLowerCase();
  const body = fact.text.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (kw.includes(token)) score += 2;
    else if (body.includes(token)) score += 1;
  }
  return score;
}

// Return the top-scoring facts for a question. The threshold scales with how
// specific the question is: a one- or two-word question ("pool?") can match on a
// single strong keyword, but a longer question must clear a higher bar so a stray
// generic word (e.g. "city" in "concert tickets in the city") doesn't drag in an
// unrelated fact — that case should fall back instead.
function retrieve(question, { limit = 3 } = {}) {
  const tokens = tokenize(question);
  if (tokens.length === 0) return [];

  const threshold = tokens.length <= 2 ? 2 : 3;
  const requestedAdults = findAdults(question);

  return FACTS
    .map((fact) => {
      let score = scoreFact(fact, tokens);
      // Capacity awareness for "a room for N guests" style questions: prefer a
      // room that actually fits the party, and never surface one that is too small.
      if (fact.category === 'room' && requestedAdults) {
        if (fact.capacity >= requestedAdults) score += 3;
        else score = 0;
      }
      return { fact, score };
    })
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({ id: r.fact.id, category: r.fact.category, text: r.fact.text, score: r.score }));
}

module.exports = { retrieve, tokenize, FACTS };

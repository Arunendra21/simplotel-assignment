// The orchestrator. Given a guest message (plus conversation history and any
// remembered availability slots), it decides the intent, runs the deterministic
// business logic, optionally asks the LLM to phrase the reply, and returns a
// clean structured object for the frontend.
//
// The shape it returns is stable and documented in the README so the frontend
// never has to guess.

const { classify, resolveSlots, missingSlots } = require('./intent');
const { checkAvailability, validateRequest } = require('./availability');
const { retrieve } = require('../knowledge/retriever');
const llm = require('../llm/provider');
const hotel = require('../data/hotel.json');
const logger = require('../utils/logger');

const FRONT_DESK = `You can also reach our front desk any time on ${hotel.property.contact.phone}.`;

function money(currency, amount) {
  return `${currency} ${amount.toLocaleString('en-IN')}`;
}

// Deterministic phrasing for a general answer, used when the LLM is disabled or
// unavailable. It simply reads back the most relevant fact(s) in plain language.
function composeFromFacts(facts) {
  if (facts.length === 1) return facts[0].text;
  // Lead with the strongest match; add a second only if it is clearly relevant.
  const [top, second] = facts;
  if (second && second.score >= top.score) return `${top.text}\n\n${second.text}`;
  return top.text;
}

// Turn a completed availability lookup into guest-facing prose. This stays
// deterministic on purpose: prices and counts must be exact.
function composeAvailabilityReply(result) {
  if (!result.anyAvailable) {
    const soldOut = result.soldOut.length
      ? ` The rooms that would fit your group (${result.soldOut.join(', ')}) are fully booked for those dates.`
      : '';
    return `I'm sorry — I don't have any rooms open for ${result.adults} guest${result.adults > 1 ? 's' : ''} from ${result.checkIn} to ${result.checkOut}.${soldOut} If your dates are flexible I'd be happy to check nearby nights.`;
  }

  const lines = result.rooms.map((r) => {
    const bf = r.breakfastIncluded ? ', breakfast included' : '';
    const left = r.roomsLeft <= 2 ? ` (only ${r.roomsLeft} left)` : '';
    return `• ${r.name} — ${money(r.currency, r.nightlyRate)}/night${bf}. ${money(r.currency, r.totalForStay)} for ${result.nights} night${result.nights > 1 ? 's' : ''}${left}.`;
  });

  return [
    `Good news — for ${result.adults} guest${result.adults > 1 ? 's' : ''} from ${result.checkIn} to ${result.checkOut} (${result.nights} night${result.nights > 1 ? 's' : ''}) I can offer:`,
    lines.join('\n'),
    'Would you like me to hold one of these for you?',
  ].join('\n\n');
}

async function handleAvailability(message, structured, remembered, history) {
  const slots = resolveSlots(message, structured, remembered);
  const missing = missingSlots(slots);

  // Slot filling: we still need something, so ask for it and remember what we have.
  if (missing.length > 0) {
    const nice = missing.length === 1
      ? `your ${missing[0]}`
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
    return {
      type: 'needs_info',
      reply: `I can check that for you. Could you tell me ${nice}?`,
      slots,
      missing,
      sources: [],
      availability: null,
    };
  }

  // We have all three slots — validate before "hitting" the tool.
  const problems = validateRequest(slots);
  if (problems.length > 0) {
    const nice = problems.length === 1
      ? problems[0]
      : `${problems.slice(0, -1).join(', ')} and ${problems[problems.length - 1]}`;
    return {
      type: 'validation_error',
      reply: `Before I can check, I need ${nice}. Could you adjust that?`,
      slots,
      sources: [],
      availability: null,
    };
  }

  const result = checkAvailability(slots.checkIn, slots.checkOut, slots.adults);
  logger.info('availability checked', { checkIn: slots.checkIn, checkOut: slots.checkOut, adults: slots.adults, anyAvailable: result.anyAvailable });

  return {
    type: 'availability',
    reply: composeAvailabilityReply(result),
    slots,
    sources: [{ id: 'tool:checkAvailability', category: 'tool' }],
    availability: result,
  };
}

async function handleGeneral(message, history) {
  const facts = retrieve(message);

  // Nothing relevant found — this is the anti-hallucination guardrail. We would
  // rather say "I'm not sure" than let a model guess.
  if (facts.length === 0) {
    return {
      type: 'fallback',
      reply: `I'm not certain about that one, so I don't want to guess. ${FRONT_DESK}`,
      sources: [],
      availability: null,
      grounded: false,
    };
  }

  // Try the LLM to phrase the grounded facts; fall back to a deterministic read-back.
  let reply = await llm.phrase(message, facts, history);
  let phrasedBy = 'llm';
  if (!reply) {
    reply = composeFromFacts(facts);
    phrasedBy = 'template';
  }

  return {
    type: 'answer',
    reply,
    sources: facts.map((f) => ({ id: f.id, category: f.category })),
    availability: null,
    grounded: true,
    phrasedBy,
  };
}

// Main entry point. `context.slots` carries availability slots remembered from
// earlier turns; we echo an updated `context` back so the caller can persist it.
async function respond({ message, history = [], structured = {}, context = {} }) {
  const trimmed = String(message || '').trim();
  const remembered = context.slots || {};

  const intent = classify(trimmed, structured, remembered);
  let outcome;

  if (intent === 'availability') {
    outcome = await handleAvailability(trimmed, structured, remembered, history);
  } else {
    outcome = await handleGeneral(trimmed, history);
  }

  // Persist any availability slots we now know for the next turn.
  const nextSlots = outcome.slots || remembered;

  return {
    reply: outcome.reply,
    type: outcome.type,
    intent,
    sources: outcome.sources,
    availability: outcome.availability ?? null,
    missing: outcome.missing ?? [],
    context: { slots: nextSlots },
    meta: {
      llmEnabled: llm.isEnabled(),
      phrasedBy: outcome.phrasedBy ?? null,
      grounded: outcome.grounded ?? null,
    },
  };
}

module.exports = { respond, composeAvailabilityReply, composeFromFacts };

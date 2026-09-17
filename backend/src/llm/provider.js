// Optional LLM layer.
//
// Design choice worth calling out: the LLM never decides *facts*. Retrieval and
// the availability tool produce grounded facts deterministically; the model's
// only job is to phrase those facts as a warm, natural reply. That is why the
// whole app still runs — and all tests pass — with no API key at all: when no
// provider is configured we skip straight to the deterministic composer.
//
// Two providers are supported through their plain HTTP APIs (no SDK dependency,
// so `npm install` stays light and offline-friendly). Anthropic is tried first.

const logger = require('../utils/logger');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 12000);

function provider() {
  if (ANTHROPIC_KEY) return 'anthropic';
  if (OPENAI_KEY) return 'openai';
  return null;
}

function isEnabled() {
  return provider() !== null;
}

const SYSTEM_PROMPT = [
  'You are the guest assistant for Seabreeze Harbour Hotel.',
  'Answer ONLY using the facts provided in the "Known facts" list.',
  'If the facts do not contain the answer, say you are not sure and offer to connect the guest with the front desk. Never invent prices, policies, amenities or dates.',
  'Keep replies short, friendly and specific. Do not mention the words "facts", "context" or "knowledge base" to the guest.',
].join(' ');

function buildUserPrompt(question, facts, history) {
  const factBlock = facts.length
    ? facts.map((f, i) => `${i + 1}. ${f.text}`).join('\n')
    : '(no matching facts were found)';

  const historyBlock = history.length
    ? history.slice(-4).map((m) => `${m.role === 'user' ? 'Guest' : 'Assistant'}: ${m.content}`).join('\n')
    : '(this is the first message)';

  return [
    `Recent conversation:\n${historyBlock}`,
    `\nKnown facts:\n${factBlock}`,
    `\nGuest question: ${question}`,
    '\nWrite the assistant\'s reply.',
  ].join('\n');
}

async function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(question, facts, history, signal) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(question, facts, history) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API responded ${res.status}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Anthropic API returned an empty message');
  return text.trim();
}

async function callOpenAI(question, facts, history, signal) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(question, facts, history) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API responded ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI API returned an empty message');
  return text.trim();
}

// Returns the phrased reply, or null if the LLM is disabled or fails. Returning
// null (rather than throwing) lets the assistant fall back silently to templates.
async function phrase(question, facts, history = []) {
  const which = provider();
  if (!which) return null;

  try {
    const text = await withTimeout(
      (signal) => (which === 'anthropic'
        ? callAnthropic(question, facts, history, signal)
        : callOpenAI(question, facts, history, signal)),
      TIMEOUT_MS,
    );
    return text;
  } catch (err) {
    // A model failure must never take the request down — log and fall back.
    logger.warn('LLM phrasing failed, using deterministic fallback', { provider: which, error: err.message });
    return null;
  }
}

module.exports = { isEnabled, phrase, provider };

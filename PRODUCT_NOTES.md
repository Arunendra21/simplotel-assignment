# Product, UX, engineering & AI notes

These are the "why" answers behind the build. I've kept them in the order the brief asked.

## What customer problem am I solving?

Before someone books a hotel — and again once they've booked — they have a short list of
small, high-friction questions: *what time can I check in, is breakfast included, can I
cancel, is there a pool, do you even have a room for my dates and my group?* Today those
answers are scattered across a website, an FAQ page, an email thread, or a phone call to a
desk that may be busy. Each unanswered question is a moment where the guest hesitates or
drops off.

The assistant collapses all of that into one place: ask in plain language, get a specific
answer instantly, and check real availability without leaving the conversation. For the
hotel it deflects repetitive front-desk queries and keeps the guest inside the booking
funnel.

## What does the guest journey look like?

1. Guest lands on the site and opens the assistant. A greeting plus four example chips make
   it obvious what they can ask (this kills the "blank chat box" hesitation).
2. They ask something like "is breakfast included?" and get a specific, grounded answer in
   under a second.
3. They follow up — "what about parking?" — in the same thread. Context carries.
4. They decide to check dates. They either type "rooms for next weekend for 2" or tap
   **Dates** and use the picker. If anything's missing the assistant asks for just that one
   thing.
5. They see room options as cards — name, rate, total for the stay, capacity, "2 left" —
   and are nudged toward the next step ("shall I hold one for you?").
6. If something breaks, they get a clear, human error and a phone number, not a spinner.

## Why did I design the frontend the way I did?

- **Chat first, form when it helps.** Free text is friendly but a lousy way to collect
  three exact fields (two dates + a count). So availability has a dedicated picker with a
  date input and a stepper, while everything else stays conversational. Guests can use
  whichever suits them; both routes hit the same backend logic.
- **Show data as data.** Availability results render as cards, not just a sentence, so a
  guest can scan rates and capacity. The deterministic backend gives exact numbers, so
  there's no reason to hide them in prose.
- **Never leave the user guessing about state.** There's an explicit typing indicator, the
  input disables while a request is in flight, and errors appear as their own bubble.
- **Low friction to start.** Suggestion chips seed the first message.
- **Responsive.** It's a single column that works from a phone up to desktop, because most
  guests will be on a phone.
- **No secrets in the browser.** The client only ever calls the backend over `/api`.

## Which parts use AI, and which stay deterministic?

| Concern | How it's done | Why |
|---|---|---|
| Parsing dates & guest counts | Deterministic (regex/rules) | A confidently wrong date is worse than "could you repeat that?" |
| Deciding availability vs general | Deterministic keyword rules | Cheap, testable, fails safe toward "just answer the question" |
| Availability, prices, capacity | Deterministic mock tool + validation | Money and inventory must be exact and reproducible |
| Finding relevant facts | Deterministic retrieval over the KB | Grounding — every answer traces to a fact |
| Phrasing the answer | **LLM** (optional), else a template | Natural tone is where a model genuinely adds value |

The rule of thumb: **the model phrases, it doesn't decide.** Anything a guest could act on
financially or logistically is computed in plain code.

## What can go wrong with the AI response?

- **Hallucination** — inventing a price, an amenity, or a policy that isn't real.
- **Over-confidence** — answering a question it actually has no data for.
- **Drift from source** — subtly restating a fact wrong (e.g. "1 PM" instead of "2 PM").
- **Latency or an outright API failure** mid-conversation.
- **Prompt injection** — a guest trying to talk the model out of its instructions.

## How do I prevent hallucinations / unsupported answers?

- **Ground everything.** The model only ever receives retrieved facts and is instructed to
  answer *only* from them and to admit uncertainty otherwise.
- **A real "I don't know" path.** If retrieval finds nothing above a confidence threshold,
  the app returns a fallback ("I'm not certain… here's the front desk number") and the model
  is never asked to fill the gap.
- **Keep numbers out of the model's hands.** Prices, dates, capacity and availability are
  computed deterministically and rendered as structured data, so even a chatty model can't
  misquote them.
- **Attach sources.** Every grounded answer comes back with the fact ids it used, which
  makes wrong answers debuggable and could power a "based on our policy page" citation.

## What happens when the model / API call / a dependency fails?

Failure is handled at every layer, and none of them takes the request down:

- **LLM fails or times out** → the backend silently falls back to the deterministic template
  for the same grounded facts. The guest still gets a correct answer; only the phrasing is
  plainer. (There's a per-call timeout so a hung provider can't stall the request.)
- **An unexpected error in the backend** → the central error handler returns a friendly
  fallback message with a phone number and a `500`, never a stack trace, and logs the cause.
- **Bad input** → `400` with a readable explanation of what to fix.
- **The frontend can't reach the backend, or it's slow** → the API client times out and the
  UI shows a clear in-chat error ("Could not reach the assistant. Is the backend running?")
  rather than an endless spinner.

## How would I measure whether this is actually useful?

- **Containment / deflection rate** — share of conversations resolved without a human or a
  phone call.
- **Availability → booking conversion** — do guests who check availability here book more?
- **Fallback rate** — how often we hit "I'm not sure". A rising number is a content gap to
  fill in the KB.
- **Follow-up depth** — multi-turn sessions suggest the assistant is genuinely conversational
  and trusted.
- **Thumbs up/down on answers** and **time-to-first-answer** as quality/latency guardrails.

The fallback rate is the one I'd watch most closely early on — it directly tells you which
questions your knowledge base can't yet answer.

## What would I improve before production?

- Move the knowledge base into a database with an admin UI so hotel staff edit it, not a JSON
  file redeploy.
- Wire `checkAvailability` to a real PMS / channel manager and add rate plans and taxes.
- Persist conversations server-side (with a session id) instead of trusting the client to
  replay context; add rate limiting and abuse protection.
- Add answer citations in the UI and a feedback control, and log every fallback for review.
- Harden the prompt against injection and add an eval harness that runs the scenarios in
  [EVALUATION.md](EVALUATION.md) against a live model on every deploy.
- Accessibility pass (focus management, ARIA live regions for new messages) and i18n, since
  guests here speak several languages.
- Stream responses token-by-token once the LLM is on, so long answers feel immediate.

# Architecture

A short tour of how a guest question becomes an answer, and why the pieces are split the
way they are.

## The shape of it

```
   Browser (React / Vite)
        │  POST /api/chat  { message, history, structured, context }
        ▼
   Express API  ──────────────────────────────────────────────┐
        │                                                      │
        ▼                                                      │
   Assistant orchestrator  (services/assistant.js)             │
        │                                                      │
        ├── classify intent  (services/intent.js)              │
        │                                                      │
        ├── AVAILABILITY ─► resolve slots ─► validate ─►        │
        │                   checkAvailability() mock tool       │
        │                   (services/availability.js)          │
        │                                                      │
        └── GENERAL ─► retrieve grounded facts                  │
                       (knowledge/retriever.js  ← data/hotel.json)
                            │                                  │
                            ▼                                  │
                       phrase the facts:                       │
                       LLM if a key is set, else a template     │
                       (llm/provider.js)                        │
                                                               │
   ◄───────────  structured JSON response  ◄────────────────────┘
```

## Frontend (`frontend/`)

React with Vite. It is deliberately a thin client:

- **`src/api.js`** is the only module that talks to the network. Every call goes to the
  backend over a relative `/api/...` path. The browser never holds an API key and never
  calls a model — Vite proxies `/api` to the backend in dev, so it's same-origin.
- **`src/App.jsx`** owns the conversation state: the message list, a loading flag, and the
  `context` object the backend hands back each turn (so multi-turn availability works).
- **Components** are small and single-purpose: `MessageBubble`, `TypingDots`,
  `AvailabilityForm` (the date/guest picker), `AvailabilityCards` (the structured result).
- Failures are rendered as a distinct in-chat error bubble rather than a silent dead end,
  and every network call has a timeout so the UI can't hang forever.

## Backend (`backend/`)

Node + Express, split so the app is testable without a live port (`app.js` builds the app,
`server.js` only listens). The request path:

1. **`routes/chat.js`** validates the body (message required, size limits, correct types)
   and returns a `400` with readable details on bad input.
2. **`services/assistant.js`** is the orchestrator. It classifies intent, runs the right
   branch, optionally calls the LLM to phrase a grounded answer, and returns one stable
   response shape.
3. **`services/intent.js`** decides *availability vs general* with deterministic keyword
   rules, and does slot filling for check-in / check-out / guests. It merges three sources
   in priority order: the frontend's structured picker input, then what the guest said in
   the current message, then slots remembered from earlier turns.
4. **`services/availability.js`** is the mock tool plus its validation. It is deterministic
   (a stable hash of room id + check-in date), so demos and tests always agree.
5. **`knowledge/retriever.js`** flattens `data/hotel.json` into scored "facts" and returns
   the best matches for a question. If nothing clears a minimum score, it returns nothing —
   which is what lets the assistant say "I'm not sure" instead of guessing.
6. **`llm/provider.js`** is the optional phrasing layer (Anthropic or OpenAI over plain
   HTTP, no SDK). It is grounded (answer only from the supplied facts) and fails soft —
   any error or timeout falls back to the deterministic template.

Cross-cutting: a tiny JSON **logger** (`utils/logger.js`), CORS, a JSON body limit, a
central **error handler** that turns any thrown error into a friendly fallback (never a
stack trace), and a `404` handler.

## AI / model layer

The model is treated as a **rephraser of trusted facts**, not a source of truth:

- Retrieval and the availability tool are the only things that produce facts.
- The system prompt tells the model to answer *only* from the supplied facts and to admit
  uncertainty otherwise.
- Business logic that must be exact — date parsing, validation, prices, capacity — lives in
  plain code, outside the model.

Because of this separation the app degrades gracefully to a fully deterministic assistant
when no key is present, and the "AI" is an enhancement rather than a dependency.

## Data flow for the two main cases

**A property question** — "Is breakfast included?"
`chat route → orchestrator → intent = general → retriever finds the breakfast FAQ + related
facts → LLM (or template) phrases them → JSON with `sources` back to the UI → bubble.`

**An availability request** — "Any rooms 20–23 Dec for 2?"
`chat route → orchestrator → intent = availability → slots resolved from the message →
validated → checkAvailability() → deterministic prose + structured `availability` payload →
UI renders sentence + room cards.` If a slot is missing, the response is `type: needs_info`
and the UI simply shows the follow-up question; the client replays `context` next turn.

## Why this split

- **Testable** — every layer is a plain module with a narrow job, so the important flows
  have unit and HTTP tests without mocking a model.
- **Cheap and fast** — most questions never touch an LLM at all.
- **Safe** — the guest can't get an invented price or policy, because the model only ever
  sees, and only ever repeats, facts we already hold.

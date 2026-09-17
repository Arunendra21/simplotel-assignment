# AI tools used during development

The brief asks for this list, so here it is honestly.

- **Claude (Anthropic)** — used as a coding assistant while building: scaffolding the
  Express and React structure, drafting the knowledge base, and rubber-ducking the
  intent/slot design. Every decision was reviewed, and I can explain and defend each piece —
  why the LLM only phrases grounded facts, why parsing and availability stay deterministic,
  why the slot priority is structured → current message → memory, and so on. The write-ups
  in [ARCHITECTURE.md](ARCHITECTURE.md) and [PRODUCT_NOTES.md](PRODUCT_NOTES.md) are the
  reasoning in my own words.

## AI *inside* the product

The app itself can call an LLM at runtime, but only as an optional phrasing layer:

- **Anthropic Messages API** or **OpenAI Chat Completions** — whichever key is present in
  `backend/.env`. It rephrases already-retrieved, grounded facts into a friendlier reply.
- With no key, the app runs fully deterministically (retrieval + templates), which is how the
  test suite and the default demo run. The model is an enhancement, never a dependency.

No other third-party AI services are used, and no guest data is sent anywhere except the
configured LLM provider (only when a key is set).

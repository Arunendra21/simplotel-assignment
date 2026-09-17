# Evaluation & test scenarios

Two layers of testing:

1. **Automated** — 37 tests (`cd backend && npm test`) across validation, the availability
   tool, NL parsing, intent, retrieval/grounding, context and the HTTP layer.
2. **Scenario walkthrough** — the table below maps each scenario the brief asked for to how
   it's exercised and what I actually observed running the app. Outputs are the real
   responses from the running backend (deterministic mode, no LLM key), lightly trimmed.

Dates like `2099-06-10` are used so the "not in the past" validation never flakes with the
clock.

## Scenario matrix

| # | Category | Input | Observed result | ✓ |
|---|---|---|---|---|
| 1 | Normal question | "What time is check-in?" | `answer`: *"Check-in starts at 2:00 PM and check-out is by 11:00 AM…"* with `sources: [policy-checkin]` | ✅ |
| 2 | Normal question | "Do you have a swimming pool?" | `answer`: *"Outdoor swimming pool: Open 6:00 AM to 8:00 PM, heated in winter."* | ✅ |
| 3 | Reasoning / capacity | "Which room is suitable for three guests?" | `answer`: leads with **Backwater Suite** (sleeps 3) — capacity-aware retrieval excludes the 2-person rooms | ✅ |
| 4 | Missing information | "Do you have any rooms available?" | `needs_info`: *"Could you tell me check-in date, check-out date and number of guests?"* — `missing` lists all three | ✅ |
| 5 | Ambiguous | "is it any good?" | `fallback`: *"I'm not certain about that one, so I don't want to guess…"* + front-desk number | ✅ |
| 6 | Availability / tool call | "rooms from 2099-06-10 to 2099-06-13 for 2 guests" | `availability`: 3-night stay, rooms + rates + totals in the structured `availability` payload | ✅ |
| 7 | Unsupported request | "can you get me concert tickets in the city?" | `fallback` — the stray word "city" no longer drags in an unrelated fact (longer questions need stronger evidence) | ✅ |
| 8 | Incorrect assumption | "I assume I can bring my dog, right?" | `answer` corrects it: *"We are not able to accommodate pets, with the exception of registered service animals."* | ✅ |
| 9 | Conversation follow-up | Turn 1 "do you have rooms from 2099-06-10 to 2099-06-13?" → Turn 2 "for 2 guests" (replaying `context`) | Turn 1 `needs_info` (missing: number of guests); Turn 2 completes with `adults: 2` — context carried | ✅ |
| 10 | Fresh dates override memory | After a booking for Sept, "what about 2099-12-20 to 2099-12-23 for 2 guests?" | New December dates win over the remembered September ones (regression-tested) | ✅ |
| 11 | Validation | `POST /api/availability` with check-out before check-in | `400`: *"Please provide a check-out date after the check-in date."* | ✅ |
| 12 | Bad input | `POST /api/chat` with an empty message | `400 invalid_request` with a readable `details` message | ✅ |
| 13 | Backend failure / fallback | Malformed JSON body | `500` with a friendly reply + phone number (no stack trace) — central error handler | ✅ |
| 14 | Frontend loading state | Any question | Typing-dots indicator shows and the input disables while the request is in flight | ✅ |
| 15 | Frontend error state | Send a message with the backend stopped | A red error bubble renders (*"Request failed (500)"* / *"Could not reach the assistant"*) and the header shows "Connecting…" — no infinite spinner | ✅ |
| 16 | End-to-end | Browser → `/api/chat` → availability tool → room cards render | Verified in the browser: ask a question, follow up, open the picker, get room cards with rates and a "2 left" badge | ✅ |

That's 16 scenarios covering every bucket in the brief (normal, missing info, ambiguous,
tool-calling, wrong assumptions, follow-ups, loading, error/fallback, and a full e2e flow).

## Automated test coverage (37 tests)

```
tests/availability.test.js  validation (missing/past/reversed dates, oversize groups),
                            tool determinism, capacity filtering, nights & totals, ordering
tests/intent.test.js        general vs availability, slot resolution & priority,
                            context carry, fresh-dates-override-memory, NL date/guest parsing
tests/retriever.test.js     pool / cancellation / capacity routing, off-topic → empty (fallback)
tests/api.test.js           FAQ answer, needs_info, availability, multi-turn context,
                            structured picker, fallback, 400s, /availability happy + error,
                            health, 404
```

Run them:

```bash
cd backend && npm test
# Test Suites: 4 passed, 4 total
# Tests:       37 passed, 37 total
```

## Reproducing the scenario outputs

With the backend running (`cd backend && npm start`), the exact calls behind the table:

```bash
curl -s -X POST localhost:4000/api/chat -H 'content-type: application/json' \
  -d '{"message":"Which room is suitable for three guests?"}'

curl -s -X POST localhost:4000/api/chat -H 'content-type: application/json' \
  -d '{"message":"is it any good?"}'

curl -s -X POST localhost:4000/api/availability -H 'content-type: application/json' \
  -d '{"checkIn":"2099-06-13","checkOut":"2099-06-10","adults":2}'
```

## Known weak spots (honest list)

- Intent is keyword-based, so a very unusual phrasing of an availability request could be
  read as a general question (it would then answer from the KB or fall back — never invent).
- Retrieval is lexical, not semantic; a synonym the KB doesn't list ("car park" is covered,
  but an unlisted term might miss) can lead to a fallback rather than an answer. With an LLM
  key set, phrasing improves but grounding is unchanged by design.
- The availability mock has no real inventory; it's deterministic pseudo-data.

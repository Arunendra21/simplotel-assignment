import React, { useEffect, useRef, useState } from 'react';
import { sendChat, checkHealth } from './api.js';
import MessageBubble from './components/MessageBubble.jsx';
import TypingDots from './components/TypingDots.jsx';
import AvailabilityForm from './components/AvailabilityForm.jsx';

const GREETING = {
  id: 'greeting',
  role: 'assistant',
  text: "Hi! I'm the Seabreeze Harbour assistant. Ask me about check-in times, our pool, breakfast, the cancellation policy — or check room availability for your dates.",
};

// A few starter prompts. They lower the "blank page" friction and quietly show
// guests the range of things the assistant can actually answer.
const SUGGESTIONS = [
  'What time is check-in?',
  'Is breakfast included?',
  'Do you have a swimming pool?',
  'What is the cancellation policy?',
];

let idCounter = 0;
const nextId = () => `m${idCounter++}`;

export default function App() {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [health, setHealth] = useState(null);

  const scrollRef = useRef(null);

  useEffect(() => {
    checkHealth().then(setHealth);
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // The conversation history we hand to the backend so it can keep context.
  function historyForApi(list) {
    return list
      .filter((m) => m.id !== 'greeting')
      .map((m) => ({ role: m.role, content: m.text }));
  }

  async function send({ text, structured }) {
    if (loading) return;
    const userMessage = { id: nextId(), role: 'user', text };
    const withUser = [...messages, userMessage];
    setMessages(withUser);
    setInput('');
    setLoading(true);

    try {
      const res = await sendChat({
        message: text,
        history: historyForApi(messages),
        structured: structured || {},
        context,
      });

      setContext(res.context || {});
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: res.reply,
          availability: res.availability || null,
          type: res.type,
        },
      ]);
    } catch (err) {
      // Graceful failure state — the assistant "speaks" the error in-character.
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: err.message || 'Something went wrong. Please try again.',
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    send({ text });
  }

  function handleAvailabilitySubmit({ checkIn, checkOut, adults }) {
    setShowForm(false);
    const text = `Check availability from ${checkIn} to ${checkOut} for ${adults} guest${adults > 1 ? 's' : ''}.`;
    send({
      text,
      structured: { intent: 'availability', checkIn, checkOut, adults },
    });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <div className="topbar__logo" aria-hidden>SH</div>
          <div>
            <h1>Seabreeze Harbour Hotel</h1>
            <p>Guest assistant · Fort Kochi</p>
          </div>
        </div>
        <div className="topbar__status">
          <span className={`status-dot ${health ? 'status-dot--ok' : 'status-dot--off'}`} />
          {health ? 'Online' : 'Connecting…'}
        </div>
      </header>

      <main className="chat" ref={scrollRef}>
        <div className="chat__inner">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {loading && <TypingDots />}

          {messages.length === 1 && (
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send({ text: s })}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="composer">
        {showForm ? (
          <AvailabilityForm
            onSubmit={handleAvailabilitySubmit}
            onClose={() => setShowForm(false)}
            disabled={loading}
          />
        ) : (
          <form className="composer__form" onSubmit={handleSubmit}>
            <button
              type="button"
              className="btn btn--dates"
              onClick={() => setShowForm(true)}
              title="Check room availability"
            >
              📅 Dates
            </button>
            <input
              className="composer__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the hotel, or check availability…"
              aria-label="Your question"
              disabled={loading}
            />
            <button type="submit" className="btn btn--primary" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        )}
      </footer>
    </div>
  );
}

import React from 'react';

// The "assistant is thinking" indicator. A visible processing state matters here:
// grounded retrieval is instant, but an LLM call can take a second or two, and
// silence reads as a broken app.
export default function TypingDots() {
  return (
    <div className="bubble-row bubble-row--assistant">
      <div className="bubble bubble--assistant bubble--typing" aria-label="Assistant is typing">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </div>
  );
}

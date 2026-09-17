import React from 'react';
import AvailabilityCards from './AvailabilityCards.jsx';

// One chat bubble. Assistant availability replies also render the structured
// cards underneath the sentence. Error replies get a distinct style so a failed
// call reads clearly as a problem, not as a normal answer.
export default function MessageBubble({ message }) {
  const { role, text, availability, isError } = message;
  const cls = [
    'bubble',
    role === 'user' ? 'bubble--user' : 'bubble--assistant',
    isError ? 'bubble--error' : '',
  ].join(' ').trim();

  return (
    <div className={`bubble-row bubble-row--${role}`}>
      <div className={cls}>
        {/* Preserve the newlines the backend uses to lay out room lists. */}
        {text.split('\n').map((line, i) => (
          <p key={i} className={line.trim() === '' ? 'bubble__spacer' : ''}>{line}</p>
        ))}
        {availability && <AvailabilityCards availability={availability} />}
      </div>
    </div>
  );
}

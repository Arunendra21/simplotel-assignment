import React, { useState } from 'react';

// A small structured picker for dates and guests. It exists because typing
// "12 March to 15 March for 3" is error-prone — a date input and a stepper are a
// far more reliable way to collect exactly the three slots the tool needs, and it
// lets guests who just want availability skip the conversational back-and-forth.

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function AvailabilityForm({ onSubmit, disabled, onClose }) {
  const [checkIn, setCheckIn] = useState(addDays(todayIso(), 1));
  const [checkOut, setCheckOut] = useState(addDays(todayIso(), 3));
  const [adults, setAdults] = useState(2);
  const [error, setError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (checkOut <= checkIn) {
      setError('Check-out needs to be after check-in.');
      return;
    }
    setError(null);
    onSubmit({ checkIn, checkOut, adults });
  }

  return (
    <form className="avail-form" onSubmit={handleSubmit}>
      <div className="avail-form__row">
        <label className="field">
          <span>Check-in</span>
          <input
            type="date"
            value={checkIn}
            min={todayIso()}
            onChange={(e) => setCheckIn(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Check-out</span>
          <input
            type="date"
            value={checkOut}
            min={addDays(checkIn, 1)}
            onChange={(e) => setCheckOut(e.target.value)}
            required
          />
        </label>
        <label className="field field--guests">
          <span>Guests</span>
          <div className="stepper">
            <button type="button" onClick={() => setAdults((n) => Math.max(1, n - 1))} aria-label="Fewer guests">−</button>
            <output>{adults}</output>
            <button type="button" onClick={() => setAdults((n) => Math.min(8, n + 1))} aria-label="More guests">+</button>
          </div>
        </label>
      </div>

      {error && <p className="avail-form__error">{error}</p>}

      <div className="avail-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--primary" disabled={disabled}>
          Check availability
        </button>
      </div>
    </form>
  );
}

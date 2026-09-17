import React from 'react';

// Renders the structured availability result as cards. Displaying this as data
// (not just the assistant's sentence) means a guest can scan rates and capacity
// at a glance — the deterministic backend gives us exact numbers, so we show them.

function formatMoney(currency, amount) {
  return `${currency} ${amount.toLocaleString('en-IN')}`;
}

export default function AvailabilityCards({ availability }) {
  if (!availability) return null;

  if (!availability.anyAvailable) {
    return (
      <div className="avail-result avail-result--empty">
        No rooms open for {availability.adults} guest{availability.adults > 1 ? 's' : ''} on those dates.
        {availability.soldOut?.length > 0 && (
          <span> ({availability.soldOut.join(', ')} fully booked.)</span>
        )}
      </div>
    );
  }

  return (
    <div className="avail-result">
      <div className="avail-result__summary">
        {availability.checkIn} → {availability.checkOut} · {availability.nights} night
        {availability.nights > 1 ? 's' : ''} · {availability.adults} guest
        {availability.adults > 1 ? 's' : ''}
      </div>
      <div className="room-cards">
        {availability.rooms.map((room) => (
          <div className="room-card" key={room.roomId}>
            <div className="room-card__head">
              <h4>{room.name}</h4>
              {room.roomsLeft <= 2 && <span className="badge badge--warn">{room.roomsLeft} left</span>}
            </div>
            <p className="room-card__desc">{room.description}</p>
            <div className="room-card__meta">
              <span>Sleeps {room.maxAdults}</span>
              {room.breakfastIncluded && <span>· Breakfast included</span>}
            </div>
            <div className="room-card__price">
              <strong>{formatMoney(room.currency, room.nightlyRate)}</strong>
              <span className="muted"> / night · {formatMoney(room.currency, room.totalForStay)} total</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

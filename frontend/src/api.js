// The one place the frontend talks to the backend. Everything goes through the
// backend API — the browser never sees an LLM key or calls a model directly.

const BASE = '/api';

// A small helper so every call has a timeout and consistent error shape. Without
// this, a hung backend would leave the UI spinning forever.
async function postJson(path, body, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Surface the backend's own message when it gave one; otherwise a generic line.
      const message = data.reply || data.message
        || (data.details ? data.details.join(', ') : null)
        || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.payload = data;
      throw err;
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('The assistant took too long to respond. Please try again.');
    }
    // Network-level failure (backend down, no connection).
    if (err instanceof TypeError) {
      throw new Error('Could not reach the assistant. Is the backend running?');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function sendChat({ message, history, structured, context }) {
  return postJson('/chat', { message, history, structured, context });
}

export function checkHealth() {
  return fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null);
}

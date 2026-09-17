const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp();
const IN = '2099-06-10';
const OUT = '2099-06-13';

describe('POST /api/chat', () => {
  test('answers a normal FAQ from the knowledge base', async () => {
    const res = await request(app).post('/api/chat').send({ message: 'what time is check-in?' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('answer');
    expect(res.body.reply).toMatch(/2:00 PM/);
    expect(res.body.sources.length).toBeGreaterThan(0); // answer is grounded
  });

  test('asks a follow-up when availability info is missing', async () => {
    const res = await request(app).post('/api/chat').send({ message: 'do you have any rooms free?' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('needs_info');
    expect(res.body.missing).toContain('check-in date');
  });

  test('completes an availability check when all slots are present', async () => {
    const res = await request(app).post('/api/chat').send({
      message: `rooms from ${IN} to ${OUT} for 2 guests`,
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('availability');
    expect(res.body.availability).toBeTruthy();
    expect(res.body.availability.nights).toBe(3);
  });

  test('carries context across turns to finish a booking request', async () => {
    // Turn 1: dates only, no guest count.
    const first = await request(app).post('/api/chat').send({
      message: `any rooms from ${IN} to ${OUT}?`,
    });
    expect(first.body.type).toBe('needs_info');

    // Turn 2: supply the guest count, replaying the remembered context.
    const second = await request(app).post('/api/chat').send({
      message: 'for 2 guests',
      context: first.body.context,
    });
    expect(second.body.type).toBe('availability');
    expect(second.body.availability.adults).toBe(2);
  });

  test('honours the structured picker payload from the frontend', async () => {
    const res = await request(app).post('/api/chat').send({
      message: 'check availability',
      structured: { intent: 'availability', checkIn: IN, checkOut: OUT, adults: 2 },
    });
    expect(res.body.type).toBe('availability');
  });

  test('falls back gracefully on an unsupported / out-of-scope question', async () => {
    const res = await request(app).post('/api/chat').send({ message: 'can you translate this contract into German?' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('fallback');
    expect(res.body.reply.toLowerCase()).toMatch(/not certain|front desk/);
  });

  test('rejects an empty message with a 400 and details', async () => {
    const res = await request(app).post('/api/chat').send({ message: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  test('rejects a non-string message', async () => {
    const res = await request(app).post('/api/chat').send({ message: 42 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/availability', () => {
  test('returns structured availability for a valid request', async () => {
    const res = await request(app).post('/api/availability').send({ checkIn: IN, checkOut: OUT, adults: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rooms');
    expect(res.body).toHaveProperty('anyAvailable');
  });

  test('returns 400 with guidance for an invalid date range', async () => {
    const res = await request(app).post('/api/availability').send({ checkIn: OUT, checkOut: IN, adults: 2 });
    expect(res.status).toBe(400);
    expect(res.body.details.join(' ')).toMatch(/after the check-in/);
  });
});

describe('service basics', () => {
  test('health check reports status and LLM mode', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('llmEnabled');
  });

  test('unknown routes return a clean 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

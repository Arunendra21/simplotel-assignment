const { retrieve } = require('../src/knowledge/retriever');

describe('knowledge retrieval (grounding)', () => {
  test('finds the pool amenity', () => {
    const facts = retrieve('do you have a swimming pool?');
    expect(facts[0].text.toLowerCase()).toContain('pool');
  });

  test('finds the cancellation policy', () => {
    const facts = retrieve('what is your cancellation policy?');
    expect(facts.some((f) => f.id === 'policy-cancellation')).toBe(true);
  });

  test('routes a capacity question to a room that fits', () => {
    const facts = retrieve('which room is suitable for three guests?');
    const text = facts.map((f) => f.text).join(' ').toLowerCase();
    expect(text).toMatch(/suite|loft|3 adults|4 adults/);
  });

  test('returns nothing for an off-topic question so we can fall back', () => {
    const facts = retrieve('what is the capital of France?');
    expect(facts).toEqual([]);
  });
});

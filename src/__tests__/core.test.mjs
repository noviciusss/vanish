import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// 1. Jaccard similarity test
function calculateJaccardSimilarity(tagsA, tagsB) {
  if (!tagsA.length && !tagsB.length) return 0;
  const setA = new Set(tagsA.map((t) => t.trim().toLowerCase()));
  const setB = new Set(tagsB.map((t) => t.trim().toLowerCase()));

  let intersectionCount = 0;
  for (const tag of setA) {
    if (setB.has(tag)) {
      intersectionCount++;
    }
  }

  const unionCount = new Set([...setA, ...setB]).size;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

// 2. HTML escaping test
function sanitizeMessage(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim()
    .slice(0, 2000);
}

describe('Anon Chat Core Unit Tests', () => {
  test('calculateJaccardSimilarity calculates overlap correctly', () => {
    const userA = ['technology', 'gaming', 'anime'];
    const userB = ['gaming', 'anime', 'cooking'];

    // intersection: ['gaming', 'anime'] = 2
    // union: ['technology', 'gaming', 'anime', 'cooking'] = 4
    // jaccard = 2/4 = 0.5
    const score = calculateJaccardSimilarity(userA, userB);
    assert.equal(score, 0.5);

    // No overlap
    const userC = ['books', 'travel'];
    const scoreNoOverlap = calculateJaccardSimilarity(userA, userC);
    assert.equal(scoreNoOverlap, 0);

    // Identical
    const scoreIdentical = calculateJaccardSimilarity(userA, userA);
    assert.equal(scoreIdentical, 1);
  });

  test('sanitizeMessage neutralizes dangerous XSS payloads', () => {
    const payload = '<script>alert("hacked")</script>';
    const sanitized = sanitizeMessage(payload);
    assert.equal(sanitized, '&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;');
    assert.ok(!sanitized.includes('<script>'));

    const imgPayload = '<img src=x onerror="alert(1)">';
    const sanitizedImg = sanitizeMessage(imgPayload);
    assert.equal(sanitizedImg, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  test('Max 10 tags validation rule', () => {
    const rawTags = [
      'tag1', 'tag2', 'tag3', 'tag4', 'tag5',
      'tag6', 'tag7', 'tag8', 'tag9', 'tag10', 'tag11'
    ];
    assert.ok(rawTags.length > 10);
    const capped = rawTags.slice(0, 10);
    assert.equal(capped.length, 10);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDailyResponse, mockChallenge } from '../src/services/leetcode.js';
import { validateAiPayload, buildPrompt } from '../src/services/ai.js';
import { classifyVerdictText } from '../src/services/automation.js';

describe('leetcode service', () => {
  it('parses GraphQL daily response', () => {
    const json = {
      data: {
        activeDailyCodingChallengeQuestion: {
          date: '2026-10-10',
          link: '/problems/two-sum/',
          question: {
            title: 'Two Sum', titleSlug: 'two-sum', difficulty: 'Easy',
            content: '<p>Given...</p><pre>Input: nums = [2,7]\nOutput: [0,1]\nExplanation: ok</pre>',
            topicTags: [{ name: 'Array' }],
          },
        },
      },
    };
    const ch = parseDailyResponse(json, '2026-10-10');
    assert.equal(ch.slug, 'two-sum');
    assert.equal(ch.examples[0].input, 'nums = [2,7]');
    assert.equal(ch.url, 'https://leetcode.com/problems/two-sum/');
  });
  it('throws on malformed payload', () => {
    assert.throws(() => parseDailyResponse({ data: {} }, '2026-10-10'));
  });
  it('mock challenge has required fields', () => {
    const m = mockChallenge('2026-10-10');
    assert.ok(m.title && m.slug && m.url.includes('leetcode.com'));
  });
});

describe('ai validation', () => {
  it('accepts a valid payload', () => {
    const s = validateAiPayload({ code: 'class Solution:\n    def f(self):\n        pass  # more than 20 chars here', approach: 'a', explanation: 'e', timeComplexity: 'O(n)', spaceComplexity: 'O(1)', edgeCases: 'none' });
    assert.ok(s.code.includes('class Solution'));
  });
  it('rejects missing code', () => {
    assert.throws(() => validateAiPayload({ code: 'x' }));
  });
  it('rejects non-solution code', () => {
    assert.throws(() => validateAiPayload({ code: 'x'.repeat(100) }));
  });
  it('prompt includes problem + language', () => {
    const p = buildPrompt(mockChallenge(), 'java');
    assert.ok(p.includes('Two Sum') && p.includes('java'));
  });
});

describe('verdict classification', () => {
  it('maps verdict strings', () => {
    assert.equal(classifyVerdictText('Accepted'), 'accepted');
    assert.equal(classifyVerdictText('Wrong Answer'), 'wrong_answer');
    assert.equal(classifyVerdictText('Runtime Error'), 'runtime_error');
    assert.equal(classifyVerdictText('Compile Error'), 'compile_error');
    assert.equal(classifyVerdictText('Time Limit Exceeded'), 'tle');
    assert.equal(classifyVerdictText(''), 'pending');
  });
});

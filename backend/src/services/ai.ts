/** Configurable LLM provider. All calls server-side. Supports:
 * openai | anthropic | gemini | groq | ollama | mock
 */
import { config } from '../config.js';
import type { DailyChallenge } from './leetcode.js';

export interface GeneratedSolution {
  code: string;
  approach: string;
  explanation: string;
  timeComplexity: string;
  spaceComplexity: string;
  edgeCases: string;
}

const SYSTEM = `You are a LeetCode expert. Respond with STRICT JSON only, no markdown fences:
{"code": "<complete LeetCode-compatible solution with required class/method signature>",
 "approach": "<algorithm name + 2-4 sentence plan>",
 "explanation": "<step-by-step walkthrough>",
 "timeComplexity": "O(...)",
 "spaceComplexity": "O(...)",
 "edgeCases": "<bullet-ish notes>"}`;

export function buildPrompt(ch: DailyChallenge, language: string): string {
  const ex = ch.examples.map((e, i) => `Example ${i + 1}: Input: ${e.input} Output: ${e.output}`).join('\n');
  return `${SYSTEM}\n\nProblem: ${ch.title} (${ch.difficulty})\n${ch.description}\n${ex}\nLanguage: ${language}. Return JSON only.`;
}

/** Validate AI JSON payload. Exported for tests. Throws on invalid. */
export function validateAiPayload(obj: any): GeneratedSolution {
  if (!obj || typeof obj !== 'object') throw new Error('AI response is not a JSON object');
  const { code, approach, explanation, timeComplexity, spaceComplexity, edgeCases } = obj;
  if (typeof code !== 'string' || code.trim().length < 20) throw new Error('AI response missing valid "code"');
  if (!/class\s+\w+|def\s+\w+|function\s+\w+|public\s+\w+|int\s+\w+\s*\(/.test(code))
    throw new Error('AI code does not look like a LeetCode solution (no class/function found)');
  return {
    code: code.trim(),
    approach: String(approach ?? ''),
    explanation: String(explanation ?? ''),
    timeComplexity: String(timeComplexity ?? ''),
    spaceComplexity: String(spaceComplexity ?? ''),
    edgeCases: String(edgeCases ?? ''),
  };
}

function mockSolution(ch: DailyChallenge, language: string): GeneratedSolution {
  const snippets: Record<string, string> = {
    python: `class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        seen: dict[int, int] = {}\n        for i, x in enumerate(nums):\n            need = target - x\n            if need in seen:\n                return [seen[need], i]\n            seen[x] = i\n        return []`,
    java: `class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        Map<Integer, Integer> seen = new HashMap<>();\n        for (int i = 0; i < nums.length; i++) {\n            int need = target - nums[i];\n            if (seen.containsKey(need)) return new int[]{seen.get(need), i};\n            seen.put(nums[i], i);\n        }\n        return new int[]{};\n    }\n}`,
    cpp: `class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        unordered_map<int,int> seen;\n        for (int i = 0; i < (int)nums.size(); i++) {\n            int need = target - nums[i];\n            if (seen.count(need)) return {seen[need], i};\n            seen[nums[i]] = i;\n        }\n        return {};\n    }\n};`,
    javascript: `class Solution {\n    /** @param {number[]} nums @param {number} target @return {number[]} */\n    twoSum(nums, target) {\n        const seen = new Map();\n        for (let i = 0; i < nums.length; i++) {\n            const need = target - nums[i];\n            if (seen.has(need)) return [seen.get(need), i];\n            seen.set(nums[i], i);\n        }\n        return [];\n    }\n}`,
  };
  return {
    code: snippets[language] ?? snippets.python,
    approach: `Hash-map single pass for ${ch.title}. Store value→index; for each x check target−x.`,
    explanation: 'Iterate once. Complement lookup is O(1) average. First valid pair returned; exactly one solution guaranteed.',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(n)',
    edgeCases: 'Empty/single-element input; negative numbers; duplicate values; large inputs (fits int).',
  };
}

async function callOpenAICompatible(base: string, key: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as any;
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error('LLM returned empty content');
  return text;
}

function extractJson(text: string): any {
  const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI response contained no JSON object');
    return JSON.parse(m[0]);
  }
}

export async function generateSolution(
  ch: DailyChallenge,
  language: string,
  provider = config.aiProvider,
  model = config.aiModel,
): Promise<{ solution: GeneratedSolution; provider: string; model: string }> {
  const p = provider.toLowerCase();
  if (p === 'mock' || config.mockMode) {
    return { solution: mockSolution(ch, language), provider: 'mock', model: 'mock-1' };
  }
  const prompt = buildPrompt(ch, language);
  let raw = '';
  let usedModel = model;
  if (p === 'openai') {
    if (!config.openaiKey) throw new Error('OPENAI_API_KEY is not set');
    usedModel = model || 'gpt-4o-mini';
    raw = await callOpenAICompatible(config.openaiBase, config.openaiKey, usedModel, prompt);
  } else if (p === 'groq') {
    if (!config.groqKey) throw new Error('GROQ_API_KEY is not set');
    usedModel = model || 'llama-3.3-70b-versatile';
    raw = await callOpenAICompatible('https://api.groq.com/openai/v1', config.groqKey, usedModel, prompt);
  } else if (p === 'ollama') {
    usedModel = model || 'llama3.1:8b';
    raw = await callOpenAICompatible(`${config.ollamaBase}/v1`, 'ollama', usedModel, prompt);
  } else if (p === 'anthropic') {
    if (!config.anthropicKey) throw new Error('ANTHROPIC_API_KEY is not set');
    usedModel = model || 'claude-3-5-sonnet-latest';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: usedModel, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    const j = (await res.json()) as any;
    raw = j.content?.map((b: any) => b.text ?? '').join('') ?? '';
    if (!raw) throw new Error('Anthropic returned empty content');
  } else if (p === 'gemini') {
    if (!config.geminiKey) throw new Error('GEMINI_API_KEY is not set');
    usedModel = model || 'gemini-1.5-flash';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${config.geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const j = (await res.json()) as any;
    raw = j.candidates?.[0]?.content?.parts?.map((x: any) => x.text ?? '').join('') ?? '';
    if (!raw) throw new Error('Gemini returned empty content');
  } else {
    throw new Error(`Unsupported AI_PROVIDER "${provider}". Use: openai | anthropic | gemini | groq | ollama | mock`);
  }
  const solution = validateAiPayload(extractJson(raw));
  return { solution, provider: p, model: usedModel };
}

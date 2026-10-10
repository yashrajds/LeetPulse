/** LeetCode integration, isolated behind a service layer.
 * Uses the public GraphQL endpoint (dailyCodingChallenge). No auth required.
 * Falls back to mock data when MOCK_MODE=true or network fails (caller decides).
 */

export interface DailyChallenge {
  date: string; // YYYY-MM-DD (Asia/Kolkata)
  slug: string;
  title: string;
  difficulty: string;
  description: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  constraints: string[];
  topics: string[];
  url: string;
}

export function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function mockChallenge(date?: string): DailyChallenge {
  const d = date ?? '2026-10-10';
  return {
    date: d,
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    description:
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.',
    examples: [
      { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'nums[0] + nums[1] == 9' },
      { input: 'nums = [3,2,4], target = 6', output: '[1,2]' },
    ],
    constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9', 'Only one valid answer exists.'],
    topics: ['Array', 'Hash Table'],
    url: 'https://leetcode.com/problems/two-sum/',
  };
}

const GQL = 'https://leetcode.com/graphql';

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Parse the raw GraphQL payload into a DailyChallenge. Exported for tests. */
export function parseDailyResponse(json: any, date: string): DailyChallenge {
  const node = json?.data?.activeDailyCodingChallengeQuestion;
  if (!node?.question) throw new Error('Unexpected LeetCode response shape');
  const q = node.question;
  const html: string = q.content ?? '';
  const text = html
    .replace(/<pre>([\s\S]*?)<\/pre>/gi, '\n$1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  const rawExamples: string[] = Array.from(html.matchAll(/<pre>([\s\S]*?)<\/pre>/gi)).map((m) =>
    (m[1] ?? '').replace(/<[^>]+>/g, '').trim(),
  );
  const examples = rawExamples.slice(0, 4).map((block) => {
    const input = (block.match(/Input:\s*([\s\S]*?)(Output:|$)/i)?.[1] ?? '').trim();
    const output = (block.match(/Output:\s*([\s\S]*?)(Explanation:|$)/i)?.[1] ?? '').trim();
    const explanation = (block.match(/Explanation:\s*([\s\S]*)$/i)?.[1] ?? '').trim();
    return { input, output, explanation };
  });
  const slug: string = q.titleSlug ?? node.link?.replace(/^\/problems\/|\/$/g, '') ?? '';
  return {
    date,
    slug,
    title: q.title ?? 'Unknown',
    difficulty: q.difficulty ?? 'Medium',
    description: text || 'Description unavailable.',
    examples,
    constraints: [],
    topics: (q.topicTags ?? []).map((t: any) => t.name ?? t.slug).filter(Boolean),
    url: slug ? `https://leetcode.com/problems/${slug}/` : 'https://leetcode.com/problemset/',
  };
}

export async function fetchDailyChallenge(date: string, retries = 3): Promise<DailyChallenge> {
  const query = `query { activeDailyCodingChallengeQuestion { date link question { title titleSlug difficulty content topicTags { name slug } } } }`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(
        GQL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com/problemset/', 'User-Agent': 'LeetPulse/1.0' },
          body: JSON.stringify({ query }),
        },
        15000,
      );
      if (!res.ok) throw new Error(`LeetCode HTTP ${res.status}`);
      const json = (await res.json()) as any;
      if (json.errors?.length) throw new Error(`LeetCode GraphQL: ${json.errors[0]?.message ?? 'unknown'}`);
      const parsed = parseDailyResponse(json, date);
      return parsed;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`Failed to fetch daily challenge after ${retries} attempts: ${(lastErr as Error)?.message ?? lastErr}`);
}

import { getStore } from '../db/index.js';
import { fetchDailyChallenge, mockChallenge, todayInTimezone } from './leetcode.js';
import { generateSolution } from './ai.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface RunOptions {
  trigger?: string;
  language?: string;
  autoSubmit?: boolean;
  date?: string;
}

/** Core daily pipeline: fetch challenge → AI solution → record execution.
 * Browser submit is a separate explicit step (never implicit).
 * Duplicate-safe: same date returns existing records without regenerating.
 */
export async function runDailyPipeline(opts: RunOptions = {}) {
  const store = getStore();
  if (!(await store.tryAcquireLock())) {
    throw Object.assign(new Error('Another automation job is already running'), { status: 409, code: 'job_in_progress' });
  }
  const started = Date.now();
  const exec = await store.insertExecution(opts.trigger ?? 'manual');
  try {
    const settings = await store.getSettings();
    const tz: string = settings.timezone ?? 'Asia/Kolkata';
    const date: string = opts.date ?? todayInTimezone(tz);
    const language: string = opts.language ?? settings.defaultLanguage ?? 'python';
    const provider: string = settings.aiProvider ?? 'mock';

    // 1. Challenge (dedupe by date)
    let challenge = await store.getChallengeByDate(date);
    if (!challenge) {
      let fetched;
      if (config.mockMode) {
        fetched = mockChallenge(date);
      } else {
        try {
          fetched = await fetchDailyChallenge(date);
        } catch (e) {
          logger.warn({ err: (e as Error).message }, 'LeetCode fetch failed, no cache — failing run');
          throw e;
        }
      }
      challenge = await store.insertChallenge(fetched);
    }

    // 2. Solution (dedupe by challenge+language unless regenerating via API route)
    let solution = await store.getSolution(challenge.id, language);
    if (!solution) {
      const { solution: gen, provider: used, model } = await generateSolution(
        {
          date: challenge.date, slug: challenge.slug, title: challenge.title,
          difficulty: challenge.difficulty, description: challenge.description,
          examples: challenge.examples, constraints: challenge.constraints,
          topics: challenge.topics, url: challenge.url,
        },
        language,
        provider,
      );
      solution = await store.insertSolution({
        challengeId: challenge.id, language, code: gen.code, explanation: gen.explanation,
        approach: gen.approach, timeComplexity: gen.timeComplexity,
        spaceComplexity: gen.spaceComplexity, edgeCases: gen.edgeCases,
        aiProvider: used, aiModel: model,
      });
    }

    // 3. Execution record
    const duration = Date.now() - started;
    await store.updateExecution(exec.id, {
      status: 'success', finishedAt: new Date().toISOString(), durationMs: duration,
      challengeDate: date, detail: { challengeId: challenge.id, solutionId: solution.id },
    });
    await store.touchLastRun();
    return { executionId: exec.id, challenge, solution, durationMs: duration };
  } catch (e) {
    const duration = Date.now() - started;
    await store.updateExecution(exec.id, {
      status: 'failed', finishedAt: new Date().toISOString(),
      durationMs: duration, error: (e as Error).message?.slice(0, 2000),
    }).catch(() => {});
    throw e;
  } finally {
    await store.releaseLock().catch(() => {});
  }
}

export function computeNextRun(cronExpr: string, tz: string): string | null {
  // Lightweight next-run estimate without extra deps: parse "m h * * *".
  try {
    const [m, h] = cronExpr.trim().split(/\s+/);
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    void fmt;
    const next = new Date(now);
    const mm = Number(m), hh = Number(h);
    if (Number.isInteger(mm) && Number.isInteger(hh)) {
      next.setSeconds(0, 0);
      // Approximate in server TZ; exact wall-time handled by node-cron at runtime.
      next.setHours(hh, mm, 0, 0);
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

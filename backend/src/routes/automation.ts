import { Router } from 'express';
import cron from 'node-cron';
import { getStore, toApiSettingsRow, toApiExecutionRow } from '../db/index.js';
import { err, validate, settingsSchema, runSchema, requireToken } from '../middleware/validate.js';
import { runDailyPipeline, computeNextRun } from '../services/scheduler.js';
import { logger } from '../logger.js';

const r = Router();
let scheduledTask: cron.ScheduledTask | null = null;

export async function startScheduler() {
  const { config } = await import('../config.js');
  if (config.disableScheduler) {
    logger.info('Scheduler disabled via DISABLE_SCHEDULER');
    return;
  }
  const store = getStore();
  const settings = await store.getSettings();
  if (!settings.scheduleEnabled) {
    logger.info('Scheduler paused (schedule_enabled=false)');
    return;
  }
  if (!cron.validate(settings.cron)) {
    logger.warn({ cron: settings.cron }, 'Invalid cron expression, scheduler not started');
    return;
  }
  scheduledTask?.stop();
  scheduledTask = cron.schedule(
    settings.cron,
    async () => {
      logger.info('Cron tick: running daily pipeline');
      try {
        await runDailyPipeline({ trigger: 'schedule' });
      } catch (e) {
        logger.error({ err: (e as Error).message }, 'Scheduled run failed');
      }
    },
    { timezone: settings.timezone ?? 'Asia/Kolkata' },
  );
  const next = computeNextRun(settings.cron, settings.timezone ?? 'Asia/Kolkata');
  await store.setNextRun(next);
  logger.info({ cron: settings.cron, tz: settings.timezone, next }, 'Scheduler started');
}

export function stopScheduler() {
  scheduledTask?.stop();
  scheduledTask = null;
}

r.get('/status', async (_req, res) => {
  try {
    const store = getStore();
    const s = await store.getSettings();
    const lastExec = await store.getLastExecution();
    res.json({
      data: {
        enabled: s.scheduleEnabled,
        cron: s.cron,
        timezone: s.timezone,
        defaultLanguage: s.defaultLanguage,
        aiProvider: s.aiProvider,
        autoSubmit: s.autoSubmit,
        lastRunAt: s.lastRunAt,
        nextRunAt: s.nextRunAt,
        running: await store.isLocked(),
        lastExecution: lastExec ? toApiExecutionRow(lastExec) : null,
        stats: await executionStats(),
      },
    });
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

export async function executionStats() {
  const store = getStore();
  const [total, ok, acc, statuses, recent] = await Promise.all([
    store.countExecutions(),
    store.countExecutions('success'),
    store.countSubmissions('accepted'),
    store.recentSubmissionStatuses(30),
    store.listExecutions(10),
  ]);
  let streak = 0;
  for (const st of statuses) {
    if (st === 'accepted') streak++;
    else break;
  }
  return { totalRuns: total, successRuns: ok, acceptedSubmissions: acc, streak, recent: recent.map(toApiExecutionRow) };
}

r.post('/run', requireToken, validate(runSchema), async (req, res) => {
  try {
    const { language, autoSubmit, date } = (req as any).validated.body;
    const out = await runDailyPipeline({ trigger: 'manual', language, autoSubmit, date });
    res.status(201).json({
      data: {
        executionId: out.executionId,
        challenge: {
          id: out.challenge.id, date: out.challenge.date, slug: out.challenge.slug,
          title: out.challenge.title, difficulty: out.challenge.difficulty,
          description: out.challenge.description, examples: out.challenge.examples,
          constraints: out.challenge.constraints, topics: out.challenge.topics,
          url: out.challenge.url, created_at: out.challenge.createdAt,
        },
        solution: {
          id: out.solution.id, challenge_id: out.solution.challengeId, language: out.solution.language,
          code: out.solution.code, explanation: out.solution.explanation, approach: out.solution.approach,
          time_complexity: out.solution.timeComplexity, space_complexity: out.solution.spaceComplexity,
          edge_cases: out.solution.edgeCases, ai_provider: out.solution.aiProvider,
          ai_model: out.solution.aiModel, created_at: out.solution.createdAt,
        },
        durationMs: out.durationMs,
      },
    });
  } catch (e: any) {
    if (e.status === 409) return err(res, 409, e.code ?? 'job_in_progress', e.message);
    return err(res, 500, 'run_failed', (e as Error).message);
  }
});

r.patch('/settings', requireToken, validate(settingsSchema), async (req, res) => {
  try {
    const b = (req as any).validated.body as any;
    const patch: Record<string, unknown> = {};
    if (b.scheduleEnabled !== undefined) patch.scheduleEnabled = b.scheduleEnabled;
    if (b.cron !== undefined) patch.cron = b.cron;
    if (b.timezone !== undefined) patch.timezone = b.timezone;
    if (b.defaultLanguage !== undefined) patch.defaultLanguage = b.defaultLanguage;
    if (b.aiProvider !== undefined) patch.aiProvider = b.aiProvider;
    if (b.autoSubmit !== undefined) patch.autoSubmit = b.autoSubmit;
    if (patch.cron !== undefined && !cron.validate(patch.cron as string)) {
      return err(res, 400, 'validation_error', 'Invalid cron expression');
    }
    const store = getStore();
    const merged = await store.saveSettings(patch as any);
    const nextRun = computeNextRun(merged.cron, merged.timezone);
    await store.setNextRun(nextRun);
    if (merged.scheduleEnabled) await startScheduler();
    else stopScheduler();
    res.json({ data: toApiSettingsRow(await store.getSettings()) });
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

r.get('/executions', async (_req, res) => {
  try {
    const rows = await getStore().listExecutions(30);
    res.json({ data: rows.map(toApiExecutionRow) });
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

export default r;

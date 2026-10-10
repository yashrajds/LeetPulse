import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { dbProvider, getStore } from './db/index.js';
import { logger } from './logger.js';
import challenges from './routes/challenges.js';
import solutions from './routes/solutions.js';
import automation, { startScheduler } from './routes/automation.js';
import submissions from './routes/submissions.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));
  app.use(pinoHttp({ logger }));
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 120, standardHeaders: 'draft-7' }));

  app.get('/api/health', async (_req, res) => {
    let db = dbProvider();
    try {
      await getStore().getSettings();
    } catch (e) {
      return res.status(503).json({ ok: false, error: { code: 'db_unavailable', message: (e as Error).message } });
    }
    res.json({ ok: true, mockMode: config.mockMode, provider: config.aiProvider, db });
  });
  app.use('/api/challenges', challenges);
  app.use('/api/solutions', solutions);
  app.use('/api/automation', automation);
  app.use('/api/submissions', submissions);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Unknown API route' } }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((e: any, _req: any, res: any, _next: any) => {
    if (e?.type === 'entity.parse.failed' || e instanceof SyntaxError) {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Malformed JSON body' } });
    }
    logger.error({ err: e?.message }, 'Unhandled error');
    res.status(500).json({ error: { code: 'internal', message: 'Internal server error' } });
  });
  return app;
}

if (process.argv[1]?.endsWith('index.ts') || process.env.RUN_SERVER !== 'false') {
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
  if (!isTest || process.env.FORCE_SERVER === 'true') {
    const app = createApp();
    app.listen(config.port, () => {
      logger.info(`LeetPulse API on :${config.port} (mock=${config.mockMode} db=${dbProvider()})`);
      startScheduler().catch((e) => logger.warn({ err: (e as Error).message }, 'Scheduler failed to start'));
    });
  }
}

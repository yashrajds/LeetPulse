/** Standalone worker entrypoint: scheduler + automation, no HTTP server.
 * Run: npm run worker
 */
import 'dotenv/config';
import { getStore } from './db/index.js';
import { startScheduler } from './routes/automation.js';
import { runDailyPipeline } from './services/scheduler.js';
import { logger } from './logger.js';

async function main() {
  await getStore().getSettings();
  const once = process.argv.includes('--once');
  if (once) {
    logger.info('Worker --once: running pipeline a single time');
    await runDailyPipeline({ trigger: 'worker-once' });
    process.exit(0);
  }
  await startScheduler();
  logger.info('LeetPulse worker running (scheduler active). Ctrl+C to stop.');
  // Run once at boot if no challenge for today yet? No — wait for schedule or --once.
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  logger.error({ err: (e as Error).message }, 'Worker failed');
  process.exit(1);
});

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.MOCK_MODE = 'true';
process.env.DB_PROVIDER = 'sqlite';
process.env.DATABASE_PATH = './data/test.db';
process.env.DISABLE_SCHEDULER = 'true';

describe('scheduler + persistence', () => {
  let runDailyPipeline: any;
  let store: any;
  before(async () => {
    try { fs.unlinkSync('./data/test.db'); } catch {}
    const cfg = await import('../src/config.js');
    cfg.config.dbPath = './data/test.db';
    cfg.config.mockMode = true;
    const db = await import('../src/db/index.js');
    db.setStore(new (await import('../src/db/sqlite.js')).SqliteStore());
    store = db.getStore();
    runDailyPipeline = (await import('../src/services/scheduler.js')).runDailyPipeline;
  });

  it('runs pipeline and dedupes same date', async () => {
    const a = await runDailyPipeline({ trigger: 'test', language: 'python', date: '2026-10-10' });
    assert.ok(a.challenge.id && a.solution.id);
    const b = await runDailyPipeline({ trigger: 'test', language: 'python', date: '2026-10-10' });
    assert.equal(String(a.challenge.id), String(b.challenge.id), 'same date must reuse challenge');
    assert.equal(String(a.solution.id), String(b.solution.id), 'same date+lang must reuse solution');
  });

  it('prevents overlapping jobs', async () => {
    assert.equal(await store.tryAcquireLock(), true);
    await assert.rejects(() => runDailyPipeline({ trigger: 'test' }), /already running/);
    await store.releaseLock();
  });

  it('records executions with duration', async () => {
    const rows = await store.listExecutions(10);
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((r: any) => typeof r.durationMs === 'number'));
  });

  it('settings round-trip', async () => {
    const s = await store.getSettings();
    assert.ok(s.cron && s.timezone === 'Asia/Kolkata');
    const updated = await store.saveSettings({ defaultLanguage: 'java' });
    assert.equal(updated.defaultLanguage, 'java');
    await store.saveSettings({ defaultLanguage: s.defaultLanguage });
  });
});

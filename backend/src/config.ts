import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dbPath: process.env.DATABASE_PATH ?? './data/leetpulse.db',
  dbProvider: (process.env.DB_PROVIDER ?? '').toLowerCase(), // sqlite | firestore (auto: firestore when Firebase creds present)
  mockMode: (process.env.MOCK_MODE ?? 'false').toLowerCase() === 'true',
  aiProvider: (process.env.AI_PROVIDER ?? 'mock').toLowerCase(),
  aiModel: process.env.AI_MODEL ?? '',
  openaiKey: process.env.OPENAI_API_KEY ?? '',
  openaiBase: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  geminiKey: process.env.GEMINI_API_KEY ?? '',
  groqKey: process.env.GROQ_API_KEY ?? '',
  ollamaBase: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  scheduleEnabled: (process.env.SCHEDULE_ENABLED ?? 'true').toLowerCase() === 'true',
  scheduleCron: process.env.SCHEDULE_CRON ?? '30 6 * * *',
  scheduleTimezone: process.env.SCHEDULE_TIMEZONE ?? 'Asia/Kolkata',
  disableScheduler: (process.env.DISABLE_SCHEDULER ?? 'false').toLowerCase() === 'true',
  defaultLanguage: process.env.DEFAULT_LANGUAGE ?? 'python',
  autoSubmit: (process.env.AUTO_SUBMIT ?? 'false').toLowerCase() === 'true',
  pwHeadless: (process.env.PLAYWRIGHT_HEADLESS ?? 'false').toLowerCase() === 'true',
  pwProfileDir: process.env.PLAYWRIGHT_PROFILE_DIR ?? './data/pw-profile',
  apiToken: process.env.API_TOKEN ?? '',
};

export const SUPPORTED_LANGUAGES = ['python', 'java', 'cpp', 'javascript'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const AI_PROVIDERS = ['openai', 'anthropic', 'gemini', 'groq', 'ollama', 'mock'] as const;

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const resolved = path.resolve(config.dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  _db = new Database(resolved);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'Medium',
      description TEXT NOT NULL DEFAULT '',
      examples TEXT NOT NULL DEFAULT '[]',
      constraints_text TEXT NOT NULL DEFAULT '[]',
      topics TEXT NOT NULL DEFAULT '[]',
      url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_challenges_date ON challenges(date);
    CREATE TABLE IF NOT EXISTS solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      language TEXT NOT NULL,
      code TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      approach TEXT NOT NULL DEFAULT '',
      time_complexity TEXT NOT NULL DEFAULT '',
      space_complexity TEXT NOT NULL DEFAULT '',
      edge_cases TEXT NOT NULL DEFAULT '',
      ai_provider TEXT NOT NULL DEFAULT 'mock',
      ai_model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_solutions_challenge ON solutions(challenge_id);
    CREATE TABLE IF NOT EXISTS automation_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schedule_enabled INTEGER NOT NULL DEFAULT 1,
      cron TEXT NOT NULL DEFAULT '30 6 * * *',
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      default_language TEXT NOT NULL DEFAULT 'python',
      ai_provider TEXT NOT NULL DEFAULT 'mock',
      auto_submit INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      next_run_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      duration_ms INTEGER,
      trigger TEXT NOT NULL DEFAULT 'manual',
      challenge_date TEXT,
      error TEXT,
      detail TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solution_id INTEGER REFERENCES solutions(id) ON DELETE SET NULL,
      challenge_id INTEGER REFERENCES challenges(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      logs TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'python',
      auto_submitted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
    CREATE TABLE IF NOT EXISTS scheduler_lock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      locked INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT
    );
  `);
  const has = _db.prepare('SELECT COUNT(*) AS c FROM automation_settings WHERE id = 1').get() as { c: number };
  if (has.c === 0) {
    _db.prepare(`INSERT INTO automation_settings
      (id, schedule_enabled, cron, timezone, default_language, ai_provider, auto_submit)
      VALUES (1, ?, ?, ?, ?, ?, ?)`).run(
      config.scheduleEnabled ? 1 : 0, config.scheduleCron, config.scheduleTimezone,
      config.defaultLanguage, config.aiProvider, config.autoSubmit ? 1 : 0,
    );
  }
  const lock = _db.prepare('SELECT COUNT(*) AS c FROM scheduler_lock WHERE id = 1').get() as { c: number };
  if (lock.c === 0) _db.prepare('INSERT INTO scheduler_lock (id, locked) VALUES (1, 0)').run();
  return _db;
}

/** For tests: in-memory DB. */
export function setTestDb(db: Database.Database) {
  _db = db;
}

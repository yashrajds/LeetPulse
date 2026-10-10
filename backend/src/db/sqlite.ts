/** SQLite Store — local dev. Zero setup, file in ./data (git-ignored). */
import { getDb } from '../config.js';
import type {
  Challenge, Execution, NewChallenge, NewSolution, Settings, Solution, Store, Submission,
} from './store.js';

function toChallenge(r: any): Challenge {
  return {
    id: r.id, date: r.date, slug: r.slug, title: r.title, difficulty: r.difficulty,
    description: r.description, examples: JSON.parse(r.examples ?? '[]'),
    constraints: JSON.parse(r.constraints_text ?? '[]'), topics: JSON.parse(r.topics ?? '[]'),
    url: r.url, createdAt: r.created_at,
  };
}

function toSolution(r: any): Solution {
  return {
    id: r.id, challengeId: r.challenge_id, language: r.language, code: r.code,
    explanation: r.explanation, approach: r.approach, timeComplexity: r.time_complexity,
    spaceComplexity: r.space_complexity, edgeCases: r.edge_cases,
    aiProvider: r.ai_provider, aiModel: r.ai_model, createdAt: r.created_at,
  };
}

function toExecution(r: any): Execution {
  let detail: Record<string, unknown> = {};
  try { detail = JSON.parse(r.detail ?? '{}'); } catch { /* keep {} */ }
  return {
    id: r.id, startedAt: r.started_at, finishedAt: r.finished_at, status: r.status,
    durationMs: r.duration_ms, trigger: r.trigger, challengeDate: r.challenge_date,
    error: r.error, detail,
  };
}

function toSubmission(r: any): Submission {
  return {
    id: r.id, solutionId: r.solution_id, challengeId: r.challenge_id, status: r.status,
    logs: r.logs, language: r.language, autoSubmitted: !!r.auto_submitted, createdAt: r.created_at,
    challengeTitle: r.challenge_title ?? null, slug: r.slug ?? null,
  };
}

export class SqliteStore implements Store {
  private db() { return getDb(); }

  async getSettings(): Promise<Settings> {
    const r = this.db().prepare('SELECT * FROM automation_settings WHERE id = 1').get() as any;
    return {
      scheduleEnabled: !!r.schedule_enabled, cron: r.cron, timezone: r.timezone,
      defaultLanguage: r.default_language, aiProvider: r.ai_provider,
      autoSubmit: !!r.auto_submit, lastRunAt: r.last_run_at, nextRunAt: r.next_run_at,
    };
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const cur = await this.getSettings();
    const m = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
    this.db().prepare(`UPDATE automation_settings SET schedule_enabled=?, cron=?, timezone=?,
      default_language=?, ai_provider=?, auto_submit=?, last_run_at=?, next_run_at=?,
      updated_at=datetime('now') WHERE id=1`).run(
      m.scheduleEnabled ? 1 : 0, m.cron, m.timezone, m.defaultLanguage,
      m.aiProvider, m.autoSubmit ? 1 : 0, m.lastRunAt, m.nextRunAt,
    );
    return this.getSettings();
  }

  async touchLastRun(): Promise<void> {
    this.db().prepare("UPDATE automation_settings SET last_run_at=datetime('now') WHERE id = 1").run();
  }

  async setNextRun(iso: string | null): Promise<void> {
    this.db().prepare('UPDATE automation_settings SET next_run_at = ? WHERE id = 1').run(iso);
  }

  async getChallengeByDate(date: string): Promise<Challenge | null> {
    const r = this.db().prepare('SELECT * FROM challenges WHERE date = ?').get(date) as any;
    return r ? toChallenge(r) : null;
  }

  async getChallengeById(id: number | string): Promise<Challenge | null> {
    const r = this.db().prepare('SELECT * FROM challenges WHERE id = ?').get(id) as any;
    return r ? toChallenge(r) : null;
  }

  async getLatestChallenge(): Promise<Challenge | null> {
    const r = this.db().prepare('SELECT * FROM challenges ORDER BY date DESC LIMIT 1').get() as any;
    return r ? toChallenge(r) : null;
  }

  async insertChallenge(c: NewChallenge): Promise<Challenge> {
    const r = this.db().prepare(`INSERT INTO challenges
      (date, slug, title, difficulty, description, examples, constraints_text, topics, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO NOTHING RETURNING *`).get(
      c.date, c.slug, c.title, c.difficulty, c.description,
      JSON.stringify(c.examples), JSON.stringify(c.constraints),
      JSON.stringify(c.topics), c.url,
    ) as any;
    if (r) return toChallenge(r);
    const existing = await this.getChallengeByDate(c.date);
    if (!existing) throw new Error('Failed to insert challenge');
    return existing;
  }

  async listChallenges(limit: number): Promise<Challenge[]> {
    const rows = this.db().prepare('SELECT * FROM challenges ORDER BY date DESC LIMIT ?').all(limit) as any[];
    return rows.map(toChallenge);
  }

  async getSolution(challengeId: number | string, language: string): Promise<Solution | null> {
    const r = this.db().prepare(
      'SELECT * FROM solutions WHERE challenge_id = ? AND language = ? ORDER BY id DESC LIMIT 1',
    ).get(challengeId, language) as any;
    return r ? toSolution(r) : null;
  }

  async getSolutionById(id: number | string): Promise<Solution | null> {
    const r = this.db().prepare('SELECT * FROM solutions WHERE id = ?').get(id) as any;
    return r ? toSolution(r) : null;
  }

  async insertSolution(s: NewSolution): Promise<Solution> {
    const r = this.db().prepare(`INSERT INTO solutions
      (challenge_id, language, code, explanation, approach, time_complexity, space_complexity, edge_cases, ai_provider, ai_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).get(
      s.challengeId, s.language, s.code, s.explanation, s.approach,
      s.timeComplexity, s.spaceComplexity, s.edgeCases, s.aiProvider, s.aiModel,
    ) as any;
    return toSolution(r);
  }

  async listSolutionsByDate(date: string, language?: string): Promise<Solution[]> {
    const ch = await this.getChallengeByDate(date);
    if (!ch) return [];
    const rows = this.db().prepare(`SELECT s.* FROM solutions s WHERE s.challenge_id = ?
      ${language ? 'AND s.language = ?' : ''} ORDER BY s.id DESC`).all(
      ...(language ? [ch.id, language] : [ch.id]),
    ) as any[];
    return rows.map(toSolution);
  }

  async listRecentSolutions(limit: number): Promise<Solution[]> {
    const rows = this.db().prepare('SELECT * FROM solutions ORDER BY id DESC LIMIT ?').all(limit) as any[];
    return rows.map(toSolution);
  }

  async insertExecution(trigger: string): Promise<Execution> {
    const r = this.db().prepare(
      `INSERT INTO executions (status, trigger, detail) VALUES ('running', ?, '{}') RETURNING *`,
    ).get(trigger) as any;
    return toExecution(r);
  }

  async updateExecution(id: number | string, patch: Partial<Pick<Execution, 'status' | 'finishedAt' | 'durationMs' | 'challengeDate' | 'error' | 'detail'>>): Promise<void> {
    const cur = this.db().prepare('SELECT * FROM executions WHERE id = ?').get(id) as any;
    if (!cur) return;
    this.db().prepare(`UPDATE executions SET status=?, finished_at=?, duration_ms=?,
      challenge_date=?, error=?, detail=? WHERE id=?`).run(
      patch.status ?? cur.status,
      patch.finishedAt ?? cur.finished_at,
      patch.durationMs ?? cur.duration_ms,
      patch.challengeDate ?? cur.challenge_date,
      patch.error ?? cur.error,
      JSON.stringify(patch.detail ?? JSON.parse(cur.detail ?? '{}')),
      id,
    );
  }

  async getLastExecution(): Promise<Execution | null> {
    const r = this.db().prepare('SELECT * FROM executions ORDER BY id DESC LIMIT 1').get() as any;
    return r ? toExecution(r) : null;
  }

  async listExecutions(limit: number): Promise<Execution[]> {
    const rows = this.db().prepare('SELECT * FROM executions ORDER BY id DESC LIMIT ?').all(limit) as any[];
    return rows.map(toExecution);
  }

  async countExecutions(status?: string): Promise<number> {
    const r = (status
      ? this.db().prepare('SELECT COUNT(*) c FROM executions WHERE status = ?').get(status)
      : this.db().prepare('SELECT COUNT(*) c FROM executions').get()) as any;
    return r.c as number;
  }

  async insertSubmission(s: { solutionId: number | string | null; challengeId: number | string | null; language: string; autoSubmitted: boolean; challengeTitle?: string | null; slug?: string | null }): Promise<Submission> {
    const r = this.db().prepare(`INSERT INTO submissions
      (solution_id, challenge_id, status, logs, language, auto_submitted)
      VALUES (?, ?, 'pending', 'started', ?, ?) RETURNING *`).get(
      s.solutionId, s.challengeId, s.language, s.autoSubmitted ? 1 : 0,
    ) as any;
    const sub = toSubmission(r);
    sub.challengeTitle = s.challengeTitle ?? null;
    sub.slug = s.slug ?? null;
    return sub;
  }

  async updateSubmission(id: number | string, status: string, logs: string): Promise<void> {
    this.db().prepare('UPDATE submissions SET status = ?, logs = ? WHERE id = ?').run(status, logs, id);
  }

  private submissionHistory(limit: number): any[] {
    return this.db().prepare(`SELECT sub.*, c.title AS challenge_title, c.slug FROM submissions sub
      LEFT JOIN challenges c ON c.id = sub.challenge_id ORDER BY sub.id DESC LIMIT ?`).all(limit) as any[];
  }

  async listSubmissions(limit: number): Promise<Submission[]> {
    return this.submissionHistory(limit).map(toSubmission);
  }

  async listSubmissionsBySolution(solutionId: number | string): Promise<Submission[]> {
    const rows = this.db().prepare(
      'SELECT * FROM submissions WHERE solution_id = ? ORDER BY id DESC',
    ).all(solutionId) as any[];
    return rows.map(toSubmission);
  }

  async countSubmissions(status: string): Promise<number> {
    return (this.db().prepare('SELECT COUNT(*) c FROM submissions WHERE status = ?').get(status) as any).c as number;
  }

  async recentSubmissionStatuses(limit: number): Promise<string[]> {
    const rows = this.db().prepare('SELECT status FROM submissions ORDER BY id DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => r.status as string);
  }

  async tryAcquireLock(): Promise<boolean> {
    const r = this.db().prepare(
      "UPDATE scheduler_lock SET locked = 1, locked_at = datetime('now') WHERE id = 1 AND locked = 0",
    ).run();
    return r.changes === 1;
  }

  async releaseLock(): Promise<void> {
    this.db().prepare('UPDATE scheduler_lock SET locked = 0 WHERE id = 1').run();
  }

  async isLocked(): Promise<boolean> {
    const r = this.db().prepare('SELECT locked FROM scheduler_lock WHERE id = 1').get() as { locked: number };
    return r.locked === 1;
  }
}

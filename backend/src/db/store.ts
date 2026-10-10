/** Database abstraction: SQLite (local dev) vs Firestore (prod).
 * Routes/services talk to the Store interface in domain terms.
 * toApi* mappers preserve the existing REST wire shapes so the frontend is untouched.
 */

export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface Challenge {
  id: number | string;
  date: string;
  slug: string;
  title: string;
  difficulty: string;
  description: string;
  examples: Example[];
  constraints: string[];
  topics: string[];
  url: string;
  createdAt: string;
}

export interface NewChallenge {
  date: string;
  slug: string;
  title: string;
  difficulty: string;
  description: string;
  examples: Example[];
  constraints: string[];
  topics: string[];
  url: string;
}

export interface Solution {
  id: number | string;
  challengeId: number | string;
  language: string;
  code: string;
  explanation: string;
  approach: string;
  timeComplexity: string;
  spaceComplexity: string;
  edgeCases: string;
  aiProvider: string;
  aiModel: string;
  createdAt: string;
}

export interface NewSolution {
  challengeId: number | string;
  language: string;
  code: string;
  explanation: string;
  approach: string;
  timeComplexity: string;
  spaceComplexity: string;
  edgeCases: string;
  aiProvider: string;
  aiModel: string;
}

export interface Settings {
  scheduleEnabled: boolean;
  cron: string;
  timezone: string;
  defaultLanguage: string;
  aiProvider: string;
  autoSubmit: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface Execution {
  id: number | string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  durationMs: number | null;
  trigger: string;
  challengeDate: string | null;
  error: string | null;
  detail: Record<string, unknown>;
}

export interface Submission {
  id: number | string;
  solutionId: number | string | null;
  challengeId: number | string | null;
  status: string;
  logs: string;
  language: string;
  autoSubmitted: boolean;
  createdAt: string;
  challengeTitle?: string | null;
  slug?: string | null;
}

export interface Store {
  // settings
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  touchLastRun(): Promise<void>;
  setNextRun(iso: string | null): Promise<void>;
  // challenges
  getChallengeByDate(date: string): Promise<Challenge | null>;
  getChallengeById(id: number | string): Promise<Challenge | null>;
  getLatestChallenge(): Promise<Challenge | null>;
  insertChallenge(c: NewChallenge): Promise<Challenge>;
  listChallenges(limit: number): Promise<Challenge[]>;
  // solutions
  getSolution(challengeId: number | string, language: string): Promise<Solution | null>;
  getSolutionById(id: number | string): Promise<Solution | null>;
  insertSolution(s: NewSolution): Promise<Solution>;
  listSolutionsByDate(date: string, language?: string): Promise<Solution[]>;
  listRecentSolutions(limit: number): Promise<Solution[]>;
  // executions
  insertExecution(trigger: string): Promise<Execution>;
  updateExecution(id: number | string, patch: Partial<Pick<Execution, 'status' | 'finishedAt' | 'durationMs' | 'challengeDate' | 'error' | 'detail'>>): Promise<void>;
  getLastExecution(): Promise<Execution | null>;
  listExecutions(limit: number): Promise<Execution[]>;
  countExecutions(status?: string): Promise<number>;
  // submissions
  insertSubmission(s: { solutionId: number | string | null; challengeId: number | string | null; language: string; autoSubmitted: boolean; challengeTitle?: string | null; slug?: string | null }): Promise<Submission>;
  updateSubmission(id: number | string, status: string, logs: string): Promise<void>;
  listSubmissions(limit: number): Promise<Submission[]>;
  listSubmissionsBySolution(solutionId: number | string): Promise<Submission[]>;
  countSubmissions(status: string): Promise<number>;
  recentSubmissionStatuses(limit: number): Promise<string[]>;
  // scheduler lock
  tryAcquireLock(): Promise<boolean>;
  releaseLock(): Promise<void>;
  isLocked(): Promise<boolean>;
}

// ---- Wire mappers (keep REST responses identical to the SQLite era) ----

export const toApiChallenge = (c: Challenge) => ({
  id: c.id,
  date: c.date,
  slug: c.slug,
  title: c.title,
  difficulty: c.difficulty,
  description: c.description,
  examples: c.examples,
  constraints: c.constraints,
  topics: c.topics,
  url: c.url,
  createdAt: c.createdAt,
});

export const toApiSolutionRow = (s: Solution) => ({
  id: s.id,
  challenge_id: s.challengeId,
  language: s.language,
  code: s.code,
  explanation: s.explanation,
  approach: s.approach,
  time_complexity: s.timeComplexity,
  space_complexity: s.spaceComplexity,
  edge_cases: s.edgeCases,
  ai_provider: s.aiProvider,
  ai_model: s.aiModel,
  created_at: s.createdAt,
});

export const toApiSettingsRow = (s: Settings) => ({
  id: 1,
  schedule_enabled: s.scheduleEnabled ? 1 : 0,
  cron: s.cron,
  timezone: s.timezone,
  default_language: s.defaultLanguage,
  ai_provider: s.aiProvider,
  auto_submit: s.autoSubmit ? 1 : 0,
  last_run_at: s.lastRunAt,
  next_run_at: s.nextRunAt,
  updated_at: new Date().toISOString(),
});

export const toApiExecutionRow = (e: Execution) => ({
  id: e.id,
  started_at: e.startedAt,
  finished_at: e.finishedAt,
  status: e.status,
  duration_ms: e.durationMs,
  trigger: e.trigger,
  challenge_date: e.challengeDate,
  error: e.error,
  detail: JSON.stringify(e.detail ?? {}),
});

export const toApiSubmissionRow = (s: Submission) => ({
  id: s.id,
  solution_id: s.solutionId,
  challenge_id: s.challengeId,
  status: s.status,
  logs: s.logs,
  language: s.language,
  auto_submitted: s.autoSubmitted ? 1 : 0,
  created_at: s.createdAt,
  ...(s.challengeTitle !== undefined ? { challenge_title: s.challengeTitle } : {}),
  ...(s.slug !== undefined ? { slug: s.slug } : {}),
});

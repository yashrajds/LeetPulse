/** Firestore Store — production database.
 * Activated with DB_PROVIDER=firestore plus either GOOGLE_APPLICATION_CREDENTIALS
 * or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
 * The backend uses the Admin SDK (bypasses security rules); clients get no direct access.
 */
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type {
  Challenge, Execution, NewChallenge, NewSolution, Settings, Solution, Store, Submission,
} from './store.js';

let _db: Firestore | null = null;

function db(): Firestore {
  if (_db) return _db;
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error(
        'Firestore selected but no credentials: set DB_PROVIDER=sqlite, or provide ' +
          'GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
      );
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({
        credential: applicationDefault(),
        ...(projectId ? { projectId } : {}),
      });
    } else {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
      if (!clientEmail || !privateKey) {
        throw new Error('FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are both required.');
      }
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
    }
  }
  _db = getFirestore();
  return _db;
}

const nowIso = () => new Date().toISOString();

function toChallenge(id: string, d: any): Challenge {
  return {
    id, date: d.date, slug: d.slug, title: d.title, difficulty: d.difficulty ?? 'Medium',
    description: d.description ?? '', examples: d.examples ?? [], constraints: d.constraints ?? [],
    topics: d.topics ?? [], url: d.url ?? '', createdAt: d.createdAt ?? nowIso(),
  };
}

function toSolution(id: string, d: any): Solution {
  return {
    id, challengeId: d.challengeId, language: d.language, code: d.code,
    explanation: d.explanation ?? '', approach: d.approach ?? '',
    timeComplexity: d.timeComplexity ?? '', spaceComplexity: d.spaceComplexity ?? '',
    edgeCases: d.edgeCases ?? '', aiProvider: d.aiProvider ?? 'mock',
    aiModel: d.aiModel ?? '', createdAt: d.createdAt ?? nowIso(),
  };
}

function toExecution(id: string, d: any): Execution {
  return {
    id, startedAt: d.startedAt, finishedAt: d.finishedAt ?? null, status: d.status ?? 'running',
    durationMs: d.durationMs ?? null, trigger: d.trigger ?? 'manual',
    challengeDate: d.challengeDate ?? null, error: d.error ?? null, detail: d.detail ?? {},
  };
}

function toSubmission(id: string, d: any): Submission {
  return {
    id, solutionId: d.solutionId ?? null, challengeId: d.challengeId ?? null,
    status: d.status ?? 'pending', logs: d.logs ?? '', language: d.language ?? 'python',
    autoSubmitted: !!d.autoSubmitted, createdAt: d.createdAt ?? nowIso(),
    challengeTitle: d.challengeTitle ?? null, slug: d.slug ?? null,
  };
}

const DEFAULT_SETTINGS: Settings = {
  scheduleEnabled: (process.env.SCHEDULE_ENABLED ?? 'true').toLowerCase() === 'true',
  cron: process.env.SCHEDULE_CRON ?? '30 6 * * *',
  timezone: process.env.SCHEDULE_TIMEZONE ?? 'Asia/Kolkata',
  defaultLanguage: process.env.DEFAULT_LANGUAGE ?? 'python',
  aiProvider: (process.env.AI_PROVIDER ?? 'mock').toLowerCase(),
  autoSubmit: (process.env.AUTO_SUBMIT ?? 'false').toLowerCase() === 'true',
  lastRunAt: null,
  nextRunAt: null,
};

export class FirestoreStore implements Store {
  private settingsRef() {
    return db().collection('automation_settings').doc('global');
  }

  async getSettings(): Promise<Settings> {
    const snap = await this.settingsRef().get();
    if (!snap.exists) {
      await this.settingsRef().set({ ...DEFAULT_SETTINGS });
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings>) };
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await this.settingsRef().set({ ...clean, updatedAt: nowIso() }, { merge: true });
    return this.getSettings();
  }

  async touchLastRun(): Promise<void> {
    await this.settingsRef().set({ lastRunAt: nowIso() }, { merge: true });
  }

  async setNextRun(iso: string | null): Promise<void> {
    await this.settingsRef().set({ nextRunAt: iso }, { merge: true });
  }

  async getChallengeByDate(date: string): Promise<Challenge | null> {
    const snap = await db().collection('challenges').doc(date).get();
    return snap.exists ? toChallenge(snap.id, snap.data()) : null;
  }

  async getChallengeById(id: number | string): Promise<Challenge | null> {
    const snap = await db().collection('challenges').doc(String(id)).get();
    return snap.exists ? toChallenge(snap.id, snap.data()) : null;
  }

  async getLatestChallenge(): Promise<Challenge | null> {
    const q = await db().collection('challenges').orderBy('date', 'desc').limit(1).get();
    return q.empty ? null : toChallenge(q.docs[0].id, q.docs[0].data());
  }

  async insertChallenge(c: NewChallenge): Promise<Challenge> {
    const ref = db().collection('challenges').doc(c.date);
    const existing = await ref.get();
    if (existing.exists) return toChallenge(existing.id, existing.data());
    const data = { ...c, createdAt: nowIso() };
    await ref.create(data).catch(async (e: any) => {
      if (e?.code !== 6) throw e; // 6 = ALREADY_EXISTS → fall through to re-read
    });
    const snap = await ref.get();
    if (!snap.exists) throw new Error('Failed to insert challenge');
    return toChallenge(snap.id, snap.data());
  }

  async listChallenges(limit: number): Promise<Challenge[]> {
    const q = await db().collection('challenges').orderBy('date', 'desc').limit(limit).get();
    return q.docs.map((d) => toChallenge(d.id, d.data()));
  }

  async getSolution(challengeId: number | string, language: string): Promise<Solution | null> {
    const q = await db().collection('solutions')
      .where('challengeId', '==', String(challengeId))
      .where('language', '==', language)
      .orderBy('createdAt', 'desc').limit(1).get();
    return q.empty ? null : toSolution(q.docs[0].id, q.docs[0].data());
  }

  async getSolutionById(id: number | string): Promise<Solution | null> {
    const snap = await db().collection('solutions').doc(String(id)).get();
    return snap.exists ? toSolution(snap.id, snap.data()) : null;
  }

  async insertSolution(s: NewSolution): Promise<Solution> {
    const data = { ...s, challengeId: String(s.challengeId), createdAt: nowIso() };
    const ref = await db().collection('solutions').add(data);
    return toSolution(ref.id, data);
  }

  async listSolutionsByDate(date: string, language?: string): Promise<Solution[]> {
    const ch = await this.getChallengeByDate(date);
    if (!ch) return [];
    const q = await db().collection('solutions')
      .where('challengeId', '==', String(ch.id))
      .orderBy('createdAt', 'desc').get();
    let rows = q.docs.map((d) => toSolution(d.id, d.data()));
    if (language) rows = rows.filter((s) => s.language === language);
    return rows;
  }

  async listRecentSolutions(limit: number): Promise<Solution[]> {
    const q = await db().collection('solutions').orderBy('createdAt', 'desc').limit(limit).get();
    return q.docs.map((d) => toSolution(d.id, d.data()));
  }

  async insertExecution(trigger: string): Promise<Execution> {
    const data = { status: 'running', trigger, detail: {}, startedAt: nowIso() };
    const ref = await db().collection('executions').add(data);
    return toExecution(ref.id, data);
  }

  async updateExecution(id: number | string, patch: Partial<Pick<Execution, 'status' | 'finishedAt' | 'durationMs' | 'challengeDate' | 'error' | 'detail'>>): Promise<void> {
    await db().collection('executions').doc(String(id)).set({ ...patch }, { merge: true });
  }

  async getLastExecution(): Promise<Execution | null> {
    const q = await db().collection('executions').orderBy('startedAt', 'desc').limit(1).get();
    return q.empty ? null : toExecution(q.docs[0].id, q.docs[0].data());
  }

  async listExecutions(limit: number): Promise<Execution[]> {
    const q = await db().collection('executions').orderBy('startedAt', 'desc').limit(limit).get();
    return q.docs.map((d) => toExecution(d.id, d.data()));
  }

  async countExecutions(status?: string): Promise<number> {
    let q: any = db().collection('executions');
    if (status) q = q.where('status', '==', status);
    const agg = await q.count().get();
    return agg.data().count as number;
  }

  async insertSubmission(s: { solutionId: number | string | null; challengeId: number | string | null; language: string; autoSubmitted: boolean; challengeTitle?: string | null; slug?: string | null }): Promise<Submission> {
    const data = {
      solutionId: s.solutionId == null ? null : String(s.solutionId),
      challengeId: s.challengeId == null ? null : String(s.challengeId),
      status: 'pending', logs: 'started', language: s.language,
      autoSubmitted: s.autoSubmitted, challengeTitle: s.challengeTitle ?? null,
      slug: s.slug ?? null, createdAt: nowIso(),
    };
    const ref = await db().collection('submissions').add(data);
    return toSubmission(ref.id, data);
  }

  async updateSubmission(id: number | string, status: string, logs: string): Promise<void> {
    await db().collection('submissions').doc(String(id)).set({ status, logs }, { merge: true });
  }

  async listSubmissions(limit: number): Promise<Submission[]> {
    const q = await db().collection('submissions').orderBy('createdAt', 'desc').limit(limit).get();
    return q.docs.map((d) => toSubmission(d.id, d.data()));
  }

  async listSubmissionsBySolution(solutionId: number | string): Promise<Submission[]> {
    const q = await db().collection('submissions')
      .where('solutionId', '==', String(solutionId))
      .orderBy('createdAt', 'desc').get();
    return q.docs.map((d) => toSubmission(d.id, d.data()));
  }

  async countSubmissions(status: string): Promise<number> {
    const agg = await db().collection('submissions').where('status', '==', status).count().get();
    return agg.data().count as number;
  }

  async recentSubmissionStatuses(limit: number): Promise<string[]> {
    const q = await db().collection('submissions').orderBy('createdAt', 'desc').limit(limit).get();
    return q.docs.map((d) => (d.data().status as string) ?? 'pending');
  }

  private lockRef() {
    return db().collection('meta').doc('scheduler_lock');
  }

  async tryAcquireLock(): Promise<boolean> {
    const ref = this.lockRef();
    try {
      const acquired = await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data()?.locked === true) return false;
        tx.set(ref, { locked: true, lockedAt: nowIso() });
        return true;
      });
      return acquired;
    } catch {
      return false;
    }
  }

  async releaseLock(): Promise<void> {
    await this.lockRef().set({ locked: false }, { merge: true });
  }

  async isLocked(): Promise<boolean> {
    const snap = await this.lockRef().get();
    return snap.exists && snap.data()?.locked === true;
  }
}

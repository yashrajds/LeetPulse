import { Router } from 'express';
import { getStore, toApiSubmissionRow } from '../db/index.js';
import { err, validate, submitSchema, requireToken } from '../middleware/validate.js';
import { automateProblem } from '../services/automation.js';

const r = Router();

r.get('/history', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const rows = await getStore().listSubmissions(limit);
    res.json({ data: rows.map(toApiSubmissionRow) });
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

r.post('/submit', requireToken, validate(submitSchema), async (req, res) => {
  try {
    const { solutionId, mode } = (req as any).validated.body as { solutionId: number; mode: 'open' | 'paste' | 'submit' };
    const store = getStore();
    const sol = await store.getSolutionById(solutionId);
    if (!sol) return err(res, 404, 'not_found', 'Solution not found');
    const ch = await store.getChallengeById(sol.challengeId);
    if (!ch) return err(res, 404, 'not_found', 'Challenge not found');
    const settings = await store.getSettings();
    const autoSubmit = settings.autoSubmit;

    const subRow = await store.insertSubmission({
      solutionId: sol.id, challengeId: ch.id, language: sol.language,
      autoSubmitted: autoSubmit, challengeTitle: ch.title, slug: ch.slug,
    });

    try {
      const result = await automateProblem({ url: ch.url, code: sol.code, language: sol.language, mode, autoSubmit });
      const statusMap: Record<string, string> = {
        accepted: 'accepted', wrong_answer: 'failed', runtime_error: 'failed',
        compile_error: 'failed', tle: 'failed', failed: 'failed',
        needs_attention: 'needs_attention', pending: 'pending',
      };
      const status = statusMap[result.status] ?? 'needs_attention';
      await store.updateSubmission(
        subRow.id, status,
        `${result.logs}\n[verdict=${result.status}] authenticated=${result.authenticated} autoSubmitted=${result.autoSubmitted}`.slice(0, 8000),
      );
      const updated = (await store.listSubmissionsBySolution(sol.id)).find((s) => String(s.id) === String(subRow.id)) ?? subRow;
      res.status(201).json({ data: { submission: toApiSubmissionRow({ ...updated, status, challengeTitle: ch.title, slug: ch.slug }), detail: result } });
    } catch (e) {
      await store.updateSubmission(subRow.id, 'failed', `Automation error: ${(e as Error).message}`.slice(0, 4000));
      return err(res, 500, 'automation_failed', (e as Error).message);
    }
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

export default r;

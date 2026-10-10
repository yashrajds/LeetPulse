import { Router } from 'express';
import { getStore, toApiSolutionRow, toApiChallenge } from '../db/index.js';
import { config } from '../config.js';
import { generateSolution } from '../services/ai.js';
import { err, validate, generateSchema, requireToken } from '../middleware/validate.js';

const r = Router();

r.post('/generate', requireToken, validate(generateSchema), async (req, res) => {
  try {
    const store = getStore();
    const { date, language, regenerate } = (req as any).validated.body as { date?: string; language?: string; regenerate?: boolean };
    const settings = await store.getSettings();
    const lang = language ?? settings.defaultLanguage ?? config.defaultLanguage;
    // Resolve challenge
    const challenge = date ? await store.getChallengeByDate(date) : await store.getLatestChallenge();
    if (!challenge) return err(res, 404, 'no_challenge', 'No challenge found. Call GET /api/challenges/today first.');
    if (!regenerate) {
      const existing = await store.getSolution(challenge.id, lang);
      if (existing) return res.json({ data: { solution: toApiSolutionRow(existing), cached: true }, message: 'Returning cached solution. Set regenerate=true to force.' });
    }
    try {
      const { solution: gen, provider, model } = await generateSolution(
        {
          date: challenge.date, slug: challenge.slug, title: challenge.title,
          difficulty: challenge.difficulty, description: challenge.description,
          examples: challenge.examples, constraints: challenge.constraints,
          topics: challenge.topics, url: challenge.url,
        },
        lang,
        settings.aiProvider ?? config.aiProvider,
      );
      const row = await store.insertSolution({
        challengeId: challenge.id, language: lang, code: gen.code, explanation: gen.explanation,
        approach: gen.approach, timeComplexity: gen.timeComplexity,
        spaceComplexity: gen.spaceComplexity, edgeCases: gen.edgeCases,
        aiProvider: provider, aiModel: model,
      });
      res.status(201).json({ data: { solution: toApiSolutionRow(row), cached: false } });
    } catch (e) {
      return err(res, 502, 'ai_generation_failed', `AI generation failed: ${(e as Error).message}`);
    }
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

r.get('/', async (req, res) => {
  try {
    const store = getStore();
    const { date, language } = req.query as { date?: string; language?: string };
    const rows = date
      ? await store.listSolutionsByDate(date, language)
      : await store.listRecentSolutions(50);
    res.json({ data: rows.map(toApiSolutionRow) });
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

r.get('/:id', async (req, res) => {
  try {
    const store = getStore();
    const row = await store.getSolutionById(req.params.id);
    if (!row) return err(res, 404, 'not_found', 'Solution not found');
    const ch = await store.getChallengeById(row.challengeId);
    const subs = await store.listSubmissionsBySolution(row.id);
    res.json({
      data: {
        solution: toApiSolutionRow(row),
        challenge: ch ? toApiChallenge(ch) : null,
        submissions: subs.map((s) => ({
          id: s.id, solution_id: s.solutionId, challenge_id: s.challengeId, status: s.status,
          logs: s.logs, language: s.language, auto_submitted: s.autoSubmitted ? 1 : 0, created_at: s.createdAt,
        })),
      },
    });
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

export default r;

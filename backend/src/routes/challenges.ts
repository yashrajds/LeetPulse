import { Router } from 'express';
import { getStore, toApiChallenge } from '../db/index.js';
import { fetchDailyChallenge, mockChallenge, todayInTimezone } from '../services/leetcode.js';
import { config } from '../config.js';
import { err, validate } from '../middleware/validate.js';
import { z } from 'zod';

const r = Router();

r.get('/today', async (req, res) => {
  try {
    const store = getStore();
    const settings = await store.getSettings();
    const date = todayInTimezone(settings.timezone ?? config.scheduleTimezone);
    let ch = await store.getChallengeByDate(date);
    if (!ch) {
      let fetched;
      if (config.mockMode) fetched = mockChallenge(date);
      else {
        try {
          fetched = await fetchDailyChallenge(date);
        } catch (e) {
          return err(res, 502, 'leetcode_unavailable', `Could not reach LeetCode: ${(e as Error).message}`);
        }
      }
      ch = await store.insertChallenge(fetched);
    }
    res.json({ data: toApiChallenge(ch) });
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

r.get('/history', validate(z.object({ query: z.object({ limit: z.string().regex(/^\d+$/).optional() }) })), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 30), 100);
    const rows = await getStore().listChallenges(limit);
    res.json({ data: rows.map(toApiChallenge) });
  } catch (e) {
    err(res, 500, 'internal', (e as Error).message);
  }
});

export default r;

import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { config, SUPPORTED_LANGUAGES } from '../config.js';

export const err = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });

export const requireToken = (req: Request, res: Response, next: NextFunction) => {
  if (!config.apiToken) return next();
  const h = req.headers.authorization ?? '';
  if (h === `Bearer ${config.apiToken}`) return next();
  return err(res, 401, 'unauthorized', 'Missing or invalid API token');
};

export const validate =
  <T extends z.ZodTypeAny>(schema: T) => (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!parsed.success) {
      return err(res, 400, 'validation_error', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    (req as any).validated = parsed.data;
    next();
  };

export const languageSchema = z.enum(SUPPORTED_LANGUAGES as unknown as [string, ...string[]]);

export const generateSchema = z.object({
  body: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    language: languageSchema.optional(),
    regenerate: z.boolean().optional(),
  }),
});

export const settingsSchema = z.object({
  body: z.object({
    scheduleEnabled: z.boolean().optional(),
    cron: z.string().min(3).max(100).optional(),
    timezone: z.string().min(2).max(60).optional(),
    defaultLanguage: languageSchema.optional(),
    aiProvider: z.enum(['openai', 'anthropic', 'gemini', 'groq', 'ollama', 'mock']).optional(),
    autoSubmit: z.boolean().optional(),
  }),
});

export const submitSchema = z.object({
  body: z.object({
    solutionId: z.number().int().positive(),
    mode: z.enum(['open', 'paste', 'submit']),
  }),
});

export const runSchema = z.object({
  body: z.object({
    language: languageSchema.optional(),
    autoSubmit: z.boolean().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});

/** Playwright automation. Opt-in auto-submit; manual review default.
 * Never handles passwords — reuses a persistent local profile. Never exposes
 * cookies to the frontend.
 */
import fs from 'node:fs';
import { config } from '../config.js';
import { logger } from '../logger.js';

export type SubmitMode = 'open' | 'paste' | 'submit';
export type Verdict = 'accepted' | 'wrong_answer' | 'runtime_error' | 'compile_error' | 'tle' | 'failed' | 'needs_attention' | 'pending';

export function classifyVerdictText(text: string): Verdict {
  const t = text.toLowerCase();
  if (/accept/.test(t)) return 'accepted';
  if (/wrong answer/.test(t)) return 'wrong_answer';
  if (/runtime error/.test(t)) return 'runtime_error';
  if (/(compil|syntax error|error:)/.test(t)) return 'compile_error';
  if (/time limit/.test(t)) return 'tle';
  if (!t.trim()) return 'pending';
  return 'failed';
}

const LANG_MENU: Record<string, string[]> = {
  python: ['Python3', 'Python'],
  java: ['Java'],
  cpp: ['C++'],
  javascript: ['JavaScript'],
};

export interface AutomationResult {
  status: Verdict;
  logs: string;
  authenticated: boolean;
  autoSubmitted: boolean;
}

/** Ensure playwright is installed lazily so API tests run without a browser. */
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error('Playwright is not installed. Run: npm i playwright && npx playwright install chromium');
  }
}

export async function automateProblem(opts: {
  url: string;
  code: string;
  language: string;
  mode: SubmitMode;
  autoSubmit: boolean;
}): Promise<AutomationResult> {
  if (config.mockMode) {
    return {
      status: opts.mode === 'submit' && opts.autoSubmit ? 'accepted' : 'pending',
      logs: `[mock] mode=${opts.mode} autoSubmit=${opts.autoSubmit} — no browser launched.`,
      authenticated: true,
      autoSubmitted: false,
    };
  }
  const { chromium } = await loadPlaywright();
  fs.mkdirSync(config.pwProfileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(config.pwProfileDir, {
    headless: config.pwHeadless,
    viewport: { width: 1400, height: 900 },
  });
  const logs: string[] = [];
  const log = (m: string) => {
    logs.push(m);
    logger.info({ automation: true }, m);
  };
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    log(`Navigating to ${opts.url}`);
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Auth check: avatar / profile link indicates logged in.
    let authenticated = false;
    try {
      await page.waitForSelector('img[alt*="avatar" i], a[href*="/u/"], button[aria-label*="profile" i]', { timeout: 8000 });
      authenticated = true;
    } catch {
      authenticated = false;
    }
    log(authenticated ? 'Authenticated session detected.' : 'NOT authenticated — user must log in manually in the opened browser.');
    if (!authenticated) {
      return { status: 'needs_attention', logs: logs.join('\n'), authenticated, autoSubmitted: false };
    }
    if (opts.mode === 'open') {
      return { status: 'pending', logs: logs.join('\n'), authenticated, autoSubmitted: false };
    }

    // Select language
    try {
      const langBtn = page.locator('button:has-text("Python"), button:has-text("C++"), button:has-text("Java")').first();
      if (await langBtn.count()) {
        await langBtn.click({ timeout: 8000 });
        for (const label of LANG_MENU[opts.language] ?? [opts.language]) {
          const item = page.locator(`text=${label}`).first();
          if (await item.count()) {
            await item.click({ timeout: 5000 });
            log(`Language set to ${label}`);
            break;
          }
        }
      }
    } catch (err) {
      log(`Language selection warning: ${(err as Error).message}`);
    }

    // Paste code into Monaco editor
    try {
      await page.waitForSelector('.monaco-editor', { timeout: 20000 });
      await page.click('.monaco-editor', { timeout: 10000 });
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Backspace');
      // Type in chunks to avoid drop issues; clipboard paste is faster:
      await page.evaluate((code) => navigator.clipboard?.writeText(code).catch(() => {}), opts.code);
      await page.keyboard.press('ControlOrMeta+V');
      // Fallback: JS injection into monaco model
      const pasted = await page.evaluate(() => document.querySelector('.monaco-editor')?.textContent?.length ?? 0);
      log(`Code entered (editor chars ~${pasted}).`);
    } catch (err) {
      return { status: 'needs_attention', logs: logs.join('\n') + `\nEditor paste failed: ${(err as Error).message}`, authenticated, autoSubmitted: false };
    }

    const shouldSubmit = opts.mode === 'submit' && opts.autoSubmit;
    if (!shouldSubmit) {
      return { status: 'pending', logs: logs.join('\n') + '\nManual review: code pasted, NOT submitted (AUTO_SUBMIT=false or mode!=submit).', authenticated, autoSubmitted: false };
    }

    await page.locator('button:has-text("Submit")').first().click({ timeout: 10000 });
    log('Submit clicked; waiting for verdict…');
    // Verdict element with generous timeout + fallbacks
    const selectors = [
      'span[data-e2e-locator="submission-result"]',
      'div[data-e2e-locator="submission-result"]',
      'text=/Accepted|Wrong Answer|Runtime Error|Compile Error|Time Limit/i',
    ];
    let verdictText = '';
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        await el.waitFor({ timeout: 60000 });
        verdictText = (await el.textContent()) ?? '';
        if (verdictText.trim()) break;
      } catch {
        continue;
      }
    }
    if (!verdictText.trim()) {
      return { status: 'needs_attention', logs: logs.join('\n') + '\nSubmit clicked but no verdict detected within 60s.', authenticated, autoSubmitted: true };
    }
    const status = classifyVerdictText(verdictText);
    log(`Verdict: ${verdictText.trim()} → ${status}`);
    return { status, logs: logs.join('\n') + `\nVerdict raw: ${verdictText.trim()}`, authenticated, autoSubmitted: true };
  } finally {
    await context.close().catch(() => {});
  }
}

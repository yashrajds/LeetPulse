# LeetPulse — Daily LeetCode Automation Platform

End-to-end platform that fetches the LeetCode Daily Challenge, generates an AI-powered
solution in your language, and (optionally) drives a local Playwright browser to paste
and submit it — with scheduling, history tracking, and a developer dashboard.

## Architecture

```
┌────────────┐      ┌──────────────────────┐      ┌───────────────┐
│  Frontend  │─────▶│  Backend (Express)   │─────▶│  LeetCode GQL │
│ React+Vite │◀─────│  /api/*              │      │  service layer│
└────────────┘      │  ┌────────────────┐  │      └───────────────┘
                    │  │ Scheduler      │  │      ┌───────────────┐
                    │  │ (node-cron,    │──┼─────▶│  LLM provider │
                    │  │  Asia/Kolkata) │  │      │  OpenAI/Anth/ │
                    │  └────────────────┘  │      │  Gemini/Groq/ │
                    │  ┌────────────────┐  │      │  Ollama/Mock  │
                    │  │ Automation     │──┼─────▶└───────────────┘
                    │  │ (Playwright,   │  │      ┌───────────────┐
                    │  │  worker entry) │  │      │ SQLite (local)│
                    └──────────────────────┘      │ Firestore (prod)
                                                  └───────────────┘
```

* `backend/src/index.ts` — Express API server.
* `backend/src/worker.ts` — standalone entrypoint (`npm run worker`) that runs the
  scheduler + automation without serving HTTP. In-process scheduler is also started
  by the API server unless `DISABLE_SCHEDULER=true`.
* `backend/src/db/` — storage abstraction: `store.ts` (interface), `sqlite.ts`
  (local dev), `firestore.ts` (prod). Selected by `DB_PROVIDER`.
* `frontend/` — React dashboard (dark theme, sidebar, Monaco viewer).
* `firebase/` — Firestore security rules, composite indexes, emulator config.

## Quick start (Windows, PowerShell)

```powershell
# 1. Clone / open the folder
cd "C:\Users\hp\OneDrive\Desktop\New folder\P Projects\LeetPulse"

# 2. Copy env template
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env  # if present (single root .env is enough)

# 3. Install + run backend (API + scheduler)
cd backend
npm install
npm run dev        # http://localhost:4000, health at /api/health

# 4. In a second terminal, run the frontend
cd ..\frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api → :4000)

# 5. Optional: run worker standalone (scheduler + automation only, no HTTP)
cd ..\backend
npm run worker
```

Mock mode (no keys needed):

```powershell
# in .env
MOCK_MODE=true
AI_PROVIDER=mock
```

Then open the dashboard → **Run Now** → a sample problem + solution appears, no
network calls to LeetCode/OpenAI, no browser launched.

## Environment variables

See `.env.example` at repo root. All secrets stay server-side:

| Var | Purpose | Default |
|---|---|---|
| `PORT` | Backend HTTP port | `4000` |
| `DATABASE_PATH` | SQLite file (local dev) | `./data/leetpulse.db` |
| `DB_PROVIDER` | `sqlite` (local) or `firestore` (prod; auto if Firebase creds set) | `sqlite` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Firebase service-account JSON (prod) | — |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Alt. Firebase credentials (prod) | — |
| `AI_PROVIDER` | `openai\|anthropic\|gemini\|groq\|ollama\|mock` | `mock` |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` | Provider keys | — |
| `OLLAMA_BASE_URL`, `AI_MODEL` | Ollama / model override | `http://localhost:11434`, provider default |
| `MOCK_MODE` | Bypass LeetCode + AI + browser | `false` |
| `SCHEDULE_ENABLED` | Daily job toggle | `true` |
| `SCHEDULE_CRON` | Cron expression | `30 6 * * *` (06:30) |
| `SCHEDULE_TIMEZONE` | IANA timezone | `Asia/Kolkata` |
| `DEFAULT_LANGUAGE` | `python\|java\|cpp\|javascript` | `python` |
| `AUTO_SUBMIT` | **Opt-in** auto submit (default manual review) | `false` |
| `PLAYWRIGHT_HEADLESS` | `false` = visible browser for review | `false` |
| `PLAYWRIGHT_PROFILE_DIR` | Persistent browser profile (never commit) | `./data/pw-profile` |
| `API_TOKEN` | Optional shared secret for automation routes | — |

## AI provider setup

1. Pick `AI_PROVIDER` in `.env`.
2. Set the matching `*_API_KEY` (or run Ollama locally for `ollama`).
3. Optionally set `AI_MODEL` (e.g. `gpt-4o-mini`, `claude-3-5-sonnet-latest`,
   `gemini-1.5-flash`, `llama3.1:8b`, `moonshotai/kimi-k2-instruct` on Groq).
4. Restart backend. Dashboard → Settings shows the active provider.
5. Test with **Generate** on the Daily Challenge page. Failures are stored with
   the error message and a retry button — nothing is faked.

## Daily scheduling

* Default `30 6 * * *` in `Asia/Kolkata` (change `SCHEDULE_CRON` / `SCHEDULE_TIMEZONE`).
* Dashboard → Automation Settings: toggle enabled, edit cron/timezone, **Run Now**.
* `GET /api/automation/status` returns `lastRun`, `nextRun`, `running`, `enabled`.
* Overlap guard: a `scheduler_lock` row + in-memory flag prevent concurrent runs.
* Retries: transient fetch/AI errors retry 3× with exponential backoff.
* GitHub Actions (`.github/workflows/daily.yml`) is provided as an alternative
  trigger that calls `POST /api/automation/run` on your hosted backend.

## Safe browser automation (Playwright)

Passwords are **never** requested or stored. Flow:

```powershell
cd backend
npx playwright install chromium
```

1. Keep `AUTO_SUBMIT=false` (default) → code is pasted, you review & submit by hand.
2. Set `PLAYWRIGHT_HEADLESS=false` so you can see the browser.
3. First run: `POST /api/submissions/submit { "action": "open" }` or Dashboard →
   **Open problem** → log in to LeetCode manually in the opened window
   (solves CAPTCHA/human checks yourself). Session persists in
   `PLAYWRIGHT_PROFILE_DIR` (git-ignored, never sent to frontend).
4. Later runs reuse that profile — no re-login.
5. Only set `AUTO_SUBMIT=true` when you explicitly want unattended submits.
6. Result detection reads the submission verdict element
   (`Accepted`, `Wrong Answer`, `Runtime Error`, `Compile Error`, `Time Limit Exceeded`).
   Anything unrecognized is saved as `Failed`/`Needs Attention` — never reported as
   Accepted without confirmation. Timeouts save the failure reason + allow retry.

## API reference

| Method & path | Description |
|---|---|
| `GET /api/health` | Liveness |
| `GET /api/challenges/today` | Fetch (or return cached) daily challenge |
| `GET /api/challenges/history?limit=30` | Recent challenges |
| `POST /api/solutions/generate { date?, language?, regenerate? }` | Generate AI solution |
| `GET /api/solutions/:id` | Solution + problem + submissions |
| `GET /api/solutions?date=&language=` | List solutions |
| `POST /api/automation/run` | Trigger daily pipeline now |
| `GET /api/automation/status` | Scheduler status |
| `PATCH /api/automation/settings { scheduleEnabled?, cron?, timezone?, defaultLanguage?, aiProvider?, autoSubmit? }` | Update settings |
| `GET /api/submissions/history?limit=50` | Submission results |
| `POST /api/submissions/submit { solutionId, mode: "open"\|"paste"\|"submit" }` | Browser automation step |

All errors: `{ "error": { "code": "...", "message": "..." } }`.

## Database

* Local: SQLite (`better-sqlite3`) — zero setup, file in `data/` (git-ignored).
* Prod: Firebase Firestore — `backend/src/db/firestore.ts` implements the same
  `Store` interface, so swapping needs no code changes:
  1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
     (your GitHub-login Google account works), enable **Firestore Database**.
  2. Deploy rules + indexes: `firebase deploy --only firestore` from `firebase/`
     (or paste `firebase/firestore.rules` in the console Rules tab).
  3. Generate a service account key: Project Settings → Service accounts →
     Generate new private key. Set `GOOGLE_APPLICATION_CREDENTIALS` to its path
     (server only — never commit it), and `DB_PROVIDER=firestore`.
  4. Restart the backend; `GET /api/health` reports `"db": "firestore"`.
* Collections: `challenges` (doc id = `YYYY-MM-DD`), `solutions`,
  `automation_settings/global`, `executions`, `submissions`, `meta/scheduler_lock`.
* Security rules deny all direct client access — only the backend Admin SDK reads/writes.
  The frontend talks to the Express API, never to Firestore.
* Local Firestore emulator (optional): `firebase emulators:start --project demo-test`
  from `firebase/`, with `FIRESTORE_EMULATOR_HOST=localhost:8080`.

## Testing

```powershell
cd backend
npm test   # node:test — leetcode parse, AI validation, scheduler dedupe, API validation
```

`MOCK_MODE=true` lets you exercise the full pipeline without credentials.

## Deployment

* Frontend → Vercel (`frontend/` as root, build `npm run build`, output `dist`,
  set `VITE_API_URL` to backend URL).
* Backend/worker → Render / Fly / Railway / any persistent VM (Playwright needs a
  persistent host — plain serverless functions can't hold the browser profile or
  run cron reliably). Set env vars in the host dashboard, deploy `backend/`.

## Known limitations

* LeetCode has no official daily-challenge REST API; integration uses the public
  GraphQL endpoint (`leetcode.com/graphql`, query `dailyCodingChallenge`) behind
  `services/leetcode.ts`. If LeetCode changes markup/GQL, only that file needs updating.
* Verdict text scraping depends on LeetCode DOM (`span[data-e2e-locator="submission-result"]`
  with fallbacks). Unknown states → `Needs Attention`, never fake-Accepted.
* Headless auto-submit may hit CAPTCHA/rate limits — keep headed mode + manual review.
* SQLite is single-writer; Firestore (`DB_PROVIDER=firestore`) is provided for multi-instance prod.

## Scripts

| Location | Command | Purpose |
|---|---|---|
| `backend/` | `npm run dev` | API + scheduler (tsx watch) |
| `backend/` | `npm run build && npm start` | Prod API |
| `backend/` | `npm run worker` | Scheduler/worker only |
| `backend/` | `npm test` | Unit tests |
| `frontend/` | `npm run dev` | Vite dev |
| `frontend/` | `npm run build` | Prod build |

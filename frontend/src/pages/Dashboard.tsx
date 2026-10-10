import { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { api } from '../api';
import { Badge } from '../components';

const LANGS = ['python', 'java', 'cpp', 'javascript'];
const MONACO_LANG: Record<string, string> = { python: 'python', java: 'java', cpp: 'cpp', javascript: 'javascript' };

export function Dashboard({ notify }: { notify: (m: string, err?: boolean) => void }) {
  const [today, setToday] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [solution, setSolution] = useState<any>(null);
  const [lang, setLang] = useState('python');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([api.today(), api.status()]);
      setToday(t);
      setStatus(s);
      if (t) {
        try {
          const list = await api.solutions(`?date=${t.date}&language=${lang}`);
          setSolution(list[0] ?? null);
        } catch { setSolution(null); }
      }
    } catch (e) { notify((e as Error).message, true); }
    finally { setLoading(false); }
  }, [lang, notify]);

  useEffect(() => { refresh(); }, [refresh]);

  const act = async (label: string, fn: () => Promise<any>, onOk?: (d: any) => void) => {
    setBusy(label);
    try {
      const d = await fn();
      onOk?.(d);
      notify(`${label} — done`);
      await refresh();
    } catch (e) { notify(`${label} failed: ${(e as Error).message}`, true); }
    finally { setBusy(null); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2 space-y-4">
        <section className="rounded-xl border border-edge bg-panel p-5">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Today's challenge</p>
              <h2 className="text-xl font-semibold">{today?.title ?? (loading ? 'Loading…' : 'No challenge yet')}</h2>
            </div>
            {today && <Badge s={today.difficulty} />}
          </div>
          {today && (
            <>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{today.description?.slice(0, 1200)}</p>
              <div className="mt-3 space-y-2">
                {today.examples?.slice(0, 3).map((e: any, i: number) => (
                  <div key={i} className="rounded-lg border border-edge bg-base p-3 text-xs font-mono">
                    <div><span className="text-zinc-500">Input: </span>{e.input}</div>
                    <div><span className="text-zinc-500">Output: </span>{e.output}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                <span>{today.date}</span>·<a className="text-accent hover:underline" href={today.url} target="_blank" rel="noreferrer">Open on LeetCode ↗</a>
                {today.topics?.map((t: string) => <span key={t} className="rounded border border-edge px-1.5 py-0.5">{t}</span>)}
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-edge bg-panel p-5">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <h3 className="font-semibold">Generated solution</h3>
            <div className="flex items-center gap-2">
              <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-lg border border-edge bg-base px-2 py-1.5 text-sm">
                {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <button disabled={busy !== null} onClick={() => act('Generate', () => api.generate({ language: lang }), (d) => setSolution(d.solution))}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:brightness-110 transition">
                {busy === 'Generate' ? 'Working…' : solution ? 'Regenerate' : 'Generate'}</button>
            </div>
          </div>
          {!solution && <p className="mt-3 text-sm text-zinc-500">No solution for {lang} yet — click Generate.</p>}
          {solution && (
            <>
              <div className="mt-3 overflow-hidden rounded-lg border border-edge">
                <Editor height="320px" theme="vs-dark" language={MONACO_LANG[solution.language] ?? 'python'}
                  value={solution.code} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <Info label="Approach" v={solution.approach} />
                <Info label="Complexity" v={`${solution.time_complexity} time · ${solution.space_complexity} space`} />
              </div>
              <p className="mt-2 text-sm text-zinc-400">{solution.explanation}</p>
              <p className="mt-1 text-xs text-zinc-500">Edge cases: {solution.edge_cases}</p>
              <p className="mt-1 text-xs text-zinc-600">via {solution.ai_provider}/{solution.ai_model}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn label="Open problem" busy={busy} onClick={() => act('Open problem', () => api.submit({ solutionId: solution.id, mode: 'open' }))} />
                <Btn label="Paste code" busy={busy} onClick={() => act('Paste code', () => api.submit({ solutionId: solution.id, mode: 'paste' }))} />
                <Btn label={status?.autoSubmit ? 'Submit (auto enabled)' : 'Submit (needs AUTO_SUBMIT=true)'} busy={busy}
                  danger onClick={() => act('Submit', () => api.submit({ solutionId: solution.id, mode: 'submit' }))} />
                <Btn label="Retry generate" busy={busy} onClick={() => act('Retry generate', () => api.generate({ language: lang, regenerate: true }), (d) => setSolution(d.solution))} />
              </div>
            </>
          )}
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-edge bg-panel p-5">
          <h3 className="font-semibold">Automation status</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            <Row k="State" v={status?.running ? <Badge s="running" /> : status?.enabled ? <Badge s="pending" /> : <span className="text-zinc-500">paused</span>} />
            <Row k="Last run" v={status?.lastRunAt ?? '—'} />
            <Row k="Next run" v={status?.nextRunAt ?? '—'} />
            <Row k="Schedule" v={`${status?.cron ?? '—'} (${status?.timezone ?? ''})`} />
            <Row k="Auto-submit" v={status?.autoSubmit ? 'ON (opt-in)' : 'OFF (review first)'} />
            <Row k="Success runs" v={status?.stats?.successRuns ?? 0} />
            <Row k="Accepted streak" v={status?.stats?.streak ?? 0} />
          </div>
          <div className="mt-3 flex gap-2">
            <button disabled={busy !== null} onClick={() => act('Run Now', () => api.run({ language: lang }))}
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:brightness-110 transition">
              {busy === 'Run Now' ? 'Running…' : 'Run Now'}</button>
          </div>
        </section>
        <section className="rounded-xl border border-edge bg-panel p-5">
          <h3 className="font-semibold">Recent executions</h3>
          <div className="mt-2 space-y-1.5 text-xs">
            {(status?.stats?.recent ?? []).map((e: any) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-base px-2.5 py-1.5">
                <span className="text-zinc-400">#{e.id} {e.trigger} · {e.duration_ms ?? '?'}ms</span>
                <Badge s={e.status} />
              </div>
            ))}
            {(status?.stats?.recent ?? []).length === 0 && <p className="text-zinc-600">No runs yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ k, v }: any) {
  return <div className="flex items-center justify-between gap-3"><span className="text-zinc-500">{k}</span><span className="text-right">{v}</span></div>;
}
function Info({ label, v }: any) {
  return <div className="rounded-lg border border-edge bg-base p-2.5"><p className="text-xs text-zinc-500">{label}</p><p className="mt-0.5 text-[13px]">{v || '—'}</p></div>;
}
function Btn({ label, onClick, busy, danger }: any) {
  return <button disabled={busy !== null} onClick={onClick}
    className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${danger ? 'border-red-500/40 text-red-300 hover:bg-red-500/10' : 'border-edge text-zinc-200 hover:border-accent hover:text-white'}`}>
    {busy ? 'Working…' : label}</button>;
}

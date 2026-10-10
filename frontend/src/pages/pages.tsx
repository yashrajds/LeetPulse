import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge } from '../components';

export function Challenges({ notify }: { notify: (m: string, e?: boolean) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.history(30).then(setRows).catch((e) => notify(e.message, true));
  }, [notify]);
  if (!rows.length) return <Empty t="No challenges yet — run the pipeline first." />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((c) => (
        <div key={c.id} className="rounded-xl border border-edge bg-panel p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">{c.title}</h3>
            <Badge s={c.difficulty} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">{c.date} · {c.slug}</p>
          <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{c.description?.slice(0, 240)}…</p>
          <a href={c.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-accent hover:underline">Open ↗</a>
        </div>
      ))}
    </div>
  );
}

export function Solutions({ notify }: { notify: (m: string, e?: boolean) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.solutions().then((d) => setRows(d)).catch((e) => notify(e.message, true));
  }, [notify]);
  if (!rows.length) return <Empty t="No solutions yet." />;
  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-panel">
      {rows.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-2.5 text-sm last:border-0">
          <span className="font-mono text-xs text-zinc-500">#{s.id}</span>
          <span>{s.language}</span>
          <span className="text-zinc-500">{s.ai_provider}/{s.ai_model}</span>
          <span className="max-w-[420px] truncate font-mono text-xs text-zinc-400">{s.code?.split('\n')[0]}</span>
        </div>
      ))}
    </div>
  );
}

export function History({ notify }: { notify: (m: string, e?: boolean) => void }) {
  const [subs, setSubs] = useState<any[]>([]);
  const [execs, setExecs] = useState<any[]>([]);
  useEffect(() => {
    api.subHistory().then(setSubs).catch((e) => notify(e.message, true));
    api.executions().then(setExecs).catch(() => {});
  }, [notify]);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-edge bg-panel p-4">
        <h3 className="font-semibold">Submissions</h3>
        <div className="mt-2 space-y-1.5">
          {subs.map((s) => (
            <div key={s.id} className="rounded-lg border border-edge bg-base p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>{s.challenge_title ?? `#${s.challenge_id}`} · {s.language}</span>
                <Badge s={s.status} />
              </div>
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-zinc-500">{s.logs?.slice(0, 600)}</pre>
            </div>
          ))}
          {!subs.length && <p className="text-sm text-zinc-600">No submissions yet.</p>}
        </div>
      </section>
      <section className="rounded-xl border border-edge bg-panel p-4">
        <h3 className="font-semibold">Executions</h3>
        <div className="mt-2 space-y-1.5 text-sm">
          {execs.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-base px-3 py-2">
              <span className="text-zinc-400">#{e.id} · {e.trigger} · {e.duration_ms ?? '?'}ms {e.error ? `· ${e.error.slice(0, 80)}` : ''}</span>
              <Badge s={e.status} />
            </div>
          ))}
          {!execs.length && <p className="text-sm text-zinc-600">No executions yet.</p>}
        </div>
      </section>
    </div>
  );
}

export function Settings({ notify }: { notify: (m: string, e?: boolean) => void }) {
  const [s, setS] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    api.status().then((d) => { setS(d); setForm({ scheduleEnabled: d.enabled, cron: d.cron, timezone: d.timezone, defaultLanguage: d.defaultLanguage, aiProvider: d.aiProvider, autoSubmit: d.autoSubmit }); }).catch((e) => notify(e.message, true));
  }, [notify]);
  if (!s) return <Empty t="Loading settings…" />;
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const save = async () => {
    try { const d = await api.patchSettings(form); setS({ ...s, ...d, enabled: !!d.schedule_enabled }); notify('Settings saved'); }
    catch (e) { notify((e as Error).message, true); }
  };
  const inp = 'rounded-lg border border-edge bg-base px-2.5 py-1.5 text-sm w-full';
  return (
    <div className="max-w-2xl rounded-xl border border-edge bg-panel p-5 space-y-3">
      <h3 className="font-semibold">Automation settings</h3>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.scheduleEnabled} onChange={(e) => set('scheduleEnabled', e.target.checked)} /> Scheduled automation enabled</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Cron<input className={inp} value={form.cron ?? ''} onChange={(e) => set('cron', e.target.value)} /></label>
        <label className="text-sm">Timezone<input className={inp} value={form.timezone ?? ''} onChange={(e) => set('timezone', e.target.value)} /></label>
        <label className="text-sm">Default language
          <select className={inp} value={form.defaultLanguage ?? 'python'} onChange={(e) => set('defaultLanguage', e.target.value)}>
            {['python', 'java', 'cpp', 'javascript'].map((l) => <option key={l} value={l}>{l}</option>)}
          </select></label>
        <label className="text-sm">AI provider
          <select className={inp} value={form.aiProvider ?? 'mock'} onChange={(e) => set('aiProvider', e.target.value)}>
            {['mock', 'openai', 'anthropic', 'gemini', 'groq', 'ollama'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select></label>
      </div>
      <label className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={!!form.autoSubmit} onChange={(e) => set('autoSubmit', e.target.checked)} />
        <span><b>Automatic submission (opt-in).</b> Off by default — code is pasted for your review and only submitted when this is explicitly enabled.</span>
      </label>
      <div className="flex gap-2">
        <button onClick={save} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">Save</button>
        <input placeholder="API token (optional)" className={`${inp} max-w-56`} onChange={(e) => localStorage.setItem('lp_token', e.target.value)} />
      </div>
      <p className="text-xs text-zinc-600">Keys live only in backend .env. Provider switch takes effect on next generation. Cron example: "30 6 * * *" = 06:30 daily.</p>
    </div>
  );
}

function Empty({ t }: { t: string }) {
  return <div className="rounded-xl border border-dashed border-edge bg-panel p-10 text-center text-sm text-zinc-500">{t}</div>;
}

import { useEffect, useState } from 'react';
import './index.css';
import { api } from './api';
import { Dashboard } from './pages/Dashboard';
import { Challenges, Solutions, History, Settings } from './pages/pages';

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'challenges', label: 'Daily Challenge' },
  { id: 'solutions', label: 'Solutions' },
  { id: 'history', label: 'Submission History' },
  { id: 'settings', label: 'Automation Settings' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ m: string; e?: boolean } | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    api.health().then(() => setApiOk(true)).catch(() => setApiOk(false));
  }, []);

  const notify = (m: string, e?: boolean) => {
    setToast({ m, e });
    setTimeout(() => setToast(null), 4500);
  };

  return (
    <div className="min-h-screen bg-base text-zinc-100">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className={`fixed z-20 h-full w-60 shrink-0 border-r border-edge bg-panel p-4 transition-transform md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-bold text-white">L</div>
            <div><p className="font-semibold leading-none">LeetPulse</p><p className="text-xs text-zinc-500">daily automation</p></div>
          </div>
          <nav className="mt-6 space-y-1">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => { setTab(n.id); setOpen(false); }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === n.id ? 'bg-accent/15 text-white border border-accent/30' : 'text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent'}`}>
                {n.label}</button>
            ))}
          </nav>
          <p className="mt-6 px-1 text-[11px] leading-relaxed text-zinc-600">Review-before-submit by default. Auto-submit is opt-in. Secrets stay in backend .env.</p>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-10 border-b border-edge bg-base/90 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
              <button className="md:hidden rounded-lg border border-edge px-2.5 py-1.5" onClick={() => setOpen(!open)}>☰</button>
              <h1 className="text-sm font-medium text-zinc-300">{NAV.find((n) => n.id === tab)?.label}</h1>
              <span className="ml-auto hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
                <span className={`h-2 w-2 rounded-full ${apiOk === true ? 'bg-green-500' : apiOk === false ? 'bg-red-500' : 'bg-zinc-600'}`} />
                {apiOk === true ? 'API connected' : apiOk === false ? 'API unreachable — set VITE_API_URL' : 'API …'}
              </span>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-5">
            {tab === 'dashboard' && <Dashboard notify={notify} />}
            {tab === 'challenges' && <Challenges notify={notify} />}
            {tab === 'solutions' && <Solutions notify={notify} />}
            {tab === 'history' && <History notify={notify} />}
            {tab === 'settings' && <Settings notify={notify} />}
          </main>
        </div>
      </div>
      {toast && (
        <div className={`fixed bottom-4 right-4 max-w-sm rounded-xl border px-4 py-2.5 text-sm shadow-xl transition ${toast.e ? 'border-red-500/40 bg-[#1d1214] text-red-200' : 'border-edge bg-panel text-zinc-200'}`}>
          {toast.m}</div>
      )}
    </div>
  );
}

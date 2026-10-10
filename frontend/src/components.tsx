export function Badge({ s }: { s: string }) {
  const map: Record<string, string> = {
    accepted: 'bg-green-500/15 text-green-400 border-green-500/30',
    success: 'bg-green-500/15 text-green-400 border-green-500/30',
    failed: 'bg-red-500/15 text-red-400 border-red-500/30',
    running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    pending: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    needs_attention: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    Easy: 'bg-green-500/15 text-green-400 border-green-500/30',
    Medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    Hard: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  const cls = map[s] ?? map.pending;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {s.replace(/_/g, ' ')}
    </span>
  );
}

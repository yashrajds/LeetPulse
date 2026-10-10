const BASE = import.meta.env.VITE_API_URL ?? '';

async function req(path: string, init?: RequestInit) {
  const token = localStorage.getItem('lp_token') ?? '';
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json.data;
}

export const api = {
  health: () => req('/api/health'),
  today: () => req('/api/challenges/today'),
  history: (limit = 30) => req(`/api/challenges/history?limit=${limit}`),
  generate: (b: object) => req('/api/solutions/generate', { method: 'POST', body: JSON.stringify(b) }),
  solution: (id: number) => req(`/api/solutions/${id}`),
  solutions: (q = '') => req(`/api/solutions${q}`),
  run: (b: object = {}) => req('/api/automation/run', { method: 'POST', body: JSON.stringify(b) }),
  status: () => req('/api/automation/status'),
  executions: () => req('/api/automation/executions'),
  patchSettings: (b: object) => req('/api/automation/settings', { method: 'PATCH', body: JSON.stringify(b) }),
  subHistory: (limit = 50) => req(`/api/submissions/history?limit=${limit}`),
  submit: (b: object) => req('/api/submissions/submit', { method: 'POST', body: JSON.stringify(b) }),
};

export type Status = 'pending' | 'running' | 'accepted' | 'failed' | 'needs_attention' | 'success';

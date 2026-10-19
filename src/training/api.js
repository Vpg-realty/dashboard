// New-hire training in the browser (functions/api/training, edge/training.js).
import { useCallback, useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';

export const loadTraining = () => call('training');
export const postTraining = (body) => call('training', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// { data, err, busy, run(body) → result | null, reload }
export function useTraining() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => loadTraining().then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { reload(); }, [reload]);
  const run = useCallback(async (body) => {
    setBusy(true); setErr(null);
    try { const d = await postTraining(body); setData(d); return d; } catch (e) { setErr(e.message); return null; } finally { setBusy(false); }
  }, []);
  return { data, err, busy, run, reload, setErr };
}

// Best score per test step, and the attempts behind it.
export function testScores(attempts) {
  const by = {};
  for (const a of attempts || []) {
    const s = by[a.step] || (by[a.step] = { best: 0, tries: 0, last: null });
    s.tries++;
    s.best = Math.max(s.best, a.score);
    s.last = a;
  }
  return by;
}

// Score by topic: the best score of each test with that topic, averaged.
export function topicScores(program, attempts) {
  const best = testScores(attempts);
  const by = {};
  for (const s of program?.steps || []) {
    if (!s.topic || !best[s.id]) continue;
    (by[s.topic] || (by[s.topic] = [])).push(best[s.id].best);
  }
  return Object.entries(by).map(([topic, xs]) => ({ topic, score: xs.reduce((a, b) => a + b, 0) / xs.length }));
}

export const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export const scoreTone = (x, bar = 0.8) => (x == null ? 'bg-zinc-100 text-zinc-400' : x >= bar ? 'bg-emerald-50 text-emerald-700' : x >= bar - 0.15 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-[#B42318]');
export const KIND_LABEL = { paper: 'Paperwork', video: 'Video + test', test: 'Test', session: 'Live session', log: 'Daily log', signoff: 'Sign-off' };
export const TRAINEE_DOES = ['video', 'test', 'log'];

// A YouTube link → its video id.
export function youTubeId(url) {
  const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(String(url || ''));
  return m ? m[1] : null;
}

export const dayLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Phoenix' }) : '');

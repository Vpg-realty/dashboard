// Alerts in the browser (Luke, Oct 18): the red dot on the sidebar's Alerts
// entry and on the browser tab, the chime, and the page's data. The count is
// polled every minute (GET /api/alerts?count=1); the page loads the full list.
// The chime plays when the number of new alerts goes up while the site is
// open — each person turns it on or off for themself (stored in D1, so it
// follows them to any device). Never while viewing as someone.
import { useEffect, useState } from 'react';
import { call, viewingAs } from '../utils/dashApi.js';

const POLL_MS = 60_000;
let counts = null;     // { unseen, overdue, open }
let chime = true;
let data = null;       // the full GET
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({ counts, chime, data }));
let timer = null;
let off = false;      // the TC has no Alerts (Luke, Oct 28)
export const alertsOff = (v) => { off = !!v; };
let lastUnseen = null;
let lastDueNow = null;

function take(r) {
  if (r.counts) {
    // New alerts, or a task whose due time just came (Luke, Oct 22).
    const up = (lastUnseen != null && r.counts.unseen > lastUnseen) || (lastDueNow != null && (r.counts.dueNow || 0) > lastDueNow);
    if (up && chime && !viewingAs()) playChime();
    lastUnseen = r.counts.unseen;
    lastDueNow = r.counts.dueNow || 0;
    counts = r.counts;
  }
  if (typeof r.chime === 'boolean') chime = r.chime;
  if (r.alerts) data = r;
  emit();
  return r;
}

// A tab in the background doesn't ask (it asks again when it's looked at).
export const pollCount = () => (off ? Promise.resolve() : typeof document !== 'undefined' && document.hidden ? Promise.resolve() : call('alerts?count=1').then(take).catch(() => {}));
export const loadAlerts = () => (off ? Promise.resolve(null) : call('alerts').then(take));

const post = (body) => call('alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(take);
export const markSeen = () => post({ action: 'seen' });
export const setChime = (on) => { if (on) playChime(); return post({ action: 'chime', on }); };
export const alertAction = (body) => post(body);

function start() {
  if (timer) return;
  pollCount();
  timer = setInterval(pollCount, POLL_MS);
  window.addEventListener('focus', pollCount);
  document.addEventListener('visibilitychange', pollCount);
}

export function useAlerts() {
  const [s, set] = useState({ counts, chime, data });
  useEffect(() => {
    listeners.add(set);
    start();
    return () => listeners.delete(set);
  }, []);
  return s;
}

// Two soft notes (no sound file). Browsers only play sound after the person
// has clicked somewhere on the page; before that this does nothing.
let ctx = null;
export function playChime() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    [[880, 0], [1318.5, 0.14]].forEach(([f, d]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.18, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t + d);
      o.stop(t + d + 0.65);
    });
  } catch { /* no audio */ }
}

// The browser tab: "(3) Page · Valley Property Group" and a red dot on the
// icon while there are new alerts (Luke, Oct 18: "the website tab at the top
// also gets a red dot that matches").
let iconHref = null;
let iconDot = null;
export function tabBadge(n) {
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;
  if (iconHref == null) iconHref = link.getAttribute('href');
  if (!n) { link.setAttribute('href', iconHref); return; }
  if (iconDot) { link.setAttribute('href', iconDot); return; }
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 64, 64);
    g.beginPath();
    g.arc(48, 16, 15, 0, Math.PI * 2);
    g.fillStyle = '#e11d48';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#fff';
    g.stroke();
    iconDot = c.toDataURL('image/png');
    if (counts?.owe) link.setAttribute('href', iconDot);
  };
  img.src = iconHref;
}

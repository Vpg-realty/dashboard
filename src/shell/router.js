// A tiny router: real links for every page (/board/pipeline,
// /team/scorecard?rep=axel) so the back button works and a link or a
// notification opens the exact page. Cloudflare Pages serves index.html for
// any path, so deep links load straight in.
import { useEffect, useReducer } from 'react';

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const listeners = new Set();
const notify = () => { here = where(); listeners.forEach((f) => f()); };
const where = () => (typeof window === 'undefined' ? '' : window.location.pathname + window.location.search);
let here = where();

// A page with unsaved edits (the deal panel — Luke, Oct 15: warn before
// leaving unsaved changes) registers a guard: guard(proceed) returns true to
// hold the move and calls proceed() later if the person chooses to leave.
// Covers in-app page changes (navigate) and the browser's Back / Forward;
// a page reload or tab close is the page's own beforeunload.
let guard = null;
export function setLeaveGuard(fn) { guard = fn; return () => { if (guard === fn) guard = null; }; }

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const back = here;
    if (guard && guard(() => { guard = null; window.history.go(-1); })) {
      window.history.pushState({}, '', back); // stay put while the person decides
      return;
    }
    notify();
  });
}

export function navigate(to, { replace = false } = {}) {
  const url = `${BASE}${to.startsWith('/') ? to : `/${to}`}`;
  if (url === window.location.pathname + window.location.search) return;
  if (guard && guard(() => { guard = null; navigate(to, { replace }); })) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
  window.scrollTo(0, 0);
  notify();
}

export function useLocation() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
  const { pathname, search } = window.location;
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname;
  return { path, query: new URLSearchParams(search) };
}

// <a> that navigates in-app but still opens in a new tab on ⌘/ctrl-click.
export function linkProps(to) {
  return {
    href: `${BASE}${to}`,
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(to);
    },
  };
}

// Change some ?query values on the current page (null removes one), keeping
// the rest — for filters and pickers that should live in the link.
export function setQuery(patch, { replace = true } = {}) {
  const { pathname, search } = window.location;
  const q = new URLSearchParams(search);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') q.delete(k); else q.set(k, v);
  }
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname;
  const s = q.toString();
  const url = `${BASE}${path}${s ? `?${s}` : ''}`;
  if (url === pathname + search) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
  notify();
}

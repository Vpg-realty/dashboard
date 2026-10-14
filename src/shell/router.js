// A tiny router: real links for every page (/board/pipeline,
// /team/scorecard?rep=axel) so the back button works and a link or a
// notification opens the exact page. Cloudflare Pages serves index.html for
// any path, so deep links load straight in.
import { useEffect, useReducer } from 'react';

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const listeners = new Set();
const notify = () => listeners.forEach((f) => f());
if (typeof window !== 'undefined') window.addEventListener('popstate', notify);

export function navigate(to, { replace = false } = {}) {
  const url = `${BASE}${to.startsWith('/') ? to : `/${to}`}`;
  if (url === window.location.pathname + window.location.search) return;
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

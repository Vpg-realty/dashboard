// Settings layout A (Luke, Oct 16: "a for settings"): the navy band like
// Finance with the page's title, and a left rail of the settings pages
// grouped by what you're deciding (Team / Money / Tracker / Alerts — the
// `group`, `sub`, `title` and `blurb` of each tab in sections.js). AppShell
// wraps every Settings page in it instead of the usual top tabs.
import { linkProps } from '../shell/router.js';
import { titleCase } from '../shell/titleCase.js';

export default function SettingsFrame({ section, tab, children }) {
  const groups = [];
  for (const t of section.tabs) {
    const g = groups.find((x) => x.name === t.group);
    if (g) g.tabs.push(t); else groups.push({ name: t.group, tabs: [t] });
  }
  return (
    <div className="max-w-[1500px] mx-auto">
      <div className="rounded-2xl bg-navy-700 text-white px-6 py-5 mb-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Settings · {tab.label}</div>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight">{titleCase(tab.title || tab.label)}</h1>
        {tab.blurb && <p className="mt-1 text-[13.5px] text-white/75 max-w-[760px]">{tab.blurb}</p>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-5">
        <nav aria-label="Settings pages" className="lg:sticky lg:top-0 self-start flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          {groups.map((g) => (
            <div key={g.name} className="contents lg:flex lg:flex-col lg:gap-1">
              <div className="hidden lg:block px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{g.name}</div>
              {g.tabs.map((t) => {
                const on = t.id === tab.id;
                return (
                  <a key={t.id} {...linkProps(`/settings/${t.id}`)} aria-current={on ? 'page' : undefined}
                    className={`shrink-0 flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${on ? 'bg-navy-700 text-white shadow-sm' : 'text-navy-800 bg-white lg:bg-transparent ring-1 ring-tan-200 lg:ring-0 hover:bg-tan-100/70'}`}>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold whitespace-nowrap">{t.label}</span>
                      <span className={`hidden lg:block text-[12px] ${on ? 'text-white/70' : 'text-zinc-500'}`}>{t.sub}</span>
                    </span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

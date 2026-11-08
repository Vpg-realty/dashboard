// Settings › Backups (Luke, Nov 4: "a stored backup of every ghl sub account
// … weekly with daily contacts. message history is all of it, and owners
// only"). What the backup keeps and where: server/backup.js; the runner:
// scripts/backup-ghl.mjs; the files: GET /api/backups (owners only).
import { useEffect, useMemo, useState } from 'react';
import { loadBackups, backupUrl } from '../utils/dashApi.js';
import LowResponse from './LowResponse.jsx';
import { Section } from './ui.jsx';
import Tile from '../shell/Tile.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ym = (s) => (s ? `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : '—');
const day = (s) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' }) : '—');
const size = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

function Dl({ k, children }) {
  return <a href={backupUrl(k)} className="inline-flex items-center h-7 px-2.5 rounded-md ring-1 ring-inset ring-tan-300 text-navy-700 text-[12px] font-semibold hover:bg-tan-50 whitespace-nowrap">{children} ↓</a>;
}

export default function BackupsView() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { loadBackups().then(setD).catch((e) => setErr(e.message)); }, []);

  const m = useMemo(() => {
    if (!d) return null;
    const st = d.status || {};
    const locs = Object.keys(st.labels || {}).sort((a, b) => (st.labels[a] || '').localeCompare(st.labels[b] || ''));
    const by = {};
    const days = new Set();
    const weeks = new Set();
    let bytes = 0;
    for (const f of d.files) {
      bytes += f.size || 0;
      let x = /^backups\/contacts\/([\d-]+)\/(\w+)\.(csv|json)\.gz$/.exec(f.key);
      if (x) { days.add(x[1]); ((by[x[2]] ||= { contacts: {}, weekly: {}, months: {} }).contacts[x[1]] ||= {})[x[3]] = f.key; continue; }
      x = /^backups\/weekly\/([\d-]+)\/(\w+)\.json\.gz$/.exec(f.key);
      if (x) { weeks.add(x[1]); (by[x[2]] ||= { contacts: {}, weekly: {}, months: {} }).weekly[x[1]] = f.key; continue; }
      x = /^backups\/messages\/(\w+)\/([\d-]{7})-(texts|email)\.json\.gz$/.exec(f.key);
      if (x) ((by[x[1]] ||= { contacts: {}, weekly: {}, months: {} }).months[x[2]] ||= {})[x[3]] = f.key;
    }
    for (const l of Object.keys(by)) if (!locs.includes(l)) locs.push(l);
    const now = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }).slice(0, 7);
    const histDone = locs.filter((l) => st.msgs?.[l]?.done && (st.msgs[l].done >= now || nextM(st.msgs[l].done) >= now)).length;
    return { st, locs, by, days: [...days].sort().reverse(), weeks: [...weeks].sort().reverse(), bytes, histDone, label: (l) => st.labels?.[l] || st.names?.[l] || l };
  }, [d]);

  if (err) return <Section title="Backups"><p className="text-rose-700 text-[13.5px]">{err}</p></Section>;
  if (!m) return <Section title="Backups"><p className="text-zinc-500 text-[13.5px]">Loading…</p></Section>;
  const { st, locs, by } = m;
  const errors = Object.values(st.errors || {});

  return (
    <div className="flex flex-col gap-5">
      <LowResponse />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile label="Contacts · Daily" dot="navy" value={st.lastContacts ? day(st.lastContacts.day) : 'Not yet'} sub={st.contacts ? `${st.contacts.done.length} of ${locs.length} sub-accounts today` : 'Starts with the next deploy'} />
        <Tile label="Weekly Copy" dot="tan" value={st.lastWeekly ? `Week of ${day(st.lastWeekly.week).replace(/, \d{4}$/, '')}` : 'Not yet'} sub={st.weekly ? `${st.weekly.done.length} of ${locs.length} sub-accounts this week` : 'Runs once a week'} />
        <Tile label="Message History" dot={m.histDone >= locs.length && locs.length ? 'green' : 'amber'} value={`${m.histDone} of ${locs.length}`} sub="sub-accounts with every month saved" />
        <Tile label="Storage Used" dot="grey" value={size(m.bytes)} sub={`${num(d.files.length)} files · 10 GB included in the plan`} />
      </div>

      {errors.length > 0 && (
        <Section title="Needs a Look">
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {errors.map((e) => <li key={`${e.loc}${e.what}`}><b className="text-navy-800">{m.label(e.loc)}</b> · {e.what} — <span className="text-rose-700">{e.msg}</span> <span className="text-zinc-400">({when(e.at)})</span></li>)}
          </ul>
          <p className="text-zinc-500 text-[12.5px] mt-2">Each one is tried again on its next turn (contacts tomorrow, the weekly copy next week, message history on the next deploy).</p>
        </Section>
      )}

      <Section title="By Sub-Account" sub="The newest copy of each. Downloads open as a spreadsheet (contacts) or a JSON file. Message history is one file per month — texts and calls in one, email in the other.">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-zinc-500 border-b border-tan-200">
                <th className="font-medium px-5 py-2">Sub-account</th>
                <th className="font-medium px-3 py-2">Contacts</th>
                <th className="font-medium px-3 py-2">Weekly copy</th>
                <th className="font-medium px-3 py-2">Message history</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {locs.map((l) => {
                const b = by[l] || { contacts: {}, weekly: {}, months: {} };
                const lastDay = Object.keys(b.contacts).sort().pop();
                const lastWeek = Object.keys(b.weekly).sort().pop();
                const months = Object.keys(b.months).sort();
                const h = st.msgs?.[l] || {};
                const isOpen = open === l;
                return [
                  <tr key={l} className="border-b border-tan-100 align-top">
                    <td className="px-5 py-2.5"><div className="font-semibold text-navy-800">{m.label(l)}</div>{st.names?.[l] && st.names[l] !== m.label(l) && <div className="text-[11.5px] text-zinc-400">{st.names[l]}</div>}</td>
                    <td className="px-3 py-2.5">
                      {lastDay ? <div className="flex flex-wrap items-center gap-1.5"><span className="text-zinc-600 mr-1">{day(lastDay)} · {num(st.lastContacts?.counts?.[l] ?? st.contacts?.counts?.[l])}</span>{b.contacts[lastDay].csv && <Dl k={b.contacts[lastDay].csv}>CSV</Dl>}{b.contacts[lastDay].json && <Dl k={b.contacts[lastDay].json}>JSON</Dl>}</div> : <span className="text-zinc-400">Not yet</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {lastWeek ? <div className="flex items-center gap-1.5"><span className="text-zinc-600 mr-1">{day(lastWeek)}</span><Dl k={b.weekly[lastWeek]}>JSON</Dl></div> : <span className="text-zinc-400">Not yet</span>}
                      {st.lastWeekly?.counts?.[l]?.missing && <div className="text-[11.5px] text-amber-700 mt-1">GHL refused: {st.lastWeekly.counts[l].missing.join(', ')}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600">
                      {months.length ? <>{ym(months[0])} → {ym(months[months.length - 1])}<div className="text-[11.5px] text-zinc-400">{num(h.count)} messages in finished months{h.done && nextM(h.done) < curMonth() ? ` · filling in, saved through ${ym(h.done)}` : ''}</div></> : h.first ? `Starting at ${ym(h.first)}` : <span className="text-zinc-400">Not yet</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right">{months.length > 0 && <button type="button" onClick={() => setOpen(isOpen ? null : l)} className="text-[12.5px] font-semibold text-navy-700 hover:underline">{isOpen ? 'Hide months' : 'Months ▸'}</button>}</td>
                  </tr>,
                  isOpen && (
                    <tr key={`${l}-m`} className="border-b border-tan-100 bg-tan-50/60">
                      <td colSpan={5} className="px-5 py-3">
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
                          {months.slice().reverse().map((mo) => (
                            <div key={mo} className="flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-tan-200 px-2.5 py-1.5">
                              <span className="font-semibold text-navy-800 text-[12.5px] w-[70px]">{ym(mo)}</span>
                              {b.months[mo].texts && <Dl k={b.months[mo].texts}>Texts & calls</Dl>}
                              {b.months[mo].email && <Dl k={b.months[mo].email}>Email</Dl>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Earlier Copies" sub="Daily contacts are kept 14 days; weekly copies 8 weeks, plus the first of each month for a year. Message history is never removed.">
        <div className="grid md:grid-cols-2 gap-5">
          <Older title="Contacts by day" dates={m.days} locs={locs} label={m.label} files={(dt, l) => by[l]?.contacts?.[dt]} />
          <Older title="Weekly copies" dates={m.weeks} locs={locs} label={m.label} files={(dt, l) => (by[l]?.weekly?.[dt] ? { json: by[l].weekly[dt] } : null)} />
        </div>
      </Section>

      <Section title="What's in the Backup">
        <ul className="list-disc pl-5 text-[13px] text-zinc-700 flex flex-col gap-1">
          <li><b>Every day:</b> every contact — fields, tags, custom fields, DND — as a spreadsheet and a JSON file.</li>
          <li><b>Every week:</b> opportunities with their notes, pipelines, users, custom fields and values, tags, calendars, phone numbers, tasks, forms, surveys, trigger links and the list of automations.</li>
          <li><b>All message history:</b> every text, call log and email from each sub-account's first message on, a file per month.</li>
          <li><b>Not included:</b> automation builds (GHL doesn't give their steps to our sub-accounts yet — names and status only), contact notes, calendar appointments, call recordings and attachments (the messages keep their links). Only sub-accounts the site has a key for are backed up.</li>
          <li>Last run {when(st.at)}. It works a few minutes per deploy and picks up where it left off.</li>
        </ul>
      </Section>
    </div>
  );
}

function nextM(s) { const [y, mo] = s.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; }
function curMonth() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }).slice(0, 7); }

function Older({ title, dates, locs, label, files }) {
  const [pick, setPick] = useState(null);
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-tan-700 mb-2">{title}</div>
      {!dates.length ? <p className="text-zinc-400 text-[13px]">None yet.</p> : (
        <div className="flex flex-col gap-1.5">
          {dates.map((dt) => (
            <div key={dt} className="rounded-lg ring-1 ring-tan-200">
              <button type="button" onClick={() => setPick(pick === dt ? null : dt)} className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] font-semibold text-navy-800">
                <span>{day(dt)}</span><span className="text-zinc-400 font-normal">{pick === dt ? '▾' : '▸'}</span>
              </button>
              {pick === dt && (
                <div className="px-3 pb-2 flex flex-col gap-1">
                  {locs.map((l) => { const f = files(dt, l); return f && (
                    <div key={l} className="flex items-center gap-1.5 text-[12.5px]"><span className="flex-1 min-w-0 truncate text-zinc-700">{label(l)}</span>{f.csv && <Dl k={f.csv}>CSV</Dl>}{f.json && <Dl k={f.json}>JSON</Dl>}</div>
                  ); })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Loads month-log.json (server/monthLog.js) once per view mount.
import { useEffect, useState } from 'react';

const LOG_URL = `${import.meta.env.BASE_URL || '/'}month-log.json`;

export default function useMonthLog() {
  const [log, setLog] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(`${LOG_URL}?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setLog(d && d.v === 1 ? d : null); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return log;
}

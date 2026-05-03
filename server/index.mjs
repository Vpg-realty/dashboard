// VPG dashboard local server.
//
// One process. Serves the React build (../dist) and exposes /api/snapshot,
// which aggregates every (rep × market) sub-account by calling GHL with the
// PIT tokens kept on this machine. Tokens never reach the browser.
//
// Run on the office TV's machine:
//   npm run build && node server/index.mjs
// or use `npm start` which does both.
//
// Required env (from .env at repo root, or shell env):
//   GHL_TOKENS    JSON string mapping locationId → PIT token, e.g.
//                 {"abc123":"pit_xxx","def456":"pit_yyy"}
//   PORT          (optional, default 3000)
//   SNAPSHOT_TTL_SECONDS (optional, default 15) — in-memory cache TTL.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSnapshot, parseTokens, countConfigured, VERSION } from './snapshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 3000);
const TTL_MS = Number(process.env.SNAPSHOT_TTL_SECONDS || 15) * 1000;

// Load .env at repo root if present (no dotenv dep — keep stack tiny).
loadDotEnv(path.resolve(__dirname, '..', '.env'));

const tokens = parseTokens(process.env.GHL_TOKENS);
console.log(`[vpg] ${countConfigured(tokens)} sub-account(s) configured`);

// In-memory snapshot cache so concurrent browser tabs share one GHL fetch.
let cached = null;        // { body, expiresAt }
let inFlight = null;      // Promise resolving to { body, expiresAt }

async function getSnapshot() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const snap = await buildSnapshot({ tokens });
    const body = JSON.stringify(snap);
    cached = { body, expiresAt: Date.now() + TTL_MS };
    inFlight = null;
    return cached;
  })();
  return inFlight;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        version: VERSION,
        configuredCount: countConfigured(tokens),
      });
    }

    if (url.pathname === '/api/snapshot') {
      const { body } = await getSnapshot();
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=${Math.floor(TTL_MS / 1000)}`,
      });
      res.end(body);
      return;
    }

    // Static files from dist/.
    return serveStatic(res, url.pathname);
  } catch (err) {
    console.error('[vpg] request error:', err);
    sendJson(res, 500, { error: 'internal' });
  }
});

server.listen(PORT, () => {
  console.log(`[vpg] dashboard live on http://localhost:${PORT}`);
});

// --- helpers -------------------------------------------------------------

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function serveStatic(res, pathname) {
  let filePath = path.join(DIST, pathname);
  // Prevent path traversal.
  if (!filePath.startsWith(DIST)) return sendJson(res, 403, { error: 'forbidden' });

  fs.stat(filePath, (err, stat) => {
    if (err || stat.isDirectory()) {
      // SPA fallback: serve index.html for any unknown path.
      filePath = path.join(DIST, 'index.html');
    }
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        return sendJson(res, 404, { error: 'not_found' });
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding quotes.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// Who is asking — for the dashboard's server functions (functions/api/*),
// which run on Cloudflare Pages behind the "VPG Dashboard" Access app.
//
// Access puts a signed token (JWT) on every request it lets through
// (Cf-Access-Jwt-Assertion header, also the CF_Authorization cookie). We
// check its signature against the team's public keys and that it was issued
// for this app, then look the email up in the D1 `users` table for the role:
// owner (Luke, Jack), manager (Anthony, Sam), team, tv. Never trust a plain
// email header — only a verified token.

const TEAM = 'https://tiny-base-e88a.cloudflareaccess.com';
// The "VPG Dashboard" Access application's audience tag.
const AUD = '69759997fd99e0e2973272d5b749eb9bfcae946bb9513b4f54362215c04807ef';

let jwks = null;
let jwksAt = 0;
async function keys(force = false) {
  if (!jwks || force || Date.now() - jwksAt > 3600_000) {
    const r = await fetch(`${TEAM}/cdn-cgi/access/certs`);
    if (!r.ok) throw new Error(`Access certs ${r.status}`);
    jwks = (await r.json()).keys || [];
    jwksAt = Date.now();
  }
  return jwks;
}

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const parse = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

function tokenFrom(request) {
  const h = request.headers.get('Cf-Access-Jwt-Assertion');
  if (h) return h;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('Cookie') || '');
  return m ? m[1] : null;
}

// The verified token's claims on the request, or null. A person's token has
// `email`; the build's service token ("dashboard-build") has `common_name`
// (its client id) and no email.
export async function verifiedClaims(request) {
  const token = tokenFrom(request);
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  try {
    const header = parse(h);
    const payload = parse(p);
    let jwk = (await keys()).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await keys(true)).find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== 'RS256') return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(AUD) || payload.iss !== TEAM) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// { email, name, role } for the signed-in person; role 'none' if they got
// past Access but aren't in the users table; role 'service' for the build's
// service token. null = not signed in.
// DEV_EMAIL is for `wrangler pages dev` on a laptop only — it is never set
// on the live site.
export async function currentUser({ request, env }) {
  const claims = await verifiedClaims(request);
  if (claims && !claims.email && typeof claims.common_name === 'string' && claims.common_name) {
    return { email: null, name: 'build', role: 'service' };
  }
  const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : (env.DEV_EMAIL ? String(env.DEV_EMAIL).toLowerCase() : null);
  if (!email) return null;
  const row = await env.DB.prepare('SELECT email, name, role FROM users WHERE email = ?').bind(email).first();
  return row || { email, name: email, role: 'none' };
}

export const canGrade = (u) => !!u && (u.role === 'owner' || u.role === 'manager');
// Manager-level data files: owners, managers, and the build (which reads its
// own previous files back).
export const canSeeManagerData = (u) => canGrade(u) || u?.role === 'service';

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

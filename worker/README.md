# vpg-dashboard-api Worker

A tiny Cloudflare Worker that holds the GitHub PAT server-side so the
dashboard browser never touches it. Replaces the previous "paste a PAT in
your localStorage" flow — now whoever loads the dashboard (Ram's Mac,
Luke's office TV, anyone) can add sub-accounts and the Worker handles the
GitHub write on their behalf.

## One-time setup

1. **Create a fine-grained PAT** at <https://github.com/settings/personal-access-tokens/new>:
   - Resource owner: `Vpg-realty` (the org)
   - Repository access: only `Vpg-realty/dashboard`
   - Permissions: Contents R/W, Secrets R/W, Actions R/W, Workflows R/W
   - Copy the token (`github_pat_...`)

2. **Generate a random shared key** (any UUID works):
   ```sh
   openssl rand -hex 32   # or use any password generator
   ```

3. **Install wrangler + log in**:
   ```sh
   cd worker
   npm install
   npx wrangler login
   ```

4. **Set the secrets**:
   ```sh
   npx wrangler secret put GITHUB_PAT   # paste the PAT from step 1
   npx wrangler secret put SHARED_KEY   # paste the random key from step 2
   ```

5. **Deploy**:
   ```sh
   npx wrangler deploy
   ```
   Wrangler will print a URL like
   `https://vpg-dashboard-api.<your-subdomain>.workers.dev`. Copy it.

6. **Wire the dashboard to the Worker** by adding two GitHub Actions
   secrets to `Vpg-realty/dashboard` (Settings → Secrets and variables →
   Actions):
   - `VITE_WORKER_URL` — the URL from step 5
   - `VITE_WORKER_KEY` — the same value as `SHARED_KEY` from step 2

7. **Trigger a deploy** of the dashboard so the new env vars get baked
   into the bundle. From the dashboard repo:
   ```sh
   gh workflow run deploy.yml
   ```

After that any browser hitting the dashboard can use the **+ Add
Sub-Account** button without configuring anything — the Worker is the
trusted intermediary.

## Rotating credentials

- **GitHub PAT**: regenerate at the same URL, then `npx wrangler secret put GITHUB_PAT`.
- **Shared key**: rotate by `npx wrangler secret put SHARED_KEY` AND
  updating the `VITE_WORKER_KEY` GitHub Actions secret to match, then
  re-deploy the dashboard.

## Endpoints

- `GET  /health` — liveness check, returns `{ ok, version, allowedOrigins }`.
- `POST /add-subaccount` — body: `{ repId, repName?, repColor?, marketId,
  marketName?, marketColor?, locationId, pitToken }`. Auth: `X-Shared-Key`
  header matching `SHARED_KEY` + `Origin` matching the dashboard.

## Tail logs

```sh
npx wrangler tail   # streams live request logs
```

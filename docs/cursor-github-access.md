# GitHub access for AXON ↔ NI portal automation

Cloud agents push as **`cursor[bot]`**. That account can write to repos where the **Cursor GitHub App** (or a PAT) has **Contents: Read & write**.

Today:

| Repo | Cloud agent push |
|------|------------------|
| `northsideventuresllc-sketch/AXON` | ✅ Works |
| `northsideventuresllc-sketch/northside-intelligence` | ❌ `403` until access is granted |

## Option A — Cursor GitHub App (for Cloud Agents)

Do this so **Cursor Cloud Agents** can commit and push to the NI portal repo directly.

1. Open GitHub → **Settings** → **Applications** → **Installed GitHub Apps** → **Cursor** → **Configure**  
   Or org: `https://github.com/organizations/northsideventuresllc-sketch/settings/installations`
2. Under **Repository access**, ensure **`northside-intelligence`** is included (or use **All repositories**).
3. Confirm permissions include **Contents: Read and write** (and **Pull requests: Read and write** if agents should open PRs).
4. Save, then re-run the Cloud Agent.

Verify from a new agent run:

```bash
git push origin HEAD:cursor/test-access
```

## Option B — Invite `cursor[bot]` as collaborator

1. Open `https://github.com/northsideventuresllc-sketch/northside-intelligence/settings/access`
2. **Add people** → invite **`cursor[bot]`**
3. Role: **Write**
4. Accept the invite (if GitHub prompts on the Cursor app side).

## Option C — GitHub Actions sync (recommended for CI)

Automated sync when AXON UI changes on `main` — no Cloud Agent push required.

### 1. Create a fine-grained PAT

1. GitHub → **Settings** → **Developer settings** → **Fine-grained tokens** → **Generate**
2. Resource owner: `northsideventuresllc-sketch`
3. Repository access: **Only `northside-intelligence`**
4. Permissions: **Contents → Read and write**
5. Generate and copy the token.

### 2. Add secret to AXON repo

1. `https://github.com/northsideventuresllc-sketch/AXON/settings/secrets/actions`
2. **New repository secret**
3. Name: `NI_GITHUB_PAT`
4. Value: the PAT from step 1

### 3. Run sync

- **Automatic:** push AXON UI changes to `main` → workflow **Sync AXON UI to NI Portal** runs.
- **Manual:** Actions → **Sync AXON UI to NI Portal** → **Run workflow**.

This commits to `northside-intelligence` `main` and triggers the normal Vercel production deploy.

## One-time: align git with current production

Production was updated via Vercel CLI before `main` had the sync. After Option A or C is configured, run the sync workflow once (or merge the pending portal sync) so GitHub matches what is live.

```bash
# From AXON repo locally:
node scripts/sync-portal-ui.mjs ../northside-intelligence
cd ../northside-intelligence && git add -A && git commit -m "chore(axon): sync embedded UI from AXON repo"
git push origin main
```

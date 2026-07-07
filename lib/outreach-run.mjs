const GITHUB_API = 'https://api.github.com';
const REPO = 'northsideventuresllc-sketch/AXON';
const WORKFLOW_FILE = 'axon-ni-outreach.yml';

function getGithubToken() {
  return (
    process.env.AXON_GITHUB_PAT ||
    process.env.GITHUB_PAT ||
    process.env.NI_GITHUB_PAT ||
    ''
  );
}

function clampMax(max) {
  const n = Number.parseInt(String(max ?? 3), 10);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(15, n);
}

/**
 * Trigger AXON NI Outreach GitHub Actions workflow.
 */
export async function dispatchOutreachRun({ max = 3 } = {}) {
  const token = getGithubToken();
  if (!token) {
    throw new Error(
      'GitHub PAT not configured. Set AXON_GITHUB_PAT (actions:write on AXON repo) to enable Generate Leads.'
    );
  }

  const maxStr = String(clampMax(max));

  const res = await fetch(
    `${GITHUB_API}/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { max: maxStr },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`GitHub workflow dispatch failed (${res.status}): ${detail.slice(0, 240)}`);
  }

  return {
    ok: true,
    max: Number(maxStr),
    actionsUrl: `https://github.com/${REPO}/actions/workflows/${WORKFLOW_FILE}`,
  };
}

/** Latest workflow run for UI status (best-effort). */
export async function fetchLatestOutreachRun() {
  const token = getGithubToken();
  if (!token) return { configured: false, run: null };

  const res = await fetch(
    `${GITHUB_API}/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!res.ok) return { configured: true, run: null };

  const data = await res.json();
  const run = data.workflow_runs?.[0];
  if (!run) return { configured: true, run: null };

  return {
    configured: true,
    run: {
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.html_url,
      createdAt: run.created_at,
      event: run.event,
    },
  };
}

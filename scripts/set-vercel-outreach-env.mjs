#!/usr/bin/env node
/**
 * One-shot: upsert AXON_GITHUB_PAT (+ GITHUB_PAT fallback) on Vercel projects.
 * Usage: VERCEL_TOKEN=... GITHUB_PAT=... node scripts/set-vercel-outreach-env.mjs
 */
const TEAM_ID = 'team_dD8iOW15WOUr27k3QeswFBac';
const PROJECTS = ['workspace', 'northside-intelligence'];
const KEYS = ['AXON_GITHUB_PAT', 'GITHUB_PAT'];

const vercelToken = process.env.VERCEL_TOKEN;
const githubPat = process.env.GITHUB_PAT || process.env.AXON_GITHUB_PAT;

if (!vercelToken || !githubPat) {
  console.error('Missing VERCEL_TOKEN or GITHUB_PAT');
  process.exit(1);
}

async function upsertEnv(project, key, value) {
  const url = `https://api.vercel.com/v10/projects/${project}/env?upsert=true&teamId=${TEAM_ID}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key,
      value,
      type: 'encrypted',
      target: ['production', 'preview', 'development'],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${project}/${key}: ${res.status} ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function redeploy(project, repo, ref = 'main') {
  const url = `https://api.vercel.com/v13/deployments?teamId=${TEAM_ID}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: project,
      target: 'production',
      gitSource: {
        type: 'github',
        org: 'northsideventuresllc-sketch',
        repo,
        ref,
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`redeploy ${project}: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = JSON.parse(text);
  return data.url || data.id;
}

async function main() {
  for (const project of PROJECTS) {
    for (const key of KEYS) {
      await upsertEnv(project, key, githubPat);
      console.log(`✓ ${project} · ${key}`);
    }
  }

  const axonDeploy = await redeploy('workspace', 'AXON');
  console.log(`✓ redeploy workspace → ${axonDeploy}`);

  const niDeploy = await redeploy('northside-intelligence', 'northside-intelligence');
  console.log(`✓ redeploy northside-intelligence → ${niDeploy}`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});

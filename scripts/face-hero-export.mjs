#!/usr/bin/env node
/**
 * THE FACE — marketing hero export.
 *
 * Records a short 1920x1080 clip of the orb (resting, then working) for marketing use,
 * plus a still frame of the working state. No new project dependency: Playwright is not
 * in package.json — this script resolves the globally-installed CLI package instead
 * (same binary `npx playwright` already reports as installed in this environment) so the
 * repo's dependency list stays untouched.
 *
 * Usage:
 *   node scripts/face-hero-export.mjs [--out docs/the-face/hero-export] [--seconds 8]
 *                                      [--port 3123] [--rest-seconds 4]
 *
 * Requires:
 *   - `npx next dev -p <port>` startable from this repo (the script starts/stops it)
 *   - PLAYWRIGHT_BROWSERS_PATH pointed at a chromium install (defaults to /opt/pw-browsers)
 *   - AXON_DASHBOARD_SECRET set in the environment this script runs in (falls back to
 *     'review-only-local' for a local/dev export run only — never use that value in prod)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, statSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXON_ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const out = { out: 'docs/the-face/hero-export', seconds: 8, restSeconds: 4, port: 3123 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--seconds') out.seconds = Number(argv[++i]);
    else if (a === '--rest-seconds') out.restSeconds = Number(argv[++i]);
    else if (a === '--port') out.port = Number(argv[++i]);
  }
  return out;
}

/**
 * Resolve the `playwright` package whether or not it is a project dependency.
 * The project-local module shape is the normal `{ chromium, firefox, webkit }` named
 * exports; the globally-installed CLI package (this environment's actual location, since
 * playwright is not in package.json here) puts that same object behind a `default` export
 * instead — normalize both to the same shape.
 */
async function loadPlaywright() {
  const candidates = [
    () => import('playwright'),
    () => import(pathToFileURL('/opt/node22/lib/node_modules/playwright/index.js').href),
  ];
  let lastErr;
  for (const load of candidates) {
    try {
      const mod = await load();
      return mod.chromium ? mod : mod.default;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Could not resolve the 'playwright' package from any known location: ${lastErr}`);
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { redirect: 'manual' });
        if (res.status < 500) return resolvePromise();
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) return reject(new Error(`Server did not come up at ${url} in time`));
      setTimeout(tick, 500);
    };
    tick();
  });
}

async function main() {
  const { out, seconds, restSeconds, port } = parseArgs(process.argv.slice(2));
  const outDir = resolve(AXON_ROOT, out);
  mkdirSync(outDir, { recursive: true });

  const dashboardSecret = process.env.AXON_DASHBOARD_SECRET || 'review-only-local';
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`[face-hero-export] starting next dev on port ${port}...`);
  const devEnv = { ...process.env, AXON_DASHBOARD_SECRET: dashboardSecret };
  const dev = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: AXON_ROOT,
    env: devEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let devOutput = '';
  dev.stdout.on('data', (d) => (devOutput += d.toString()));
  dev.stderr.on('data', (d) => (devOutput += d.toString()));

  const cleanup = () => {
    if (!dev.killed) dev.kill('SIGTERM');
  };
  process.on('exit', cleanup);

  try {
    await waitForServer(baseUrl, 60_000);
    console.log('[face-hero-export] server is up.');

    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch();

    // Log in first (no video) so the recorded context starts already authenticated —
    // recording the login screen itself is not the marketing shot.
    const loginContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const loginPage = await loginContext.newPage();
    const loginRes = await loginContext.request.post(`${baseUrl}/api/auth/login`, {
      data: { email: 'hero-export@northsideventuresllc.com', password: dashboardSecret },
    });
    if (!loginRes.ok()) {
      throw new Error(`Login failed: ${loginRes.status()} ${await loginRes.text()}`);
    }
    const storageState = await loginContext.storageState();
    await loginPage.close();
    await loginContext.close();

    const videoDir = join(outDir, '.video-tmp');
    mkdirSync(videoDir, { recursive: true });

    const recordContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      storageState,
      recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
    });
    const page = await recordContext.newPage();

    // 'load' rather than 'networkidle': the page polls its summary/activity routes on an
    // interval (see docs/the-face/SPEC.md), so the network is never idle for long once it
    // is up — 'networkidle' would just time out waiting for a quiet moment that never comes.
    console.log(`[face-hero-export] resting state for ~${restSeconds}s...`);
    await page.goto(`${baseUrl}/?working=0`, { waitUntil: 'load' });
    await page.waitForTimeout(restSeconds * 1000);

    console.log(`[face-hero-export] working state for ~${seconds}s...`);
    await page.goto(`${baseUrl}/?working=1`, { waitUntil: 'load' });
    await page.waitForTimeout(500); // let the orb settle into the working pulse
    const stillPath = join(outDir, 'orb-hero-1080p.png');
    await page.screenshot({ path: stillPath });
    await page.waitForTimeout(Math.max(0, seconds * 1000 - 500));

    const video = page.video();
    await page.close();
    await recordContext.close();
    await browser.close();

    const videoPath = video ? await video.path() : null;
    const finalVideoPath = join(outDir, 'orb-hero-1080p.webm');
    // video.path() can resolve slightly before the file is fully flushed to disk in this
    // environment, so poll briefly rather than failing on the very first check.
    let found = false;
    if (videoPath) {
      for (let i = 0; i < 20; i++) {
        if (existsSync(videoPath) && statSync(videoPath).size > 0) {
          found = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    if (found) {
      renameSync(videoPath, finalVideoPath);
    } else {
      throw new Error(`Playwright did not produce a video file (looked for ${videoPath}).`);
    }

    const videoSize = statSync(finalVideoPath).size;
    const stillSize = statSync(stillPath).size;
    console.log(`[face-hero-export] video: ${finalVideoPath} (${(videoSize / 1e6).toFixed(2)} MB)`);
    console.log(`[face-hero-export] still: ${stillPath} (${(stillSize / 1e3).toFixed(0)} KB)`);

    if (videoSize > 15 * 1024 * 1024) {
      throw new Error(
        `Video is ${(videoSize / 1e6).toFixed(2)} MB, over the 15 MB commit limit. Re-run with fewer --seconds.`,
      );
    }
  } catch (err) {
    console.error('[face-hero-export] failed:', err?.message || err);
    console.error(devOutput.slice(-4000));
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main();

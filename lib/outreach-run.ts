import { dispatchOutreachRun, fetchLatestOutreachRun } from './outreach-run.mjs';

export interface OutreachRunStatus {
  configured: boolean;
  run: {
    id: number;
    status: string;
    conclusion: string | null;
    htmlUrl: string;
    createdAt: string;
    event: string;
  } | null;
}

export async function triggerOutreachRun(options: { max?: number } = {}) {
  return dispatchOutreachRun(options) as Promise<{
    ok: boolean;
    max: number;
    actionsUrl: string;
  }>;
}

export async function getOutreachRunStatus(): Promise<OutreachRunStatus> {
  return fetchLatestOutreachRun() as Promise<OutreachRunStatus>;
}

export { dispatchOutreachRun, fetchLatestOutreachRun };

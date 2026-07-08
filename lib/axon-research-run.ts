import {
  dispatchResearchRun as dispatchResearchRunCore,
  fetchLatestResearchRun as fetchLatestResearchRunCore,
} from './axon-research-run-core.mjs';

export type ResearchDispatchOptions = {
  lane?: 'ai_models' | 'open_source' | 'neuroscience';
  force?: boolean;
};

export async function dispatchResearchRun(opts: ResearchDispatchOptions = {}) {
  return dispatchResearchRunCore(opts);
}

export async function fetchLatestResearchRun() {
  return fetchLatestResearchRunCore();
}

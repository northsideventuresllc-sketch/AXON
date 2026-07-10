/**
 * Repo Manager dispatch session — survives route changes and tab revisits.
 * Polls in the background while tasks are running or a dispatch session is active.
 */

export type DispatchItem = {
  id: string;
  code: string;
  title: string;
  owner: string;
  manager_chat: string | null;
  repo: string | null;
  status: string;
  priority: number;
  action_type: string;
  dispatch_phrase: string | null;
  workflow_repo: string | null;
  risk_tier: string | null;
  created_at: string | null;
  result_summary: string | null;
};

export type QueueView = 'active' | 'completed' | 'cron';

export type SortMode = 'venture' | 'complexity' | 'date';
export type SortDir = 'asc' | 'desc';

export type FilterState = {
  sortBy: SortMode;
  sortDir: SortDir;
  ventures: string[];
  complexities: Array<'high' | 'medium' | 'low'>;
};

type SessionState = {
  items: DispatchItem[];
  queueView: QueueView;
  filters: FilterState | null;
  loading: boolean;
  error: string | null;
  message: string | null;
  /** True while Hermes fire request is in flight or recently started. */
  firingUntil: number | null;
  /** Keeps live progress bar + polling until queue settles. */
  dispatchActive: boolean;
  lastFetchedAt: number | null;
};

const STORAGE_KEY = 'axon-dispatch-session-v1';
const POLL_MS = 3000;
const COMPLETED_SINCE = '2025-06-29';
const FIRING_GRACE_MS = 45_000;

const DEFAULT_STATE: SessionState = {
  items: [],
  queueView: 'active',
  filters: null,
  loading: true,
  error: null,
  message: null,
  firingUntil: null,
  dispatchActive: false,
  lastFetchedAt: null,
};

let state: SessionState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let firingExpiryTimer: ReturnType<typeof setTimeout> | null = null;
let fetchInFlight = false;
let hydrated = false;

function emit() {
  listeners.forEach((l) => l());
  persist();
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: state.items,
        queueView: state.queueView,
        filters: state.filters,
        message: state.message,
        firingUntil: state.firingUntil,
        dispatchActive: state.dispatchActive,
        lastFetchedAt: state.lastFetchedAt,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

function hydrate() {
  if (typeof window === 'undefined' || hydrated) return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<SessionState>;
    state = {
      ...state,
      items: saved.items ?? state.items,
      queueView: saved.queueView ?? state.queueView,
      filters: saved.filters ?? state.filters,
      message: saved.message ?? null,
      firingUntil: saved.firingUntil ?? null,
      dispatchActive: Boolean(saved.dispatchActive),
      lastFetchedAt: saved.lastFetchedAt ?? null,
      loading: false,
    };
  } catch {
    /* corrupt cache */
  }
}

function runningCount(items: DispatchItem[]): number {
  return items.filter((i) => i.status === 'running').length;
}

function queuedCount(items: DispatchItem[]): number {
  return items.filter((i) => i.status === 'queued').length;
}

function isFiring(): boolean {
  return state.firingUntil !== null && state.firingUntil > Date.now();
}

function reconcileDispatchActive(items: DispatchItem[]) {
  const running = runningCount(items);
  const queued = queuedCount(items);
  if (running > 0) {
    state.dispatchActive = true;
    return;
  }
  if (isFiring()) {
    state.dispatchActive = true;
    return;
  }
  if (!running && !queued) {
    state.dispatchActive = false;
    if (state.firingUntil && state.firingUntil <= Date.now()) {
      state.firingUntil = null;
    }
  }
}

function needsPolling(): boolean {
  if (state.queueView === 'cron') return false;
  if (state.dispatchActive || isFiring()) return true;
  return runningCount(state.items) > 0;
}

function scheduleFiringExpiry() {
  if (firingExpiryTimer) clearTimeout(firingExpiryTimer);
  if (!state.firingUntil) return;
  const ms = state.firingUntil - Date.now();
  if (ms <= 0) {
    reconcileDispatchActive(state.items);
    emit();
    ensurePolling();
    return;
  }
  firingExpiryTimer = setTimeout(() => {
    reconcileDispatchActive(state.items);
    emit();
    ensurePolling();
  }, ms + 50);
}

function ensurePolling() {
  if (!needsPolling()) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    return;
  }
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void refresh();
  }, POLL_MS);
}

async function refresh() {
  if (state.queueView === 'cron') {
    state = { ...state, loading: false };
    emit();
    return;
  }

  if (fetchInFlight) return;
  fetchInFlight = true;

  const hadCache = state.items.length > 0;
  if (!hadCache) {
    state = { ...state, loading: true };
    emit();
  }

  try {
    const url =
      state.queueView === 'completed'
        ? `/api/axon/dispatch/queue?view=completed&since=${COMPLETED_SINCE}&limit=500`
        : '/api/axon/dispatch/queue';
    const r = await fetch(url);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'load failed');
    const items = (data.items || []) as DispatchItem[];
    reconcileDispatchActive(items);
    state = {
      ...state,
      items,
      loading: false,
      error: null,
      lastFetchedAt: Date.now(),
    };
  } catch (e) {
    state = {
      ...state,
      loading: false,
      error: e instanceof Error ? e.message : 'load failed',
    };
  } finally {
    fetchInFlight = false;
    emit();
    ensurePolling();
  }
}

function patch(partial: Partial<SessionState>) {
  state = { ...state, ...partial };
  emit();
  ensurePolling();
}

export const dispatchSessionStore = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  init() {
    hydrate();
    ensurePolling();
    const stale =
      !state.lastFetchedAt || Date.now() - state.lastFetchedAt > POLL_MS;
    if (stale || state.items.length === 0) {
      void refresh();
    }
  },

  refresh,

  setQueueView(view: QueueView) {
    if (view === state.queueView) return;
    const loading = view !== 'cron' && state.items.length === 0;
    state = { ...state, queueView: view, loading, error: null };
    emit();
    if (view === 'cron') {
      ensurePolling();
      return;
    }
    void refresh();
  },

  setFilters(filters: FilterState) {
    patch({ filters });
  },

  setMessage(message: string | null) {
    patch({ message });
  },

  setError(error: string | null) {
    patch({ error });
  },

  updateItem(updated: DispatchItem) {
    patch({
      items: state.items.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)),
    });
  },

  beginFire() {
    state = {
      ...state,
      firingUntil: Date.now() + FIRING_GRACE_MS,
      dispatchActive: true,
      error: null,
    };
    emit();
    scheduleFiringExpiry();
    ensurePolling();
  },

  endFire() {
    if (state.firingUntil) {
      state = { ...state, firingUntil: Date.now() + 12_000 };
    }
    emit();
    scheduleFiringExpiry();
    void refresh();
    ensurePolling();
  },

  showLiveBar(): boolean {
    return (
      isFiring() ||
      state.dispatchActive ||
      runningCount(state.items) > 0
    );
  },

  isFiring,
};

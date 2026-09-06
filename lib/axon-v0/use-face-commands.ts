'use client';

/**
 * THE FACE — what a command does once it has been heard (Build Plan B, step 3).
 *
 * One command changes exactly one panel. The grammar itself is pure and lives in
 * lib/axon-v0/face-commands.mjs; this hook is only the wiring: run the parser, fetch the one
 * read-only route the matched command needs, and hand back what the panel and the spoken
 * reply should say.
 *
 * Three commands in step 3, all read-only:
 *   "show me today's plan" → GET /api/axon-v0/face/plan      (EXEC's own daily post)
 *   "what needs me"        → GET /api/axon-v0/face/needs-me  (the queue, waiting on JB)
 *   "show agents"          → back to the module list, no request at all
 *
 * Anything else is answered with one plain sentence. **Nothing is sent to a model here.**
 * Free-form speech is a later step and has to be grounded first; until then an unknown line
 * is shown in the transcript and answered honestly rather than guessed at.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import {
  UNKNOWN_COMMAND_HINT,
  UNKNOWN_COMMAND_REPLY,
  parseCommand,
  spokenLineFor,
} from '@/lib/axon-v0/face-commands.mjs';
import type { FaceDayPlan, FaceNeedsMe } from '@/lib/axon-v0/face-plan-reads';

export type FacePanel = 'modules' | 'plan' | 'needs-me';

const PLAN_UNREADABLE: FaceDayPlan = { source: 'none', date: null, items: [], readable: false };
const NEEDS_ME_UNREADABLE: FaceNeedsMe = { items: [], readable: false };

export interface FaceCommandState {
  /** Which panel is showing. `modules` is home. */
  panel: FacePanel;
  /** True while a read is out — the orb pulses and the timer counts. */
  pending: boolean;
  /** Seconds since the pending read started, one decimal place. */
  elapsed: number;
  /** The last thing heard or typed, exactly as given. */
  heard: string;
  /** The one line the panel and the spoken reply both use. */
  reply: string;
  /** Extra sentence naming the nearest commands, only after an unknown line. */
  hint: string | null;
  plan: FaceDayPlan | null;
  needsMe: FaceNeedsMe | null;
  /** Run one heard or typed line. */
  run: (text: string) => void;
  /** The Back micro-label: straight home, no request. */
  back: () => void;
}

export interface FaceCommandOptions {
  /** Say the reply out loud. Already muted-aware — this hook never decides that. */
  speak: (line: string) => void;
  /** How many agents are on the roster, for the spoken line when going home. */
  moduleCount: number | null;
}

export function useFaceCommands({ speak, moduleCount }: FaceCommandOptions): FaceCommandState {
  const [panel, setPanel] = useState<FacePanel>('modules');
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [plan, setPlan] = useState<FaceDayPlan | null>(null);
  const [needsMe, setNeedsMe] = useState<FaceNeedsMe | null>(null);

  const aliveRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const moduleCountRef = useRef(moduleCount);
  moduleCountRef.current = moduleCount;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // The Thinking timer. Ten ticks a second is enough for a 0.0s readout and nowhere near
  // the flash threshold; it only exists while a read is actually out.
  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100);
    return () => clearInterval(id);
  }, [pending]);

  const back = useCallback(() => {
    setPanel('modules');
    setHint(null);
    const line = spokenLineFor({ panel: 'modules', moduleCount: moduleCountRef.current });
    setReply(line);
    speakRef.current(line);
  }, []);

  const run = useCallback((text: string) => {
    const spoken = String(text ?? '').trim();
    if (!spoken) return;
    setHeard(spoken);

    const { command } = parseCommand(spoken) as { command: FacePanel | null };

    if (command === null) {
      setHint(UNKNOWN_COMMAND_HINT);
      setReply(UNKNOWN_COMMAND_REPLY);
      speakRef.current(UNKNOWN_COMMAND_REPLY);
      return;
    }

    setHint(null);

    if (command === 'modules') {
      setPanel('modules');
      const line = spokenLineFor({ panel: 'modules', moduleCount: moduleCountRef.current });
      setReply(line);
      speakRef.current(line);
      return;
    }

    const path = command === 'plan' ? '/api/axon-v0/face/plan' : '/api/axon-v0/face/needs-me';
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    setReply('');

    void (async () => {
      let planResult: FaceDayPlan | null = null;
      let needsMeResult: FaceNeedsMe | null = null;
      try {
        const response = await fetch(apiUrl(path), { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (command === 'plan') planResult = (body?.plan as FaceDayPlan) ?? PLAN_UNREADABLE;
        else needsMeResult = (body?.needsMe as FaceNeedsMe) ?? NEEDS_ME_UNREADABLE;
      } catch {
        // An unreadable source says so; it never becomes an empty list, which would read as
        // "nothing to do" and be a claim we cannot back.
        if (controller.signal.aborted) return;
        if (command === 'plan') planResult = PLAN_UNREADABLE;
        else needsMeResult = NEEDS_ME_UNREADABLE;
      }

      if (!aliveRef.current || controller.signal.aborted) return;
      if (abortRef.current === controller) abortRef.current = null;

      if (command === 'plan') setPlan(planResult);
      else setNeedsMe(needsMeResult);

      setPanel(command);
      setPending(false);

      const line = spokenLineFor({
        panel: command,
        plan: planResult ?? undefined,
        needsMe: needsMeResult ?? undefined,
      });
      setReply(line);
      speakRef.current(line);
    })();
  }, []);

  return { panel, pending, elapsed, heard, reply, hint, plan, needsMe, run, back };
}

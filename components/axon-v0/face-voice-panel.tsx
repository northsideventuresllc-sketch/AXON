'use client';

/**
 * THE FACE — the voice panel (Build Plan B, step 3).
 *
 * Three states, all of them written as well as drawn:
 *  - **Idle** — a mic glyph and one quiet "Hold to talk" micro-label.
 *  - **Listening** — the same glyph lit, plus a level meter whose bars are driven by the
 *    real microphone. Under reduced motion the bars are static and the label does the work.
 *  - **Thinking** — a monospaced timer counting up while the read is out.
 *
 * Under all three, a live transcript line: what is being heard right now, then what was
 * heard, then the one-line answer. Everything spoken is also on screen — the transcript is
 * the record and the audio is a convenience layer over it, so it carries `aria-live`.
 *
 * **Push-to-talk, never always-on.** Hold the button with the mouse or a finger, or focus it
 * and hold Space. The microphone closes the instant it is let go.
 *
 * **No dead UI.** A browser that cannot transcribe speech (Firefox, most of them without a
 * secure context) gets a typed input in the same panel, in the same styling, running the
 * identical parser — the panel never shows a control that does nothing.
 *
 * Mic glyph and meter bars are drawn in CSS and inline SVG. No icon library, no dependency.
 */
import { useCallback, useRef, useState } from 'react';

export interface FaceVoicePanelProps {
  listening: boolean;
  pending: boolean;
  /** Seconds since the pending read started. */
  elapsed: number;
  /** One value per bar, 0–1, straight off the microphone. */
  levels: number[];
  /** What is being heard right now, before it settles. */
  interim: string;
  /** The last thing heard or typed. */
  heard: string;
  /** The one-line answer, shown and spoken. */
  reply: string;
  /** Names the nearest commands after an unknown line. */
  hint: string | null;
  /** False → the typed input replaces the hold-to-talk button. */
  speechSupported: boolean;
  /** One plain sentence when the microphone would not open. */
  micError: string | null;
  muted: boolean;
  onToggleMute: () => void;
  reducedMotion: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  /** Run a typed line through the same parser the microphone feeds. */
  onSubmit: (text: string) => void;
}

/** The mic glyph, drawn rather than imported. Cyan when live, dim when idle. */
function MicGlyph({ live }: { live: boolean }) {
  return (
    <svg
      className="face-voice-mic"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
      data-live={live ? 'true' : 'false'}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M12 18v3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function FaceVoicePanel({
  listening,
  pending,
  elapsed,
  levels,
  interim,
  heard,
  reply,
  hint,
  speechSupported,
  micError,
  muted,
  onToggleMute,
  reducedMotion,
  onHoldStart,
  onHoldEnd,
  onSubmit,
}: FaceVoicePanelProps) {
  const [typed, setTyped] = useState('');
  // Holding a key fires keydown over and over; only the first one may open the microphone.
  const spaceHeldRef = useRef(false);

  const state = pending ? 'thinking' : listening ? 'listening' : 'idle';
  const stateLabel = pending ? 'Thinking' : listening ? 'Listening' : 'Hold to talk';

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Spacebar') return;
      event.preventDefault();
      if (spaceHeldRef.current) return;
      spaceHeldRef.current = true;
      onHoldStart();
    },
    [onHoldStart]
  );

  const onKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Spacebar') return;
      event.preventDefault();
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      onHoldEnd();
    },
    [onHoldEnd]
  );

  const submitTyped = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const line = typed.trim();
      if (!line) return;
      setTyped('');
      onSubmit(line);
    },
    [onSubmit, typed]
  );

  return (
    <section className="face-voice" data-state={state} aria-label="Voice">
      <span className="face-card-bracket face-card-bracket--tl" aria-hidden />
      <span className="face-card-bracket face-card-bracket--br" aria-hidden />

      <div className="face-voice-controls">
        {speechSupported ? (
          <button
            type="button"
            className="face-voice-hold"
            data-live={listening ? 'true' : 'false'}
            aria-pressed={listening}
            onPointerDown={onHoldStart}
            onPointerUp={onHoldEnd}
            onPointerLeave={onHoldEnd}
            onPointerCancel={onHoldEnd}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
          >
            <MicGlyph live={listening} />
            <span className="face-micro">{stateLabel}</span>
          </button>
        ) : (
          <form className="face-voice-typed" onSubmit={submitTyped}>
            <MicGlyph live={false} />
            <label className="sr-only" htmlFor="face-voice-input">
              Type a command
            </label>
            <input
              id="face-voice-input"
              className="face-voice-input"
              type="text"
              autoComplete="off"
              placeholder="Show me today's plan"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            <button type="submit" className="face-voice-send face-micro">
              Send
            </button>
          </form>
        )}

        {/* The meter is real: every bar is the microphone's own level. Under reduced motion
            the bars hold still and the written label says what is happening instead. */}
        <div
          className="face-voice-meter"
          data-listening={listening ? 'true' : 'false'}
          data-static={reducedMotion ? 'true' : 'false'}
          aria-hidden
        >
          {levels.map((level, index) => (
            <span
              key={index}
              className="face-voice-bar"
              style={{ transform: `scaleY(${reducedMotion ? 0.34 : Math.max(0.08, level)})` }}
            />
          ))}
        </div>

        {pending ? (
          <span className="face-voice-timer face-micro" aria-hidden>
            {elapsed.toFixed(1)}s
          </span>
        ) : null}

        <button
          type="button"
          className="face-voice-mute face-micro"
          aria-pressed={muted}
          onClick={onToggleMute}
        >
          {muted ? 'Muted' : 'Mute'}
        </button>
      </div>

      <div className="face-voice-transcript" aria-live="polite">
        {interim ? <p className="face-voice-interim">{interim}</p> : null}
        {heard ? <p className="face-voice-heard">“{heard}”</p> : null}
        {reply ? <p className="face-voice-reply">{reply}</p> : null}
        {hint ? <p className="face-voice-hint">{hint}</p> : null}
        {micError ? <p className="face-voice-hint">{micError}</p> : null}
        {!interim && !heard && !reply && !micError ? (
          <p className="face-voice-hint">
            {speechSupported
              ? 'Hold the button and ask for today’s plan, what needs you, or the agents.'
              : 'This browser cannot listen, so type it instead: today’s plan, what needs you, or the agents.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default FaceVoicePanel;

'use client';

/**
 * THE FACE — the brain orb (Build Plan B, step 1).
 *
 * A glowing neural burst inside three thin rings, drawn with Three.js (already a dependency
 * of this repo — see components/axon-v0/brain-scene.tsx). It pulses hard on the beat while
 * agents are working and drifts on a slow breathe when they are not.
 *
 * Kept deliberately cheap so it holds 60 fps in Chrome on the Mac mini:
 *   · one Points cloud (1,400 sprites, one shared 64px glow texture)
 *   · one LineSegments filament web built once
 *   · three thin torus rings, low segment counts
 *   · no post-processing, no shadows, no per-frame allocation
 *   · device pixel ratio capped (lib/axon-v0/face-signal.mjs, MAX_PIXEL_RATIO)
 *   · the loop stops on a hidden tab and on unmount, and never integrates more than one
 *     twentieth of a second in a single frame
 *
 * Reduced motion: no animation loop at all. One frame is drawn and the container does a
 * slow opacity breathe in CSS instead.
 *
 * WebGL can be taken away at any moment (driver reset, tab evicted from the GPU). Losing
 * the context swaps in the still cyan bloom; getting it back rebuilds the scene.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  RESIZE_THROTTLE_MS,
  cappedPixelRatio,
  clampFrameDelta,
} from '@/lib/axon-v0/face-signal.mjs';

/** Locked palette — ground #07080C, cyan #00D4FF, navy #0A1628. No green. */
const CYAN = 0x00d4ff;
const CORE_WHITE = 0xdff6ff;
const NAVY = 0x0a1628;

const POINT_COUNT = 1400;
const FILAMENT_COUNT = 260;

interface FaceOrbSceneProps {
  /** True while agents are working — drives the pulse. */
  working: boolean;
  /** When true nothing animates; a single frame is drawn. */
  reducedMotion: boolean;
  /** Spoken label for screen readers. */
  ariaLabel: string;
  /**
   * Step 4: bump this by one every time a new bus row arrives (see
   * lib/axon-v0/use-face-activity.ts) to trigger one visible ~600ms ring-brighten burst.
   * Ignored under reduced motion — that mode brightens only the trail's own dot, never
   * the orb.
   */
  burstSignal?: number;
}

/** How long the burst brightening lasts, in milliseconds. */
const BURST_DURATION_MS = 600;

/** Soft radial dot used as the sprite for every point and for the core halo. */
function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

/** Evenly spread points on a sphere, jittered into a shell so it reads as a burst. */
function buildBurstPositions(): Float32Array {
  const positions = new Float32Array(POINT_COUNT * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < POINT_COUNT; i += 1) {
    const y = 1 - (i / (POINT_COUNT - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    // Shell thickness: most points near the surface, a few pulled toward the core.
    const jitter = 0.62 + Math.pow(Math.random(), 1.6) * 0.46;
    positions[i * 3] = Math.cos(theta) * radiusAtY * jitter;
    positions[i * 3 + 1] = y * jitter;
    positions[i * 3 + 2] = Math.sin(theta) * radiusAtY * jitter;
  }
  return positions;
}

/** Short links between nearby points — the "neural" wiring. Built once, never per frame. */
function buildFilamentPositions(points: Float32Array): Float32Array {
  const segments: number[] = [];
  let attempts = 0;
  while (segments.length < FILAMENT_COUNT * 6 && attempts < FILAMENT_COUNT * 40) {
    attempts += 1;
    const a = Math.floor(Math.random() * POINT_COUNT);
    const b = Math.floor(Math.random() * POINT_COUNT);
    if (a === b) continue;
    const ax = points[a * 3];
    const ay = points[a * 3 + 1];
    const az = points[a * 3 + 2];
    const bx = points[b * 3];
    const by = points[b * 3 + 1];
    const bz = points[b * 3 + 2];
    const d = Math.hypot(ax - bx, ay - by, az - bz);
    if (d > 0.34) continue;
    segments.push(ax, ay, az, bx, by, bz);
  }
  return new Float32Array(segments);
}

export default function FaceOrbScene({
  working,
  reducedMotion,
  ariaLabel,
  burstSignal,
}: FaceOrbSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  /** Bumped when a lost WebGL context comes back, which rebuilds the whole scene. */
  const [generation, setGeneration] = useState(0);

  // Latest props read by the animation loop without rebuilding the scene.
  const workingRef = useRef(working);
  const reducedRef = useRef(reducedMotion);
  workingRef.current = working;
  reducedRef.current = reducedMotion;

  /**
   * When the burst last started, in `performance.now()` time. `-Infinity` means no burst is
   * active. Read every frame by the animation loop, written only by the effect below —
   * never by React state, so a burst never forces a re-render or a scene rebuild.
   */
  const burstStartRef = useRef(-Infinity);
  const lastBurstSignalRef = useRef<number | undefined>(burstSignal);

  useEffect(() => {
    // Skip the very first value so mounting with a non-zero starting token never fires a
    // burst nobody asked for, and skip entirely under reduced motion — that mode brightens
    // only the trail's own dot, never the orb.
    const changed = burstSignal !== undefined && burstSignal !== lastBurstSignalRef.current;
    lastBurstSignalRef.current = burstSignal;
    if (!changed || reducedMotion) return;
    burstStartRef.current = performance.now();
  }, [burstSignal, reducedMotion]);

  /**
   * Handle onto the running scene. The motion preference is read from a media query, so it
   * is still `false` on the very first render — the scene therefore always starts its loop
   * and this handle is what stops it again the moment the real preference arrives.
   */
  const controlRef = useRef<{
    startLoop: () => void;
    stopLoop: () => void;
    renderStill: () => void;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }

    const width = mount.clientWidth || 640;
    const height = mount.clientHeight || 480;
    renderer.setPixelRatio(cappedPixelRatio(window.devicePixelRatio));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.25, 5.2);
    camera.lookAt(0, 0, 0);

    const orb = new THREE.Group();
    scene.add(orb);

    const glow = makeGlowTexture();

    // --- neural burst -----------------------------------------------------------------
    const burstPositions = buildBurstPositions();
    const burstGeometry = new THREE.BufferGeometry();
    burstGeometry.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3));
    const burstMaterial = new THREE.PointsMaterial({
      size: 0.055,
      map: glow,
      color: CYAN,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const burst = new THREE.Points(burstGeometry, burstMaterial);
    orb.add(burst);

    // --- filament web -----------------------------------------------------------------
    const filamentGeometry = new THREE.BufferGeometry();
    filamentGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(buildFilamentPositions(burstPositions), 3)
    );
    const filamentMaterial = new THREE.LineBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const filaments = new THREE.LineSegments(filamentGeometry, filamentMaterial);
    orb.add(filaments);

    // --- core -------------------------------------------------------------------------
    // Small and additive on purpose: the core has to read as light, not as a solid ball.
    const coreGeometry = new THREE.IcosahedronGeometry(0.07, 2);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: CORE_WHITE,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    orb.add(core);

    const haloMaterial = new THREE.SpriteMaterial({
      map: glow,
      color: CYAN,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.set(2.2, 2.2, 1);
    orb.add(halo);

    // Tight white inner bloom so the middle of the burst is the brightest point on screen.
    const innerBloomMaterial = new THREE.SpriteMaterial({
      map: glow,
      color: CORE_WHITE,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerBloom = new THREE.Sprite(innerBloomMaterial);
    innerBloom.scale.set(0.9, 0.9, 1);
    orb.add(innerBloom);

    // --- rings ------------------------------------------------------------------------
    const ringSpecs: Array<{ radius: number; tilt: [number, number, number]; opacity: number; spin: number }> = [
      { radius: 1.32, tilt: [1.28, 0.1, 0], opacity: 0.5, spin: 0.34 },
      { radius: 1.66, tilt: [1.05, 0.62, 0.3], opacity: 0.36, spin: -0.24 },
      { radius: 2.02, tilt: [1.5, -0.5, 0.15], opacity: 0.24, spin: 0.16 },
    ];
    const rings = ringSpecs.map((spec) => {
      const geometry = new THREE.TorusGeometry(spec.radius, 0.006, 3, 160);
      const material = new THREE.MeshBasicMaterial({
        color: CYAN,
        transparent: true,
        opacity: spec.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.set(spec.tilt[0], spec.tilt[1], spec.tilt[2]);
      orb.add(mesh);
      return { mesh, material, spec };
    });

    // A very dim navy backdrop sphere so the burst has something to sit inside.
    const shellGeometry = new THREE.SphereGeometry(2.6, 24, 16);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: NAVY,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    orb.add(shell);

    // --- animation --------------------------------------------------------------------
    let raf = 0;
    let energy = 0; // 0 = resting, 1 = agents working; eased so state changes never snap.
    // Hand-rolled timing rather than THREE.Clock, which is deprecated in this version.
    let startedAt = performance.now();
    let lastAt = startedAt;

    const drawFrame = (elapsed: number, delta: number, nowMs: number) => {
      const target = workingRef.current ? 1 : 0;
      energy += (target - energy) * Math.min(1, delta * 2.4);

      const beat = Math.sin(elapsed * (1.05 + energy * 2.6));
      const pulse = 0.5 + 0.5 * beat;
      const amplitude = 0.02 + energy * 0.13;

      // Step 4: one transient ring-brighten burst when a new bus row lands (skipped entirely
      // under reduced motion — burstStartRef is only ever set when motion is allowed). Eases
      // out over BURST_DURATION_MS rather than snapping off, so it reads as a pulse, not a flash.
      const sinceBurst = nowMs - burstStartRef.current;
      const burstT = sinceBurst >= 0 && sinceBurst < BURST_DURATION_MS ? 1 - sinceBurst / BURST_DURATION_MS : 0;

      const scale = 1 + pulse * amplitude;
      burst.scale.setScalar(scale);
      filaments.scale.setScalar(scale);

      core.scale.setScalar(1 + pulse * (0.05 + energy * 0.22));
      coreMaterial.opacity = Math.min(1, 0.72 + pulse * (0.1 + energy * 0.18) + burstT * 0.18);
      haloMaterial.opacity = Math.min(1, 0.4 + pulse * (0.1 + energy * 0.34) + burstT * 0.4);
      halo.scale.setScalar(2.0 + pulse * (0.15 + energy * 0.7) + burstT * 0.5);
      innerBloomMaterial.opacity = Math.min(1, 0.55 + pulse * (0.12 + energy * 0.28) + burstT * 0.3);
      innerBloom.scale.setScalar(0.8 + pulse * (0.08 + energy * 0.3) + burstT * 0.25);

      burstMaterial.opacity = 0.6 + energy * 0.22 + pulse * 0.08;
      burstMaterial.size = 0.05 + energy * 0.014;
      filamentMaterial.opacity = 0.1 + energy * 0.18 + pulse * 0.05;

      orb.rotation.y = elapsed * (0.09 + energy * 0.16);
      orb.rotation.x = Math.sin(elapsed * 0.18) * 0.09;

      for (const ring of rings) {
        ring.mesh.rotation.z += delta * ring.spec.spin * (0.4 + energy * 1.5);
        ring.material.opacity = Math.min(
          1,
          ring.spec.opacity * (0.7 + energy * 0.5 + pulse * 0.12) + burstT * 0.5
        );
      }

      renderer.render(scene, camera);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const delta = clampFrameDelta(now, lastAt);
      lastAt = now;
      drawFrame((now - startedAt) / 1000, delta, now);
    };

    // Under reduced motion the loop is stopped and one representative frame is drawn instead.
    // No burst ever reaches here — burstStartRef is only set when reducedMotion is false.
    const renderStill = () => {
      energy = workingRef.current ? 1 : 0;
      drawFrame(1.15, 0, performance.now());
    };

    const stopLoop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const startLoop = () => {
      if (raf) return;
      // Skip the paused stretch so the orb resumes mid-beat instead of jumping.
      const now = performance.now();
      startedAt += now - lastAt;
      lastAt = now;
      raf = requestAnimationFrame(loop);
    };

    controlRef.current = { startLoop, stopLoop, renderStill };

    // A tab that is already hidden on mount never starts the loop — one still frame is
    // enough to have something on screen the moment it is looked at.
    if (reducedRef.current || document.hidden) {
      renderStill();
    } else {
      raf = requestAnimationFrame(loop);
    }

    // --- resize -----------------------------------------------------------------------
    const resize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(cappedPixelRatio(window.devicePixelRatio));
      renderer.setSize(w, h);
      if (reducedRef.current || document.hidden) renderStill();
    };

    // Dragging a window edge fires resize dozens of times a second; reallocating the draw
    // buffer that often is what makes a canvas stutter. Collapse the burst into one resize.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const throttledResize = () => {
      if (resizeTimer) return;
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        resize();
      }, RESIZE_THROTTLE_MS);
    };
    const observer = new ResizeObserver(throttledResize);
    observer.observe(mount);
    window.addEventListener('resize', throttledResize);

    // --- WebGL context loss -------------------------------------------------------------
    // preventDefault() on the loss is what makes the browser promise a restore event.
    const canvas = renderer.domElement;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      stopLoop();
      setFailed(true);
    };
    const onContextRestored = () => {
      setFailed(false);
      // Every GPU object died with the old context, so rebuild rather than resume.
      setGeneration((n) => n + 1);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // Stop burning frames when the tab is hidden. A hidden tab always stops, whatever the
    // motion preference; coming back only restarts the loop when motion is allowed.
    const onVisibility = () => {
      if (document.hidden) {
        stopLoop();
      } else if (reducedRef.current) {
        renderStill();
      } else {
        startLoop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      controlRef.current = null;
      cancelAnimationFrame(raf);
      raf = 0;
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      window.removeEventListener('resize', throttledResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      burstGeometry.dispose();
      burstMaterial.dispose();
      filamentGeometry.dispose();
      filamentMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      haloMaterial.dispose();
      innerBloomMaterial.dispose();
      shellGeometry.dispose();
      shellMaterial.dispose();
      for (const ring of rings) {
        ring.mesh.geometry.dispose();
        ring.material.dispose();
      }
      glow.dispose();
      renderer.dispose();
      if (canvas.parentNode === mount) mount.removeChild(canvas);
    };
    // Built once per context. State changes are read through refs so the scene is never
    // torn down; only a restored WebGL context (generation) rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  /**
   * The motion preference and the working state both arrive after the scene is built, so this
   * is what actually enforces them. Turning reduced motion on stops the loop dead and leaves a
   * single frame on screen; turning it off starts the loop again. While motion is reduced, a
   * change of state just redraws that one frame.
   */
  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    if (reducedMotion) {
      control.stopLoop();
      control.renderStill();
    } else if (!document.hidden) {
      control.startLoop();
    }
  }, [reducedMotion, working]);

  // The mount stays in the tree even while the fallback is showing: a lost WebGL context is
  // only ever restored on the same canvas, so removing it would make the loss permanent.
  return (
    <div className="face-orb-stage">
      <div
        ref={mountRef}
        className="face-orb-canvas"
        role={failed ? undefined : 'img'}
        aria-label={failed ? undefined : ariaLabel}
        aria-hidden={failed ? true : undefined}
        data-failed={failed ? 'true' : 'false'}
        data-reduced={reducedMotion ? 'true' : 'false'}
      />
      {failed ? (
        <div
          className="face-orb-fallback"
          role="img"
          aria-label={ariaLabel}
          data-working={working ? 'true' : 'false'}
        />
      ) : null}
    </div>
  );
}

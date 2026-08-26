'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './brain.css';

export interface GraphNode {
  id: string;
  kind: 'hub' | 'decision' | 'learning' | 'context';
  label: string;
  at?: string | null;
}
export interface GraphLink {
  source: string;
  target: string;
}
export interface FocusRequest {
  id: string;
  nonce: number;
}

interface BrainSceneProps {
  data: { nodes: GraphNode[]; links: GraphLink[] };
  fullscreen?: boolean;
  focus?: FocusRequest | null;
  onPick?: (node: GraphNode | null) => void;
}

const KIND_COLOR: Record<GraphNode['kind'], number> = {
  hub: 0x00d4ff,
  decision: 0x7dd3fc,
  learning: 0x34d399,
  context: 0xc084fc,
};
const KIND_LABEL: Record<GraphNode['kind'], string> = {
  hub: 'Hub',
  decision: 'Decision',
  learning: 'Learning',
  context: 'Context',
};

// Radial-gradient sprite texture used for the glow halo behind every node.
function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

export default function BrainScene({ data, fullscreen, focus, onPick }: BrainSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState(false);
  const [tip, setTip] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

  // Mutable scene handles shared across effects (built once per data set).
  const apiRef = useRef<{
    focusNode: (id: string) => void;
    resize: () => void;
  } | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // ---- Build the scene (rebuilds only when the graph data changes) ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const nodes = data.nodes || [];
    const links = data.links || [];
    if (!nodes.length) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07080c, 0.008);

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 4000);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setWebglError(true);
      return;
    }
    // Detect a lost/failed context defensively.
    const gl = renderer.getContext();
    if (!gl) {
      setWebglError(true);
      renderer.dispose();
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(o: T): T => {
      disposables.push(o);
      return o;
    };
    const glowTex = track(makeGlowTexture());

    // ---- Starfield ambiance ----
    const starCount = 1400;
    const starPos = new Float32Array(starCount * 3);
    const starColor = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 300 + Math.random() * 900;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      starPos[i * 3 + 2] = r * Math.cos(ph);
      const t = Math.random();
      starColor[i * 3] = 0.4 + t * 0.6;
      starColor[i * 3 + 1] = 0.7 + t * 0.3;
      starColor[i * 3 + 2] = 1.0;
    }
    const starGeo = track(new THREE.BufferGeometry());
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColor, 3));
    const starMat = track(
      new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ---- Drifting near-field dust ----
    const dustCount = 300;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 160;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 160;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const dustGeo = track(new THREE.BufferGeometry());
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = track(
      new THREE.PointsMaterial({ size: 0.7, color: 0x00d4ff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // ---- Layout: hubs near center, spokes on kind-shells (golden spiral) ----
    const positions = new Map<string, THREE.Vector3>();
    const byKind: Record<string, number> = {};
    nodes.forEach((n) => (byKind[n.kind] = (byKind[n.kind] || 0) + 1));
    const seen: Record<string, number> = {};
    let hubIndex = 0;
    nodes.forEach((n) => {
      if (n.kind === 'hub') {
        const a = (hubIndex++ / 3) * Math.PI * 2;
        positions.set(n.id, new THREE.Vector3(Math.cos(a) * 11, Math.sin(a) * 7, Math.sin(a) * 4));
        return;
      }
      const i = (seen[n.kind] = (seen[n.kind] || 0) + 1);
      const total = byKind[n.kind] || 1;
      const radius = n.kind === 'decision' ? 22 : n.kind === 'learning' ? 33 : 44;
      const phi = Math.acos(1 - (2 * i) / (total + 1));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      positions.set(
        n.id,
        new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi)
        )
      );
    });

    // ---- Nodes: core sphere + additive glow sprite ----
    const coreGeoHub = track(new THREE.SphereGeometry(2.4, 24, 24));
    const coreGeoNode = track(new THREE.SphereGeometry(0.95, 18, 18));
    const meshes: THREE.Mesh[] = [];
    const glowByMesh = new Map<THREE.Mesh, THREE.Sprite>();
    const matByKind = new Map<string, THREE.MeshBasicMaterial>();

    nodes.forEach((n) => {
      const isHub = n.kind === 'hub';
      let mat = matByKind.get(n.kind + (isHub ? ':hub' : ''));
      if (!mat) {
        mat = track(
          new THREE.MeshBasicMaterial({ color: KIND_COLOR[n.kind], transparent: true, opacity: isHub ? 0.98 : 0.85 })
        );
        matByKind.set(n.kind + (isHub ? ':hub' : ''), mat);
      }
      const mesh = new THREE.Mesh(isHub ? coreGeoHub : coreGeoNode, mat);
      mesh.position.copy(positions.get(n.id)!);
      mesh.userData.node = n;
      scene.add(mesh);
      meshes.push(mesh);

      const glowMat = track(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: KIND_COLOR[n.kind],
          transparent: true,
          opacity: isHub ? 0.75 : 0.5,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const sprite = new THREE.Sprite(glowMat);
      const s = isHub ? 16 : 6.5;
      sprite.scale.set(s, s, 1);
      sprite.position.copy(mesh.position);
      scene.add(sprite);
      glowByMesh.set(mesh, sprite);
    });

    // ---- Links ----
    const linkMat = track(new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.12 }));
    const linkPts: number[] = [];
    links.forEach((l) => {
      const a = positions.get(l.source);
      const b = positions.get(l.target);
      if (!a || !b) return;
      linkPts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    });
    const linkGeo = track(new THREE.BufferGeometry());
    linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linkPts), 3));
    const linkLines = new THREE.LineSegments(linkGeo, linkMat);
    scene.add(linkLines);

    // ---- Camera orbit model (orbit the camera around `center`) ----
    const orbit = { theta: 0.6, phi: Math.PI / 2.2, radius: 78 };
    const center = new THREE.Vector3(0, 0, 0);
    // fly-to animation targets
    const fly = {
      active: false,
      t: 0,
      dur: reduceMotion ? 0.001 : 1.0,
      fromCenter: new THREE.Vector3(),
      toCenter: new THREE.Vector3(),
      fromRadius: 78,
      toRadius: 78,
      pulse: null as THREE.Sprite | null,
      pulseBase: 6.5,
    };

    const applyCamera = () => {
      const { theta, phi, radius } = orbit;
      camera.position.set(
        center.x + radius * Math.sin(phi) * Math.cos(theta),
        center.y + radius * Math.cos(phi),
        center.z + radius * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(center);
    };
    applyCamera();

    const focusNode = (id: string) => {
      const mesh = meshes.find((m) => (m.userData.node as GraphNode).id === id);
      if (!mesh) return;
      fly.active = true;
      fly.t = 0;
      fly.fromCenter.copy(center);
      fly.toCenter.copy(mesh.position);
      fly.fromRadius = orbit.radius;
      fly.toRadius = (mesh.userData.node as GraphNode).kind === 'hub' ? 26 : 14;
      const sprite = glowByMesh.get(mesh);
      fly.pulse = sprite || null;
      fly.pulseBase = sprite ? sprite.scale.x : 6.5;
      onPickRef.current?.(mesh.userData.node as GraphNode);
    };
    apiRef.current = {
      focusNode,
      resize: () => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      },
    };

    // ---- Interaction: drag orbit, wheel zoom, hover tooltip, click pick ----
    const el = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let lastRayTs = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      fly.active = false; // manual control cancels a fly-to
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        lastX = e.clientX;
        lastY = e.clientY;
        orbit.theta -= dx * 0.005;
        orbit.phi = Math.max(0.15, Math.min(Math.PI - 0.15, orbit.phi - dy * 0.005));
        return;
      }
      // hover raycast (throttled)
      const now = performance.now();
      if (now - lastRayTs < 40) return;
      lastRayTs = now;
      const rect = el.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (hit) {
        const node = hit.object.userData.node as GraphNode;
        setTip({ node, x: e.clientX - rect.left, y: e.clientY - rect.top });
        el.style.cursor = 'pointer';
      } else {
        setTip(null);
        el.style.cursor = '';
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (moved) return;
      const rect = el.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (hit) {
        const node = hit.object.userData.node as GraphNode;
        onPickRef.current?.(node);
        focusNode(node.id);
      } else {
        onPickRef.current?.(null);
      }
    };
    const onLeave = () => setTip(null);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.radius = Math.min(220, Math.max(9, orbit.radius + e.deltaY * 0.06));
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => apiRef.current?.resize();
    window.addEventListener('resize', onResize);

    // ---- Render loop ----
    let raf = 0;
    let t0 = performance.now();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;

      if (!reduceMotion) {
        if (!dragging && !fly.active) orbit.theta += 0.0009;
        stars.rotation.y += 0.00015;
        dust.rotation.y -= 0.0004;
      }

      if (fly.active) {
        fly.t = Math.min(1, fly.t + dt / fly.dur);
        // easeInOutCubic
        const e = fly.t < 0.5 ? 4 * fly.t * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 3) / 2;
        center.lerpVectors(fly.fromCenter, fly.toCenter, e);
        orbit.radius = fly.fromRadius + (fly.toRadius - fly.fromRadius) * e;
        if (fly.t >= 1) {
          fly.active = false;
          center.copy(fly.toCenter);
        }
      }

      // pulse the focused node's glow for a moment after arrival
      if (fly.pulse) {
        const p = fly.pulseBase * (1 + 0.35 * Math.sin(now * 0.006));
        fly.pulse.scale.set(p, p, 1);
      }

      applyCamera();
      renderer.render(scene, camera);
    };
    animate();

    // context-loss safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(true);
    };
    el.addEventListener('webglcontextlost', onContextLost);

    return () => {
      cancelAnimationFrame(raf);
      apiRef.current = null;
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('resize', onResize);
      disposables.forEach((d) => {
        try {
          d.dispose();
        } catch {
          /* ignore */
        }
      });
      renderer.dispose();
      if (el.parentElement === mount) mount.removeChild(el);
    };
  }, [data]);

  // ---- React to fullscreen toggle (resize the renderer) ----
  useEffect(() => {
    const id = requestAnimationFrame(() => apiRef.current?.resize());
    return () => cancelAnimationFrame(id);
  }, [fullscreen]);

  // ---- React to a search-focus request ----
  useEffect(() => {
    if (focus?.id) apiRef.current?.focusNode(focus.id);
  }, [focus?.id, focus?.nonce]);

  return (
    <div ref={mountRef} className="bn-stage">
      {tip && (
        <div className="bn-tooltip" style={{ left: tip.x, top: tip.y }}>
          <div className="bn-tooltip-kind" style={{ color: `#${KIND_COLOR[tip.node.kind].toString(16).padStart(6, '0')}` }}>
            {KIND_LABEL[tip.node.kind]}
          </div>
          <div className="bn-tooltip-label">{tip.node.label}</div>
        </div>
      )}
      {webglError && (
        <div className="bn-webgl-fallback">
          <strong>The brain needs a 3D view your browser can&apos;t provide.</strong>
          <span className="text-xs">
            WebGL is unavailable or was lost. Your memories are still safe — try another browser or re-enable hardware
            acceleration to see the graph.
          </span>
        </div>
      )}
    </div>
  );
}

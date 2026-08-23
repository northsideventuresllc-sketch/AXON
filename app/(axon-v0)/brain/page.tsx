'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { apiUrl } from '@/lib/api-base';

interface GraphNode {
  id: string;
  kind: 'hub' | 'decision' | 'learning' | 'context';
  label: string;
  at?: string | null;
}

interface GraphLink {
  source: string;
  target: string;
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

export default function BrainPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<GraphNode | null>(null);
  const [counts, setCounts] = useState<{ nodes: number; links: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    fetch(apiUrl('/api/axon-v0/brain-graph'))
      .then((r) => r.json())
      .then((data: { nodes?: GraphNode[]; links?: GraphLink[]; error?: string }) => {
        if (disposed || !mount) return;
        const nodes = data.nodes || [];
        const links = data.links || [];
        if (!nodes.length) {
          setError(data.error || 'The brain returned no memories.');
          return;
        }
        setCounts({ nodes: nodes.length, links: links.length });

        const width = mount.clientWidth;
        const height = mount.clientHeight;
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x07080c, 0.012);
        const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        camera.position.z = 60;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mount.appendChild(renderer.domElement);

        // Lay nodes out: hub at center, everything else on jittered spheres by kind.
        const group = new THREE.Group();
        scene.add(group);
        const positions = new Map<string, THREE.Vector3>();
        const byKind: Record<string, number> = {};
        nodes.forEach((n) => {
          byKind[n.kind] = (byKind[n.kind] || 0) + 1;
        });
        const seen: Record<string, number> = {};
        nodes.forEach((n) => {
          if (n.kind === 'hub') {
            positions.set(n.id, new THREE.Vector3(0, 0, 0));
            return;
          }
          const i = (seen[n.kind] = (seen[n.kind] || 0) + 1);
          const total = byKind[n.kind] || 1;
          const radius = n.kind === 'decision' ? 20 : n.kind === 'learning' ? 30 : 40;
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

        const meshes: THREE.Mesh[] = [];
        nodes.forEach((n) => {
          const r = n.kind === 'hub' ? 2.4 : 0.9;
          const geo = new THREE.SphereGeometry(r, 16, 16);
          const mat = new THREE.MeshBasicMaterial({
            color: KIND_COLOR[n.kind],
            transparent: true,
            opacity: n.kind === 'hub' ? 0.95 : 0.8,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(positions.get(n.id)!);
          mesh.userData.node = n;
          group.add(mesh);
          meshes.push(mesh);

          const glowGeo = new THREE.SphereGeometry(r * 1.8, 12, 12);
          const glowMat = new THREE.MeshBasicMaterial({
            color: KIND_COLOR[n.kind],
            transparent: true,
            opacity: 0.12,
          });
          const glow = new THREE.Mesh(glowGeo, glowMat);
          glow.position.copy(mesh.position);
          group.add(glow);
        });

        const linkMat = new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.14 });
        links.forEach((l) => {
          const a = positions.get(l.source);
          const b = positions.get(l.target);
          if (!a || !b) return;
          const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
          group.add(new THREE.Line(geo, linkMat));
        });

        // Manual orbit: drag to rotate, wheel to zoom, click to inspect.
        let dragging = false;
        let moved = false;
        let lastX = 0;
        let lastY = 0;
        const onDown = (e: PointerEvent) => {
          dragging = true;
          moved = false;
          lastX = e.clientX;
          lastY = e.clientY;
        };
        const onMove = (e: PointerEvent) => {
          if (!dragging) return;
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
          lastX = e.clientX;
          lastY = e.clientY;
          group.rotation.y += dx * 0.005;
          group.rotation.x += dy * 0.005;
        };
        const raycaster = new THREE.Raycaster();
        const onUp = (e: PointerEvent) => {
          dragging = false;
          if (moved) return;
          const rect = renderer.domElement.getBoundingClientRect();
          const pointer = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
          );
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(meshes)[0];
          setPicked(hit ? (hit.object.userData.node as GraphNode) : null);
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          camera.position.z = Math.min(140, Math.max(15, camera.position.z + e.deltaY * 0.05));
        };
        const el = renderer.domElement;
        el.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        el.addEventListener('wheel', onWheel, { passive: false });

        const onResize = () => {
          const w = mount.clientWidth;
          const h = mount.clientHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener('resize', onResize);

        let raf = 0;
        const animate = () => {
          raf = requestAnimationFrame(animate);
          if (!dragging) group.rotation.y += 0.0012;
          renderer.render(scene, camera);
        };
        animate();

        cleanup = () => {
          cancelAnimationFrame(raf);
          el.removeEventListener('pointerdown', onDown);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          el.removeEventListener('wheel', onWheel);
          window.removeEventListener('resize', onResize);
          renderer.dispose();
          scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
              obj.geometry.dispose();
              const m = obj.material as THREE.Material | THREE.Material[];
              (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
            }
          });
          if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
        };
      })
      .catch(() => setError('Could not reach the brain.'));

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-end justify-between">
        <div>
          <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
            ← Command deck
          </Link>
          <h1 className="v0-neon mt-1 text-3xl">Brain</h1>
          <p className="mt-1 text-sm text-slate-400">
            Your real decisions, learnings and context — drag to spin, scroll to zoom, tap a node.
          </p>
        </div>
        {counts && (
          <p className="font-mono text-[11px] text-slate-500">
            {counts.nodes} nodes · {counts.links} links
          </p>
        )}
      </div>

      <div className="relative mt-4">
        <div ref={mountRef} className="v0-panel h-[62vh] w-full overflow-hidden" />
        {error && (
          <p className="absolute inset-x-0 top-1/2 text-center text-xs text-slate-500">{error}</p>
        )}
        {picked && (
          <div className="v0-rise absolute bottom-4 left-4 max-w-sm rounded-xl border border-cyan-400/30 bg-black/80 p-4 backdrop-blur">
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
              {KIND_LABEL[picked.kind]}
            </p>
            <p className="mt-1 text-sm text-slate-100">{picked.label}</p>
            {picked.at && (
              <p className="mt-2 font-mono text-[10px] text-slate-500">
                {new Date(picked.at).toLocaleString()}
              </p>
            )}
            <button onClick={() => setPicked(null)} className="mt-3 text-[10px] text-slate-500 hover:text-cyan-300">
              ✕ close
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-3 font-mono text-[10px] text-slate-500">
        <span><span className="text-cyan-300">●</span> hub</span>
        <span><span className="text-sky-300">●</span> decisions</span>
        <span><span className="text-emerald-300">●</span> learnings</span>
        <span><span className="text-purple-300">●</span> context</span>
      </div>
    </div>
  );
}

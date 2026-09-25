import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  SphereGeometry,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';
import type { Group } from 'three';
import { useAppStore } from '../state/store';
import type { HotspotRig, SceneRig } from './setup';
import { isRunning, setHover } from './interaction';
import { damp, noRaycast, restorePart, setEmissive } from './utils';

// ---- Tunables ----
const HIGHLIGHT_COLOR = new Color('#ffcf8a');
const HOVER_GLOW = 0.1;
const PULSE_MIN = 0.12;
const PULSE_MAX = 0.3;
const PULSE_SPEED = 3.2;
const HOVER_LIFT = 0.035;
/** Springy pop: POP_AMOUNT·sin(POP_FREQ·t)·e^(−POP_DECAY·t) → peaks ≈ +6 %. */
const POP_AMOUNT = 0.11;
const POP_FREQ = 14;
const POP_DECAY = 6;
const POP_TIME = 1.2;
const MARKER_COLOR = '#ffd89a';
const MARKER_GAP = 0.32; // above the hotspot's bbox top
const FRAME_PRIORITY = -35;

interface HotspotAnim {
  h: HotspotRig;
  lift: number;
  glow: number;
  applied: number;
  highlighted: boolean;
  popT0: number;
}

export default function Hotspots({ rig }: { rig: SceneRig }) {
  const anims = useMemo<HotspotAnim[]>(
    () => rig.hotspots.map((h) => ({ h, lift: 0, glow: 0, applied: -1, highlighted: false, popT0: -10 })),
    [rig],
  );

  useEffect(
    () => () => {
      for (const a of anims) {
        restorePart(a.h.base);
        setEmissive(a.h.slots, HIGHLIGHT_COLOR, 0);
      }
    },
    [anims],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const s = useAppStore.getState();
    const running = s.phase === 'running';
    if (!running && s.hovered !== null) setHover(null);

    for (let i = 0; i < anims.length; i++) {
      const a = anims[i];
      const topic = a.h.topic;
      const hovered = running && s.hovered === topic;
      const highlighted = s.highlight === topic;
      if (highlighted && !a.highlighted) a.popT0 = t;
      a.highlighted = highlighted;

      a.lift = damp(a.lift, hovered ? HOVER_LIFT : 0, 10, dt);
      const pulse = highlighted
        ? PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 + 0.5 * Math.sin(t * PULSE_SPEED))
        : 0;
      a.glow = damp(a.glow, Math.max(pulse, hovered ? HOVER_GLOW : 0), 8, dt);
      if (a.glow < 0.001) a.glow = 0;

      const u = t - a.popT0;
      const pop = u < POP_TIME ? POP_AMOUNT * Math.sin(POP_FREQ * u) * Math.exp(-POP_DECAY * u) : 0;
      const { obj, pos, scale } = a.h.base;
      obj.position.y = pos.y + a.lift;
      obj.scale.set(scale.x * (1 + pop), scale.y * (1 + pop), scale.z * (1 + pop));

      if (Math.abs(a.glow - a.applied) > 0.002 || (a.glow === 0 && a.applied !== 0)) {
        a.applied = a.glow;
        setEmissive(a.h.slots, HIGHLIGHT_COLOR, a.glow);
      }
    }
  }, FRAME_PRIORITY);

  return (
    <>
      {rig.hotspots.map((h, i) => (
        <Marker key={h.topic} hotspot={h} index={i} />
      ))}
    </>
  );
}

interface MarkerResources {
  core: OctahedronGeometry;
  coreMat: MeshBasicMaterial;
  glowMat: SpriteMaterial;
  hit: SphereGeometry;
}

let shared: MarkerResources | null = null;

/** Shared by all markers; lives for the page lifetime. */
function markerResources(): MarkerResources {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  shared = {
    core: new OctahedronGeometry(0.085, 0),
    coreMat: new MeshBasicMaterial({ color: MARKER_COLOR, toneMapped: false }),
    glowMat: new SpriteMaterial({
      map,
      color: MARKER_COLOR,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
    hit: new SphereGeometry(0.2, 10, 8),
  };
  return shared;
}

/** Floating glowing gem above a not-yet-visited hotspot. */
function Marker({ hotspot, index }: { hotspot: HotspotRig; index: number }) {
  const res = markerResources();
  const group = useRef<Group>(null);
  const hit = useRef<Mesh>(null);
  const st = useRef({ shown: 0, interactive: true });
  const { topic, center, box } = hotspot;
  const baseY = box.max.y + MARKER_GAP;

  useFrame((state, rawDt) => {
    const g = group.current;
    const h = hit.current;
    if (!g || !h) return;
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const s = useAppStore.getState();
    const m = st.current;
    const want =
      s.phase === 'running' && !s.visited.includes(topic) && s.activeTopic !== topic && s.highlight !== topic;
    m.shown = damp(m.shown, want ? 1 : 0, 6, dt);
    g.visible = m.shown > 0.01;
    g.scale.setScalar(Math.max(m.shown, 0.001) * (s.hovered === topic ? 1.25 : 1));
    g.position.y = baseY + 0.06 * Math.sin(t * 2 + index * 1.3);
    g.rotation.y = t * 1.4 + index;
    const interactive = want && m.shown > 0.5;
    if (interactive !== m.interactive) {
      m.interactive = interactive;
      h.raycast = interactive ? Mesh.prototype.raycast : noRaycast;
    }
  }, FRAME_PRIORITY);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!st.current.interactive || !isRunning()) return;
    e.stopPropagation(); // must precede setHover: it un-hovers the room behind
    setHover(topic);
  };
  const onOut = () => {
    if (useAppStore.getState().hovered === topic) setHover(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!st.current.interactive || !isRunning()) return;
    e.stopPropagation();
    useAppStore.getState().requestTopic(topic);
  };

  return (
    <group ref={group} position={[center.x, baseY, center.z]} visible={false}>
      <mesh geometry={res.core} material={res.coreMat} />
      <sprite material={res.glowMat} scale={0.55} />
      <mesh
        ref={hit}
        geometry={res.hit}
        visible={false}
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
      />
    </group>
  );
}

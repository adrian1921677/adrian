import { useLayoutEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Box3 } from 'three';
import { TOPIC_IDS } from '../data/nodes';
import type { TopicId } from '../data/nodes';
import { useAppStore } from '../state/store';
import type { SceneRig } from './setup';
import { damp, dampAngle, dampFactor } from './utils';

// ---- Tunables ----
const FOV = 30;
/** Home view direction normalize(1, 0.78, 1) as azimuth (from +Z toward +X) / elevation. */
const HOME_AZ = Math.atan2(1, 1);
const HOME_EL = Math.atan2(0.78, Math.SQRT2);
const TOPIC_AZ_SWING = MathUtils.degToRad(12);
const TOPIC_EL_DROP = 0.04;
const HOME_PAD = 1.06;
const TOPIC_PAD = 1.15;
const TOPIC_MIN_DIST = 4.5;
const PORTRAIT_ASPECT = 0.8;
/** Share of the screen height (from the top) the subject may fill; the dialogue UI covers the rest. */
const HOME_SAFE = 0.84;
const HOME_SAFE_PORTRAIT = 0.72;
const TOPIC_SAFE = 0.7;
const TOPIC_SAFE_PORTRAIT = 0.56;
/** Establishing pose while phase !== 'running'. */
const INTRO_AZ = 0.22;
const INTRO_DRIFT = 0.16;
const INTRO_EL = 0.2;
const INTRO_DIST = 1.45;
const INTRO_LIFT = 0.3;
const CAM_K = 2.6; // ≈1.5 s to settle (swoop + topic moves)
const INTRO_K = 1.2;
const PARALLAX_X = 0.25;
const PARALLAX_Y = 0.15;
const PARALLAX_K = 4;
const FRAME_PRIORITY = -30;

interface View {
  target: Vector3;
  az: number;
  el: number;
  dist: number;
}

const makeView = (): View => ({ target: new Vector3(), az: HOME_AZ, el: HOME_EL, dist: 12 });

function copyView(out: View, v: View): void {
  out.target.copy(v.target);
  out.az = v.az;
  out.el = v.el;
  out.dist = v.dist;
}

const _back = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _c = new Vector3();
const _p = new Vector3();

/** Camera basis for an orbit direction (back = from target toward the camera). */
function basis(az: number, el: number): void {
  const ce = Math.cos(el);
  _back.set(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce);
  _right.set(Math.cos(az), 0, -Math.sin(az));
  _up.crossVectors(_back, _right);
}

/**
 * Fit all 8 corners of `box` for the given direction and aspect, keeping the
 * subject in the top `safe` share of the screen (look target shifted down).
 */
function frameBox(box: Box3, az: number, el: number, aspect: number, safe: number, pad: number, minDist: number, out: View): void {
  box.getCenter(_c);
  basis(az, el);
  const tanHalf = Math.tan(MathUtils.degToRad(FOV) / 2);
  const tanV = (tanHalf * safe) / pad;
  const tanH = (tanHalf * aspect) / pad;
  let d = minDist;
  for (let i = 0; i < 8; i++) {
    _p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(_c);
    const z = _p.dot(_back);
    d = Math.max(d, z + Math.abs(_p.dot(_right)) / tanH, z + Math.abs(_p.dot(_up)) / tanV);
  }
  const shift = (1 - safe) * tanHalf * d;
  out.target.copy(_c).addScaledVector(_up, -shift);
  out.az = az;
  out.el = el;
  out.dist = d;
}

export default function CameraRig({ rig }: { rig: SceneRig }) {
  const camera = useThree((s) => s.camera);

  useLayoutEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = FOV;
      camera.near = 0.1;
      camera.far = 150;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  const st = useMemo(() => {
    // Swing each topic's view toward the side of the room its hotspot is on.
    const roomCenter = rig.roomBox.getCenter(new Vector3());
    basis(HOME_AZ, HOME_EL);
    const topicAz: Partial<Record<TopicId, number>> = {};
    for (const topic of TOPIC_IDS) {
      const h = rig.hotspotByTopic[topic];
      if (!h) continue;
      const side = _p.copy(h.center).sub(roomCenter).dot(_right);
      topicAz[topic] = HOME_AZ - Math.sign(side) * TOPIC_AZ_SWING * Math.min(1, Math.abs(side) / 1.5);
    }
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    return {
      topicAz,
      parallax: coarse ? 0 : 1,
      aspect: -1,
      focus: null as TopicId | 'home' | null,
      home: makeView(),
      focused: makeView(),
      goal: makeView(),
      cur: makeView(),
      parX: 0,
      parY: 0,
      init: false,
    };
  }, [rig]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = state.clock.elapsedTime;
    const s = useAppStore.getState();
    const { width, height } = state.size;
    const aspect = width > 0 && height > 0 ? width / height : 1;
    const portrait = aspect < PORTRAIT_ASPECT;

    // Recompute framings only on resize / focus change.
    if (aspect !== st.aspect) {
      st.aspect = aspect;
      st.focus = null;
      frameBox(rig.roomBox, HOME_AZ, HOME_EL, aspect, portrait ? HOME_SAFE_PORTRAIT : HOME_SAFE, HOME_PAD, 0, st.home);
    }
    if (s.focus !== st.focus) {
      st.focus = s.focus;
      const box = s.focus === 'home' ? undefined : rig.topicBoxes[s.focus];
      if (s.focus !== 'home' && box) {
        const az = st.topicAz[s.focus] ?? HOME_AZ;
        const safe = portrait ? TOPIC_SAFE_PORTRAIT : TOPIC_SAFE;
        frameBox(box, az, HOME_EL - TOPIC_EL_DROP, aspect, safe, TOPIC_PAD, TOPIC_MIN_DIST, st.focused);
      } else {
        copyView(st.focused, st.home);
      }
    }

    const running = s.phase === 'running';
    const goal = st.goal;
    if (running) {
      copyView(goal, st.focused);
    } else {
      goal.target.copy(st.home.target);
      goal.target.y += INTRO_LIFT;
      goal.az = HOME_AZ + INTRO_AZ + INTRO_DRIFT * Math.sin(t * 0.09);
      goal.el = HOME_EL + INTRO_EL;
      goal.dist = st.home.dist * INTRO_DIST;
    }

    const cur = st.cur;
    if (!st.init) {
      st.init = true;
      copyView(cur, goal);
    } else {
      const k = running ? CAM_K : INTRO_K;
      cur.target.lerp(goal.target, dampFactor(k, dt));
      cur.az = dampAngle(cur.az, goal.az, k, dt);
      cur.el = damp(cur.el, goal.el, k, dt);
      cur.dist = damp(cur.dist, goal.dist, k, dt);
    }

    st.parX = damp(st.parX, state.pointer.x * PARALLAX_X * st.parallax, PARALLAX_K, dt);
    st.parY = damp(st.parY, state.pointer.y * PARALLAX_Y * st.parallax, PARALLAX_K, dt);

    basis(cur.az, cur.el);
    state.camera.position
      .copy(cur.target)
      .addScaledVector(_back, cur.dist)
      .addScaledVector(_right, st.parX)
      .addScaledVector(_up, st.parY);
    state.camera.lookAt(cur.target);
  }, FRAME_PRIORITY);

  return null;
}

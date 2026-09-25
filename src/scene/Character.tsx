import { useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { NODES } from '../data/nodes';
import type { TopicId } from '../data/nodes';
import { useAppStore } from '../state/store';
import type { AppState, CharacterAction } from '../state/store';
import { talkSignal } from '../state/signals';
import type { CharacterRig, SceneRig } from './setup';
import ArrivalMirror from './ArrivalMirror';
import {
  clamp,
  damp,
  dampAngle,
  dampFactor,
  envelope,
  restorePart,
  setEmissive,
  smoothstep,
  warnOnce,
  wrapAngle,
} from './utils';

// ---- Tunables ----
const WALK_SPEED = 1.5; // units/s
const WALK_ACCEL = 3.2; // ease-in, units/s²
const WALK_DECEL = 2.6; // ease-out, units/s²
const CORNER_SPEED = 0.75; // max speed when passing through Spot_Home
const DIRECT_WALK_DIST = 1.6;
const ARRIVE_EPS = 0.004;
const STEP_LENGTH = 0.3; // ground covered per footstep (drives the walk cycle)
const BOB = 0.05;
const LEAN = 0.1;
const WADDLE = 0.05;
const FOOT_SWING = 0.12;
const FOOT_LIFT = 0.06;
const ARM_SWING = 0.5;
const YAW_K_WALK = 10;
const YAW_K_STAND = 6;
const MOUTH_K = 30;
const BLIP_WINDOW_MS = 90;
const SHOULDER_HEIGHT = 0.62;
const ANT_STIFFNESS = 140;
const ANT_DAMPING = 7.5;
const ANT_STEP = 1 / 120;
const FRAME_PRIORITY = -40;

type Gesture = Exclude<CharacterAction, 'idle'>;

const DURATION: Record<Gesture, number> = {
  wave: 1.6,
  jump: 0.74,
  think: 1.6,
  point: 1.5,
  celebrate: 1.4,
  shrug: 1.0,
};
const J_PREP = 0.12;
const J_AIR = 0.36;
const J_LAND = 0.26;

/** Additive gesture layer (0 / 1 = neutral). */
interface Pose {
  hop: number;
  bodyY: number;
  sy: number;
  sxz: number;
  bodyRotX: number;
  bodyRotZ: number;
  armLx: number;
  armLz: number;
  armRx: number;
  armRz: number;
  eyes: number;
  antX: number;
  antZ: number;
}

function resetPose(p: Pose): Pose {
  p.hop = 0;
  p.bodyY = 0;
  p.sy = 1;
  p.sxz = 1;
  p.bodyRotX = 0;
  p.bodyRotZ = 0;
  p.armLx = 0;
  p.armLz = 0;
  p.armRx = 0;
  p.armRz = 0;
  p.eyes = 1;
  p.antX = 0;
  p.antZ = 0;
  return p;
}

/** Smooths gesture starts/interruptions; squash & hop stay snappy. */
function dampPose(cur: Pose, tgt: Pose, dt: number): void {
  const fast = dampFactor(45, dt);
  const mid = dampFactor(25, dt);
  const slow = dampFactor(18, dt);
  cur.hop += (tgt.hop - cur.hop) * fast;
  cur.bodyY += (tgt.bodyY - cur.bodyY) * fast;
  cur.sy += (tgt.sy - cur.sy) * fast;
  cur.sxz += (tgt.sxz - cur.sxz) * fast;
  cur.eyes += (tgt.eyes - cur.eyes) * mid;
  cur.bodyRotX += (tgt.bodyRotX - cur.bodyRotX) * slow;
  cur.bodyRotZ += (tgt.bodyRotZ - cur.bodyRotZ) * slow;
  cur.armLx += (tgt.armLx - cur.armLx) * slow;
  cur.armLz += (tgt.armLz - cur.armLz) * slow;
  cur.armRx += (tgt.armRx - cur.armRx) * slow;
  cur.armRz += (tgt.armRz - cur.armRz) * slow;
  cur.antX += (tgt.antX - cur.antX) * slow;
  cur.antZ += (tgt.antZ - cur.antZ) * slow;
}

interface Local {
  /** Spots in Char_Root's parent space. */
  spots: Map<string, Vector3>;
  /** Hotspot bbox centres in Char_Root's parent space. */
  hotspots: Partial<Record<TopicId, Vector3>>;
}

interface Ctl {
  // walking
  goal: string;
  atSpot: string | null;
  walking: boolean;
  path: [Vector3, Vector3];
  pathLen: number;
  wp: number;
  speed: number;
  heading: number;
  yaw: number;
  phase: number;
  walkAmt: number;
  // gestures
  gesture: Gesture | null;
  gestureT0: number;
  queued: Gesture | null;
  lastNonce: number;
  kicks: number;
  pointLeft: boolean;
  pointTopic: TopicId | null;
  pointPhi: number;
  pointTheta: number;
  // face / talk
  blinkNext: number;
  blinkStart: number;
  blinkSecond: boolean;
  mouth: number;
  lastBlip: number;
  tipPulse: number;
  bounce: number;
  tipApplied: number;
  // antenna spring (rotation x/z)
  antX: number;
  antZ: number;
  antVX: number;
  antVZ: number;
  tgt: Pose;
  cur: Pose;
}

const _v = new Vector3();

export default function Character({ rig }: { rig: SceneRig }) {
  if (!rig.character) return <ArrivalMirror />;
  return <CharacterController rig={rig} char={rig.character} />;
}

function CharacterController({ rig, char }: { rig: SceneRig; char: CharacterRig }) {
  const local = useMemo<Local>(() => {
    const spots = new Map<string, Vector3>();
    rig.spots.forEach((p, name) => spots.set(name, p.clone().applyMatrix4(char.parentInverse)));
    const hotspots: Partial<Record<TopicId, Vector3>> = {};
    for (const h of rig.hotspots) hotspots[h.topic] = h.center.clone().applyMatrix4(char.parentInverse);
    return { spots, hotspots };
  }, [rig, char]);

  const ctl = useMemo<Ctl>(() => {
    const s = useAppStore.getState();
    return {
      goal: s.currentSpot,
      atSpot: s.currentSpot,
      walking: false,
      path: [new Vector3(), new Vector3()],
      pathLen: 0,
      wp: 0,
      speed: 0,
      heading: char.root.rot.y,
      yaw: char.root.rot.y,
      phase: 0,
      walkAmt: 0,
      gesture: null,
      gestureT0: 0,
      queued: null,
      lastNonce: s.actionNonce,
      kicks: 0,
      pointLeft: false,
      pointTopic: null,
      pointPhi: 0,
      pointTheta: 0,
      blinkNext: 1.5 + Math.random() * 2,
      blinkStart: -1,
      blinkSecond: false,
      mouth: 0.35,
      lastBlip: talkSignal.lastBlipAt,
      tipPulse: 0,
      bounce: 0,
      tipApplied: -1,
      antX: 0,
      antZ: 0,
      antVX: 0,
      antVZ: 0,
      tgt: resetPose({} as Pose),
      cur: resetPose({} as Pose),
    };
  }, [char]);

  // Stand on the current spot at mount; restore the rest pose on unmount.
  useLayoutEffect(() => {
    const s = useAppStore.getState();
    const p = local.spots.get(ctl.goal);
    if (p) {
      char.root.obj.position.x = p.x;
      char.root.obj.position.z = p.z;
    } else {
      warnOnce(`spot:${ctl.goal}`, `Spot "${ctl.goal}" not found — the character stays where it was modelled.`);
    }
    if (s.walking && s.targetSpot === s.currentSpot) s.setWalking(false);
    return () => {
      const { root, body, eyeL, eyeR, mouth, armL, armR, footL, footR, antenna, earL, earR } = char;
      for (const part of [root, body, eyeL, eyeR, mouth, armL, armR, footL, footR, antenna, earL, earR]) {
        if (part) restorePart(part);
      }
      setEmissive(char.tipSlots, char.tipGlow, 0);
    };
  }, [char, ctl, local]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const s = useAppStore.getState();
    const root = char.root.obj;

    // 1) Walk requests (re-plans mid-walk from the current position).
    if (s.targetSpot !== ctl.goal) planWalk(ctl, local, root.position, s.targetSpot);

    // 2) Gesture requests (queued while walking, played on arrival).
    if (s.actionNonce !== ctl.lastNonce) {
      ctl.lastNonce = s.actionNonce;
      if (s.action === 'idle') {
        ctl.gesture = null;
        ctl.queued = null;
      } else if (ctl.walking) {
        ctl.queued = s.action;
      } else {
        startGesture(ctl, local, root.position, s.action, t);
      }
    }

    // 3) Walk.
    let moved = 0;
    if (ctl.walking) {
      moved = stepWalk(ctl, root.position, dt);
      if (!ctl.walking) {
        useAppStore.getState().arrive(ctl.goal);
        if (ctl.queued) {
          startGesture(ctl, local, root.position, ctl.queued, t);
          ctl.queued = null;
        }
      }
    }
    ctl.phase += (moved / STEP_LENGTH) * Math.PI;
    ctl.walkAmt = damp(ctl.walkAmt, ctl.walking ? 1 : 0, 8, dt);

    // 4) Yaw: walking direction, else camera / active hotspot.
    if (ctl.walking) {
      ctl.yaw = dampAngle(ctl.yaw, ctl.heading, YAW_K_WALK, dt);
    } else {
      const target = faceYaw(s, local, char, root.position, state.camera.position);
      if (target !== null) ctl.yaw = dampAngle(ctl.yaw, target, YAW_K_STAND, dt);
    }
    ctl.yaw = wrapAngle(ctl.yaw);

    // 5) Gesture layer.
    resetPose(ctl.tgt);
    if (ctl.gesture) {
      const tau = t - ctl.gestureT0;
      if (tau >= DURATION[ctl.gesture]) {
        ctl.gesture = null;
      } else {
        if (ctl.gesture === 'point') pointAngles(ctl, local, root.position);
        gesturePose(ctl, ctl.gesture, tau, ctl.tgt);
      }
    }
    dampPose(ctl.cur, ctl.tgt, dt);
    const p = ctl.cur;

    // 6) Blink (sometimes a double blink).
    if (ctl.blinkStart < 0 && t >= ctl.blinkNext) ctl.blinkStart = t;
    let blink = 1;
    if (ctl.blinkStart >= 0) {
      const u = (t - ctl.blinkStart) / 0.12;
      if (u >= 1) {
        ctl.blinkStart = -1;
        if (!ctl.blinkSecond && Math.random() < 0.25) {
          ctl.blinkSecond = true;
          ctl.blinkNext = t + 0.08;
        } else {
          ctl.blinkSecond = false;
          ctl.blinkNext = t + 2.5 + Math.random() * 3;
        }
      } else {
        blink = 1 - 0.9 * Math.sin(Math.PI * u);
      }
    }

    // 7) Talking: mouth from babble blips, glow + tiny bounce per syllable.
    if (talkSignal.lastBlipAt !== ctl.lastBlip) {
      ctl.lastBlip = talkSignal.lastBlipAt;
      const i = clamp(talkSignal.intensity, 0, 1);
      ctl.tipPulse = Math.max(ctl.tipPulse, 0.5 + 0.7 * i);
      ctl.bounce = 1;
      ctl.antVZ += (Math.random() < 0.5 ? -1 : 1) * (0.8 + 1.2 * i);
    }
    ctl.tipPulse *= Math.exp(-8 * dt);
    ctl.bounce *= Math.exp(-14 * dt);
    let mouthTarget =
      performance.now() - talkSignal.lastBlipAt < BLIP_WINDOW_MS ? 0.6 + 1.0 * talkSignal.intensity : 0.35;
    if (s.talking) mouthTarget = Math.max(mouthTarget, 0.45);
    ctl.mouth = damp(ctl.mouth, mouthTarget, MOUTH_K, dt);

    // 8) Antenna spring (lags behind walking, wiggles when idle).
    const wa = ctl.walkAmt;
    const s1 = Math.sin(ctl.phase);
    const c1 = Math.cos(ctl.phase);
    const speedN = ctl.speed / WALK_SPEED;
    const antTX = 0.05 * Math.sin(1.3 * t) - 0.3 * speedN + 0.08 * wa * Math.sin(2 * ctl.phase) + p.antX;
    const antTZ = 0.06 * Math.sin(1.7 * t + 1) + p.antZ;
    for (let rem = dt; rem > 1e-6; rem -= ANT_STEP) {
      const h = Math.min(ANT_STEP, rem);
      ctl.antVX += (-ANT_STIFFNESS * (ctl.antX - antTX) - ANT_DAMPING * ctl.antVX) * h;
      ctl.antVZ += (-ANT_STIFFNESS * (ctl.antZ - antTZ) - ANT_DAMPING * ctl.antVZ) * h;
      ctl.antX += ctl.antVX * h;
      ctl.antZ += ctl.antVZ * h;
    }

    // ---- apply (base + offsets) ----
    root.position.y = char.root.pos.y + p.hop;
    root.rotation.y = ctl.yaw;

    const { body } = char;
    if (body) {
      const breath = 0.015 * Math.sin(2 * t);
      const o = body.obj;
      o.position.y = body.pos.y + wa * BOB * Math.abs(c1) + p.bodyY + 0.012 * ctl.bounce;
      o.rotation.x = body.rot.x + LEAN * wa * speedN + p.bodyRotX;
      o.rotation.z = body.rot.z + 0.02 * Math.sin(0.9 * t) * (1 - wa) + WADDLE * wa * s1 + p.bodyRotZ;
      const xz = (1 - breath * 0.5) * p.sxz;
      o.scale.set(body.scale.x * xz, body.scale.y * (1 + breath) * p.sy * (1 + 0.02 * ctl.bounce), body.scale.z * xz);
    }

    const { footL, footR } = char;
    if (footL) {
      footL.obj.position.z = footL.pos.z + wa * FOOT_SWING * s1;
      footL.obj.position.y = footL.pos.y + wa * FOOT_LIFT * Math.max(0, c1);
    }
    if (footR) {
      footR.obj.position.z = footR.pos.z - wa * FOOT_SWING * s1;
      footR.obj.position.y = footR.pos.y + wa * FOOT_LIFT * Math.max(0, -c1);
    }

    // Arms: +rot.x swings back, ArmL raises with +rot.z, ArmR with -rot.z.
    const idleArm = 0.06 + 0.025 * Math.sin(1.4 * t);
    const { armL, armR } = char;
    if (armL) {
      armL.obj.rotation.x = armL.rot.x + wa * ARM_SWING * s1 + p.armLx;
      armL.obj.rotation.z = armL.rot.z + idleArm + p.armLz;
    }
    if (armR) {
      armR.obj.rotation.x = armR.rot.x - wa * ARM_SWING * s1 + p.armRx;
      armR.obj.rotation.z = armR.rot.z - idleArm + p.armRz;
    }

    const eyeScale = blink * p.eyes;
    if (char.eyeL) char.eyeL.obj.scale.y = char.eyeL.scale.y * eyeScale;
    if (char.eyeR) char.eyeR.obj.scale.y = char.eyeR.scale.y * eyeScale;
    if (char.mouth) char.mouth.obj.scale.y = char.mouth.scale.y * ctl.mouth;

    if (char.antenna) {
      char.antenna.obj.rotation.x = char.antenna.rot.x + ctl.antX;
      char.antenna.obj.rotation.z = char.antenna.rot.z + ctl.antZ;
    }
    const ear = 0.04 * Math.sin(2.1 * t) + 0.12 * ctl.bounce + 0.1 * wa * Math.sin(2 * ctl.phase);
    if (char.earL) char.earL.obj.rotation.z = char.earL.rot.z + ear;
    if (char.earR) char.earR.obj.rotation.z = char.earR.rot.z - ear;

    const glow = 0.9 * ctl.tipPulse + (s.talking ? 0.12 : 0) + 0.05 * (0.5 + 0.5 * Math.sin(2.2 * t));
    if (Math.abs(glow - ctl.tipApplied) > 0.003) {
      ctl.tipApplied = glow;
      setEmissive(char.tipSlots, char.tipGlow, glow);
    }
  }, FRAME_PRIORITY);

  return null;
}

/** Plan a path to `target`: direct, or via Spot_Home for long spot→spot walks. */
function planWalk(ctl: Ctl, local: Local, pos: Vector3, target: string): void {
  const s = useAppStore.getState();
  ctl.goal = target;
  const dest = local.spots.get(target);
  if (!dest) {
    warnOnce(`spot:${target}`, `Spot "${target}" not found — arriving without walking.`);
    ctl.walking = false;
    ctl.speed = 0;
    ctl.atSpot = target;
    s.arrive(target);
    return;
  }
  const dist = Math.hypot(dest.x - pos.x, dest.z - pos.z);
  if (!ctl.walking && dist < ARRIVE_EPS) {
    ctl.atSpot = target;
    s.arrive(target);
    return;
  }
  const home = local.spots.get(NODES.homeSpot);
  const direct =
    !home || ctl.atSpot === NODES.homeSpot || target === NODES.homeSpot || dist < DIRECT_WALK_DIST;
  let n = 0;
  if (!direct && home) ctl.path[n++].copy(home);
  ctl.path[n++].copy(dest);
  ctl.pathLen = n;
  ctl.wp = 0;
  ctl.atSpot = null;
  if (!ctl.walking) {
    ctl.walking = true;
    ctl.gesture = null; // a running gesture fades out through the pose damping
    s.setWalking(true);
  }
}

/** Advance along the path with an ease-in/out speed profile. Returns distance moved. */
function stepWalk(ctl: Ctl, pos: Vector3, dt: number): number {
  const wp = ctl.path[ctl.wp];
  const dx = wp.x - pos.x;
  const dz = wp.z - pos.z;
  const leg = Math.hypot(dx, dz);
  const isLast = ctl.wp >= ctl.pathLen - 1;
  let rest = leg;
  for (let i = ctl.wp + 1; i < ctl.pathLen; i++) {
    const a = ctl.path[i - 1];
    const b = ctl.path[i];
    rest += Math.hypot(b.x - a.x, b.z - a.z);
  }
  let v = Math.min(WALK_SPEED, ctl.speed + WALK_ACCEL * dt, Math.sqrt(2 * WALK_DECEL * rest) + 0.05);
  if (!isLast) v = Math.min(v, Math.sqrt(2 * WALK_DECEL * leg + CORNER_SPEED * CORNER_SPEED));
  ctl.speed = v;
  if (leg > 1e-5) ctl.heading = Math.atan2(dx, dz);
  const step = v * dt;
  if (step < leg) {
    pos.x += (dx / leg) * step;
    pos.z += (dz / leg) * step;
    return step;
  }
  pos.x = wp.x;
  pos.z = wp.z;
  if (isLast) {
    ctl.walking = false;
    ctl.speed = 0;
    ctl.atSpot = ctl.goal;
  } else {
    ctl.wp++;
  }
  return leg;
}

/** Standing yaw: toward the camera, or toward the active topic's hotspot. */
function faceYaw(s: AppState, local: Local, char: CharacterRig, pos: Vector3, cameraPos: Vector3): number | null {
  let tx: number;
  let tz: number;
  const topic = s.facing === 'hotspot' ? (s.highlight ?? s.activeTopic) : null;
  const hp = topic ? local.hotspots[topic] : undefined;
  if (hp) {
    tx = hp.x;
    tz = hp.z;
  } else {
    _v.copy(cameraPos).applyMatrix4(char.parentInverse);
    tx = _v.x;
    tz = _v.z;
  }
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  if (dx * dx + dz * dz < 0.0025) return null;
  return Math.atan2(dx, dz);
}

/** Direction to the pointed-at hotspot in the character's local frame (x = its left, z = front). */
function localDir(ctl: Ctl, local: Local, pos: Vector3, out: Vector3): boolean {
  const hp = ctl.pointTopic ? local.hotspots[ctl.pointTopic] : undefined;
  if (!hp) return false;
  const dx = hp.x - pos.x;
  const dz = hp.z - pos.z;
  const cy = Math.cos(ctl.yaw);
  const sy = Math.sin(ctl.yaw);
  out.set(dx * cy - dz * sy, hp.y - (pos.y + SHOULDER_HEIGHT), dx * sy + dz * cy);
  return true;
}

function startGesture(ctl: Ctl, local: Local, pos: Vector3, g: Gesture, t: number): void {
  ctl.gesture = g;
  ctl.gestureT0 = t;
  ctl.kicks = 0;
  if (g === 'point') {
    const s = useAppStore.getState();
    ctl.pointTopic = s.highlight ?? s.activeTopic;
    ctl.pointLeft = localDir(ctl, local, pos, _v) && _v.x > 0.05;
  }
}

/**
 * Arm angles that aim the pointing arm at the hotspot. Arms hang along -Y and
 * use Euler XYZ, so dir = Rx(theta) * Rz(phi) * (0,-1,0)
 * = (sin phi, -cos phi cos theta, -cos phi sin theta).
 */
function pointAngles(ctl: Ctl, local: Local, pos: Vector3): void {
  let lx = 0;
  let lz = 1;
  let elev = 0.15;
  if (localDir(ctl, local, pos, _v)) {
    const hd = Math.hypot(_v.x, _v.z);
    if (hd > 1e-4) {
      lx = _v.x / hd;
      lz = _v.z / hd;
    }
    elev = clamp(Math.atan2(_v.y, Math.max(hd, 0.1)), -0.35, 0.6);
  }
  // Never reach across the body. Targets behind (the usual case while facing
  // the camera) get an over-the-shoulder point out to the side, not hidden behind.
  const behind = smoothstep(-0.2, 0.6, -lz);
  const minLat = -0.15 + 0.9 * behind;
  lx = ctl.pointLeft ? Math.max(lx, minLat) : Math.min(lx, -minLat);
  lz = Math.max(lz, -0.45);
  elev = clamp(elev + 0.35 * behind, -0.35, 0.8);
  const n = Math.hypot(lx, lz) || 1;
  lx /= n;
  lz /= n;
  const a = Math.PI / 2 + elev; // angle away from hanging straight down
  const dX = lx * Math.sin(a);
  const dY = -Math.cos(a);
  const dZ = lz * Math.sin(a);
  // Two Euler solutions; take the one with the least total rotation (no flipped arm).
  const phi1 = Math.asin(clamp(dX, -1, 1));
  const theta1 = Math.atan2(-dZ, -dY);
  const phi2 = (dX >= 0 ? Math.PI : -Math.PI) - phi1;
  const theta2 = wrapAngle(theta1 + Math.PI);
  if (Math.abs(phi1) + Math.abs(theta1) <= Math.abs(phi2) + Math.abs(theta2)) {
    ctl.pointPhi = phi1;
    ctl.pointTheta = theta1;
  } else {
    ctl.pointPhi = phi2;
    ctl.pointTheta = theta2;
  }
}

function hopArc(tau: number, start: number, dur: number, height: number): number {
  const u = (tau - start) / dur;
  return u > 0 && u < 1 ? height * Math.sin(Math.PI * u) : 0;
}

function landSquash(tau: number, at: number): number {
  const v = (tau - at) / 0.14;
  return v > 0 && v < 1 ? Math.sin(Math.PI * v) : 0;
}

function gesturePose(ctl: Ctl, g: Gesture, tau: number, p: Pose): void {
  switch (g) {
    case 'wave': {
      const e = envelope(tau, DURATION.wave, 0.2, 0.3);
      p.armRz = e * (-2.5 + 0.35 * Math.sin(tau * 12));
      p.armRx = -0.25 * e;
      p.armLz = 0.1 * e;
      p.bodyRotZ = -0.06 * e;
      p.bodyY = 0.02 * e * Math.abs(Math.sin(tau * 6));
      p.eyes = 1 - 0.25 * e;
      p.antZ = 0.12 * e * Math.sin(tau * 12);
      break;
    }
    case 'jump': {
      if (tau < J_PREP) {
        // anticipation squash
        const k = smoothstep(0, 1, tau / J_PREP);
        p.sy = 1 - 0.15 * k;
        p.sxz = 1 + 0.1 * k;
        p.eyes = 1 - 0.3 * k;
        p.armLz = 0.25 * k;
        p.armRz = -0.25 * k;
      } else if (tau < J_PREP + J_AIR) {
        // hop with stretch
        if (!(ctl.kicks & 1)) {
          ctl.kicks |= 1;
          ctl.antVX -= 3;
        }
        const u = (tau - J_PREP) / J_AIR;
        const arc = Math.sin(Math.PI * u);
        const st = u < 0.5 ? 0.1 * (1 - 2 * u) : 0.05 * (2 * u - 1);
        p.hop = 0.35 * arc;
        p.sy = 1 + st;
        p.sxz = 1 - st * 0.7;
        p.armLz = 0.25 + 0.65 * arc;
        p.armRz = -(0.25 + 0.65 * arc);
      } else {
        // landing squash, then settle
        if (!(ctl.kicks & 2)) {
          ctl.kicks |= 2;
          ctl.antVX += 5;
        }
        const v = Math.min(1, (tau - J_PREP - J_AIR) / J_LAND);
        const sq = v < 0.5 ? Math.sin(Math.PI * v * 2) : -0.25 * Math.sin(Math.PI * (v * 2 - 1));
        p.sy = 1 - 0.14 * sq;
        p.sxz = 1 + 0.09 * sq;
        p.eyes = 1 - 0.25 * Math.max(0, sq);
        p.armLz = 0.25 * (1 - v);
        p.armRz = -0.25 * (1 - v);
      }
      break;
    }
    case 'think': {
      const e = envelope(tau, DURATION.think, 0.25, 0.35);
      p.bodyRotZ = e * (0.12 + 0.02 * Math.sin(tau * 2.5));
      // left hand forward to the "chin", tapping
      p.armLx = -1.45 * e;
      p.armLz = e * (-0.3 + 0.06 * Math.sin(tau * 7));
      p.eyes = 1 - 0.4 * e;
      p.antX = 0.5 * e;
      p.antZ = -0.15 * e;
      break;
    }
    case 'point': {
      const e = envelope(tau, DURATION.point, 0.2, 0.3);
      if (ctl.pointLeft) {
        p.armLz = ctl.pointPhi * e;
        p.armLx = ctl.pointTheta * e;
        p.armRz = -0.12 * e;
        p.bodyRotZ = -0.05 * e;
      } else {
        p.armRz = ctl.pointPhi * e;
        p.armRx = ctl.pointTheta * e;
        p.armLz = 0.12 * e;
        p.bodyRotZ = 0.05 * e;
      }
      p.antX = -0.12 * e;
      break;
    }
    case 'celebrate': {
      const e = envelope(tau, DURATION.celebrate, 0.15, 0.35);
      const w = 0.2 * Math.sin(tau * 14);
      p.armLz = e * (2.6 + w);
      p.armRz = -e * (2.6 - w);
      p.hop = hopArc(tau, 0.08, 0.38, 0.2) + hopArc(tau, 0.6, 0.32, 0.12);
      const sq = landSquash(tau, 0.46) + 0.6 * landSquash(tau, 0.92);
      p.sy = 1 - 0.08 * sq;
      p.sxz = 1 + 0.05 * sq;
      p.eyes = 1 - 0.3 * e;
      p.antZ = 0.15 * e * Math.sin(tau * 14);
      if (!(ctl.kicks & 1) && tau > 0.46) {
        ctl.kicks |= 1;
        ctl.antVX += 3;
      }
      break;
    }
    case 'shrug': {
      const e = envelope(tau, DURATION.shrug, 0.18, 0.3);
      p.armLz = 1.2 * e;
      p.armRz = -1.2 * e;
      p.armLx = -0.35 * e;
      p.armRx = -0.35 * e;
      p.sy = 1 - 0.05 * e;
      p.sxz = 1 + 0.03 * e;
      p.bodyRotZ = 0.08 * e;
      p.eyes = 1 - 0.15 * e;
      p.antX = 0.25 * e;
      break;
    }
  }
}


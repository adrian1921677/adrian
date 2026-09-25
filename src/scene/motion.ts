import { Vector3 } from 'three';
import { NODES } from '../data/nodes';
import { clamp, warnOnce, wrapAngle } from './utils';

// ---- Walk tunables ----
export const WALK_SPEED = 1.5; // units/s
const WALK_ACCEL = 3.2; // ease-in, units/s²
const WALK_DECEL = 2.6; // ease-out, units/s²
const CORNER_SPEED = 0.75; // max speed when passing through Spot_Home
const DIRECT_WALK_DIST = 1.6;
const ARRIVE_EPS = 0.004;

/** Pure walk state (positions live in Char_Root's parent space). */
export interface Walk {
  goal: string;
  atSpot: string | null;
  walking: boolean;
  path: [Vector3, Vector3];
  pathLen: number;
  wp: number;
  speed: number;
  heading: number;
}

export function makeWalk(spot: string, heading: number): Walk {
  return {
    goal: spot,
    atSpot: spot,
    walking: false,
    path: [new Vector3(), new Vector3()],
    pathLen: 0,
    wp: 0,
    speed: 0,
    heading,
  };
}

/**
 * Plan a path to `target` from `pos`: direct when starting at / going to
 * Spot_Home or when short, else via Spot_Home. Mid-walk calls re-plan.
 *  - 'arrive': nothing to walk (already there, or the spot is missing)
 *  - 'start':  a walk begins
 *  - 'replan': the running walk now heads somewhere else
 */
export function planWalk(w: Walk, spots: Map<string, Vector3>, pos: Vector3, target: string): 'arrive' | 'start' | 'replan' {
  w.goal = target;
  const dest = spots.get(target);
  if (!dest) {
    warnOnce(`spot:${target}`, `Spot "${target}" not found — arriving without walking.`);
    w.walking = false;
    w.speed = 0;
    w.atSpot = target;
    return 'arrive';
  }
  const dist = Math.hypot(dest.x - pos.x, dest.z - pos.z);
  if (!w.walking && dist < ARRIVE_EPS) {
    w.atSpot = target;
    return 'arrive';
  }
  const home = spots.get(NODES.homeSpot);
  const direct = !home || w.atSpot === NODES.homeSpot || target === NODES.homeSpot || dist < DIRECT_WALK_DIST;
  let n = 0;
  if (!direct && home) w.path[n++].copy(home);
  w.path[n++].copy(dest);
  w.pathLen = n;
  w.wp = 0;
  w.atSpot = null;
  if (w.walking) return 'replan';
  w.walking = true;
  return 'start';
}

/** Advance along the path with an ease-in/out speed profile. Returns the distance moved. */
export function stepWalk(w: Walk, pos: Vector3, dt: number): number {
  const wp = w.path[w.wp];
  const dx = wp.x - pos.x;
  const dz = wp.z - pos.z;
  const leg = Math.hypot(dx, dz);
  const isLast = w.wp >= w.pathLen - 1;
  let rest = leg;
  for (let i = w.wp + 1; i < w.pathLen; i++) {
    const a = w.path[i - 1];
    const b = w.path[i];
    rest += Math.hypot(b.x - a.x, b.z - a.z);
  }
  let v = Math.min(WALK_SPEED, w.speed + WALK_ACCEL * dt, Math.sqrt(2 * WALK_DECEL * rest) + 0.05);
  if (!isLast) v = Math.min(v, Math.sqrt(2 * WALK_DECEL * leg + CORNER_SPEED * CORNER_SPEED));
  w.speed = v;
  if (leg > 1e-5) w.heading = Math.atan2(dx, dz);
  const step = v * dt;
  if (step < leg) {
    pos.x += (dx / leg) * step;
    pos.z += (dz / leg) * step;
    return step;
  }
  pos.x = wp.x;
  pos.z = wp.z;
  if (isLast) {
    w.walking = false;
    w.speed = 0;
    w.atSpot = w.goal;
  } else {
    w.wp++;
  }
  return leg;
}

/**
 * Arm rotation (Euler XYZ) that aims an arm hanging along -Y at unit direction
 * d: Rx(theta)·Rz(phi)·(0,-1,0) = (sin phi, -cos phi cos theta, -cos phi sin theta).
 * Of the two solutions it returns the one with the least total rotation.
 */
export function solveArmAngles(dX: number, dY: number, dZ: number, out: { phi: number; theta: number }): void {
  const phi1 = Math.asin(clamp(dX, -1, 1));
  const theta1 = Math.atan2(-dZ, -dY);
  const phi2 = (dX >= 0 ? Math.PI : -Math.PI) - phi1;
  const theta2 = wrapAngle(theta1 + Math.PI);
  if (Math.abs(phi1) + Math.abs(theta1) <= Math.abs(phi2) + Math.abs(theta2)) {
    out.phi = phi1;
    out.theta = theta1;
  } else {
    out.phi = phi2;
    out.theta = theta2;
  }
}

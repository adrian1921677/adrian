import { Color, Euler, Vector3 } from 'three';
import type { Material, Object3D } from 'three';

const warned = new Set<string>();

/** console.warn once per key — missing GLB nodes must never spam or crash. */
export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[scene] ${message}`);
}

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent damping factor. */
export function dampFactor(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

export function damp(current: number, target: number, k: number, dt: number): number {
  return current + (target - current) * dampFactor(k, dt);
}

/** Wrap to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shortest-angle damping. */
export function dampAngle(current: number, target: number, k: number, dt: number): number {
  return current + wrapAngle(target - current) * dampFactor(k, dt);
}

/** Fade-in / hold / fade-out envelope over [0, dur]. */
export function envelope(t: number, dur: number, fadeIn: number, fadeOut: number): number {
  return smoothstep(0, fadeIn, t) * (1 - smoothstep(dur - fadeOut, dur, t));
}

/** Base transform of an animated node; animation = base + offset, so nothing drifts. */
export interface Part {
  obj: Object3D;
  pos: Vector3;
  rot: Euler;
  scale: Vector3;
}

export function capturePart(obj: Object3D): Part {
  return { obj, pos: obj.position.clone(), rot: obj.rotation.clone(), scale: obj.scale.clone() };
}

export function restorePart(p: Part): void {
  p.obj.position.copy(p.pos);
  p.obj.rotation.copy(p.rot);
  p.obj.scale.copy(p.scale);
}

export type EmissiveMaterial = Material & { emissive: Color; emissiveIntensity: number };

export function hasEmissive(m: Material): m is EmissiveMaterial {
  return (m as Partial<EmissiveMaterial>).emissive instanceof Color;
}

/** A cloned material plus its original emissive (color * intensity, linear). */
export interface EmissiveSlot {
  material: EmissiveMaterial;
  base: Color;
}

/** emissive = original + color * amount (always additive on top of the original). */
export function setEmissive(slots: EmissiveSlot[], color: Color, amount: number): void {
  for (let i = 0; i < slots.length; i++) {
    const { material, base } = slots[i];
    material.emissive.setRGB(
      base.r + color.r * amount,
      base.g + color.g * amount,
      base.b + color.b * amount,
    );
    material.emissiveIntensity = 1;
  }
}

/** Returns a no-op raycast so an object can be switched non-interactive. */
export function noRaycast(): void {
  /* intentionally empty */
}

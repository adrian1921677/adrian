import { MathUtils, Vector3 } from 'three';
import type { Box3 } from 'three';

export const FOV = 30;
/** Home view direction normalize(1, 0.78, 1) as azimuth (from +Z toward +X) / elevation. */
export const HOME_AZ = Math.atan2(1, 1);
export const HOME_EL = Math.atan2(0.78, Math.SQRT2);

/** Orbit view: look `target` from direction (az, el) at `dist`. */
export interface View {
  target: Vector3;
  az: number;
  el: number;
  dist: number;
}

export const makeView = (): View => ({ target: new Vector3(), az: HOME_AZ, el: HOME_EL, dist: 12 });

export function copyView(out: View, v: View): void {
  out.target.copy(v.target);
  out.az = v.az;
  out.el = v.el;
  out.dist = v.dist;
}

/** Camera basis of the last `basis()` call (back = from target toward the camera). */
export const viewBack = new Vector3();
export const viewRight = new Vector3();
export const viewUp = new Vector3();

export function basis(az: number, el: number): void {
  const ce = Math.cos(el);
  viewBack.set(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce);
  viewRight.set(Math.cos(az), 0, -Math.sin(az));
  viewUp.crossVectors(viewBack, viewRight);
}

const _c = new Vector3();
const _p = new Vector3();

/**
 * Fit all 8 corners of `box` for direction (az, el) and `aspect`, so the
 * subject fills at most the top `safe` share of the screen (the look target
 * is shifted down; the dialogue UI covers the bottom).
 */
export function frameBox(
  box: Box3,
  az: number,
  el: number,
  aspect: number,
  safe: number,
  pad: number,
  minDist: number,
  out: View,
): void {
  box.getCenter(_c);
  basis(az, el);
  const tanHalf = Math.tan(MathUtils.degToRad(FOV) / 2);
  const tanV = (tanHalf * safe) / pad;
  const tanH = (tanHalf * aspect) / pad;
  let d = minDist;
  for (let i = 0; i < 8; i++) {
    _p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(_c);
    const z = _p.dot(viewBack);
    d = Math.max(d, z + Math.abs(_p.dot(viewRight)) / tanH, z + Math.abs(_p.dot(viewUp)) / tanV);
  }
  const shift = (1 - safe) * tanHalf * d;
  out.target.copy(_c).addScaledVector(viewUp, -shift);
  out.az = az;
  out.el = el;
  out.dist = d;
}

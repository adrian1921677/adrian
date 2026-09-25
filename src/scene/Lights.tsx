import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { NeutralToneMapping, Object3D, Vector3 } from 'three';
import type { DirectionalLight, ToneMapping } from 'three';
import type { SceneRig } from './setup';

// ---- Tunables (three r169 physical units: ~PI on a light ≈ full albedo) ----
/** Neutral keeps pastel colours closer to their Blender base colour than ACES. */
const TONE_MAPPING: ToneMapping = NeutralToneMapping;
const EXPOSURE = 1.0;

const HEMI_SKY = '#ffe9d6';
const HEMI_GROUND = '#3a2a4a';
const HEMI_INTENSITY = 1.3;

const AMBIENT_COLOR = '#b9a8ff';
const AMBIENT_INTENSITY = 0.25;

const KEY_COLOR = '#ffe4c8';
const KEY_INTENSITY = 2.2;
/** Key light offset from the room's floor centre (upper right-front). */
const KEY_OFFSET: [number, number, number] = [6, 9, 5];
const SHADOW_EXTENT = 5;
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.02;

const LAMP_COLOR = '#ffb56b';
const LAMP_INTENSITY = 4;
const LAMP_DISTANCE = 4.5;

const WINDOW_COLOR = '#9ec5ff';
const WINDOW_INTENSITY = 2.5;
const WINDOW_DISTANCE = 5;

export default function Lights({ rig }: { rig: SceneRig }) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const keyRef = useRef<DirectionalLight>(null);

  // Decided once at mount; resizing the shadow map later would need a re-alloc.
  const [mapSize] = useState(() => (get().size.width < 768 ? 1024 : 2048));

  const center = useMemo(() => {
    const c = rig.roomBox.getCenter(new Vector3());
    return [c.x, rig.roomBox.min.y, c.z] as const;
  }, [rig]);
  const target = useMemo(() => new Object3D(), []);

  useLayoutEffect(() => {
    gl.toneMapping = TONE_MAPPING;
    gl.toneMappingExposure = EXPOSURE;
  }, [gl]);

  useLayoutEffect(() => {
    keyRef.current?.shadow.camera.updateProjectionMatrix();
  }, [mapSize]);

  return (
    <>
      <hemisphereLight args={[HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY]} />
      <ambientLight color={AMBIENT_COLOR} intensity={AMBIENT_INTENSITY} />
      <primitive object={target} position={[center[0], center[1], center[2]]} />
      <directionalLight
        ref={keyRef}
        color={KEY_COLOR}
        intensity={KEY_INTENSITY}
        position={[center[0] + KEY_OFFSET[0], center[1] + KEY_OFFSET[1], center[2] + KEY_OFFSET[2]]}
        target={target}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-bias={SHADOW_BIAS}
        shadow-normalBias={SHADOW_NORMAL_BIAS}
      />
      {rig.lamp && (
        <pointLight
          position={rig.lamp}
          color={LAMP_COLOR}
          intensity={LAMP_INTENSITY}
          distance={LAMP_DISTANCE}
          decay={2}
        />
      )}
      {rig.window && (
        <pointLight
          position={rig.window}
          color={WINDOW_COLOR}
          intensity={WINDOW_INTENSITY}
          distance={WINDOW_DISTANCE}
          decay={2}
        />
      )}
    </>
  );
}

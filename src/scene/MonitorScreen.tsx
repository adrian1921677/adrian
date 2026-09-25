import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshBasicMaterial } from 'three';
import type { Mesh } from 'three';
import { useAppStore } from '../state/store';
import { ScreenTexture } from './screenTexture';

const FRAME_PRIORITY = -10;

/** Puts the animated editor (with store.screenTitle) on Desk_Screen. */
export default function MonitorScreen({ meshes }: { meshes: Mesh[] }) {
  const gl = useThree((s) => s.gl);
  const screen = useRef<ScreenTexture | null>(null);

  useEffect(() => {
    if (meshes.length === 0) return;
    const tex = new ScreenTexture(gl.capabilities.getMaxAnisotropy());
    const material = new MeshBasicMaterial({ map: tex.texture, toneMapped: false });
    const originals = meshes.map((m) => m.material);
    for (const m of meshes) m.material = material;
    screen.current = tex;
    return () => {
      screen.current = null;
      meshes.forEach((m, i) => {
        m.material = originals[i];
      });
      material.dispose();
      tex.dispose();
    };
  }, [meshes, gl]);

  useFrame((state) => {
    screen.current?.update(state.clock.elapsedTime, useAppStore.getState().screenTitle);
  }, FRAME_PRIORITY);

  return null;
}

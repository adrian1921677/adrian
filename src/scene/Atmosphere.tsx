import { useMemo } from 'react';
import { Sparkles } from '@react-three/drei';
import { Vector3 } from 'three';
import type { Box3 } from 'three';

const DUST_COUNT = 40;
const DUST_COLOR = '#ffd9a8';
const DUST_SIZE = 3;

/** Warm dust motes floating inside the room volume. */
export default function Atmosphere({ roomBox }: { roomBox: Box3 }) {
  const { position, scale } = useMemo(() => {
    const size = roomBox.getSize(new Vector3());
    const c = roomBox.getCenter(new Vector3());
    return {
      position: [c.x, roomBox.min.y + size.y * 0.45, c.z] as [number, number, number],
      scale: [size.x * 0.8, size.y * 0.7, size.z * 0.8] as [number, number, number],
    };
  }, [roomBox]);

  return (
    <Sparkles
      count={DUST_COUNT}
      position={position}
      scale={scale}
      size={DUST_SIZE}
      speed={0.25}
      opacity={0.6}
      noise={0.6}
      color={DUST_COLOR}
    />
  );
}

import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../state/store';
import { bubbleAnchor } from '../state/signals';

/**
 * Stand-in when there is no walkable character (node missing or GLB failed):
 * every walk "arrives" instantly so the dialogue flow never waits forever.
 */
export default function ArrivalMirror() {
  useEffect(() => {
    bubbleAnchor.visible = false;
  }, []);

  useFrame(() => {
    const s = useAppStore.getState();
    if (s.targetSpot !== s.currentSpot) s.arrive(s.targetSpot);
    else if (s.walking) s.setWalking(false);
  });

  return null;
}

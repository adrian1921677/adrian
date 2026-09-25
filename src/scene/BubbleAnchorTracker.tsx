import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { bubbleAnchor } from '../state/signals';
import type { SceneRig } from './setup';

/** Used when Char_BubbleAnchor is missing: roughly above the head. */
const FALLBACK_HEIGHT = 1.35;
/** The anchor counts as visible only this far inside the viewport (CSS px). */
const MARGIN = 8;
/** Runs after the character and the camera rig. */
const FRAME_PRIORITY = -20;

const _world = new Vector3();
const _view = new Vector3();

/** Projects Char_BubbleAnchor to canvas CSS pixels every frame for the speech bubble. */
export default function BubbleAnchorTracker({ rig }: { rig: SceneRig }) {
  useEffect(
    () => () => {
      bubbleAnchor.visible = false;
    },
    [],
  );

  useFrame((state) => {
    const char = rig.character;
    if (!char) {
      bubbleAnchor.visible = false;
      return;
    }
    if (char.bubbleAnchor) {
      char.bubbleAnchor.getWorldPosition(_world);
    } else {
      char.root.obj.getWorldPosition(_world);
      _world.y += FALLBACK_HEIGHT;
    }
    const { camera, size } = state;
    camera.updateMatrixWorld(); // the rig moved it this frame
    const inFront = _view.copy(_world).applyMatrix4(camera.matrixWorldInverse).z < 0;
    _world.project(camera);
    const x = (_world.x * 0.5 + 0.5) * size.width;
    const y = (0.5 - _world.y * 0.5) * size.height;
    bubbleAnchor.x = x;
    bubbleAnchor.y = y;
    bubbleAnchor.visible =
      inFront && x >= MARGIN && x <= size.width - MARGIN && y >= MARGIN && y <= size.height - MARGIN;
  }, FRAME_PRIORITY);

  return null;
}

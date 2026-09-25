import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { MODEL_URL } from '../data/nodes';
import { useAppStore } from '../state/store';
import { getSceneRig } from './setup';
import { isRunning, setHover } from './interaction';
import Lights from './Lights';
import Character from './Character';
import Hotspots from './Hotspots';
import CameraRig from './CameraRig';
import BubbleAnchorTracker from './BubbleAnchorTracker';
import MonitorScreen from './MonitorScreen';
import Atmosphere from './Atmosphere';

useGLTF.preload(MODEL_URL);

/** Loads room.glb, prepares it once, and mounts every scene system on top of it. */
export default function Room() {
  const { scene } = useGLTF(MODEL_URL);
  const rig = useMemo(() => getSceneRig(scene), [scene]);
  const gl = useThree((s) => s.gl);
  const threeScene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    // Warm up shaders so the first real frame doesn't hitch, then report ready.
    try {
      gl.compile(threeScene, camera);
    } catch (err) {
      console.warn('[scene] shader warm-up failed', err);
    }
    useAppStore.getState().setSceneReady();
    return () => setHover(null);
  }, [gl, threeScene, camera]);

  // One set of handlers for the whole GLB; ownership decides what was hit.
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isRunning()) return setHover(null);
    e.stopPropagation(); // nearest hit only
    setHover(rig.owners.get(e.object) ?? null);
  };
  const onPointerOut = () => setHover(null);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isRunning()) return;
    const owner = rig.owners.get(e.object);
    if (!owner) return;
    e.stopPropagation();
    const s = useAppStore.getState();
    if (owner === 'character') s.poke();
    else s.requestTopic(owner);
  };

  return (
    <>
      <Lights rig={rig} />
      <primitive object={scene} onPointerMove={onPointerMove} onPointerOut={onPointerOut} onClick={onClick} />
      <Character rig={rig} />
      <Hotspots rig={rig} />
      <CameraRig rig={rig} />
      <BubbleAnchorTracker rig={rig} />
      <MonitorScreen meshes={rig.screenMeshes} />
      <Atmosphere roomBox={rig.roomBox} />
    </>
  );
}

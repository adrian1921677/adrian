import { Component, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import Room from './Room';
import ArrivalMirror from './ArrivalMirror';

/** Catches GLB load/setup errors inside the canvas; the UI shows its own error state. */
class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[scene] failed to load the room', error, info.componentStack);
  }

  render(): ReactNode {
    // Keep walks "arriving" so the dialogue never waits on a missing scene.
    return this.state.failed ? <ArrivalMirror /> : this.props.children;
  }
}

/** Full-bleed transparent 3D canvas; the page background comes from CSS. */
export default function Experience() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 0.1, far: 150, position: [14, 11, 14] }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <SceneErrorBoundary>
        <Suspense fallback={null}>
          <Room />
        </Suspense>
      </SceneErrorBoundary>
    </Canvas>
  );
}

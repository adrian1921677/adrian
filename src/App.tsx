import { MotionConfig } from 'framer-motion';
import { useDirector } from './dialogue/useDirector';
import Experience from './scene/Experience';
import { LoaderGate } from './ui/LoaderGate';
import { Overlay } from './ui/Overlay';

export default function App() {
  useDirector();

  return (
    <MotionConfig reducedMotion="user">
      <main className="app-shell fixed inset-0 overflow-hidden">
        {/* 3D room behind everything */}
        <div className="absolute inset-0 z-0">
          <Experience />
        </div>
        <div className="grain pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
        <Overlay />
        <LoaderGate />
      </main>
    </MotionConfig>
  );
}

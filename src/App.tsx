import { useEffect, useState } from 'react';
import SideNav from './components/SideNav';
import MobileBar from './components/MobileBar';
import MobileMenu from './components/MobileMenu';
import Hero from './components/Hero';
import About from './components/sections/About';
import Journey from './components/sections/Journey';
import Work from './components/sections/Work';
import Playground from './components/sections/Playground';
import Contact from './components/sections/Contact';
import Footer from './components/Footer';
import Cursor from './components/Cursor';
import DepthGauge from './components/DepthGauge';
import { useAmbience } from './hooks/useAmbience';
import { SMOOTH_CONTENT_ID, useSmoothScroll } from './hooks/useSmoothScroll';
import { useDepthScroll } from './hooks/useDepthScroll';
import { initEasterEggs } from './lib/easterEggs';

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { enabled: soundEnabled, toggle: toggleSound } = useAmbience();

  useSmoothScroll();
  useDepthScroll();
  useEffect(() => initEasterEggs(), []);

  return (
    <>
      {/* Bewusst außerhalb von #smooth-content: dessen Transform würde sonst
          zum Bezugsrahmen für alles Fixierte und die Navigation mitscrollen. */}
      <Cursor />
      <SideNav soundEnabled={soundEnabled} onToggleSound={toggleSound} />
      <DepthGauge />
      <MobileBar
        onOpenMenu={() => setMenuOpen(true)}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
      />
      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}

      <div id={SMOOTH_CONTENT_ID} className="bg-[#0a0a0a]">
        <main>
          <Hero />
          <About />
          <Journey />
          <Work />
          <Playground />
          <Contact />
        </main>
        <Footer />
      </div>
    </>
  );
}

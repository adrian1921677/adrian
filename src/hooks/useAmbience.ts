import { useCallback, useEffect, useRef, useState } from 'react';
import {
  disableAudio,
  enableAudio,
  resumeFromBackground,
  suspendForBackground,
} from '../audio/engine';

const STORAGE_KEY = 'adrian:ambience';

/** Der Toggle-Button trägt dieses Attribut — siehe Autostart unten. */
export const AMBIENCE_TOGGLE_ATTR = 'data-ambience-toggle';

/**
 * Der Wald läuft ab Start — außer jemand hat ihn beim letzten Besuch bewusst
 * ausgeschaltet. Browser blockieren Ton ohne Nutzergeste, deshalb wird der
 * Start sofort versucht und bei Ablehnung an die erste Interaktion gehängt.
 */
export function useAmbience() {
  const [enabled, setEnabled] = useState(true);
  /** Spiegelt `enabled`, damit toggle() nie einen veralteten Closure-Wert liest. */
  const enabledRef = useRef(true);

  const enable = useCallback(async () => {
    enabledRef.current = true;
    setEnabled(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, 'on');
    } catch {
      /* Storage gesperrt — egal */
    }
    return enableAudio();
  }, []);

  const disable = useCallback(() => {
    disableAudio();
    enabledRef.current = false;
    setEnabled(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, 'off');
    } catch {
      /* Storage gesperrt — egal */
    }
  }, []);

  const toggle = useCallback(() => {
    if (enabledRef.current) disable();
    else void enable();
  }, [disable, enable]);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* Storage gesperrt */
    }

    if (stored === 'off') {
      enabledRef.current = false;
      setEnabled(false);
      return;
    }

    let cancelled = false;

    const detach = () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      window.removeEventListener('wheel', kick);
      window.removeEventListener('touchstart', kick);
    };

    function kick(event: Event) {
      // Ein Klick auf den Toggle gehört dem Toggle. Ohne diese Ausnahme
      // würde das pointerdown hier den Ton anschalten und der direkt
      // folgende click ihn sofort wieder aus — der Button wirkt kaputt.
      const target = event.target;
      if (target instanceof Element && target.closest(`[${AMBIENCE_TOGGLE_ATTR}]`)) return;
      detach();
      if (enabledRef.current) void enableAudio();
    }

    void (async () => {
      const result = await enableAudio();
      if (cancelled) return;
      // Autoplay abgelehnt -> beim ersten echten Kontakt nachziehen.
      if (result !== 'running') {
        window.addEventListener('pointerdown', kick);
        window.addEventListener('keydown', kick);
        window.addEventListener('wheel', kick, { passive: true });
        window.addEventListener('touchstart', kick, { passive: true });
      }
    })();

    return () => {
      cancelled = true;
      detach();
    };
  }, []);

  // Im Hintergrundtab schweigen.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) suspendForBackground();
      else resumeFromBackground();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => () => disableAudio(), []);

  return { enabled, toggle };
}

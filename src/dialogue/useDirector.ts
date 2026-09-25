import { useEffect } from 'react';
import { director } from './director';

/** Mounts the dialogue director for the lifetime of the app. */
export function useDirector() {
  useEffect(() => {
    director.start();
    return () => director.stop();
  }, []);
}

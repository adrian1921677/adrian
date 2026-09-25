import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { GalleryImage } from '../data/types';
import { ComicModal } from './ComicModal';

interface LightboxProps {
  images: GalleryImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}

/** Enlarged making-of image with prev/next (arrow keys work too). */
export function Lightbox({ images, index, onIndex, onClose }: LightboxProps) {
  const step = (d: number) => onIndex((index + d + images.length) % images.length);
  const img = images[index];

  return (
    <ComicModal
      title="Hinter den Kulissen"
      onClose={onClose}
      wide
      onKey={(e) => {
        if (e.key === 'ArrowLeft') step(-1);
        if (e.key === 'ArrowRight') step(1);
      }}
    >
      <figure className="lightbox-figure">
        <img src={img.src} alt={img.caption} className="lightbox-img" />
        <figcaption className="lightbox-caption">
          <button type="button" className="lightbox-nav" onClick={() => step(-1)} aria-label="Vorheriges Bild">
            <ChevronLeft size={20} strokeWidth={2.8} aria-hidden="true" />
          </button>
          <span>
            {img.caption}
            <span className="ml-2 tabular-nums text-ink-muted">
              {index + 1}/{images.length}
            </span>
          </span>
          <button type="button" className="lightbox-nav" onClick={() => step(1)} aria-label="Nächstes Bild">
            <ChevronRight size={20} strokeWidth={2.8} aria-hidden="true" />
          </button>
        </figcaption>
      </figure>
    </ComicModal>
  );
}

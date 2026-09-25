import type { CharacterAction } from '../state/store';
import type { TopicId } from './nodes';

export type Mood = 'happy' | 'excited' | 'thinking' | 'proud' | 'shy';

export interface TimelineCard {
  /** e.g. "2021 – heute" */
  period: string;
  /** Role / degree */
  title: string;
  /** Company / school / place */
  org: string;
  bullets?: string[];
}

export interface Skill {
  name: string;
  /** 0–100 */
  level: number;
}

export interface ContactLink {
  label: string;
  href: string;
  /** lucide-react icon name to render, e.g. "Mail", "Linkedin", "Github", "Instagram", "Globe" */
  icon: string;
}

interface LineBase {
  /** What Momo says; typed out with babble. Keep it short (≤ ~140 chars). */
  text: string;
  mood?: Mood;
  /** Optional gesture the character plays when this line starts. */
  gesture?: CharacterAction;
}

export interface GalleryImage {
  src: string;
  caption: string;
}

export type GameId = 'keepy' | 'fix' | 'memory';

export type Line =
  | (LineBase & { kind: 'say' })
  | (LineBase & { kind: 'card'; card: TimelineCard })
  | (LineBase & { kind: 'skills'; skills: Skill[] })
  | (LineBase & { kind: 'contact'; links: ContactLink[] })
  | (LineBase & { kind: 'gallery'; images: GalleryImage[] })
  | (LineBase & { kind: 'games' });

export interface Topic {
  id: TopicId;
  /** Full question as shown in the question bubble, e.g. "Was hat Adrian gemacht?" */
  question: string;
  /** Short title for the monitor screen / text CV headings */
  title: string;
  /** lucide-react icon name for the chip */
  icon: string;
  /** Lowercase German/English keywords for free-text routing */
  keywords: string[];
  /** Said immediately when picked, before walking over ("Ooh, komm mit!") */
  reaction: string;
  lines: Line[];
}

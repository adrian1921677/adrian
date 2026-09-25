import { TOPICS } from '../data/content';
import type { TopicId } from '../data/nodes';

export type SmallTalk = 'greeting' | 'name' | 'thanks' | 'joke';
export type Route =
  | { type: 'topic'; id: TopicId }
  | { type: 'smalltalk'; intent: SmallTalk }
  | { type: 'unknown' };

/** Lowercase, fold umlauts, strip punctuation, collapse whitespace. */
export function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GREETING_WORDS = ['hallo', 'hi', 'hey', 'servus', 'moin', 'hello', 'huhu', 'gruezi', 'ciao'];
const PHRASES: Record<Exclude<SmallTalk, 'greeting'>, string[]> = {
  name: ['wie heisst du', 'wer bist du', 'dein name', 'wie ist dein name', 'what is your name', 'who are you'],
  thanks: ['danke', 'thx', 'merci', 'thanks', 'thank you', 'vielen dank'],
  joke: ['witz', 'joke', 'lustig', 'bring mich zum lachen'],
};

const TOPIC_KEYWORDS = TOPICS.map((t) => ({ id: t.id, keywords: t.keywords.map(normalise) }));

/** Phrase must start at a word boundary ("danke" matches "dankeschoen", not "gedanken"). */
function startsWord(padded: string, phrase: string): boolean {
  return padded.includes(` ${phrase}`);
}

function bestTopic(norm: string, padded: string): TopicId | null {
  let best: TopicId | null = null;
  let bestScore = 0;
  for (const t of TOPIC_KEYWORDS) {
    let score = 0;
    for (const k of t.keywords) {
      // Short keywords ("uni", "cv") must start a word; longer ones may sit anywhere.
      const hit = k.length <= 3 ? startsWord(padded, k) : norm.includes(k);
      // Longer keywords are more specific, so they weigh a bit more.
      if (k && hit) score += 1 + k.length / 12;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t.id;
    }
  }
  return best;
}

export function route(input: string): Route {
  const norm = normalise(input);
  if (!norm) return { type: 'unknown' };
  const padded = ` ${norm} `;

  // Small talk first (so "wer bist du" doesn't land on "about")…
  for (const intent of ['name', 'thanks', 'joke'] as const) {
    if (PHRASES[intent].some((p) => startsWord(padded, p))) {
      return { type: 'smalltalk', intent };
    }
  }
  const topic = bestTopic(norm, padded);
  const words = norm.split(' ');
  const isGreeting = words.some((w) => GREETING_WORDS.includes(w)) || norm.startsWith('guten ');
  // …except a greeting followed by a real question ("Hi, was hat Adrian gemacht?").
  if (isGreeting && !topic) return { type: 'smalltalk', intent: 'greeting' };
  if (topic) return { type: 'topic', id: topic };
  return { type: 'unknown' };
}

import { motion } from 'framer-motion';
import type { ContactLink, Line, Skill, TimelineCard } from '../data/types';
import { iconFor } from './icons';

/**
 * Extra content under a line (card / skills / contact). It is laid out from the
 * start (invisible) so the bubble never changes size mid-line, and animates in
 * once the text has finished typing.
 */
export function LineExtras({ line, shown }: { line: Line; shown: boolean }) {
  switch (line.kind) {
    case 'card':
      return <Card card={line.card} shown={shown} />;
    case 'skills':
      return <SkillBars skills={line.skills} shown={shown} />;
    case 'contact':
      return <ContactButtons links={line.links} shown={shown} />;
    default:
      return null;
  }
}

const reveal = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0 },
};

function Card({ card, shown }: { card: TimelineCard; shown: boolean }) {
  return (
    <motion.div
      className="mt-3 rounded-2xl border-[2.5px] border-ink bg-lilac-50 px-4 py-3"
      initial="hidden"
      animate={shown ? 'shown' : 'hidden'}
      variants={reveal}
      transition={{ type: 'spring', stiffness: 420, damping: 26, staggerChildren: 0.08, delayChildren: 0.12 }}
      aria-hidden={!shown}
    >
      <span className="inline-block rounded-full border-2 border-ink bg-lilac px-2.5 py-px text-[13px] font-semibold leading-5 text-ink">
        {card.period}
      </span>
      <p className="mt-2 text-[17px] font-semibold leading-tight text-ink">{card.title}</p>
      <p className="text-[14px] leading-snug text-ink-muted">{card.org}</p>
      {card.bullets && card.bullets.length > 0 && (
        <ul className="mt-2 space-y-1">
          {card.bullets.map((b) => (
            <motion.li
              key={b}
              variants={reveal}
              className="flex gap-2 text-[15px] font-normal leading-snug text-ink"
            >
              <span aria-hidden="true" className="select-none text-pink">
                ✦
              </span>
              <span>{b}</span>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function SkillBars({ skills, shown }: { skills: Skill[]; shown: boolean }) {
  return (
    <motion.ul
      className="mt-3 space-y-2.5"
      initial="hidden"
      animate={shown ? 'shown' : 'hidden'}
      variants={reveal}
      aria-hidden={!shown}
    >
      {skills.map((s, i) => {
        const level = Math.max(0, Math.min(100, s.level));
        return (
          <li key={s.name}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[15px] leading-none">
              <span className="font-medium text-ink">{s.name}</span>
              <motion.span
                className="text-[13px] font-semibold tabular-nums text-ink-muted"
                initial={{ opacity: 0 }}
                animate={{ opacity: shown ? 1 : 0 }}
                transition={{ delay: shown ? 0.5 + i * 0.09 : 0 }}
              >
                {level}
              </motion.span>
            </div>
            <div className="h-3.5 overflow-hidden rounded-full border-2 border-ink bg-lilac-50">
              <motion.div
                className="skill-fill h-full rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: shown ? `${level}%` : '0%' }}
                transition={{
                  delay: shown ? 0.15 + i * 0.09 : 0,
                  duration: shown ? 0.9 : 0.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </div>
          </li>
        );
      })}
    </motion.ul>
  );
}

function ContactButtons({ links, shown }: { links: ContactLink[]; shown: boolean }) {
  return (
    <motion.ul
      className="mt-3 grid grid-cols-2 gap-2.5"
      initial="hidden"
      animate={shown ? 'shown' : 'hidden'}
      variants={reveal}
      transition={{ staggerChildren: 0.07, delayChildren: 0.05 }}
      aria-hidden={!shown}
    >
      {links.map((l) => {
        const Icon = iconFor(l.icon);
        const external = !l.href.startsWith('mailto:');
        return (
          <motion.li key={l.href} variants={reveal}>
            <a
              href={l.href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              tabIndex={shown ? 0 : -1}
              className="contact-btn"
            >
              <Icon size={18} strokeWidth={2.4} aria-hidden="true" />
              <span>{l.label}</span>
            </a>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

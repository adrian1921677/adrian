import {
  Briefcase,
  Download,
  Gamepad2,
  Globe,
  GraduationCap,
  Linkedin,
  Mail,
  Route,
  Sparkles,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** lucide icon names used in content.ts → components (only what we need). */
const ICONS: Record<string, LucideIcon> = {
  Briefcase,
  Download,
  Gamepad2,
  Globe,
  GraduationCap,
  Linkedin,
  Mail,
  Route,
  Sparkles,
  User,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Sparkles;
}

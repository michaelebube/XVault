import type { CategoryColor } from '~/types/api';

/**
 * Category colour tokens → concrete classes.
 *
 * The server stores a token (`violet`), never a hex value, so one palette
 * decision here fixes readability in both themes — DESIGN.md §17. The classes
 * are written out in full rather than interpolated because Tailwind scans
 * source text: a template string like `bg-${color}-500` would simply not exist
 * in the built CSS.
 */
interface ColorClasses {
  dot: string;
  chip: string;
}

const PALETTE: Record<CategoryColor, ColorClasses> = {
  neutral: {
    dot: 'bg-zinc-400 dark:bg-zinc-500',
    chip: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
  indigo: {
    dot: 'bg-indigo-500',
    chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  },
  violet: {
    dot: 'bg-violet-500',
    chip: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  },
  blue: {
    dot: 'bg-blue-500',
    chip: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  },
  teal: {
    dot: 'bg-teal-500',
    chip: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  },
  green: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  amber: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  orange: {
    dot: 'bg-orange-500',
    chip: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  },
  rose: {
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
};

export const CATEGORY_COLORS = Object.keys(PALETTE) as CategoryColor[];

export function categoryDot(color: CategoryColor | null | undefined): string {
  return PALETTE[color ?? 'neutral']?.dot ?? PALETTE.neutral.dot;
}

export function categoryChip(color: CategoryColor | null | undefined): string {
  return PALETTE[color ?? 'neutral']?.chip ?? PALETTE.neutral.chip;
}

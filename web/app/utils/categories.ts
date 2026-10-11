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
    dot: 'bg-stone-400 dark:bg-stone-500',
    chip: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  },
  indigo: {
    dot: 'bg-neutral-500',
    chip: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  },
  violet: {
    dot: 'bg-stone-600',
    chip: 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200',
  },
  blue: {
    dot: 'bg-slate-500',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  teal: {
    dot: 'bg-zinc-500',
    chip: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
  green: {
    dot: 'bg-stone-500',
    chip: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  },
  amber: {
    dot: 'bg-amber-700',
    chip: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
  orange: {
    dot: 'bg-stone-700',
    chip: 'bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-200',
  },
  rose: {
    dot: 'bg-neutral-700',
    chip: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200',
  },
};

export const CATEGORY_COLORS = Object.keys(PALETTE) as CategoryColor[];

export function categoryDot(color: CategoryColor | null | undefined): string {
  return PALETTE[color ?? 'neutral']?.dot ?? PALETTE.neutral.dot;
}

export function categoryChip(color: CategoryColor | null | undefined): string {
  return PALETTE[color ?? 'neutral']?.chip ?? PALETTE.neutral.chip;
}

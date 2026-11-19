import type { SignalKind } from "../store/user";

/**
 * How each interaction trains the model. `null` = logged, never trained on.
 *
 * Safeguards (product rules):
 *  - opening a title is a very weak positive and never a negative
 *  - a skipped / scrolled-past recommendation is NOT a signal at all
 *  - failed image loads, broken pages and errors are never signals
 *  - only explicit actions (Not interested, Hide, Dislike, Dropped) are negative
 */
export const SIGNAL_WEIGHTS: Record<SignalKind, { y: 0 | 1; w: number } | null> = {
  open: { y: 1, w: 0.08 },
  chapter_read: { y: 1, w: 0.45 },
  title_finished: { y: 1, w: 2.5 },
  library_add: { y: 1, w: 1.0 },
  favorite: { y: 1, w: 2.0 },
  like: { y: 1, w: 2.0 },
  more_like_this: { y: 1, w: 1.0 },
  return: { y: 1, w: 0.6 },
  dislike: { y: 0, w: 2.0 },
  not_interested: { y: 0, w: 1.4 },
  hide: { y: 0, w: 0.8 },
  dropped: { y: 0, w: 0.6 },
  unhide: null,
  // Reward bookkeeping only (quests); never trained on.
  surprise_pick: null,
  comment: null,
};

export const SHORT_HALF_LIFE_DAYS = 14;
export const LONG_HALF_LIFE_DAYS = 365;

export function decay(ageMs: number, halfLifeDays: number): number {
  return Math.pow(0.5, Math.max(0, ageMs) / (halfLifeDays * 86_400_000));
}

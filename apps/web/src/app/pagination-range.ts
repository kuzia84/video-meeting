/** A gap standing in for pages that are not worth a link of their own. */
export const ELLIPSIS = 'ellipsis' as const;

export type PaginationSlot = number | typeof ELLIPSIS;

/**
 * Page links to render: always the first and last page, always a window around the
 * current one, and an ellipsis wherever that skips something.
 *
 * Rendering every page instead looks fine at three pages and falls apart at fifty —
 * the row wraps into a wall of numbers. The output length is bounded by `siblings`,
 * no matter how many meetings exist.
 */
export function paginationRange(page: number, pageCount: number, siblings = 1): PaginationSlot[] {
  // First + last + current + 2 ellipses + the window on both sides. Below this,
  // every page fits and an ellipsis could never replace more than one number.
  const maxSlots = siblings * 2 + 5;
  if (pageCount <= maxSlots) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, pageCount);
  // An ellipsis earns its place only when it hides at least two pages. Hiding exactly
  // one (left === 3 → only page 2 behind it) trades a usable click target for a "…"
  // that saves no space, so render the number instead.
  const showLeftEllipsis = left > 3;
  const showRightEllipsis = right < pageCount - 2;

  const slots: PaginationSlot[] = [1];
  if (showLeftEllipsis) {
    slots.push(ELLIPSIS);
  }
  for (let p = showLeftEllipsis ? left : 2; p <= (showRightEllipsis ? right : pageCount - 1); p++) {
    slots.push(p);
  }
  if (showRightEllipsis) {
    slots.push(ELLIPSIS);
  }
  slots.push(pageCount);

  return slots;
}

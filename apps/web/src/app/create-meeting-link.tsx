import { buttonVariants } from '@heroui/react';
import NextLink from 'next/link';

/** Where the "create a meeting" actions lead. */
export const CREATE_MEETING_HREF = '/meetings/new';

/**
 * Navigation that looks like a button, so it is a real <a>: middle-click and
 * "open in new tab" work, and Next prefetches it like any other route link.
 *
 * Styled via `buttonVariants` rather than <Button render={…}> — HeroUI's documented
 * way to dress a framework link, and the render route warns at runtime
 * ("Expected <button>, got <a>. This may break the component behavior and
 * accessibility") because Button builds on React Aria's button behaviour.
 */
export function CreateMeetingLink({ children, size }: { children: string; size?: 'lg' }) {
  return (
    <NextLink className={buttonVariants({ size })} href={CREATE_MEETING_HREF}>
      {children}
    </NextLink>
  );
}

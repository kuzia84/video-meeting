import {
  AVATAR_COLOR_SOLUTIONS,
  avatarInitial,
  findAvatarColorSolution,
} from '@video-meetings/shared';
import type { CSSProperties } from 'react';

interface DefaultAvatarProps {
  /** The user's name, or null/blank when unset — the letter prefers it. */
  name: string | null;
  /** The user's email — the letter falls back to it. */
  email: string;
  /** The stored colour-solution name (User.avatarColor). */
  colorName: string;
  /** Sizing (width/height/text size) — the caller sets it per placement. */
  className?: string;
}

/**
 * The circle shown in place of an uploaded picture: the user's initial on their
 * own colour. Colours come from the shared palette by `colorName` and switch
 * with the theme via CSS variables consumed by `.avatar-default` in globals.css
 * (a `[data-theme='dark']` override), so there is no theme detection in JS and
 * no first-render flash. Decorative — the name/email is shown as text alongside,
 * so the letter is hidden from assistive tech.
 */
export function DefaultAvatar({ name, email, colorName, className }: DefaultAvatarProps) {
  // avatarColor is always a valid palette name (assigned at registration), but
  // fall back to a real solution rather than render an uncoloured circle if an
  // unknown name ever reaches here.
  const solution = findAvatarColorSolution(colorName) ?? AVATAR_COLOR_SOLUTIONS[0];
  const initial = avatarInitial(name, email);

  const colours = {
    '--avatar-bg-light': solution.light.background,
    '--avatar-fg-light': solution.light.foreground,
    '--avatar-bg-dark': solution.dark.background,
    '--avatar-fg-dark': solution.dark.foreground,
  } as CSSProperties;

  return (
    <span
      data-testid="default-avatar"
      aria-hidden="true"
      className={`avatar-default inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none ${className ?? ''}`}
      style={colours}
    >
      {initial}
    </span>
  );
}

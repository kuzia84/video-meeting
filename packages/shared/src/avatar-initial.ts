// The single letter shown on a default avatar. Rule: the first letter of the
// name, skipping any non-letters (digits, punctuation, spaces, emoji); if the
// name has no letter, the same rule applied to the email; if neither has one, a
// neutral sign. Letters are matched with the Unicode letter class, so it works
// on any alphabet (Latin, Cyrillic, Arabic, CJK, …).

/** Shown when neither the name nor the email contains a letter. */
export const NEUTRAL_AVATAR_INITIAL = '?';

/** First Unicode letter (a whole code point) in `source`, or undefined. */
function firstLetter(source: string | null | undefined): string | undefined {
  if (!source) {
    return undefined;
  }
  const match = source.match(/\p{L}/u);
  return match ? match[0] : undefined;
}

/**
 * The initial to render on a user's default avatar. Prefers the name, falls
 * back to the email, then to {@link NEUTRAL_AVATAR_INITIAL}. Always returns a
 * single visible glyph, uppercased where the script has case.
 */
export function avatarInitial(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const letter = firstLetter(name) ?? firstLetter(email);
  if (!letter) {
    return NEUTRAL_AVATAR_INITIAL;
  }
  // toUpperCase can expand one letter to several (e.g. 'ß' -> 'SS'); keep a
  // single glyph so the circle never shows two characters.
  return [...letter.toUpperCase()][0];
}

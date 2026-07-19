import { NEUTRAL_AVATAR_INITIAL, avatarInitial } from './avatar-initial';

describe('avatarInitial', () => {
  describe('from the name', () => {
    it('takes the first letter of a plain name', () => {
      expect(avatarInitial('Bob', 'bob@example.com')).toBe('B');
    });

    it('uppercases a lowercase first letter', () => {
      expect(avatarInitial('bob', 'x@y.com')).toBe('B');
    });

    it('works on a non-Latin alphabet', () => {
      expect(avatarInitial('Богдан', 'x@y.com')).toBe('Б');
      expect(avatarInitial('علي', 'x@y.com')).toBe('ع');
    });

    it('leaves case-less scripts unchanged', () => {
      expect(avatarInitial('山田', 'x@y.com')).toBe('山');
    });

    it('skips leading non-letters (digits, punctuation, spaces)', () => {
      // The PRD example: `1-й отдел` must show `Й`, not `1` or `-`.
      expect(avatarInitial('1-й отдел', 'x@y.com')).toBe('Й');
      expect(avatarInitial('   привет', 'x@y.com')).toBe('П');
      expect(avatarInitial('42 cats', 'x@y.com')).toBe('C');
    });

    it('skips a leading emoji', () => {
      expect(avatarInitial('😀 Anna', 'x@y.com')).toBe('A');
    });
  });

  describe('falling back to the email', () => {
    it('uses the email when the name is null', () => {
      expect(avatarInitial(null, 'kate@example.com')).toBe('K');
    });

    it('uses the email when the name is empty or blank', () => {
      expect(avatarInitial('', 'kate@example.com')).toBe('K');
      expect(avatarInitial('   ', 'kate@example.com')).toBe('K');
    });

    it('uses the email when the name has no letters at all', () => {
      expect(avatarInitial('123-456', 'kate@example.com')).toBe('K');
      expect(avatarInitial('😀', 'kate@example.com')).toBe('K');
    });

    it('skips leading non-letters in the email too', () => {
      expect(avatarInitial('123', '42cats@example.com')).toBe('C');
    });
  });

  describe('the neutral sign', () => {
    it('is used when neither name nor email has a letter', () => {
      expect(avatarInitial('123', '42@42.42')).toBe(NEUTRAL_AVATAR_INITIAL);
    });

    it('is used when both are null/undefined', () => {
      expect(avatarInitial(null, null)).toBe(NEUTRAL_AVATAR_INITIAL);
      expect(avatarInitial(undefined, undefined)).toBe(NEUTRAL_AVATAR_INITIAL);
    });

    it('is a single visible character, not empty', () => {
      expect(NEUTRAL_AVATAR_INITIAL.length).toBeGreaterThanOrEqual(1);
      expect(NEUTRAL_AVATAR_INITIAL.trim()).not.toBe('');
    });
  });

  it('always returns exactly one visible glyph', () => {
    const cases: Array<[string | null, string | null]> = [
      ['Bob', 'b@c.com'],
      ['山田', 'x@y.com'],
      ['123', 'kate@example.com'],
      ['123', '42@42.42'],
      [null, null],
    ];
    for (const [name, email] of cases) {
      const initial = avatarInitial(name, email);
      expect([...initial]).toHaveLength(1);
    }
  });
});

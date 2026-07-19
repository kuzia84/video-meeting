import {
  AVATAR_COLOR_NAMES,
  AVATAR_COLOR_SOLUTIONS,
  pickAvatarColorName,
  type AvatarColorSolution,
  type AvatarColorVariant,
} from './avatar-palette';

// --- WCAG contrast helpers ----------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) {
    throw new Error(`Not a #rrggbb hex colour: ${hex}`);
  }
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
}

function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

function hueAndSaturation(hex: string): { hue: number; saturation: number } {
  const [r, g, b] = parseHex(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, saturation };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// The letter is rendered large and bold, but we hold every variant to the
// stricter WCAG AA threshold for normal text so it stays comfortably legible.
const MIN_CONTRAST = 4.5;

describe('AVATAR_COLOR_SOLUTIONS', () => {
  it('offers a set of solutions to choose from', () => {
    expect(AVATAR_COLOR_SOLUTIONS.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every solution a unique name', () => {
    const names = AVATAR_COLOR_SOLUTIONS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  const variants: Array<[string, keyof Pick<AvatarColorSolution, 'light' | 'dark'>]> = [
    ['light', 'light'],
    ['dark', 'dark'],
  ];

  describe.each(AVATAR_COLOR_SOLUTIONS.map((s) => [s.name, s] as const))(
    '%s',
    (_name, solution) => {
      it.each(variants)('letter is readable in the %s theme', (_label, key) => {
        const variant: AvatarColorVariant = solution[key];
        expect(contrastRatio(variant.foreground, variant.background)).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      });

      it('keeps the light and dark variants in the same hue', () => {
        const light = hueAndSaturation(solution.light.background);
        const dark = hueAndSaturation(solution.dark.background);
        const bothAchromatic = light.saturation < 0.1 && dark.saturation < 0.1;
        if (bothAchromatic) {
          return; // a neutral/grey solution has no hue to match
        }
        expect(hueDistance(light.hue, dark.hue)).toBeLessThanOrEqual(30);
      });
    },
  );
});

describe('pickAvatarColorName', () => {
  it('always returns the name of a real solution', () => {
    // Sweep the whole [0, 1) range the RNG can produce.
    for (let i = 0; i < 100; i += 1) {
      const name = pickAvatarColorName(() => i / 100);
      expect(AVATAR_COLOR_NAMES).toContain(name);
    }
  });

  it('maps the bottom of the range to the first solution', () => {
    expect(pickAvatarColorName(() => 0)).toBe(AVATAR_COLOR_SOLUTIONS[0].name);
  });

  it('never overflows when the RNG returns its maximum value', () => {
    // Math.random() never returns 1, but an injected source might; the pick
    // must still land on the last solution, not read past the array.
    const last = AVATAR_COLOR_SOLUTIONS[AVATAR_COLOR_SOLUTIONS.length - 1].name;
    expect(pickAvatarColorName(() => 0.999999999)).toBe(last);
    expect(pickAvatarColorName(() => 1)).toBe(last);
  });

  it('can reach every solution', () => {
    const reached = new Set(
      AVATAR_COLOR_SOLUTIONS.map((_, i) =>
        pickAvatarColorName(() => i / AVATAR_COLOR_SOLUTIONS.length),
      ),
    );
    expect(reached.size).toBe(AVATAR_COLOR_SOLUTIONS.length);
  });

  it('defaults to Math.random and returns a valid name', () => {
    expect(AVATAR_COLOR_NAMES).toContain(pickAvatarColorName());
  });
});

// The set of colour solutions a default avatar can be given. Each solution is
// picked once per user (by `name`) and never changes, so the circle keeps the
// same colour across reloads and re-logins. The `name` is the only part stored
// on the user and returned by the API; the frontend maps it back to the colours
// below. A solution carries a light-theme and a dark-theme variant in the same
// hue — the letter (`foreground`) stays readable on the `background` in both,
// and the background is muted enough not to glare in the dark.

export interface AvatarColorVariant {
  /** Circle fill. */
  background: string;
  /** Letter colour — readable on `background`. */
  foreground: string;
}

export interface AvatarColorSolution {
  /** Stable identifier stored on the user and returned by the profile API. */
  name: string;
  light: AvatarColorVariant;
  dark: AvatarColorVariant;
}

export const AVATAR_COLOR_SOLUTIONS: readonly AvatarColorSolution[] = [
  {
    name: 'red',
    light: { background: '#FEE2E2', foreground: '#B91C1C' },
    dark: { background: '#7F1D1D', foreground: '#FECACA' },
  },
  {
    name: 'orange',
    light: { background: '#FFEDD5', foreground: '#C2410C' },
    dark: { background: '#7C2D12', foreground: '#FED7AA' },
  },
  {
    name: 'amber',
    light: { background: '#FEF3C7', foreground: '#B45309' },
    dark: { background: '#78350F', foreground: '#FDE68A' },
  },
  {
    name: 'green',
    light: { background: '#DCFCE7', foreground: '#15803D' },
    dark: { background: '#14532D', foreground: '#BBF7D0' },
  },
  {
    name: 'teal',
    light: { background: '#CCFBF1', foreground: '#0F766E' },
    dark: { background: '#134E4A', foreground: '#99F6E4' },
  },
  {
    name: 'blue',
    light: { background: '#DBEAFE', foreground: '#1D4ED8' },
    dark: { background: '#1E3A8A', foreground: '#BFDBFE' },
  },
  {
    name: 'indigo',
    light: { background: '#E0E7FF', foreground: '#4338CA' },
    dark: { background: '#312E81', foreground: '#C7D2FE' },
  },
  {
    name: 'purple',
    light: { background: '#F3E8FF', foreground: '#7E22CE' },
    dark: { background: '#581C87', foreground: '#E9D5FF' },
  },
  {
    name: 'pink',
    light: { background: '#FCE7F3', foreground: '#BE185D' },
    dark: { background: '#831843', foreground: '#FBCFE8' },
  },
  {
    name: 'slate',
    light: { background: '#F1F5F9', foreground: '#334155' },
    dark: { background: '#0F172A', foreground: '#E2E8F0' },
  },
];

/** The stable names of every colour solution, in palette order. */
export const AVATAR_COLOR_NAMES: readonly string[] = AVATAR_COLOR_SOLUTIONS.map(
  (solution) => solution.name,
);

/** Look a solution up by its stored name, or `undefined` if unknown. */
export function findAvatarColorSolution(name: string): AvatarColorSolution | undefined {
  return AVATAR_COLOR_SOLUTIONS.find((solution) => solution.name === name);
}

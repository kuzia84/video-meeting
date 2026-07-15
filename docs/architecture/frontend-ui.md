# Frontend UI: HeroUI v3 + Playwright MCP (`apps/web`)

Conventions for building UI in `apps/web` (Next.js 15, App Router, React 19) with HeroUI v3, and for verifying layout/UI changes with the Playwright MCP server.

## Setup status

Wired up: `apps/web/postcss.config.mjs`, `apps/web/src/app/globals.css` (`@import 'tailwindcss'` then `@import '@heroui/styles'`), `apps/web/src/app/providers.tsx` (`next-themes` `ThemeProvider`, no `HeroUIProvider`), `apps/web/src/app/layout.tsx` (imports `globals.css`, `suppressHydrationWarning`, wraps `children` in `<Providers>`). First real page: `apps/web/src/app/register/` (registration form — see the `validationBehavior` gotcha below, discovered building it).

## HeroUI v3 — critical: not v2

HeroUI v3 changed the provider, styling, and component API from v2. **Ignore v2 knowledge/patterns.**

|               | v2 (do not use)                   | v3 (use this)                      |
| ------------- | --------------------------------- | ---------------------------------- |
| Provider      | `<HeroUIProvider>` required       | **No provider needed**             |
| Animations    | `framer-motion`                   | CSS-based, no extra deps           |
| Component API | Flat props (`<Card title="x">`)   | Compound (`<Card><Card.Header>`)   |
| Styling       | Tailwind v3 + `@heroui/theme`     | **Tailwind v4** + `@heroui/styles` |
| Packages      | `@heroui/system`, `@heroui/theme` | `@heroui/react`, `@heroui/styles`  |

```tsx
// WRONG — v2 pattern
import { HeroUIProvider } from '@heroui/react';
<HeroUIProvider>
  <Card title="Product" />
</HeroUIProvider>;

// RIGHT — v3 pattern
import { Card } from '@heroui/react';
<Card>
  <Card.Header>
    <Card.Title>Product</Card.Title>
  </Card.Header>
</Card>;
```

### Setup (Next.js App Router)

1. `postcss.config.mjs`:
   ```js
   export default {
     plugins: { '@tailwindcss/postcss': {} },
   };
   ```
2. `src/app/globals.css` — Tailwind import must come before HeroUI's:
   ```css
   @import 'tailwindcss';
   @import '@heroui/styles';
   ```
3. `src/app/layout.tsx` — import `globals.css`, add `suppressHydrationWarning` on `<html>` (required for theme switching to avoid a hydration mismatch warning), apply `bg-background text-foreground` on `<body>`. No `HeroUIProvider`.
4. Light/dark theme uses `next-themes`, not a HeroUI provider — wrap the app in a client `Providers` component:

   ```tsx
   // src/app/providers.tsx
   'use client';
   import { ThemeProvider } from 'next-themes';
   export function Providers({ children }: { children: React.ReactNode }) {
     return (
       <ThemeProvider attribute={['class', 'data-theme']} defaultTheme="light">
         {children}
       </ThemeProvider>
     );
   }
   ```

   **`attribute` must include `'data-theme'`, not just `'class'`.** `@heroui/styles`' shipped CSS keys its dark-mode variables off `[data-theme="dark"]` — verified by reading the generated theme CSS (`get_theme.mjs`), where the dark block is literally `[data-theme='dark'] { ... }`, not `.dark { ... }`. `attribute="class"` alone (the form shown in HeroUI's own basic theming example, and what this doc originally documented) means `next-themes` only ever sets `class="dark"`; HeroUI's CSS never matches that selector, so **no dark tokens apply at all** — confirmed live: manually forcing only the class left every color at its light-mode value, while setting `data-theme="dark"` (via `next-themes`' array form, or by hand) correctly switched them. Toggle with `useTheme()` from `next-themes` (`const { theme, setTheme } = useTheme()`), never by hand-editing `document.documentElement.className`.

   **Testing dark mode with Playwright MCP:** don't just set `document.documentElement.classList.add('dark')` via `browser_evaluate` — that masks exactly the bug above (the class alone does nothing; you must also verify `data-theme` actually gets set by the real mechanism). Prefer `localStorage.setItem('theme', 'dark')` (next-themes' default storage key) followed by `browser_navigate` to the same URL — this exercises next-themes' actual init script, the same path a real user's toggle takes.

### Component conventions

- **Compound components only.** Don't flatten props — compose with subcomponents (`Card.Header`, `Card.Title`, `Form.Field`, etc.). Fetch the component's doc before using it (see below) — the API is compound and not guessable from v2 familiarity.
- **`onPress`, not `onClick`**, for interactive elements — HeroUI is built on React Aria and `onPress` gives correct keyboard/touch/screen-reader behavior that `onClick` doesn't.
- **Semantic variants** (`primary`, `secondary`, `tertiary`, `danger`, `ghost`, `outline`), never raw colors/Tailwind color utilities on HeroUI components — semantic variants adapt to the active theme.
- **Theme via CSS variables** (`oklch` color space), e.g. `--accent`, `--accent-foreground` (no-suffix = background, `-foreground` = text on that background). Override in `globals.css` under `:root`, don't hardcode colors in components.
- **Verify contrast against `--surface`, don't assume HeroUI's defaults clear WCAG AA.** Measured on the register page: `--field-border` (`transparent`, relying on `--field-shadow` instead) leaves inputs with **zero visible boundary in dark mode** where `--field-background` happens to equal `--surface` (1:1 contrast) — `globals.css` now sets an explicit `--field-border: #71717a` (verified ≥3:1 against `--surface` in both themes; the semantic `--border` token is too subtle on its own, ~1.3:1, since it's designed to pair with the shadow, not replace it). Likewise `.field-error`'s `text-danger` measured 3.57–3.97:1 at its 12px size — under the 4.5:1 AA floor for that size — and is overridden with theme-specific reds (`#b91c1c` light / `#f87171` dark) scoped to `.field-error` only, not the shared `--danger` token. Don't eyeball contrast — compute it (`browser_evaluate` + the WCAG relative-luminance formula, or a contrast checker) against the actual rendered background, per theme.
- **`Alert` has no built-in `role`/`aria-live`** — checked the component source (`get_source.mjs Alert`), the root `<dom.div>` spreads arbitrary props through but adds neither by default. Any `Alert` used for an error/status that appears asynchronously (e.g. after a failed submit) needs `role="alert" aria-live="assertive"` added explicitly, or screen reader users never hear about it.

### Forms: always set `validationBehavior="aria"`

`Form`/`TextField`'s `validationBehavior` prop **defaults to `'native'`**, which uses the browser's own HTML5 constraint validation (`type="email"`, `required`, etc.). That default causes two problems in practice:

- It shows the browser's own unstyled, non-localized validation tooltip instead of HeroUI's `<FieldError>`, and it can silently swallow your custom `validate` function's message for that field.
- The tooltip/native behavior is inconsistent across browsers and doesn't match the rest of the app's design.

**Always pass `validationBehavior="aria"` on `<Form>`** (it cascades to fields) to get real-time, ARIA-driven validation that renders through `<FieldError>` consistently. Confirmed by inspecting the rendered DOM: without it, the `<form>` element has `noValidate={false}` and the browser intercepts submission.

One consequence of `'aria'` mode: per HeroUI's own docs, it **does not block form submission** on invalid fields (unlike `'native'`) — a field can still be empty/invalid when `onSubmit` fires. Two things to account for when writing a field's `validate` function and your submit handler:

1. **Skip validation on an empty value** (`if (!value) return null;` before the real check). Without this, `validate` treating `""` as "wrong format" makes every required field show an error on first render/mount, before the user has touched anything — bad UX, easy to trip over since the official example doesn't call this out.
2. **Your submit handler still runs even with empty/invalid fields.** Rely on the backend's validation as the safety net (its 400 response) rather than assuming client-side `validate` blocked the request — display that 400 the same way you'd display any other API error (see `register-form.tsx` for the pattern: a general `Alert` for non-field-specific errors).

For a **server-side error tied to a specific field** (e.g. a 409 "email already registered"), don't rely on `<Form validationErrors={...}>` alone to auto-clear on edit — empirically (tested in `register-form.tsx`) the stale error persisted after changing the field's value. Track it in your own state and clear it explicitly in the field's `onChange`:

```tsx
const [emailError, setEmailError] = useState<string | null>(null);
// ...
<Form validationErrors={emailError ? { email: emailError } : undefined} ...>
  <TextField name="email" onChange={() => setEmailError(null)} ...>
```

Route the field to blame off `ApiError.field` (set by the API response, e.g. `{ field: "email" }` on the 409), **not off the HTTP status code alone** — `err.status === 409` doesn't generalize to a form with more than one possible conflicting field, since the status code carries no information about which field caused it:

```tsx
} catch (err) {
  if (err instanceof ApiError) {
    if (err.field === 'email') setEmailError(err.messages[0]);
    else setFormError(err.messages.join(', '));
  } else if (err instanceof Error) {
    setFormError(err.message); // client.ts already gives network vs. malformed-response distinct messages
  }
}
```

**Re-entrancy:** `Button isPending` only disables _pointer_ interaction (`pointer-events: none`) — it does not set `disabled`/`aria-disabled`, so it does not stop a second Enter-triggered submit, and a React state guard (`if (isSubmitting) return`) can itself race a rapid double-submit if both invocations read the same pre-commit render's closure. Guard with a `useRef` instead — it updates synchronously, independent of React's render/commit timing:

```tsx
const isSubmittingRef = useRef(false);
async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmittingRef.current) return;
  isSubmittingRef.current = true;
  try {
    /* ... */
  } finally {
    isSubmittingRef.current = false;
    setSubmitting(false);
  }
}
// <Button isPending={isSubmitting} isDisabled={isSubmitting}>  — isDisabled is defense in depth for pointer input
```

**Separate "the mutation succeeded but a client-side side-effect failed" from "the request failed."** In `register-form.tsx`, `saveAccessToken` (writes to `sessionStorage`) is called in its own `try/catch` _after_ `registerUser` resolves, not inside the same `try` — a storage write failure (private browsing, quota) is not a "please retry" network error, and lumping it into the same catch tells the user to retry an already-successful registration.

### Fetching component docs

Always fetch a component's docs before implementing with it — the compound API, props, and anatomy are not guessable. Two ways:

- **Scripts** (`.claude/skills/heroui-react/scripts/`): `node scripts/list_components.mjs`, `node scripts/get_component_docs.mjs Button Card`, `node scripts/get_styles.mjs Button`, `node scripts/get_theme.mjs`.
- **Direct MDX**: `https://heroui.com/docs/react/components/{component-name}.mdx`.

Or invoke the `heroui-react` skill, which wraps this workflow.

## Playwright MCP — verifying layout changes

The `playwright` MCP server is configured at **project scope** (`.mcp.json`, committed — every contributor gets it automatically, not just a per-user setup). It drives a real browser against the running `apps/web` dev server, so it's the way to actually verify a layout/UI change rather than just reading the JSX.

### Workflow

1. Start the dev server (`npm run dev -w @video-meetings/web`, or `npm run dev` from root for both apps) so there's a real page to load.
2. Navigate to the affected route with the Playwright MCP browser-navigate tool.
3. Inspect the result:
   - **Structural/accessibility check** — take an accessibility snapshot (tree of roles/labels/text). Prefer this for confirming an element exists, its text, and its accessible role/state (matters doubly here since HeroUI is React-Aria-based).
   - **Visual check** — take a screenshot when the thing being verified is genuinely visual (spacing, alignment, color, responsive layout at a given viewport). Resize the browser first if checking a specific breakpoint.
4. For interaction-driven UI (theme toggle, form validation, modal open/close), drive it: click/type/press-key via the MCP tools, then re-snapshot/screenshot to confirm the resulting state.
5. Check the console-messages tool if a change might have introduced a runtime warning/error (e.g. a hydration mismatch from theme switching) — these don't always show up in a screenshot.

### When to use it

Use it whenever a change touches rendered output — new/changed component, theme or styling change, a page reachable in the browser. Skip it for changes with no visual/DOM surface (e.g. a pure type change in `packages/shared` with no consuming UI yet).

This is the frontend analogue of `apps/api`'s e2e tests: e2e proves the HTTP contract behaves as specified by driving real requests; Playwright MCP proves the UI actually renders/behaves as intended by driving a real browser. Neither is satisfied by reading the source.

## References

- HeroUI usage guidance is also captured in the `heroui-react` skill (`.claude/skills/heroui-react/`) — invoke it for hands-on implementation help.
- Backend's equivalent architecture guide: `docs/architecture/cqrs.md`.

'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { CurrentUserProvider } from '@/lib/current-user/current-user-context';

export function Providers({ children }: { children: ReactNode }) {
  return (
    // HeroUI's shipped CSS (@heroui/styles) keys its dark-mode variables off
    // [data-theme="dark"], not a .dark class — attribute="class" alone means
    // next-themes never sets the attribute HeroUI actually reads, so no dark
    // tokens ever apply. Set both: `class` for any Tailwind dark: variants,
    // `data-theme` for HeroUI.
    <ThemeProvider attribute={['class', 'data-theme']} defaultTheme="light">
      {/* The single source of the signed-in user — spans header + page content so a
          rename updates both at once. Stays mounted across client navigations. */}
      <CurrentUserProvider>{children}</CurrentUserProvider>
    </ThemeProvider>
  );
}

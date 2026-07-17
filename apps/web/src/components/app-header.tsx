'use client';

import { Button } from '@heroui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { removeAccessToken } from '@/lib/auth/token';

/**
 * The header every signed-in page wears.
 *
 * One component rather than the same markup in each page: copied by hand across three
 * screens it had already drifted — logout existed on two of them and the logo linked
 * home on some but not others — and each fix had to be made three times to stick.
 */
export function AppHeader() {
  const router = useRouter();

  function handleLogout() {
    removeAccessToken();
    router.replace('/login');
  }

  return (
    <header className="border-border border-b">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 p-4">
        <NextLink href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="size-7" />
          MeetingBrain
        </NextLink>
        <Button variant="outline" size="sm" onPress={handleLogout}>
          Выйти
        </Button>
      </div>
    </header>
  );
}

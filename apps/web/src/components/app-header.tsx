'use client';

import { Button } from '@heroui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { DefaultAvatar } from '@/components/default-avatar';
import { Logo } from '@/components/logo';
import { useCurrentUser } from '@/lib/current-user/current-user-context';
import { removeAccessToken } from '@/lib/auth/token';

/**
 * The header every signed-in page wears.
 *
 * One component rather than the same markup in each page: copied by hand across three
 * screens it had already drifted — logout existed on two of them and the logo linked
 * home on some but not others — and each fix had to be made three times to stick.
 *
 * It shows the current user beside the logout button — the default avatar (or, later,
 * an uploaded picture) with the display name next to it, the avatar linking to the
 * profile page. The user comes from the shared `useCurrentUser` source (not a fetch of
 * its own), so a rename on the profile page updates this chip live, with no reload. When
 * there is no user yet (loading, signed out, or a failed load) it stays a bare logo +
 * logout, since the page around it owns auth outcomes, not the header.
 */
export function AppHeader() {
  const router = useRouter();
  const { user } = useCurrentUser();

  function handleLogout() {
    removeAccessToken();
    router.replace('/login');
  }

  const displayName = user ? (user.name?.trim() ? (user.name as string) : user.email) : null;

  return (
    <header className="border-border border-b">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 p-4">
        <NextLink href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="size-7" />
          MeetingBrain
        </NextLink>
        <div className="flex items-center gap-3">
          {user ? (
            // Avatar + name side by side; clicking the avatar opens the profile page.
            <NextLink
              href="/profile"
              // Accessible name contains the visible name (WCAG 2.5.3 Label in Name), so a
              // speech-input user can still activate it by the name they see.
              aria-label={`Профиль: ${displayName}`}
              className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <DefaultAvatar
                name={user.name}
                email={user.email}
                colorName={user.avatarColor}
                className="h-8 w-8 text-sm"
              />
              <span className="max-w-40 truncate text-sm font-medium">{displayName}</span>
            </NextLink>
          ) : null}
          <Button variant="outline" size="sm" onPress={handleLogout}>
            Выйти
          </Button>
        </div>
      </div>
    </header>
  );
}

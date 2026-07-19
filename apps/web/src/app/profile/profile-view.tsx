'use client';

import { Button, Card, Input, Label, TextField } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { PageShell } from '@/components/page-shell';
import { UserAvatar } from '@/components/user-avatar';
import { useCurrentUser } from '@/lib/current-user/current-user-context';
import { removeAccessToken } from '@/lib/auth/token';
import { AvatarUpload } from './avatar-upload';
import { PasswordChangeForm } from './password-change-form';
import { ProfileNameForm } from './profile-name-form';

export function ProfileView() {
  const router = useRouter();
  // The profile page reads the signed-in user from the shared source rather than a fetch
  // of its own — so saving a name here updates the header chip at the same time, and only
  // one GET /users/me is made for the header + this page together.
  const { user, status, errorMessage, reload, setUser } = useCurrentUser();

  // A 401 (initial load or saving the name) means the session died: drop the dead token
  // and send the user to log in again. Passed to the name form and driven by `status`.
  const goToLogin = useCallback(() => {
    removeAccessToken();
    router.replace('/login');
  }, [router]);

  // The shared source resolves "no/expired token" to `unauthenticated`; the page owns the
  // redirect (the provider never redirects on anyone's behalf).
  useEffect(() => {
    if (status === 'unauthenticated') {
      goToLogin();
    }
  }, [status, goToLogin]);

  // Loading, or already bouncing to /login: keep a bare loading screen so nothing flashes.
  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted text-sm">Загрузка…</p>
      </main>
    );
  }

  // `!user` cannot happen while status is 'ready', but guard it so a stray render can
  // never reach into a null user below.
  if (status === 'error' || !user) {
    return (
      <PageShell>
        <h1 className="text-2xl font-semibold tracking-tight">Профиль</h1>
        <section className="flex flex-col items-start gap-3">
          <p className="text-danger text-sm" role="alert">
            {errorMessage ?? 'Попробуйте ещё раз.'}
          </p>
          {/* Retries the request, not the whole document: no reason to re-boot the app. */}
          <Button onPress={() => reload()}>Попробовать снова</Button>
        </section>
      </PageShell>
    );
  }

  // Until the user sets a name, the email stands in for it everywhere. Treat a
  // blank/whitespace name as unset, not just null.
  const hasName = Boolean(user.name?.trim());
  const displayName = hasName ? (user.name as string) : user.email;

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold tracking-tight">Профиль</h1>

      <Card className="w-full max-w-sm">
        <Card.Header>
          <div className="flex items-center gap-4">
            {/* The uploaded picture when there is one, otherwise the default circle —
                the user's initial in their own colour. */}
            <UserAvatar
              name={user.name}
              email={user.email}
              colorName={user.avatarColor}
              avatarUrl={user.avatarUrl}
              className="h-16 w-16 text-2xl"
            />
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <Card.Title>{displayName}</Card.Title>
                {hasName ? null : (
                  <Card.Description>Имя пока не задано — показан email</Card.Description>
                )}
              </div>
              {/* Uploading updates the shared user, so the new avatar shows here and in the
                  header at once (the image itself is rendered in a later phase). */}
              <AvatarUpload onUploaded={setUser} onUnauthorized={goToLogin} />
            </div>
          </div>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4 p-6 pt-0">
          {/* Email is read-only in every phase: it identifies the account and is never
              editable here, unlike the name. */}
          <TextField isReadOnly value={user.email}>
            <Label>Email</Label>
            <Input className="h-11 md:h-10" />
          </TextField>

          {/* Saving pushes the updated user into the shared source, so the card header,
              the avatar letter here, and the header chip all change at once — no reload. */}
          <ProfileNameForm profile={user} onSaved={setUser} onUnauthorized={goToLogin} />
        </Card.Content>
      </Card>

      {/* Password change is its own card — a distinct action from editing profile fields. */}
      <Card className="w-full max-w-sm">
        <Card.Content className="p-6">
          <PasswordChangeForm onUnauthorized={goToLogin} />
        </Card.Content>
      </Card>
    </PageShell>
  );
}

'use client';

import { Button, Card, Input, Label, TextField } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DefaultAvatar } from '@/components/default-avatar';
import { PageShell } from '@/components/page-shell';
import { ApiError, getProfile, type UserProfile } from '@/lib/api/profile';
import { getAccessToken, removeAccessToken } from '@/lib/auth/token';

type Status = 'loading' | 'ready' | 'error';

export function ProfileView() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // React Strict Mode runs effects twice in dev; guard the one-time auth check so it
  // doesn't fire (and redirect) twice.
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      setProfile(await getProfile());
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Expired or invalid token: drop it and send the user to log in again.
        removeAccessToken();
        router.replace('/login');
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось загрузить профиль.');
      setStatus('error');
    }
  }, [router]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Client-side route protection, same as the home view: the token lives in
    // sessionStorage, invisible to the server/middleware, so gate here. No token
    // → straight to login (stay on the loading screen so the page never flashes).
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [router, load]);

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted text-sm">Загрузка…</p>
      </main>
    );
  }

  // `!profile` cannot happen while status is 'ready', but guard it so a stray render
  // can never reach into a null profile below.
  if (status === 'error' || !profile) {
    return (
      <PageShell>
        <h1 className="text-2xl font-semibold tracking-tight">Профиль</h1>
        <section className="flex flex-col items-start gap-3">
          <p className="text-danger text-sm" role="alert">
            {errorMessage ?? 'Попробуйте ещё раз.'}
          </p>
          {/* Retries the request, not the whole document: no reason to re-boot the app. */}
          <Button onPress={() => void load()}>Попробовать снова</Button>
        </section>
      </PageShell>
    );
  }

  // Until the user sets a name (a later phase), the email stands in for it everywhere.
  // Treat a blank/whitespace name as unset, not just null.
  const hasName = Boolean(profile.name?.trim());
  const displayName = hasName ? (profile.name as string) : profile.email;

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold tracking-tight">Профиль</h1>

      <Card className="w-full max-w-sm">
        <Card.Header>
          <div className="flex items-center gap-4">
            {/* No uploaded picture yet (that arrives in a later phase), so the
                default circle — the user's initial in their own colour — stands in. */}
            <DefaultAvatar
              name={profile.name}
              email={profile.email}
              colorName={profile.avatarColor}
              className="h-16 w-16 text-2xl"
            />
            <div className="flex flex-col gap-1">
              <Card.Title>{displayName}</Card.Title>
              {hasName ? null : (
                <Card.Description>Имя пока не задано — показан email</Card.Description>
              )}
            </div>
          </div>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4 p-6 pt-0">
          {/* Email is read-only in every phase: it identifies the account and is never
              editable here, unlike the name (which becomes editable later). */}
          <TextField isReadOnly value={profile.email}>
            <Label>Email</Label>
            <Input className="h-11 md:h-10" />
          </TextField>
        </Card.Content>
      </Card>
    </PageShell>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { getAccessToken } from '@/lib/auth/token';

type Status = 'loading' | 'ready';

export function ProfileView() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');

  // React 18 Strict Mode runs effects twice in dev; guard the one-time auth
  // check so it doesn't fire (and redirect) twice.
  const startedRef = useRef(false);

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
    setStatus('ready');
  }, [router]);

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted text-sm">Загрузка…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Профиль</h1>
      </main>
    </div>
  );
}

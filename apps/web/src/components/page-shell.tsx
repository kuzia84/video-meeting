import { AppHeader } from '@/components/app-header';

/**
 * The frame every signed-in content page wears: the shared AppHeader above a
 * centered, max-w-3xl main column. One component rather than the same wrapper
 * copied into each page — the same reasoning that pulled AppHeader out, one
 * level up. Loading/redirect screens that render before the frame is warranted
 * (a bare centered spinner) stay outside it on purpose.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
        {children}
      </main>
    </div>
  );
}

'use client';

import {
  Alert,
  Button,
  buttonVariants,
  FieldError,
  Form,
  Input,
  Label,
  TextArea,
  TextField,
} from '@heroui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { ApiError, createMeeting } from '@/lib/api/meetings';
import { getAccessToken, removeAccessToken } from '@/lib/auth/token';

/** `datetime-local` gives "YYYY-MM-DDTHH:mm" with no zone; the API wants ISO 8601. */
function toIso(localValue: string): string | null {
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function CreateMeetingView() {
  const router = useRouter();
  const [isReady, setReady] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Per field, not one banner: the phase asks for the reason to sit on the field it
  // belongs to, which is also where a user looks for it.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Ref guard, not state: synchronous, so a rapid double submit cannot slip through
  // before a re-render commits. Same reasoning as register-form.
  const isSubmittingRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Client-side route protection: the token lives in sessionStorage, invisible to the
    // server, so every protected page gates in a mount effect.
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setFormError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const startIso = toIso(String(data.get('startTime') ?? ''));
    const endIso = toIso(String(data.get('endTime') ?? ''));

    // validationBehavior="aria" does NOT block submission, so this handler runs with
    // empty or invalid fields — these checks are load-bearing, not belt-and-braces.
    const errors: Record<string, string> = {};
    if (!title) errors.title = 'Введите название встречи';
    if (!startIso) errors.startTime = 'Укажите время начала';
    if (!endIso) errors.endTime = 'Укажите время окончания';
    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      errors.endTime = 'Окончание должно быть позже начала';
    }

    // The null checks are redundant with `errors` above — they are here so TypeScript
    // narrows startIso/endIso to string for the call below.
    if (Object.keys(errors).length > 0 || !startIso || !endIso) {
      setFieldErrors(errors);
      isSubmittingRef.current = false;
      return;
    }

    setSubmitting(true);
    try {
      const created = await createMeeting({
        title,
        // The API's column is nullable; an empty box means "no description", not "".
        description: description || null,
        startTime: startIso,
        endTime: endIso,
      });
      router.push(`/meetings/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        removeAccessToken();
        router.replace('/login');
        return;
      }
      // The API validates the same rules; show what it says rather than guessing.
      setFormError(err instanceof Error ? err.message : 'Не удалось создать встречу.');
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  // Nothing is rendered until the token check has run: flashing a form at someone who is
  // about to be bounced to /login is worse than a blank moment.
  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted text-sm">Загрузка…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Новая встреча</h1>

        <Form
          className="flex flex-col gap-4"
          // 'aria' (not the default 'native'): renders errors through FieldError instead
          // of the browser's unstyled, unlocalized tooltip. See docs/architecture/frontend-ui.md.
          validationBehavior="aria"
          validationErrors={fieldErrors}
          onSubmit={handleSubmit}
        >
          {formError ? (
            // HeroUI's Alert carries no role of its own — without these it is never
            // announced when it appears after a submit.
            <Alert status="danger" role="alert" aria-live="assertive">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{formError}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          <TextField
            isRequired
            name="title"
            onChange={() => clearFieldError('title')}
            validate={(value) => {
              // Skip the empty case: validating "" as wrong would light the field up
              // red before the user has typed anything.
              if (!value) return null;
              return value.trim() ? null : 'Введите название встречи';
            }}
          >
            <Label>Название</Label>
            <Input className="h-11 md:h-10" placeholder="Еженедельная синхронизация" />
            <FieldError />
          </TextField>

          <TextField name="description">
            <Label>Описание</Label>
            <TextArea className="min-h-24" placeholder="Необязательно" />
            <FieldError />
          </TextField>

          <TextField
            isRequired
            name="startTime"
            type="datetime-local"
            // Also clears endTime: "end before start" is about the pair, so correcting
            // either side invalidates it — leaving it under a now-valid end time would be
            // its own bug.
            onChange={() => {
              clearFieldError('startTime');
              clearFieldError('endTime');
            }}
          >
            <Label>Начало</Label>
            <Input className="h-11 md:h-10" />
            <FieldError />
          </TextField>

          <TextField
            isRequired
            name="endTime"
            type="datetime-local"
            // Cleared on edit: HeroUI leaves a submit-time error in place after the value
            // changes, so it must be dropped by hand.
            onChange={() => clearFieldError('endTime')}
          >
            <Label>Окончание</Label>
            <Input className="h-11 md:h-10" />
            <FieldError />
          </TextField>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" size="lg" isPending={isSubmitting} isDisabled={isSubmitting}>
              {({ isPending }) => (isPending ? 'Создание…' : 'Создать встречу')}
            </Button>
            <NextLink className={buttonVariants({ variant: 'outline', size: 'lg' })} href="/">
              Отмена
            </NextLink>
          </div>
        </Form>
      </main>
    </div>
  );
}

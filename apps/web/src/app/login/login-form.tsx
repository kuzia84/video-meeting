'use client';

import { Alert, Button, Card, FieldError, Form, Input, Label, TextField } from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ApiError, loginUser } from '@/lib/api/auth';
import { saveAccessToken, StorageError } from '@/lib/auth/token';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Ref-based guard: synchronous and immune to React's state-commit timing,
    // unlike checking `isSubmitting` state directly (which could momentarily
    // read stale on a rapid double Enter/click before a re-render commits).
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setFormError(null);

    const data = new FormData(e.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');

    setSubmitting(true);
    try {
      const result = await loginUser(email, password);
      try {
        saveAccessToken(result.accessToken);
      } catch (storageErr) {
        // Login already succeeded server-side — this is a distinct,
        // non-retryable failure (can't persist the session in this browser),
        // not a "please try again" network/validation error. Don't redirect:
        // without a stored token the app can't treat the user as signed in.
        setFormError(
          storageErr instanceof StorageError ? storageErr.message : 'Не удалось сохранить сессию.',
        );
        return;
      }
      router.push('/');
    } catch (err) {
      // Login 401 ("Invalid credentials") carries no `field` — it deliberately
      // doesn't distinguish unknown email from wrong password — so every API
      // error surfaces in the general Alert, not on a specific field.
      if (err instanceof ApiError) {
        setFormError(err.status === 401 ? 'Неверный email или пароль' : err.messages.join(', '));
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('Произошла непредвиденная ошибка. Попробуйте ещё раз.');
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <Card.Header>
        <Card.Title>Вход</Card.Title>
      </Card.Header>
      <Form
        className="flex flex-col gap-4 p-6 pt-0"
        validationBehavior="aria"
        onSubmit={handleSubmit}
      >
        {formError ? (
          // HeroUI's Alert has no built-in role/aria-live — without this it
          // never gets announced to screen reader users when it appears
          // asynchronously after submit.
          <Alert status="danger" role="alert" aria-live="assertive">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{formError}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        <TextField
          isRequired
          name="email"
          type="email"
          validate={(value) => {
            if (!value) return null;
            return EMAIL_PATTERN.test(value) ? null : 'Введите корректный email';
          }}
        >
          <Label>Email</Label>
          <Input className="h-11 md:h-10" placeholder="you@example.com" />
          <FieldError />
        </TextField>

        <TextField isRequired name="password" type="password">
          <Label>Пароль</Label>
          <Input className="h-11 md:h-10" placeholder="Ваш пароль" />
          <FieldError />
        </TextField>

        <Button type="submit" size="lg" isPending={isSubmitting} isDisabled={isSubmitting}>
          {({ isPending }) => (isPending ? 'Вход…' : 'Войти')}
        </Button>

        <p className="text-muted text-center text-sm">
          Нет аккаунта?{' '}
          <Link
            href="/register"
            className="text-accent font-medium underline-offset-4 hover:underline"
          >
            Зарегистрироваться
          </Link>
        </p>
      </Form>
    </Card>
  );
}

'use client';

import {
  Alert,
  Button,
  Card,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ApiError, registerUser } from '@/lib/api/auth';
import { saveAccessToken, StorageError } from '@/lib/auth/token';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm() {
  const router = useRouter();
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Ref-based guard: synchronous and immune to React's state-commit timing,
    // unlike checking `isSubmitting` state directly (which could momentarily
    // read stale on a rapid double Enter/click before a re-render commits).
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setFormError(null);
    setEmailError(null);

    const data = new FormData(e.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');

    setSubmitting(true);
    try {
      const result = await registerUser(email, password);
      try {
        saveAccessToken(result.accessToken);
      } catch (storageErr) {
        // Registration already succeeded server-side — this is a distinct,
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
      if (err instanceof ApiError) {
        if (err.field === 'email') {
          setEmailError(err.messages[0]);
        } else {
          setFormError(err.messages.join(', '));
        }
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
        <Card.Title>Регистрация</Card.Title>
      </Card.Header>
      <Form
        className="flex flex-col gap-4 p-6 pt-0"
        validationBehavior="aria"
        validationErrors={emailError ? { email: emailError } : undefined}
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
          onChange={() => setEmailError(null)}
          validate={(value) => {
            if (!value) return null;
            return EMAIL_PATTERN.test(value) ? null : 'Введите корректный email';
          }}
        >
          <Label>Email</Label>
          <Input className="h-11 md:h-10" placeholder="you@example.com" />
          <FieldError />
        </TextField>

        <TextField
          isRequired
          name="password"
          type="password"
          minLength={8}
          maxLength={72}
          validate={(value) => {
            if (!value) return null;
            if (value.length < 8) return 'Пароль должен быть не короче 8 символов';
            if (value.length > 72) return 'Пароль должен быть не длиннее 72 символов';
            return null;
          }}
        >
          <Label>Пароль</Label>
          <Input className="h-11 md:h-10" placeholder="Минимум 8 символов" />
          <Description>Минимум 8 символов</Description>
          <FieldError />
        </TextField>

        <Button type="submit" size="lg" isPending={isSubmitting} isDisabled={isSubmitting}>
          {({ isPending }) => (isPending ? 'Регистрация…' : 'Зарегистрироваться')}
        </Button>
      </Form>
    </Card>
  );
}

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
import { useState } from 'react';
import { ApiError, registerUser } from '@/lib/api/auth';
import { saveAccessToken } from '@/lib/auth/token';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm() {
  const router = useRouter();
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setEmailError(null);

    const data = new FormData(e.currentTarget);
    const email = String(data.get('email'));
    const password = String(data.get('password'));

    setSubmitting(true);
    try {
      const result = await registerUser(email, password);
      saveAccessToken(result.accessToken);
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEmailError(err.messages[0]);
      } else if (err instanceof ApiError) {
        setFormError(err.messages.join(', '));
      } else {
        setFormError('Не удалось подключиться к серверу. Попробуйте ещё раз.');
      }
    } finally {
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
          <Alert status="danger">
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
          <Input placeholder="you@example.com" />
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
          <Input placeholder="Минимум 8 символов" />
          <Description>Минимум 8 символов</Description>
          <FieldError />
        </TextField>

        <Button type="submit" isPending={isSubmitting}>
          {({ isPending }) => (isPending ? 'Регистрация…' : 'Зарегистрироваться')}
        </Button>
      </Form>
    </Card>
  );
}

'use client';

import { Alert, Button, FieldError, Form, Input, Label, TextField } from '@heroui/react';
import { useRef, useState } from 'react';
import { ApiError, changePassword } from '@/lib/api/profile';

// Mirrors the API's registration rule (see IsPassword on the backend). Kept in sync by
// hand — a client-side check gives an instant Russian message; the server is the authority.
const PASSWORD_MIN = 8;
// bcrypt only considers the first 72 bytes, so the backend caps the password there too.
const PASSWORD_MAX = 72;

/**
 * The password-change form on the profile page: current password, new, and confirm-new.
 * The confirmation is checked here (the server never sees it); the new-password length is
 * checked here too for an instant message, and the server re-applies the registration
 * rules and verifies the current password. A wrong current password comes back as a `400`
 * with `field: 'currentPassword'`, pinned to that input; other failures show above the
 * fields. On success the fields are cleared and a confirmation is shown. A `401` bubbles
 * to the page via `onUnauthorized`.
 */
export function PasswordChangeForm({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmittingRef = useRef(false);

  function clearErrorsFor(field: string) {
    setFormError(null);
    setSaved(false);
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
    setSaved(false);

    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');

    // validationBehavior="aria" does not block submission, so these checks are load-bearing.
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = 'Введите текущий пароль';
    if (newPassword.length < PASSWORD_MIN) {
      errors.newPassword = `Пароль должен быть не короче ${PASSWORD_MIN} символов`;
    } else if (newPassword.length > PASSWORD_MAX) {
      errors.newPassword = `Пароль должен быть не длиннее ${PASSWORD_MAX} символов`;
    }
    if (confirmPassword !== newPassword) errors.confirmPassword = 'Пароли не совпадают';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      isSubmittingRef.current = false;
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      // Clear the fields so the passwords don't linger in the form.
      formRef.current?.reset();
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      // A wrong current password is pinned to its field; anything else goes above the form.
      if (err instanceof ApiError && err.field) {
        setFieldErrors({ [err.field]: err.message });
      } else {
        setFormError(err instanceof Error ? err.message : 'Не удалось сменить пароль.');
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Form
      ref={formRef}
      className="flex flex-col gap-4"
      validationBehavior="aria"
      validationErrors={fieldErrors}
      onSubmit={handleSubmit}
    >
      <h2 className="text-lg font-semibold tracking-tight">Смена пароля</h2>

      {formError ? (
        <Alert status="danger" role="alert" aria-live="assertive">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{formError}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {saved ? (
        <Alert status="success" role="status" aria-live="polite">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>Пароль изменён</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <TextField
        isRequired
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        onChange={() => clearErrorsFor('currentPassword')}
      >
        <Label>Текущий пароль</Label>
        <Input className="h-11 md:h-10" />
        <FieldError />
      </TextField>

      <TextField
        isRequired
        name="newPassword"
        type="password"
        autoComplete="new-password"
        onChange={() => clearErrorsFor('newPassword')}
      >
        <Label>Новый пароль</Label>
        <Input className="h-11 md:h-10" />
        <FieldError />
      </TextField>

      <TextField
        isRequired
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        onChange={() => clearErrorsFor('confirmPassword')}
      >
        <Label>Повторите новый пароль</Label>
        <Input className="h-11 md:h-10" />
        <FieldError />
      </TextField>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="lg" isPending={isSubmitting} isDisabled={isSubmitting}>
          {({ isPending }) => (isPending ? 'Сохранение…' : 'Сменить пароль')}
        </Button>
      </div>
    </Form>
  );
}

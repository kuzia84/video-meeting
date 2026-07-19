'use client';

import { Alert, Button, FieldError, Form, Input, Label, TextField } from '@heroui/react';
import { useRef, useState } from 'react';
import { ApiError, updateProfileName, type UserProfile } from '@/lib/api/profile';

const NAME_MAX = 100;

/**
 * The name-editing form on the profile page. Pre-filled with the current name (empty
 * when unset), it PATCHes /users/me and hands the updated profile back so the card
 * title and avatar letter refresh from the same source without a reload.
 *
 * A 401 (the session died) is bubbled to the page via `onUnauthorized`, which owns the
 * redirect — the same reason the meeting-files block leaves page-level outcomes to its
 * parent. Every other failure is shown here, verbatim from the API when it names a cause.
 */
export function ProfileNameForm({
  profile,
  onSaved,
  onUnauthorized,
}: {
  profile: UserProfile;
  onSaved: (updated: UserProfile) => void;
  onUnauthorized: () => void;
}) {
  const [isSaving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // Synchronous guard against a double submit slipping past before a re-render.
  const isSavingRef = useRef(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setFormError(null);
    setFieldErrors({});
    setSaved(false);

    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();

    // validationBehavior="aria" does not block submission, so this runs with an empty
    // field — the check is load-bearing, mirroring the API's 1..100 rule.
    if (!name) {
      setFieldErrors({ name: 'Введите имя' });
      isSavingRef.current = false;
      return;
    }
    if (name.length > NAME_MAX) {
      setFieldErrors({ name: `Имя не длиннее ${NAME_MAX} символов` });
      isSavingRef.current = false;
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfileName(name);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setFormError(err instanceof Error ? err.message : 'Не удалось сохранить имя.');
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Form
      className="flex flex-col gap-4"
      validationBehavior="aria"
      validationErrors={fieldErrors}
      onSubmit={handleSubmit}
    >
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
            <Alert.Description>Имя сохранено</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <TextField
        isRequired
        name="name"
        maxLength={NAME_MAX}
        defaultValue={profile.name ?? ''}
        onChange={() => {
          setFormError(null);
          setSaved(false);
          setFieldErrors((current) => (current.name ? {} : current));
        }}
        validate={(value) => {
          // Skip the empty case so the field doesn't light up red before the first keystroke.
          if (!value) return null;
          return value.trim() ? null : 'Введите имя';
        }}
      >
        <Label>Имя</Label>
        <Input className="h-11 md:h-10" placeholder="Как к вам обращаться" />
        <FieldError />
      </TextField>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="lg" isPending={isSaving} isDisabled={isSaving}>
          {({ isPending }) => (isPending ? 'Сохранение…' : 'Сохранить')}
        </Button>
      </div>
    </Form>
  );
}

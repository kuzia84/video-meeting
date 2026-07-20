'use client';

import { Alert, Button, FieldError, Form, Input, Label, TextArea, TextField } from '@heroui/react';
import { useRef, useState } from 'react';
import { toLocalInput, validateMeetingFields } from './meeting-form-validation';

/** What the API needs; the form does the converting. */
export interface MeetingFormValues {
  title: string;
  description: string | null;
  /** ISO 8601. */
  startTime: string;
  endTime: string;
}

export interface MeetingFormInitial {
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
}

/**
 * The meeting fields, shared by creating and editing.
 *
 * One component because the phase's own wording is "the same rules as when creating" —
 * two copies would be two places for those rules to drift apart, and the validation here
 * is not decorative (see below).
 */
export function MeetingForm({
  initial,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
  cancelLabel = 'Отмена',
  autoFocus = false,
  children,
}: {
  initial?: MeetingFormInitial;
  submitLabel: string;
  pendingLabel: string;
  /** Rejects to report a failure; its message is shown above the fields. */
  onSubmit: (values: MeetingFormValues) => Promise<void>;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Set when the form appears in place of something else, so focus follows it there. */
  autoFocus?: boolean;
  /**
   * Extra controls between the fields and the buttons — the create page's file picker.
   * A slot, not a prop on this component: files belong to creating a meeting, not to
   * editing one, and this form serves both.
   */
  children?: React.ReactNode;
}) {
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Per field: the reason belongs where the user looks for it, not in one banner.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Ref, not state: synchronous, so a rapid double submit cannot slip past before a
  // re-render commits.
  const isSubmittingRef = useRef(false);

  /** A failure describes the attempt that produced it; editing makes it stale. */
  function clearErrorsFor(field: string) {
    setFormError(null);
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

    // validationBehavior="aria" does NOT block submission, so this runs with empty and
    // invalid fields — the checks in validateMeetingFields are load-bearing, not
    // belt-and-braces.
    const { values, errors } = validateMeetingFields(new FormData(event.currentTarget));
    if (!values) {
      setFieldErrors(errors);
      isSubmittingRef.current = false;
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось сохранить встречу.');
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Form
      className="flex flex-col gap-4"
      // 'aria', never the default 'native': the latter shows the browser's own unstyled,
      // unlocalized tooltip instead of FieldError. See docs/architecture/frontend-ui.md.
      validationBehavior="aria"
      validationErrors={fieldErrors}
      onSubmit={handleSubmit}
    >
      {formError ? (
        // HeroUI's Alert carries no role of its own — without these it is never announced.
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
        autoFocus={autoFocus}
        defaultValue={initial?.title ?? ''}
        onChange={() => clearErrorsFor('title')}
        validate={(value) => {
          // Skip the empty case: treating "" as wrong lights the field red before the
          // user has typed anything.
          if (!value) return null;
          return value.trim() ? null : 'Введите название встречи';
        }}
      >
        <Label>Название</Label>
        <Input className="h-11 md:h-10" placeholder="Еженедельная синхронизация" />
        <FieldError />
      </TextField>

      <TextField
        name="description"
        defaultValue={initial?.description ?? ''}
        onChange={() => setFormError(null)}
      >
        <Label>Описание</Label>
        <TextArea className="min-h-24" placeholder="Необязательно" />
        <FieldError />
      </TextField>

      <TextField
        isRequired
        name="startTime"
        type="datetime-local"
        defaultValue={initial ? toLocalInput(initial.startTime) : ''}
        // Also clears endTime: "end before start" is about the pair, so correcting either
        // side invalidates it.
        onChange={() => {
          clearErrorsFor('startTime');
          clearErrorsFor('endTime');
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
        defaultValue={initial ? toLocalInput(initial.endTime) : ''}
        // Cleared by hand: HeroUI leaves a submit-time error in place after the value
        // changes.
        onChange={() => clearErrorsFor('endTime')}
      >
        <Label>Окончание</Label>
        <Input className="h-11 md:h-10" />
        <FieldError />
      </TextField>

      {children}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="lg" isPending={isSubmitting} isDisabled={isSubmitting}>
          {({ isPending }) => (isPending ? pendingLabel : submitLabel)}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" size="lg" onPress={onCancel}>
            {cancelLabel}
          </Button>
        ) : null}
      </div>
    </Form>
  );
}

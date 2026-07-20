import type { MeetingFormValues } from './meeting-form';

/** `datetime-local` speaks zone-less local time; the API speaks ISO. */
export function toIso(localValue: string): string | null {
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The inverse: an ISO instant as the local wall-clock string the input expects. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export interface MeetingFieldValidation {
  /** The parsed values when every field is valid; null when `errors` is non-empty. */
  values: MeetingFormValues | null;
  /** Per-field reasons, keyed by field name; empty when the form is valid. */
  errors: Record<string, string>;
}

/**
 * Parses and validates the meeting fields out of the submitted `FormData`.
 *
 * These checks are **load-bearing**, not belt-and-braces: `validationBehavior="aria"`
 * does NOT block submission, so this runs with empty and invalid fields. A pure function
 * so it stays unit-testable apart from the component (mutation-tested — delete a check
 * and e2e fail).
 */
export function validateMeetingFields(data: FormData): MeetingFieldValidation {
  const title = String(data.get('title') ?? '').trim();
  const description = String(data.get('description') ?? '').trim();
  const startIso = toIso(String(data.get('startTime') ?? ''));
  const endIso = toIso(String(data.get('endTime') ?? ''));

  const errors: Record<string, string> = {};
  if (!title) errors.title = 'Введите название встречи';
  if (!startIso) errors.startTime = 'Укажите время начала';
  if (!endIso) errors.endTime = 'Укажите время окончания';
  if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
    errors.endTime = 'Окончание должно быть позже начала';
  }

  // The null checks are redundant with `errors`; they are here so TypeScript narrows.
  if (Object.keys(errors).length > 0 || !startIso || !endIso) {
    return { values: null, errors };
  }

  return {
    values: {
      title,
      // The column is nullable; an empty box means "no description", not "".
      description: description || null,
      startTime: startIso,
      endTime: endIso,
    },
    errors,
  };
}

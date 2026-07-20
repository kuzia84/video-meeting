'use client';

import { Button } from '@heroui/react';
import type { RefObject } from 'react';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import type { Meeting } from '@/lib/api/meetings';
import { formatMeetingDateTime } from '@/lib/format-date';

/** The read-only view of a meeting: title, actions (edit/delete), dates, description. */
export function MeetingDetails({
  meeting,
  editButtonRef,
  savedNotice,
  onEdit,
  onDelete,
}: {
  meeting: Meeting;
  /** Focus returns here after edit/save, so the button is passed in from the view. */
  editButtonRef: RefObject<HTMLButtonElement | null>;
  savedNotice: boolean;
  onEdit: () => void;
  /** Resolves once the meeting is gone; the dialog stays open until it settles. */
  onDelete: () => Promise<void>;
}) {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <Button ref={editButtonRef} variant="outline" size="sm" onPress={onEdit}>
              Редактировать
            </Button>
            <ConfirmDeleteDialog
              trigger={
                <Button variant="ghost" size="sm">
                  Удалить встречу
                </Button>
              }
              heading="Удалить встречу?"
              body={
                <p>
                  Встреча <strong>{meeting.title}</strong> и все её файлы будут удалены
                  безвозвратно.
                </p>
              }
              // Not "Удалить встречу": that is the trigger's own name, and two buttons
              // answering to one name are two outcomes for one utterance.
              confirmLabel="Да, удалить"
              pendingLabel="Удаление…"
              onConfirm={onDelete}
            />
          </div>
        </div>
        <p className="text-muted text-sm">
          <time dateTime={meeting.startTime}>{formatMeetingDateTime(meeting.startTime)}</time>
          {' — '}
          <time dateTime={meeting.endTime}>{formatMeetingDateTime(meeting.endTime)}</time>
        </p>
      </header>

      {savedNotice ? (
        <p className="text-success text-sm" role="status">
          Изменения сохранены
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Описание</h2>
        {meeting.description ? (
          <p className="whitespace-pre-wrap">{meeting.description}</p>
        ) : (
          <p className="text-muted text-sm">Описание не указано</p>
        )}
      </section>
    </article>
  );
}

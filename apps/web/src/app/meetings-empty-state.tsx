import { CalendarIcon } from '@/components/icons';
import { CreateMeetingLink } from './create-meeting-link';

/** Shown when the user has no meetings — carries its own "create" invitation. */
export function MeetingsEmptyState() {
  return (
    <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
      <CalendarIcon className="text-muted size-12" />
      <p className="font-medium">Встреч пока нет</p>
      <p className="text-muted max-w-xs text-sm text-balance">
        Создайте первую встречу — сюда можно будет загрузить её запись.
      </p>
      {/* Wording differs from the CTA above on purpose: two buttons reading "Создать
          встречу" would be ambiguous to screen readers and to tests. */}
      <CreateMeetingLink>Создать первую встречу</CreateMeetingLink>
    </div>
  );
}

// Shared ru-RU date formatters. One `Intl.DateTimeFormat` per shape, created once at
// module load (constructing one is not free), rather than the same config inlined per
// page — the three shapes below had drifted apart when each screen kept its own.

/** Day + month + time — the meeting-list card ("14 июля, 09:30"). */
const meetingDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** Day + month + year + time — the meeting page header ("14 июля 2026 г., 09:30"). */
const meetingDateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Day + month + year, no time — a file's upload date ("14 июля 2026 г."). */
const fileDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatMeetingDate(iso: string): string {
  return meetingDateFormatter.format(new Date(iso));
}

export function formatMeetingDateTime(iso: string): string {
  return meetingDateTimeFormatter.format(new Date(iso));
}

export function formatFileDate(iso: string): string {
  return fileDateFormatter.format(new Date(iso));
}

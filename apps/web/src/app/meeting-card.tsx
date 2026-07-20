import { Card } from '@heroui/react';
import NextLink from 'next/link';
import type { Meeting } from '@/lib/api/meetings';
import { formatMeetingDate } from '@/lib/format-date';

/** One meeting in the home list — the whole card is the link to its page. */
export function MeetingCard({ meeting }: { meeting: Meeting }) {
  return (
    // The whole card is the link, so the target is as big as it looks rather than just
    // the title.
    <NextLink
      href={`/meetings/${meeting.id}`}
      className="focus-visible:outline-accent block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Card className="hover:border-accent transition-colors">
        <Card.Header>
          <Card.Title>{meeting.title}</Card.Title>
          <Card.Description>
            {formatMeetingDate(meeting.startTime)} — {formatMeetingDate(meeting.endTime)}
          </Card.Description>
        </Card.Header>
        {meeting.description ? (
          <Card.Content>
            <p className="text-muted text-sm">{meeting.description}</p>
          </Card.Content>
        ) : null}
      </Card>
    </NextLink>
  );
}

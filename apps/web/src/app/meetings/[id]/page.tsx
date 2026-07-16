import { MeetingView } from './meeting-view';

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeetingView meetingId={id} />;
}

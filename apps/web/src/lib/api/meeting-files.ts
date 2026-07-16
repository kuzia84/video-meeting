import { fetchJson } from './client';
import { getAccessToken } from '@/lib/auth/token';

export { ApiError } from './client';

// Mirrors MeetingFileResponse in apps/api/src/meetings/meeting-file.response.ts.
// `storedName` is deliberately absent there — it never leaves the server.
export interface MeetingFile {
  id: string;
  meetingId: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function listMeetingFiles(meetingId: string): Promise<MeetingFile[]> {
  return fetchJson<MeetingFile[]>(`/meetings/${encodeURIComponent(meetingId)}/files`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
}

/**
 * Downloads a file and hands it to the browser's save flow.
 *
 * Not an `<a href>` pointing at the endpoint: the route is JWT-guarded and the token
 * lives in sessionStorage, so it can only travel as a header — a plain link would send
 * no Authorization and get a 401. So: fetch with the header, take the bytes as a blob,
 * and click a synthetic link at an object URL.
 *
 * The whole file lands in the tab's memory, up to the 100 MB the API accepts. Tolerable,
 * but not free — the alternative is short-lived signed URLs, which is a mechanism neither
 * the PRD nor the current auth has.
 */
export async function downloadMeetingFile(file: MeetingFile): Promise<void> {
  const response = await fetch(
    `${API_URL}/meetings/${encodeURIComponent(file.meetingId)}/files/${encodeURIComponent(file.id)}`,
    { method: 'GET', headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error('Не удалось скачать файл. Попробуйте ещё раз.');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = objectUrl;
  // The server sends the name in Content-Disposition too, but a blob: URL has no
  // response headers behind it — the browser reads the name from here instead.
  link.download = file.originalName;
  document.body.append(link);
  link.click();
  link.remove();

  // Revoked on the next tick, not straight after click(): the click only *starts* the
  // download, and pulling the URL out from under it in the same task can cancel it.
  // Without revoking at all, the blob pins its bytes — up to 100 MB — for the lifetime
  // of the document.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

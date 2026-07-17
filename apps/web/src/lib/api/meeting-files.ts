import { apiErrorFromText, apiUrl, fetchBlob, fetchJson } from './client';
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

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Uploads one file, reporting how much of it has actually gone out.
 *
 * XMLHttpRequest, not fetch — and not by preference: `fetch` has no upload progress
 * events at all (only download). The streaming workaround (`ReadableStream` body with
 * `duplex: 'half'`) needs HTTP/2 and is unsupported in Safari and Firefox. So this is
 * the one call in the app that cannot use the shared fetch wrapper; base-URL resolution
 * and ApiError mapping still come from client.ts rather than being re-derived here.
 *
 * Content-Type is deliberately never set: the browser must write it itself, because only
 * it knows the multipart boundary. Setting it by hand produces a body the server cannot
 * parse.
 */
export function uploadMeetingFile(
  meetingId: string,
  file: File,
  { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<MeetingFile> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Загрузка отменена.'));
      return;
    }

    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(`/meetings/${encodeURIComponent(meetingId)}/files`));

    // Without this a 100 MB upload keeps going after the user has left the page.
    const onAbortRequested = () => xhr.abort();
    signal?.addEventListener('abort', onAbortRequested, { once: true });
    xhr.onloadend = () => signal?.removeEventListener('abort', onAbortRequested);

    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      // lengthComputable is false when the total is unknown; reporting a fraction of an
      // unknown total would be a made-up number.
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { data?: MeetingFile };
          if (!body.data) throw new Error('no data');
          resolve(body.data);
        } catch {
          reject(new Error('Сервер вернул некорректный ответ. Попробуйте ещё раз.'));
        }
        return;
      }
      // The rejection reason the user must see (the 100 MB limit, the allowed types)
      // lives in this body — the PRD requires showing it verbatim.
      reject(apiErrorFromText(xhr.status, xhr.responseText, 'Не удалось загрузить файл.'));
    };

    xhr.onerror = () => reject(new Error('Не удалось подключиться к серверу. Попробуйте ещё раз.'));
    xhr.onabort = () => reject(new Error('Загрузка отменена.'));

    xhr.send(form);
  });
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
  // fetchBlob, not a bare fetch: the base URL and the ApiError shape belong to client.ts,
  // so a 401 here is the same recognizable error as a 401 anywhere else.
  const blob = await fetchBlob(
    `/meetings/${encodeURIComponent(file.meetingId)}/files/${encodeURIComponent(file.id)}`,
    { method: 'GET', headers: authHeaders() },
  );
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

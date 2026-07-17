import { fetchJson, fetchPaginated, fetchVoid } from './client';
import { getAccessToken } from '@/lib/auth/token';
import type { PaginatedResponse } from '@video-meetings/shared';

export { ApiError } from './client';

// The API's `Meeting` is the Prisma model, serialized to JSON (dates become
// ISO strings). There is no shared `Meeting` type in @video-meetings/shared,
// so mirror the fields the API actually returns here.
export interface Meeting {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  createdAt: string;
  userId: string;
}

// GET /meetings is JWT-protected: the guard requires an `Authorization: Bearer
// <token>` header. fetchPaginated spreads `options` over its default headers,
// so pass Content-Type too or it's lost.
function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** How many meetings one page of the home list shows. */
export const MEETINGS_PAGE_SIZE = 10;

export interface MeetingsPage {
  meetings: Meeting[];
  /** Total across all pages — drives both the page count and the header count. */
  total: number;
  page: number;
}

// The home page shows the full list a page at a time, so it maps straight onto the
// API's own pagination — no client-side slicing, and only one page is ever in memory.
// Ordering is the API's: startTime ascending, the only order it supports.
export async function listMeetings(page: number): Promise<MeetingsPage> {
  const response: PaginatedResponse<Meeting> = await fetchPaginated<Meeting>(
    `/meetings?page=${page}&limit=${MEETINGS_PAGE_SIZE}`,
    { method: 'GET', headers: authHeaders() },
  );

  return { meetings: response.data, total: response.total, page: response.page };
}

export interface NewMeeting {
  title: string;
  description: string | null;
  /** ISO 8601, as the API's @IsDateString expects. */
  startTime: string;
  endTime: string;
}

export function createMeeting(meeting: NewMeeting): Promise<Meeting> {
  return fetchJson<Meeting>('/meetings', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(meeting),
  });
}

/**
 * PATCH: only the fields sent are changed. `description: null` clears it, which is why
 * this takes the same shape as create rather than a partial of it — the form always has
 * every field, so it always sends every field.
 */
export function updateMeeting(id: string, changes: NewMeeting): Promise<Meeting> {
  return fetchJson<Meeting>(`/meetings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(changes),
  });
}

/** 204, so there is no body to read back. */
export async function deleteMeeting(id: string): Promise<void> {
  await fetchVoid(`/meetings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

// A meeting the caller does not own answers 404 exactly like one that does not exist —
// the API refuses to confirm it exists at all, so the page cannot tell the two apart
// and must not try to.
export function getMeeting(id: string): Promise<Meeting> {
  return fetchJson<Meeting>(`/meetings/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

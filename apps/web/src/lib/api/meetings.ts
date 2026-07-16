import { fetchPaginated } from './client';
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

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
// <token>` header (note the trailing space after "Bearer"). fetchPaginated
// spreads `options` over its default headers, so pass Content-Type too or it's
// lost.
function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const RECENT_LIMIT = 3;

function fetchMeetingsPage(page: number, limit: number): Promise<PaginatedResponse<Meeting>> {
  return fetchPaginated<Meeting>(`/meetings?page=${page}&limit=${limit}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export interface RecentMeetings {
  total: number;
  recent: Meeting[];
}

// The home page needs the authoritative meeting count and the three most recent
// meetings. The API paginates and only sorts by startTime ASC, so the newest
// meetings live at the *end* of the last page. We drive that with server-side
// pagination rather than pulling everything into memory:
//   1. Fetch page 1 (limit 3) — this also yields `total`.
//   2. If total ≤ 3, that page already holds every meeting: reverse for
//      most-recent-first and we're done in a single request.
//   3. Otherwise fetch the last page; if its remainder is < 3 items, also fetch
//      the previous page so we always have the final three, then reverse.
export async function getRecentMeetings(): Promise<RecentMeetings> {
  const firstPage = await fetchMeetingsPage(1, RECENT_LIMIT);
  const total = firstPage.total;

  if (total <= RECENT_LIMIT) {
    return { total, recent: [...firstPage.data].reverse() };
  }

  const lastPageNumber = Math.ceil(total / RECENT_LIMIT);
  const lastPage = await fetchMeetingsPage(lastPageNumber, RECENT_LIMIT);
  let tail = lastPage.data;

  // A partial last page (total not divisible by 3) holds fewer than 3 of the
  // newest meetings; pull the previous page to backfill up to three. When that
  // previous page is page 1 (total of 4 or 5), reuse the `firstPage` we already
  // fetched instead of re-requesting it.
  if (tail.length < RECENT_LIMIT && lastPageNumber > 1) {
    const prevPageNumber = lastPageNumber - 1;
    const prevPage =
      prevPageNumber === 1 ? firstPage : await fetchMeetingsPage(prevPageNumber, RECENT_LIMIT);
    tail = [...prevPage.data, ...tail];
  }

  return { total, recent: tail.slice(-RECENT_LIMIT).reverse() };
}

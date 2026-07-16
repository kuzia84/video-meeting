import type { APIRequestContext, Page } from '@playwright/test';

export const API_URL = 'http://localhost:3001';

/** Mirrors ACCESS_TOKEN_KEY in src/lib/auth/token.ts — the app reads exactly this. */
const ACCESS_TOKEN_KEY = 'accessToken';

export interface TestUser {
  email: string;
  token: string;
}

/**
 * These tests share the dev database, so every run needs its own user rather than a
 * fixed address: a second run would otherwise hit the 409 on a duplicate email, and
 * one test's meetings would show up in another's list.
 *
 * KNOWN GAP — the seeded rows are never removed, so each run leaves a handful of users
 * and their meetings behind. Cleaning up needs either `DELETE /meetings/:id`, which does
 * not exist yet (it lands in phase 6 of meeting management), or direct database access
 * from this workspace, which would mean giving apps/web a Prisma dependency purely for
 * tests. Neither is worth forcing here: the rows are tiny, this is the dev database, and
 * the API's own e2e suite wipes users wholesale on its next run anyway. Revisit once the
 * DELETE endpoint exists.
 */
let userCounter = 0;
function uniqueEmail(): string {
  userCounter += 1;
  return `e2e-${process.pid}-${Date.now()}-${userCounter}@example.com`;
}

export async function registerUser(request: APIRequestContext): Promise<TestUser> {
  const email = uniqueEmail();
  const res = await request.post(`${API_URL}/auth/register`, {
    data: { email, password: 'password123' },
  });
  if (!res.ok()) {
    throw new Error(`Failed to register ${email}: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { data: { accessToken: string } };
  return { email, token: body.data.accessToken };
}

export interface SeededMeeting {
  id: string;
  title: string;
}

/**
 * Meetings are seeded through the API rather than the UI: the creation form does not
 * exist yet (it arrives in phase 3), and even once it does, driving it here would test
 * that form instead of the list under test.
 *
 * `index` shifts startTime so the seeded order is deterministic — the API sorts by
 * startTime ascending, which is the order the list renders.
 */
export async function createMeeting(
  request: APIRequestContext,
  token: string,
  {
    index = 0,
    title = `Встреча ${index + 1}`,
    description = null,
  }: { index?: number; title?: string; description?: string | null } = {},
): Promise<SeededMeeting> {
  const start = new Date(Date.UTC(2026, 7, 1, 9, 0, 0) + index * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const res = await request.post(`${API_URL}/meetings`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title,
      description,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create meeting: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { data: { id: string } };
  return { id: body.data.id, title };
}

export interface UploadedFile {
  id: string;
  originalName: string;
  size: number;
}

/**
 * Derived from the extension rather than hardcoded: a helper that always declared
 * audio/mpeg would post a .wav labelled as mp3 and still pass, so a test named for one
 * format would quietly exercise another.
 */
function mimeTypeFor(name: string): string {
  const byExtension: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/x-m4a',
    '.mp4': 'video/mp4',
  };
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  return byExtension[extension] ?? 'application/octet-stream';
}

/**
 * Uploads a file to a meeting through the API. The upload UI does not exist yet (it is
 * phase 5), and once it does, driving it here would test that instead of the list.
 */
export async function uploadFile(
  request: APIRequestContext,
  token: string,
  meetingId: string,
  { name = 'recording.mp3', contents = 'fake mp3 payload', mimeType = mimeTypeFor(name) } = {},
): Promise<UploadedFile> {
  const res = await request.post(`${API_URL}/meetings/${meetingId}/files`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: { name, mimeType, buffer: Buffer.from(contents) },
    },
  });
  if (!res.ok()) {
    throw new Error(`Failed to upload ${name}: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { data: UploadedFile };
  return body.data;
}

export async function createMeetings(
  request: APIRequestContext,
  token: string,
  count: number,
): Promise<SeededMeeting[]> {
  const meetings: SeededMeeting[] = [];
  for (let index = 0; index < count; index += 1) {
    meetings.push(await createMeeting(request, token, { index }));
  }
  return meetings;
}

/**
 * Seeds the session the way the app expects to find it. `addInitScript` runs before
 * any page script, so the home view's mount-time auth check sees the token and does
 * not bounce to /login. Going through the login form instead would test the login
 * form in every list test.
 */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.addInitScript(([key, token]) => window.sessionStorage.setItem(key, token), [
    ACCESS_TOKEN_KEY,
    user.token,
  ] as const);
}

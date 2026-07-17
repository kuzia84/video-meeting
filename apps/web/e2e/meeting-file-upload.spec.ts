import { open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { API_URL, createMeeting, registerUser, signIn, uploadFile } from './support';

/** A file the browser sees as picked from disk, without touching the filesystem. */
function fileOfSize(name: string, bytes: number, mimeType = 'audio/mpeg') {
  return { name, mimeType, buffer: Buffer.alloc(bytes, 1) };
}

test.describe('Meeting page — upload', () => {
  test('uploads a picked file and adds it to the list', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await expect(page.getByText('Файлов пока нет')).toBeVisible();

    await page.getByLabel('Загрузить файл').setInputFiles(fileOfSize('Запись.mp3', 2048));

    const items = page.getByRole('list', { name: 'Список файлов' }).getByRole('listitem');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Запись.mp3');
    await expect(items.first()).toContainText('2 КБ');
    // The empty state must give way, not sit alongside the list.
    await expect(page.getByText('Файлов пока нет')).toHaveCount(0);
  });

  test('the uploaded file survives a reload — it really reached the server', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByLabel('Загрузить файл').setInputFiles(fileOfSize('persisted.mp3', 1024));
    await expect(page.getByRole('listitem').filter({ hasText: 'persisted.mp3' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('listitem').filter({ hasText: 'persisted.mp3' })).toBeVisible();
  });

  test('shows progress that actually moves while a large file goes out', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    // Without throttling, 8 MB over loopback completes between two frames and the bar
    // jumps 0 → 100, so "progress moves" would be untestable (and the test flaky).
    // 200 KB/s makes the intermediate values observable.
    const session = await page.context().newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: 200 * 1024,
    });

    const progressBar = page.getByRole('progressbar', { name: 'Загрузка файла' });
    const seen: number[] = [];

    await page.getByLabel('Загрузить файл').setInputFiles(fileOfSize('big.mp3', 8 * 1024 * 1024));

    await expect(progressBar).toBeVisible();
    // Sample the reported value as the upload runs.
    for (let i = 0; i < 20; i += 1) {
      const value = await progressBar.getAttribute('aria-valuenow').catch(() => null);
      if (value !== null) seen.push(Number(value));
      if (seen.at(-1) === 100) break;
      await page.waitForTimeout(250);
    }

    // At least two distinct values: the bar tracked the transfer rather than sitting at
    // one number until it finished.
    expect(new Set(seen).size).toBeGreaterThan(1);
    // ...and they only ever go up.
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);

    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await expect(page.getByRole('listitem').filter({ hasText: 'big.mp3' })).toBeVisible({
      timeout: 60_000,
    });
  });

  test('does not pass one uploaded file off as the whole list when the list failed', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    // Two files already on the server that the page will fail to learn about.
    await uploadFile(request, user.token, meeting.id, { name: 'existing-1.mp3' });
    await uploadFile(request, user.token, meeting.id, { name: 'existing-2.mp3' });
    await signIn(page, user);

    // Fail the list once, then let it through.
    let failList = true;
    await page.route(`${API_URL}/meetings/*/files`, (route) => {
      if (route.request().method() === 'GET' && failList) {
        failList = false;
        return route.abort('failed');
      }
      return route.continue();
    });

    await page.goto(`/meetings/${meeting.id}`);
    await expect(page.getByRole('button', { name: 'Попробовать снова' })).toBeVisible();

    await page.getByLabel('Загрузить файл').setInputFiles(fileOfSize('third.mp3', 1024));

    // All three, not just the one that was uploaded from this page.
    const items = page.getByRole('list', { name: 'Список файлов' }).getByRole('listitem');
    await expect(items).toHaveCount(3);
    await expect(items.last()).toContainText('third.mp3');
  });

  test('shows the API’s reason when the type is rejected', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByLabel('Загрузить файл').setInputFiles({
      name: 'malware.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ'),
    });

    // The exact text is the API's, shown verbatim — the PRD asks for the cause.
    await expect(page.getByText(/Тип файла не поддерживается/)).toBeVisible();
    await expect(page.getByText(/\.exe/)).toBeVisible();
    await expect(page.getByText('Файлов пока нет')).toBeVisible();
  });

  test('shows the API’s reason, naming the limit, when the file is too large', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    // One byte past the cap: the smallest file the API must refuse. From disk, not a
    // buffer — Playwright refuses in-memory files over 50 MB — and grown with truncate,
    // so it costs no real space and no RAM.
    const oversizedPath = join(tmpdir(), 'vm-web-oversized.mp3');
    const handle = await open(oversizedPath, 'w');
    await handle.truncate(100 * 1024 * 1024 + 1);
    await handle.close();

    try {
      await page.getByLabel('Загрузить файл').setInputFiles(oversizedPath);

      await expect(page.getByText(/Файл слишком большой/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(/100 МБ/)).toBeVisible();
      await expect(page.getByRole('list', { name: 'Список файлов' })).toHaveCount(0);
    } finally {
      await rm(oversizedPath, { force: true });
    }
  });

  test('a rejected upload leaves the existing list alone', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByLabel('Загрузить файл').setInputFiles(fileOfSize('good.mp3', 1024));
    await expect(page.getByRole('listitem').filter({ hasText: 'good.mp3' })).toBeVisible();

    await page.getByLabel('Загрузить файл').setInputFiles({
      name: 'bad.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ'),
    });

    await expect(page.getByText(/Тип файла не поддерживается/)).toBeVisible();
    const items = page.getByRole('list', { name: 'Список файлов' }).getByRole('listitem');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('good.mp3');
  });
});

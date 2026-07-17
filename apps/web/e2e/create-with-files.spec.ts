import { expect, test } from '@playwright/test';
import { API_URL, registerUser, signIn } from './support';

const START_LOCAL = '2026-08-01T09:00';
const END_LOCAL = '2026-08-01T10:00';

function fileOfSize(name: string, bytes: number) {
  return { name, mimeType: 'audio/mpeg', buffer: Buffer.alloc(bytes, 1) };
}

async function fillRequiredFields(page: import('@playwright/test').Page, title: string) {
  await page.getByLabel('Название').fill(title);
  await page.getByLabel('Начало').fill(START_LOCAL);
  await page.getByLabel('Окончание').fill(END_LOCAL);
}

test.describe('Create meeting with files', () => {
  test('creates the meeting, uploads the picked files, and lands on its page', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    await fillRequiredFields(page, 'Встреча с записью');
    await page
      .getByLabel('Файлы записи')
      .setInputFiles([fileOfSize('first.mp3', 1024), fileOfSize('second.mp3', 2048)]);
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    // Only once the uploads finish — the phase asks for the page after the upload.
    await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Встреча с записью' })).toBeVisible();

    const items = page.getByRole('list', { name: 'Список файлов' }).getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('first.mp3');
    await expect(items.last()).toContainText('second.mp3');
  });

  test('creating without files still works', async ({ page, request }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    await fillRequiredFields(page, 'Без файлов');
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    await expect(page.getByRole('heading', { name: 'Без файлов' })).toBeVisible();
    await expect(page.getByText('Файлов пока нет')).toBeVisible();
  });

  test('shows progress that moves while a large file goes out', async ({ page, request }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    // Without throttling, 6 MB over loopback finishes between two frames and the bar
    // jumps 0 → 100, making "progress moves" untestable and the test flaky.
    const session = await page.context().newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: 200 * 1024,
    });

    await fillRequiredFields(page, 'Большой файл');
    await page.getByLabel('Файлы записи').setInputFiles([fileOfSize('big.mp3', 6 * 1024 * 1024)]);
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    const progressBar = page.getByRole('progressbar', { name: 'Загрузка файлов' });
    await expect(progressBar).toBeVisible();

    const seen: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const value = await progressBar.getAttribute('aria-valuenow').catch(() => null);
      if (value !== null) seen.push(Number(value));
      if (seen.at(-1) === 100) break;
      await page.waitForTimeout(250);
    }
    expect(new Set(seen).size).toBeGreaterThan(1);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);

    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  });

  test('a failed upload leaves the created meeting reachable, and says so', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    // The meeting is created first — it has to be, files need its id — so a failure here
    // must never read as "the meeting was not created".
    await page.route(`${API_URL}/meetings/*/files`, (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
    );

    await fillRequiredFields(page, 'Встреча уцелела');
    await page.getByLabel('Файлы записи').setInputFiles([fileOfSize('doomed.mp3', 1024)]);
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    // The meeting is real, so the message must say so — and name the file that failed.
    await expect(page.getByText(/Встреча создана, но загрузка прервалась/)).toBeVisible();
    await expect(page.getByText(/doomed\.mp3/)).toBeVisible();
    // Still on the form, not navigated away — and offered a way to the real meeting.
    await expect(page).toHaveURL('/meetings/new');

    const created = await request.get(`${API_URL}/meetings?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect((await created.json()).total).toBe(1);

    await page.getByRole('link', { name: 'Открыть встречу' }).click();
    await expect(page.getByRole('heading', { name: 'Встреча уцелела' })).toBeVisible();
  });

  test('names which file of several failed, and how many made it', async ({ page, request }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    await fillRequiredFields(page, 'Второй файл плохой');
    await page
      .getByLabel('Файлы записи')
      .setInputFiles([
        fileOfSize('good.mp3', 1024),
        { name: 'bad.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
        fileOfSize('never-started.mp3', 1024),
      ]);
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    // Which file, where in the queue, and what survived — otherwise the user opens the
    // meeting to find one file of three and no idea what to retry.
    await expect(page.getByText(/bad\.exe/)).toBeVisible();
    await expect(page.getByText(/2 из 3/)).toBeVisible();
    await expect(page.getByText(/Загружено файлов: 1 из 3/)).toBeVisible();
  });

  test('an upload rejected by the API reports the API’s reason', async ({ page, request }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    await fillRequiredFields(page, 'Плохой тип');
    await page.getByLabel('Файлы записи').setInputFiles([
      {
        name: 'malware.exe',
        mimeType: 'application/x-msdownload',
        buffer: Buffer.from('MZ'),
      },
    ]);
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    await expect(page.getByText(/Тип файла не поддерживается/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Открыть встречу' })).toBeVisible();
  });
});

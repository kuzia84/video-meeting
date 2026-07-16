import { expect, test } from '@playwright/test';
import { API_URL, createMeeting, registerUser, signIn, uploadFile } from './support';

test.describe('Meeting page — files', () => {
  test('lists the meeting’s files with name, size and upload date', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    // 2048 bytes exactly, so the rendered size is unambiguous rather than rounded.
    await uploadFile(request, user.token, meeting.id, {
      name: 'Запись встречи.mp3',
      contents: 'x'.repeat(2048),
    });
    await signIn(page, user);

    await page.goto(`/meetings/${meeting.id}`);

    const items = page.getByRole('list', { name: 'Список файлов' }).getByRole('listitem');
    await expect(items).toHaveCount(1);
    // Cyrillic survives the whole round trip: busboy's latin1 quirk, the DB, and back.
    await expect(items.first()).toContainText('Запись встречи.mp3');
    await expect(items.first()).toContainText('2 КБ');
    // Uploaded just now — the date is today's, whatever day the suite runs.
    const today = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date());
    await expect(items.first()).toContainText(today);
  });

  test('downloads a file on click, byte for byte', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    const contents = 'the actual bytes of the recording';
    await uploadFile(request, user.token, meeting.id, { name: 'audio.mp3', contents });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    // Wait before the click: the event fires during it, and starting to listen after
    // would race the download.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать audio.mp3' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('audio.mp3');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe(contents);
  });

  test('keeps a Cyrillic filename on the downloaded file', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await uploadFile(request, user.token, meeting.id, { name: 'Запись встречи.mp3' });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать Запись встречи.mp3' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('Запись встречи.mp3');
  });

  test('shows an empty state when the meeting has no files', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);

    await page.goto(`/meetings/${meeting.id}`);

    await expect(page.getByText('Файлов пока нет')).toBeVisible();
    // An empty list must read as empty, not as broken.
    await expect(page.getByText('Не удалось загрузить файлы.')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Список файлов' })).toHaveCount(0);
  });

  test('lists several files', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await uploadFile(request, user.token, meeting.id, { name: 'first.mp3' });
    await uploadFile(request, user.token, meeting.id, { name: 'second.mp3' });
    await signIn(page, user);

    await page.goto(`/meetings/${meeting.id}`);

    const items = page.getByRole('list', { name: 'Список файлов' }).getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('first.mp3');
    await expect(items.last()).toContainText('second.mp3');
  });

  test('reports a failed file list without breaking the meeting page', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, { title: 'Встреча жива' });
    await signIn(page, user);

    await page.route(`${API_URL}/meetings/*/files`, (route) => route.abort('failed'));
    await page.goto(`/meetings/${meeting.id}`);

    // The meeting itself loaded fine; only its files did not.
    await expect(page.getByRole('heading', { name: 'Встреча жива' })).toBeVisible();
    // Anchored on the retry, which only the error branch renders. Not on getByRole('alert')
    // — Next ships its own route announcer with that role — nor on the exact text, which
    // comes from client.ts and is not this screen's to restate.
    await expect(page.getByRole('button', { name: 'Попробовать снова' })).toBeVisible();
    await expect(page.getByText(/^Не удалось/)).toBeVisible();
    // A failure must not masquerade as "no files yet".
    await expect(page.getByText('Файлов пока нет')).toHaveCount(0);
  });
});

import { expect, test } from '@playwright/test';
import { API_URL, createMeeting, registerUser, signIn, uploadFile } from './support';

test.describe('Deleting', () => {
  test('deletes a file after confirming', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await uploadFile(request, user.token, meeting.id, { name: 'doomed.mp3' });
    await uploadFile(request, user.token, meeting.id, { name: 'keeper.mp3' });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByRole('button', { name: 'Удалить doomed.mp3' }).click();
    await page.getByRole('button', { name: 'Удалить файл' }).click();

    const items = page.getByRole('list', { name: 'Список файлов' }).getByRole('listitem');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('keeper.mp3');

    // It reached the server, not just the screen.
    const res = await request.get(`${API_URL}/meetings/${meeting.id}/files`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const names = (await res.json()).data.map((f: { originalName: string }) => f.originalName);
    expect(names).toEqual(['keeper.mp3']);
  });

  test('cancelling the file dialog leaves the file alone', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await uploadFile(request, user.token, meeting.id, { name: 'safe.mp3' });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByRole('button', { name: 'Удалить safe.mp3' }).click();
    await page.getByRole('button', { name: 'Отмена' }).click();

    await expect(page.getByRole('listitem').filter({ hasText: 'safe.mp3' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: 'safe.mp3' })).toBeVisible();
  });

  test('deletes a meeting after confirming and returns to the list', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, { title: 'На удаление' });
    await uploadFile(request, user.token, meeting.id);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    // The trigger and the confirm have different names on purpose: one opens a dialog,
    // the other destroys the meeting, and they must not answer to the same words.
    await page.getByRole('button', { name: 'Удалить встречу' }).click();
    await page.getByRole('button', { name: 'Да, удалить' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('Встреч пока нет')).toBeVisible();

    const res = await request.get(`${API_URL}/meetings?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect((await res.json()).total).toBe(0);
  });

  test('cancelling the meeting dialog leaves the meeting alone', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, { title: 'Останется' });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByRole('button', { name: 'Удалить встречу' }).first().click();
    await page.getByRole('button', { name: 'Отмена' }).click();

    await expect(page.getByRole('heading', { name: 'Останется' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Останется' })).toBeVisible();
  });

  test('a failed delete keeps the dialog open and says why', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await uploadFile(request, user.token, meeting.id, { name: 'stubborn.mp3' });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.route(`${API_URL}/meetings/*/files/*`, (route) =>
      route.request().method() === 'DELETE' ? route.abort('failed') : route.continue(),
    );

    await page.getByRole('button', { name: 'Удалить stubborn.mp3' }).click();
    await page.getByRole('button', { name: 'Удалить файл' }).click();

    // Closing on failure would hide the reason and imply it worked.
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText(/Не удалось подключиться к серверу/)).toBeVisible();
    // And the file is still there behind the dialog.
    await expect(page.getByRole('listitem').filter({ hasText: 'stubborn.mp3' })).toBeVisible();
  });
});

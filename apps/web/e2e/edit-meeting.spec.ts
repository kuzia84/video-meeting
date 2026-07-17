import { expect, test } from '@playwright/test';
import { createMeeting, registerUser, signIn } from './support';

test.describe('Edit meeting', () => {
  test('saves the edit and it survives a reload', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, {
      title: 'Старое название',
      description: 'Старое описание',
    });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByRole('button', { name: 'Редактировать' }).click();

    // The form starts from what the meeting actually holds, not from blanks.
    await expect(page.getByLabel('Название')).toHaveValue('Старое название');
    await expect(page.getByLabel('Описание')).toHaveValue('Старое описание');
    // The config pins UTC, and seeding used 09:00Z.
    await expect(page.getByLabel('Начало')).toHaveValue('2026-08-01T09:00');

    await page.getByLabel('Название').fill('Новое название');
    await page.getByLabel('Описание').fill('Новое описание');
    await page.getByLabel('Начало').fill('2026-08-02T14:00');
    await page.getByLabel('Окончание').fill('2026-08-02T15:30');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    // Back to the read view, showing the new data without a reload.
    await expect(page.getByRole('heading', { name: 'Новое название' })).toBeVisible();
    await expect(page.getByText('Новое описание')).toBeVisible();
    await expect(page.getByText(/2 августа 2026 г. в 14:00/)).toBeVisible();

    await page.reload();

    // It reached the server, not just the screen.
    await expect(page.getByRole('heading', { name: 'Новое название' })).toBeVisible();
    await expect(page.getByText(/2 августа 2026 г. в 15:30/)).toBeVisible();
  });

  test('shows the reason at the field when the end is before the start', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, { title: 'Не трогать' });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);
    await page.getByRole('button', { name: 'Редактировать' }).click();

    await page.getByLabel('Начало').fill('2026-08-02T15:00');
    await page.getByLabel('Окончание').fill('2026-08-02T14:00');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByText('Окончание должно быть позже начала')).toBeVisible();
    // Still editing, and nothing was saved.
    await expect(page.getByRole('button', { name: 'Сохранить' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Не трогать' })).toBeVisible();
    await expect(page.getByText(/1 августа 2026 г. в 09:00/)).toBeVisible();
  });

  test('shows the reason at the field when the title is emptied', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);
    await page.getByRole('button', { name: 'Редактировать' }).click();

    await page.getByLabel('Название').fill('');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByText('Введите название встречи')).toBeVisible();
  });

  test('cancelling leaves the meeting as it was', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, { title: 'Как было' });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);
    await page.getByRole('button', { name: 'Редактировать' }).click();

    await page.getByLabel('Название').fill('Как не должно стать');
    await page.getByRole('button', { name: 'Отмена' }).click();

    await expect(page.getByRole('heading', { name: 'Как было' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Как было' })).toBeVisible();
  });

  test('clearing the description removes it rather than storing a blank', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, { description: 'Будет удалено' });
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);
    await page.getByRole('button', { name: 'Редактировать' }).click();

    await page.getByLabel('Описание').fill('');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByText('Описание не указано')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Описание не указано')).toBeVisible();
  });

  test('keeps keyboard focus with the mode switch, and says when a save landed', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByRole('button', { name: 'Редактировать' }).click();
    // Focus follows the form in, rather than falling to <body> with the button that
    // opened it.
    await expect(page.getByLabel('Название')).toBeFocused();

    await page.getByRole('button', { name: 'Отмена' }).click();
    await expect(page.getByRole('button', { name: 'Редактировать' })).toBeFocused();

    await page.getByRole('button', { name: 'Редактировать' }).click();
    await page.getByLabel('Название').fill('Сохранено');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    // A save and a cancel must not look identical.
    await expect(page.getByText('Изменения сохранены')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Редактировать' })).toBeFocused();
  });

  test('a stale save failure clears once the user starts fixing it', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);
    await page.getByRole('button', { name: 'Редактировать' }).click();

    await page.route('**/meetings/*', (route) =>
      route.request().method() === 'PATCH' ? route.abort('failed') : route.continue(),
    );
    await page.getByRole('button', { name: 'Сохранить' }).click();
    // By text, not by role: Next ships its own route announcer with role="alert".
    const failure = page.getByText(/Не удалось подключиться к серверу/);
    await expect(failure).toBeVisible();

    await page.getByLabel('Название').fill('Правлю дальше');

    // The message described an attempt that no longer matches the fields.
    await expect(failure).toHaveCount(0);
  });
});

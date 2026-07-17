import { expect, test } from '@playwright/test';
import { registerUser, signIn } from './support';

/** The value a `datetime-local` input expects: no zone, minute precision. */
const START_LOCAL = '2026-08-01T09:00';
const END_LOCAL = '2026-08-01T10:00';

test.describe('Create meeting', () => {
  test('creates a meeting and lands on its page with the entered data', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/');

    // Through the button the home page has offered since phase 1 — until now it 404'd.
    await page.getByRole('link', { name: 'Создать первую встречу' }).click();
    await expect(page).toHaveURL('/meetings/new');

    await page.getByLabel('Название').fill('Планёрка команды');
    await page.getByLabel('Описание').fill('Статус, блокеры, планы.');
    await page.getByLabel('Начало').fill(START_LOCAL);
    await page.getByLabel('Окончание').fill(END_LOCAL);
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    // Landed on the new meeting's own page, not back on the list.
    await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Планёрка команды' })).toBeVisible();
    await expect(page.getByText('Статус, блокеры, планы.')).toBeVisible();
    // Config pins UTC, so the entered local time is the time shown.
    await expect(page.getByText(/1 августа 2026 г. в 09:00/)).toBeVisible();
  });

  test('the new meeting shows up in the list', async ({ page, request }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    await page.getByLabel('Название').fill('Ретро');
    await page.getByLabel('Начало').fill(START_LOCAL);
    await page.getByLabel('Окончание').fill(END_LOCAL);
    await page.getByRole('button', { name: 'Создать встречу' }).click();
    await expect(page.getByRole('heading', { name: 'Ретро' })).toBeVisible();

    await page.getByRole('link', { name: '← К списку встреч' }).click();

    await expect(page.getByRole('listitem').filter({ hasText: 'Ретро' })).toBeVisible();
  });

  test('an empty title is refused at the field, and no meeting is created', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    await page.getByLabel('Начало').fill(START_LOCAL);
    await page.getByLabel('Окончание').fill(END_LOCAL);
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    // Still here, and told why — on the field, not in a form-wide banner.
    await expect(page).toHaveURL('/meetings/new');
    await expect(page.getByText('Введите название встречи')).toBeVisible();

    // Nothing reached the server.
    const res = await request.get('http://localhost:3001/meetings?page=1&limit=10', {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect((await res.json()).total).toBe(0);
  });

  test('an end before the start is refused at the field, and no meeting is created', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    await page.getByLabel('Название').fill('Задом наперёд');
    await page.getByLabel('Начало').fill(END_LOCAL);
    await page.getByLabel('Окончание').fill(START_LOCAL);
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    await expect(page).toHaveURL('/meetings/new');
    // The reason sits on the field it belongs to, not only in a form-wide banner.
    await expect(page.getByText('Окончание должно быть позже начала')).toBeVisible();

    const res = await request.get('http://localhost:3001/meetings?page=1&limit=10', {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect((await res.json()).total).toBe(0);
  });

  test('an equal start and end is refused too', async ({ page, request }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    await page.getByLabel('Название').fill('Нулевая длительность');
    await page.getByLabel('Начало').fill(START_LOCAL);
    await page.getByLabel('Окончание').fill(START_LOCAL);
    await page.getByRole('button', { name: 'Создать встречу' }).click();

    await expect(page.getByText('Окончание должно быть позже начала')).toBeVisible();
  });

  test('the field error clears once the end time is corrected', async ({ page, request }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/meetings/new');

    await page.getByLabel('Название').fill('Исправленная');
    await page.getByLabel('Начало').fill(START_LOCAL);
    await page.getByLabel('Окончание').fill('2026-08-01T08:00');
    await page.getByRole('button', { name: 'Создать встречу' }).click();
    await expect(page.getByText('Окончание должно быть позже начала')).toBeVisible();

    await page.getByLabel('Окончание').fill(END_LOCAL);

    // A stale error next to a now-valid value would be its own bug.
    await expect(page.getByText('Окончание должно быть позже начала')).toHaveCount(0);
    await page.getByRole('button', { name: 'Создать встречу' }).click();
    await expect(page.getByRole('heading', { name: 'Исправленная' })).toBeVisible();
  });

  test('sends an unauthenticated visitor to login', async ({ page }) => {
    await page.goto('/meetings/new');

    await expect(page).toHaveURL('/login');
  });
});

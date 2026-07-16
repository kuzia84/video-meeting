import { expect, test } from '@playwright/test';
import { API_URL, createMeeting, registerUser, signIn } from './support';

test.describe('Meeting page', () => {
  test('opens the owner’s meeting from the list and shows its details', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, {
      title: 'Ретроспектива спринта',
      description: 'Что получилось, что нет, что меняем.',
    });
    await signIn(page, user);

    await page.goto('/');
    await page.getByRole('link', { name: /Ретроспектива спринта/ }).click();

    await expect(page).toHaveURL(`/meetings/${meeting.id}`);
    await expect(page.getByRole('heading', { name: 'Ретроспектива спринта' })).toBeVisible();
    await expect(page.getByText('Что получилось, что нет, что меняем.')).toBeVisible();
    // Both ends of the meeting, not just the start. Readable to a human — the machine
    // -readable value is asserted below. Deterministic because the config pins UTC.
    await expect(
      page.getByText('1 августа 2026 г. в 09:00 — 1 августа 2026 г. в 09:30'),
    ).toBeVisible();
    // The <time> elements must carry the real instants, not only the formatted text.
    await expect(page.locator('time').first()).toHaveAttribute(
      'datetime',
      '2026-08-01T09:00:00.000Z',
    );
    await expect(page.locator('time').last()).toHaveAttribute(
      'datetime',
      '2026-08-01T09:30:00.000Z',
    );
  });

  test('says a meeting with no description has none, rather than showing a blank', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, { title: 'Без описания' });
    await signIn(page, user);

    await page.goto(`/meetings/${meeting.id}`);

    await expect(page.getByRole('heading', { name: 'Без описания' })).toBeVisible();
    await expect(page.getByText('Описание не указано')).toBeVisible();
  });

  test('shows another user’s meeting as not found', async ({ page, request }) => {
    const owner = await registerUser(request);
    const stranger = await registerUser(request);
    const meeting = await createMeeting(request, owner.token, { title: 'Чужая встреча' });
    await signIn(page, stranger);

    await page.goto(`/meetings/${meeting.id}`);

    // The API refuses to confirm it exists, so the page must not either.
    await expect(page.getByRole('heading', { name: 'Встреча не найдена' })).toBeVisible();
    await expect(page.getByText('Чужая встреча')).toHaveCount(0);
  });

  test('shows a non-existent meeting as not found', async ({ page, request }) => {
    const user = await registerUser(request);
    await signIn(page, user);

    await page.goto('/meetings/00000000-0000-0000-0000-000000000000');

    await expect(page.getByRole('heading', { name: 'Встреча не найдена' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'К списку встреч' })).toBeVisible();
  });

  test('sends an unauthenticated visitor to login', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    // No signIn: no token in sessionStorage.

    await page.goto(`/meetings/${meeting.id}`);

    await expect(page).toHaveURL('/login');
  });

  test('reports a failed request as an error, not as a missing meeting', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);

    // Scoped to the API origin: '**/meetings/*' would also match this page's own URL and
    // abort the navigation itself rather than the request it makes.
    await page.route(`${API_URL}/meetings/*`, (route) => route.abort('failed'));
    await page.goto(`/meetings/${meeting.id}`);

    await expect(page.getByRole('heading', { name: 'Не удалось загрузить встречу' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Встреча не найдена' })).toHaveCount(0);
  });

  test('retries the failed request in place, without reloading', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token, { title: 'Восстановилась' });
    await signIn(page, user);

    let failNext = true;
    await page.route(`${API_URL}/meetings/*`, (route) => {
      if (failNext) {
        failNext = false;
        return route.abort('failed');
      }
      return route.continue();
    });

    await page.goto(`/meetings/${meeting.id}`);
    await expect(page.getByRole('heading', { name: 'Не удалось загрузить встречу' })).toBeVisible();

    await page.getByRole('button', { name: 'Попробовать снова' }).click();

    await expect(page.getByRole('heading', { name: 'Восстановилась' })).toBeVisible();
  });

  test('logs out from the meeting page', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByRole('button', { name: 'Выйти' }).click();

    await expect(page).toHaveURL('/login');
  });

  test('goes back to the list from the meeting page', async ({ page, request }) => {
    const user = await registerUser(request);
    const meeting = await createMeeting(request, user.token);
    await signIn(page, user);
    await page.goto(`/meetings/${meeting.id}`);

    await page.getByRole('link', { name: '← К списку встреч' }).click();

    await expect(page).toHaveURL('/');
  });
});

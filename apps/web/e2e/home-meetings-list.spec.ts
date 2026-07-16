import { expect, type Page, test } from '@playwright/test';
import { createMeetings, registerUser, signIn } from './support';

const PAGE_SIZE = 10;

/**
 * Scoped to the named list on purpose: the pagination control renders <li>s of its own,
 * so a bare getByRole('listitem') also counts page links.
 */
function meetingItems(page: Page) {
  return page.getByRole('list', { name: 'Список встреч' }).getByRole('listitem');
}

test.describe('Home — meetings list', () => {
  test('shows the first page and pages forward through the list', async ({ page, request }) => {
    const user = await registerUser(request);
    // 25 meetings is the figure the phase's own criterion names: 3 pages, the last partial.
    const seeded = await createMeetings(request, user.token, 25);
    await signIn(page, user);

    await page.goto('/');

    await expect(page.getByText('У вас 25 встреч')).toBeVisible();

    const items = meetingItems(page);
    await expect(items).toHaveCount(PAGE_SIZE);
    // The API sorts by startTime ascending, which is the order seeding produced.
    await expect(items.first()).toContainText(seeded[0].title);
    await expect(items.last()).toContainText(seeded[PAGE_SIZE - 1].title);

    await page.getByRole('button', { name: 'Вперёд' }).click();

    await expect(items).toHaveCount(PAGE_SIZE);
    await expect(items.first()).toContainText(seeded[PAGE_SIZE].title);
    await expect(items.last()).toContainText(seeded[PAGE_SIZE * 2 - 1].title);
    // The previous page's meetings are gone, not appended.
    await expect(page.getByText(seeded[0].title, { exact: true })).toHaveCount(0);

    // Last page holds the remainder (25 = 10 + 10 + 5).
    await page.getByRole('button', { name: 'Вперёд' }).click();
    await expect(items).toHaveCount(5);
    await expect(items.last()).toContainText(seeded[24].title);

    await expect(page.getByRole('button', { name: 'Вперёд' })).toBeDisabled();
  });

  test('goes back to the previous page', async ({ page, request }) => {
    const user = await registerUser(request);
    const seeded = await createMeetings(request, user.token, 25);
    await signIn(page, user);
    await page.goto('/');

    await page.getByRole('button', { name: 'Вперёд' }).click();
    await expect(meetingItems(page).first()).toContainText(seeded[PAGE_SIZE].title);

    await page.getByRole('button', { name: 'Назад' }).click();

    await expect(meetingItems(page).first()).toContainText(seeded[0].title);
    await expect(page.getByRole('button', { name: 'Назад' })).toBeDisabled();
  });

  test('hides pagination when everything fits on one page', async ({ page, request }) => {
    const user = await registerUser(request);
    await createMeetings(request, user.token, 3);
    await signIn(page, user);

    await page.goto('/');

    await expect(meetingItems(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Вперёд' })).toHaveCount(0);
  });

  test('shows an empty state inviting a first meeting when there are none', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);

    await page.goto('/');

    await expect(page.getByText('Встреч пока нет')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Создать первую встречу' })).toBeVisible();
    // An empty list must not read as a failure.
    await expect(page.getByText('Не удалось загрузить встречи.')).toHaveCount(0);
    // Exactly one invitation: the page-level CTA stands down so two identical primary
    // buttons don't compete.
    await expect(page.getByRole('link', { name: /Создать/ })).toHaveCount(1);
  });

  test('the create button leads to the create page', async ({ page, request }) => {
    const user = await registerUser(request);
    await createMeetings(request, user.token, 1);
    await signIn(page, user);
    await page.goto('/');

    await page.getByRole('link', { name: 'Создать встречу' }).click();

    // The page itself is built in a later phase; this pins where the button points.
    await expect(page).toHaveURL('/meetings/new');
  });

  test('sends an unauthenticated visitor to login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/login');
  });
});

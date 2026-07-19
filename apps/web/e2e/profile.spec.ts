import { expect, test } from '@playwright/test';
import { registerUser, signIn } from './support';

test.describe('Profile — page & auth gating', () => {
  test('shows the email read-only and falls back to it while no name is set', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);

    await page.goto('/profile');

    await expect(page).toHaveURL('/profile');
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();

    // A freshly registered user has no name yet, so the email stands in for it.
    await expect(page.getByText('Имя пока не задано — показан email')).toBeVisible();

    // Email is shown read-only: the value is the user's, and the field cannot be edited.
    const email = page.getByLabel('Email');
    await expect(email).toHaveValue(user.email);
    await expect(email).toHaveJSProperty('readOnly', true);
  });

  test('sends an unauthenticated visitor to login', async ({ page }) => {
    await page.goto('/profile');

    await expect(page).toHaveURL('/login');
  });

  test('sends a visitor whose token the API rejects to login', async ({ page }) => {
    // A present-but-invalid token: the guard passes it on, GET /users/me answers 401,
    // and the view must drop the dead token and bounce to login — same as the home view.
    await page.addInitScript(
      (key) => window.sessionStorage.setItem(key, 'not.a.valid.token'),
      'accessToken',
    );

    await page.goto('/profile');

    await expect(page).toHaveURL('/login');
  });
});

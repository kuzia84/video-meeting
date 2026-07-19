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

  test('shows a default-avatar circle with the initial, and its colour survives a reload', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);

    await page.goto('/profile');

    // The header also carries a default-avatar now, so scope to the card's (in <main>).
    const avatar = page.getByRole('main').getByTestId('default-avatar');
    await expect(avatar).toBeVisible();
    // No name yet → the letter comes from the email. Test emails start with "e2e-".
    await expect(avatar).toHaveText('E');

    // The colour is stored on the user, so it must be identical after a reload.
    const colourBefore = await avatar.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.reload();

    const avatarAfter = page.getByRole('main').getByTestId('default-avatar');
    await expect(avatarAfter).toHaveText('E');
    const colourAfter = await avatarAfter.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(colourAfter).toBe(colourBefore);
  });

  test('sends an unauthenticated visitor to login', async ({ page }) => {
    await page.goto('/profile');

    await expect(page).toHaveURL('/login');
  });

  test('a saved name shows in the header with its initial, keeps the circle colour, and survives a reload', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);

    await page.goto('/profile');

    const header = page.locator('header');
    const headerAvatar = header.getByTestId('default-avatar');
    // Before the rename: no name yet, so the header shows the email initial, and the
    // circle already has its stored colour — captured here to prove it does not change.
    await expect(headerAvatar).toHaveText('E');
    const colourBefore = await headerAvatar.evaluate((el) => getComputedStyle(el).backgroundColor);

    // Rename to a name whose first letter differs from the email initial, so the letter
    // change is observable (and Cyrillic, to exercise the uppercasing).
    await page.getByRole('textbox', { name: 'Имя' }).fill('Николай');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    // The name is now visible in the header, the avatar letter switched to its first
    // letter, the card title updated too — all without a reload.
    await expect(header.getByText('Николай')).toBeVisible();
    await expect(headerAvatar).toHaveText('Н');
    await expect(page.getByRole('heading', { level: 3, name: 'Николай' })).toBeVisible();

    // The circle colour did not change with the name.
    const colourAfter = await headerAvatar.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(colourAfter).toBe(colourBefore);

    // It survives a reload (the name is persisted, not just held in memory): still in the
    // header, same letter, same colour.
    await page.reload();
    await expect(header.getByText('Николай')).toBeVisible();
    await expect(headerAvatar).toHaveText('Н');
    const colourReload = await headerAvatar.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(colourReload).toBe(colourBefore);
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

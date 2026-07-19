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

    const header = page.getByRole('banner');
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
    await expect(
      page.getByRole('main').getByRole('heading', { level: 3, name: 'Николай' }),
    ).toBeVisible();

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

test.describe('Profile — avatar upload', () => {
  // A valid PNG for the picker: the signature plus padding is enough — the API's content
  // check sniffs only the leading bytes.
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64),
  ]);

  test('an uploaded picture shows in the profile and the header without a reload, and stays after a rename', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/profile');

    const card = page.getByRole('main');
    const header = page.getByRole('banner');

    // Before any upload: the default letter circle in both places, no image.
    await expect(card.getByTestId('default-avatar')).toBeVisible();
    await expect(header.getByTestId('default-avatar')).toBeVisible();

    // A sentinel on window: a full-document reload wipes it, so if the upload ever caused
    // a reload this survives-check would fail — that is what pins "без перезагрузки".
    await page.evaluate(() => {
      (window as unknown as { __noReload?: boolean }).__noReload = true;
    });

    // Upload straight into the (sr-only) file input.
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });

    // The picture replaces the letter circle in the profile card and the header at once.
    await expect(card.locator('img')).toBeVisible();
    await expect(header.locator('img')).toBeVisible();
    await expect(card.getByTestId('default-avatar')).toHaveCount(0);
    await expect(header.getByTestId('default-avatar')).toHaveCount(0);
    // The upload succeeded (no error alert), and it happened without a reload.
    await expect(card.getByRole('alert')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
    ).toBe(true);

    // Renaming must not bring the letter back — a set avatar stays a picture.
    await page.getByRole('textbox', { name: 'Имя' }).fill('Пётр');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(header.getByText('Пётр')).toBeVisible();
    await expect(card.locator('img')).toBeVisible();
    await expect(header.locator('img')).toBeVisible();
    await expect(card.getByTestId('default-avatar')).toHaveCount(0);
    await expect(header.getByTestId('default-avatar')).toHaveCount(0);
  });
});

test.describe('Profile — password change', () => {
  // registerUser (support.ts) always registers with this password.
  const OLD_PASSWORD = 'password123';
  const NEW_PASSWORD = 'NewPass456!';

  async function logIn(page: import('@playwright/test').Page, email: string, password: string) {
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
  }

  test('after a change, login works with the new password and not the old', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await signIn(page, user);
    await page.goto('/profile');

    // Change the password via the form.
    await page.locator('input[name="currentPassword"]').fill(OLD_PASSWORD);
    await page.locator('input[name="newPassword"]').fill(NEW_PASSWORD);
    await page.locator('input[name="confirmPassword"]').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Сменить пароль' }).click();
    await expect(page.getByText('Пароль изменён')).toBeVisible();
    // The fields are cleared so the passwords don't linger in the form.
    await expect(page.locator('input[name="currentPassword"]')).toHaveValue('');

    // Sign out, then the NEW password logs in — reaching the authenticated home.
    await page.getByRole('banner').getByRole('button', { name: 'Выйти' }).click();
    await expect(page).toHaveURL('/login');
    await logIn(page, user.email, NEW_PASSWORD);
    await expect(page).toHaveURL('/');

    // Sign out again; the OLD password is now rejected and the login stays put.
    await page.getByRole('banner').getByRole('button', { name: 'Выйти' }).click();
    await expect(page).toHaveURL('/login');
    await logIn(page, user.email, OLD_PASSWORD);
    // Scope to <main>: Next.js's route announcer also carries role="alert" at body level.
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Неверный email или пароль',
    );
    await expect(page).toHaveURL('/login');
  });
});

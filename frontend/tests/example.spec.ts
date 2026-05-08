import { test, expect } from '@playwright/test';

const BACKEND_ORIGIN =
  process.env.PLAYWRIGHT_BACKEND_ORIGIN ??
  process.env.VITE_DEV_BACKEND_ORIGIN ??
  'http://127.0.0.1:3000';
const E2E_LOGIN_EMAIL = process.env.PLAYWRIGHT_E2E_EMAIL ?? 'test@test.com';
const E2E_LOGIN_PASSWORD = process.env.PLAYWRIGHT_E2E_PASSWORD ?? 'Test1234';

async function loginToApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Logg inn' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('E-post').fill(E2E_LOGIN_EMAIL);
  await page.getByLabel('Passord').fill(E2E_LOGIN_PASSWORD);
  await page.getByRole('button', { name: 'Logg inn', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dine presentasjoner' })).toBeVisible({ timeout: 30_000 });
}

async function goHomeAndSaveIfPrompt(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Hjem', exact: true }).click();
  const exitEditorHeading = page.getByRole('heading', { name: 'Gå ut av editor?' });
  if (await exitEditorHeading.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Dine presentasjoner' })).toBeVisible({ timeout: 30_000 });
}

test('loads ProSlides app and waits for login UI', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/ProSlides/i);
  await expect(page.getByRole('heading', { name: 'ProSlides' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Logg inn' })).toBeVisible({ timeout: 30_000 });
});

test('backend health endpoint responds', async ({ request }) => {
  const response = await request.get(`${BACKEND_ORIGIN}/api/v1/health`);

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.status).toBe('ok');
  expect(data.message).toBe('API is running');
  expect(data.timestamp).toBeTruthy();
});

test('user can log in and access app home', async ({ page }) => {
  await loginToApp(page);
  await expect(page.getByRole('heading', { name: 'Dine presentasjoner' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Ny presentasjon' })).toBeVisible({ timeout: 30_000 });
});

test('comprehensive flow: login, create, edit, save, reopen, and delete presentation', async ({ page }) => {
  await loginToApp(page);

  const unique = Date.now();
  const createdTitle = `PW Comprehensive ${unique}`;
  const updatedTitle = `${createdTitle} Updated`;

  await page.getByRole('button', { name: 'Ny presentasjon' }).click();
  await expect(page.getByPlaceholder('Presentasjonstittel')).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder('Presentasjonstittel').fill(createdTitle);
  await goHomeAndSaveIfPrompt(page);

  const createdCard = page.locator(`[aria-label="Rediger ${createdTitle}"]`);
  await expect(createdCard).toBeVisible({ timeout: 30_000 });
  await createdCard.getByRole('button', { name: 'Rediger', exact: true }).click();

  await expect(page.getByPlaceholder('Presentasjonstittel')).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('Presentasjonstittel').fill(updatedTitle);
  await goHomeAndSaveIfPrompt(page);

  const updatedCard = page.locator(`[aria-label="Rediger ${updatedTitle}"]`);
  await expect(updatedCard).toBeVisible({ timeout: 30_000 });
  await updatedCard.getByRole('button', { name: 'Slett', exact: true }).click();

  await expect(page.locator(`[aria-label="Rediger ${updatedTitle}"]`)).not.toBeVisible({ timeout: 15_000 });
});

test('database-backed API create/read works for user and presentation', async ({ request }) => {
  const unique = Date.now();
  const email = `pw-e2e-${unique}@example.com`;
  const password = 'StrongPass123!';

  const registerResponse = await request.post(`${BACKEND_ORIGIN}/api/v1/auth/register`, {
    data: {
      email,
      name: `PW User ${unique}`,
      password,
    },
  });
  expect(registerResponse.status()).toBe(201);
  const registerData = await registerResponse.json();
  expect(registerData.token).toBeTruthy();

  const authHeaders = {
    Authorization: `Bearer ${registerData.token as string}`,
  };

  const meResponse = await request.get(`${BACKEND_ORIGIN}/api/v1/auth/me`, { headers: authHeaders });
  expect(meResponse.ok()).toBeTruthy();
  const meData = await meResponse.json();
  expect(meData.user.email).toBe(email);

  const createPresentationResponse = await request.post(`${BACKEND_ORIGIN}/api/v1/presentations`, {
    headers: authHeaders,
    data: {
      presentation: {
        title: `Playwright Connectivity ${unique}`,
        slides: [
          {
            title: 'Slide 1',
            content: 'Connectivity test',
            notes: '',
            backgroundColor: '#ffffff',
          },
        ],
      },
    },
  });
  expect(createPresentationResponse.status()).toBe(201);
  const created = await createPresentationResponse.json();
  expect(created.presentation.id).toBeTruthy();

  const listResponse = await request.get(`${BACKEND_ORIGIN}/api/v1/presentations?limit=5`, {
    headers: authHeaders,
  });
  expect(listResponse.ok()).toBeTruthy();
  const listData = await listResponse.json();
  expect(Array.isArray(listData.presentations)).toBeTruthy();
  expect(
    listData.presentations.some(
      (presentation: { title?: string }) => presentation.title === `Playwright Connectivity ${unique}`
    )
  ).toBeTruthy();
});

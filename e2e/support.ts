import { expect, type Browser, type Page } from '@playwright/test';

/** Seeded by scripts/e2e-serve.mjs into the isolated E2E database only. */
export const E2E_ADMIN = { email: 'e2e-admin@example.com', password: 'e2e-admin-password' };

export const PASSWORD = 'e2e-password-123';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function newPage(
  browser: Browser,
  viewport = { width: 1280, height: 900 },
): Promise<Page> {
  const context = await browser.newContext({
    viewport,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });
  return context.newPage();
}

export async function signUp(page: Page, role: 'student' | 'tutor', name: string, email: string) {
  const response = await page.goto('/sign-up');
  expect(response?.status(), 'sign-up navigation failed').toBe(200);
  await page.getByLabel(role === 'tutor' ? /Gia sư — tạo hồ sơ/ : /Phụ huynh/).check();
  await page.getByLabel(/Họ và tên/).fill(name);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  const response = await page.goto('/sign-in');
  expect(response?.status(), 'sign-in navigation failed').toBe(200);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
}

/** Asserts the page does not scroll horizontally (layout fits the viewport). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

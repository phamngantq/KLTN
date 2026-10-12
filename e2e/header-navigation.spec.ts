import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E_ADMIN, expectNoHorizontalOverflow, newPage, uniqueEmail } from './support';

const WIDTHS = [320, 375, 768, 1024, 1280, 1440, 1600] as const;

async function expectHeaderFits(page: Page, width: number) {
  await expectNoHorizontalOverflow(page);

  const layout = await page
    .locator('header')
    .first()
    .evaluate((header) => {
      const visible = (element: Element) => {
        const style = window.getComputedStyle(element);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.getClientRects().length > 0
        );
      };
      const bounds = (element: Element) => element.getBoundingClientRect();
      const topRow = header.firstElementChild;
      if (!topRow) throw new Error('Header top row is missing');

      const rowItems = Array.from(topRow.children).filter(visible).map(bounds);
      const navs = Array.from(header.querySelectorAll('nav'))
        .filter((nav) => visible(nav) && nav.id !== 'mobile-navigation')
        .map((nav) => {
          const list = nav.querySelector(':scope > ul');
          const entries = list ? Array.from(list.children).filter(visible) : [];
          const tops = entries.map((entry) => Math.round(bounds(entry).top));
          const wrappedLabels: string[] = [];
          for (const entry of entries) {
            const label = entry.querySelector(':scope > a, :scope > details > summary');
            if (!label) continue;
            const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const node = walker.currentNode;
              if (!node.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              const lineTops = new Set(
                Array.from(range.getClientRects(), (rect) => Math.round(rect.top)),
              );
              if (lineTops.size > 1) wrappedLabels.push(label.textContent?.trim() ?? '');
            }
          }
          return {
            height: bounds(nav).height,
            rowSpread: tops.length ? Math.max(...tops) - Math.min(...tops) : 0,
            wrappedLabels,
            clippedEntries: entries
              .filter(
                (entry) => bounds(entry).left < -1 || bounds(entry).right > window.innerWidth + 1,
              )
              .map((entry) => entry.textContent?.trim() ?? ''),
          };
        });

      return {
        topRowHeight: bounds(topRow).height,
        rowItemsFit: rowItems.every(
          (rect) => rect.left >= -1 && rect.right <= window.innerWidth + 1,
        ),
        navs,
      };
    });

  expect(layout.topRowHeight, `Header top row grew at ${width}px`).toBeLessThanOrEqual(84);
  expect(layout.rowItemsFit, `Header top row clipped at ${width}px`).toBe(true);
  if (width >= 1280) {
    expect(layout.navs, `Desktop navigation is unavailable at ${width}px`).toHaveLength(1);
  }
  for (const nav of layout.navs) {
    expect(nav.height, `Desktop navigation grew at ${width}px`).toBeLessThanOrEqual(72);
    expect(nav.rowSpread, `Desktop navigation wrapped at ${width}px`).toBeLessThanOrEqual(2);
    expect(nav.wrappedLabels, `Navigation labels wrapped at ${width}px`).toEqual([]);
    expect(nav.clippedEntries, `Navigation entries clipped at ${width}px`).toEqual([]);
  }
}

async function expectMobileMenu(page: Page, linkName: string) {
  const menuButton = page.locator('header button[aria-controls="mobile-navigation"]');
  await expect(menuButton).toBeVisible();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  const menu = page.locator('#mobile-navigation');
  await expect(menu).toBeVisible();
  const link = menu.getByRole('link', { name: linkName, exact: true, includeHidden: true });
  if (!(await link.isVisible())) {
    await link.locator('xpath=ancestor::details[1]').locator('summary').click();
  }
  await expect(link).toBeVisible();
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toHaveCount(0);
}

async function makeRolePage(browser: Browser, role: 'parent' | 'tutor' | 'admin') {
  const page = await newPage(browser);
  const response =
    role === 'admin'
      ? await page.context().request.post('/api/v1/auth/login', { data: E2E_ADMIN })
      : await page.context().request.post('/api/v1/auth/register', {
          data: {
            email: uniqueEmail(`header-${role}`),
            password: 'e2e-password-123',
            displayName: `Header ${role}`,
            role,
          },
        });
  expect(response.status(), await response.text()).toBe(role === 'admin' ? 200 : 201);
  await page.goto(role === 'admin' ? '/admin' : `/${role}`);
  await expect(
    page.locator(`[data-role-area="${role === 'admin' ? 'moderator' : role}"]`),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return page;
}

test('public header stays on one line and both class lists remain reachable', async ({
  browser,
}) => {
  const page = await newPage(browser);
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectHeaderFits(page, width);
      if (width === 320 || width === 1024) {
        await expectMobileMenu(page, 'Lớp tìm học viên');
      }
      if (width === 1280) {
        const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
        const classLink = nav.getByRole('link', {
          name: 'Lớp tìm học viên',
          exact: true,
          includeHidden: true,
        });
        const trigger = classLink.locator('xpath=ancestor::details[1]').locator('summary');
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(classLink).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(classLink).not.toBeVisible();
        await expect(trigger).toBeFocused();
      }
    }
  } finally {
    await page.context().close();
  }
});

test('parent, tutor and moderator navigation stays compact and reachable', async ({ browser }) => {
  test.setTimeout(120_000);
  const roles = [
    { role: 'parent', mobileLink: 'Cẩm nang' },
    { role: 'tutor', mobileLink: 'Hồ sơ gia sư' },
    { role: 'admin', mobileLink: 'Người dùng' },
  ] as const;

  for (const { role, mobileLink } of roles) {
    const page = await makeRolePage(browser, role);
    try {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await expectHeaderFits(page, width);
        if (width === 320 || width === 1024) await expectMobileMenu(page, mobileLink);
        if (width === 1280) {
          const header = page.locator('header').first();
          const accountTrigger = header.locator('summary[aria-label^="Tài khoản của"]');
          await expect(accountTrigger).toBeVisible();
          await accountTrigger.focus();
          await page.keyboard.press('Enter');
          const accountLink = header.getByRole('link', { name: 'Tài khoản', exact: true });
          await expect(accountLink).toBeVisible();
          if (role === 'parent') {
            await expect(header.getByRole('link', { name: 'Khu vực phụ huynh' })).toHaveCount(0);
          }
          await expect(header.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(accountLink).not.toBeVisible();
          await expect(accountTrigger).toBeFocused();
        }
      }
    } finally {
      await page.context().close();
    }
  }
});

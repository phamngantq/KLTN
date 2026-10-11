#!/usr/bin/env node
/** Browser smoke of the deployed read-only preview at a narrow viewport. */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.argv[2];
if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
  console.error(
    'Usage: node scripts/smoke-preview-browser.mjs https://<preview-worker>.workers.dev',
  );
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto(new URL('/', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(
    await page.getByRole('status').filter({ hasText: 'Bản xem trước chỉ đọc' }).count(),
    1,
  );

  await page.goto(new URL('/tutors', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('link', { name: /Gia sư mẫu/ }).count(), 2);
  assert.equal(await page.getByText(/₫\/giờ/).count(), 0);
  assert.equal(await page.getByLabel(/Giá từ/).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await page.goto(new URL('/sign-up', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('heading', { name: 'Đăng ký chưa mở' }).isVisible(), true);
  assert.equal(await page.getByLabel('Email').count(), 0);
  console.log(
    'preview browser: PASS (banner, 2 tutors, hidden prices, mobile, registration blocked)',
  );
} finally {
  await browser.close();
}

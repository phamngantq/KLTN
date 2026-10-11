import { expect, test, type Page } from '@playwright/test';
import {
  E2E_ADMIN,
  expectNoHorizontalOverflow,
  newPage,
  signIn,
  signUp,
  uniqueEmail,
} from './support';

/**
 * One end-to-end story against the real Worker + local D1 (no mocks):
 * tutor onboarding → availability → admin approval → student search & booking →
 * tutor confirmation → student cancellation. Tests share state, so they run serially.
 */
test.describe.configure({ mode: 'serial' });

// The journey creates several long-lived contexts so tutor and parent sessions can be reused.
// Close them before the worker/browser fixtures tear down, including when a test fails.
test.afterAll(async ({ browser }) => {
  await Promise.all(browser.contexts().map((context) => context.close()));
});

const tutor = { name: `Gia sư E2E ${Date.now()}`, email: uniqueEmail('tutor') };
const student = { name: 'Học viên E2E', email: uniqueEmail('student') };
let tutorPage: Page;
let studentPage: Page;

test('tutor signs up, completes the profile and submits it for review', async ({ browser }) => {
  tutorPage = await newPage(browser);
  await signUp(tutorPage, 'tutor', tutor.name, tutor.email);
  await expect(tutorPage).toHaveURL(/\/tutor$/);

  await tutorPage.goto('/tutor/profile');
  await tutorPage
    .getByLabel('Giới thiệu')
    .fill('Giáo viên Toán, 5 năm kinh nghiệm luyện thi THPT.');
  await tutorPage.getByLabel('Toán').check();
  await tutorPage.getByLabel(/Học phí/).fill('200000');
  await tutorPage.getByLabel('Trực tuyến').check();
  await tutorPage.getByRole('button', { name: 'Lưu hồ sơ' }).click();
  await expect(tutorPage.getByText('Đã lưu.')).toBeVisible();

  await tutorPage.getByRole('button', { name: 'Gửi duyệt' }).click();
  await expect(tutorPage.getByText('Đã gửi hồ sơ để duyệt.')).toBeVisible();
  await expect(tutorPage.getByText('Chờ duyệt', { exact: true })).toBeVisible();
});

test('tutor publishes weekly availability (every day 18:00–19:00)', async () => {
  await tutorPage.getByRole('link', { name: 'Lịch dạy' }).click();
  const addButtons = tutorPage.getByRole('button', { name: '+ Thêm khung giờ' });
  await expect(addButtons).toHaveCount(7);
  for (let i = 0; i < 7; i++) await addButtons.nth(i).click();
  await expect(tutorPage.getByText('Có thay đổi chưa lưu')).toBeVisible();
  await tutorPage.getByRole('button', { name: 'Lưu lịch tuần' }).click();
  await expect(tutorPage.getByText('Đã lưu lịch tuần.')).toBeVisible();
  await tutorPage.reload();
  await expect(tutorPage.getByLabel('Chủ nhật: giờ bắt đầu')).toHaveValue('18:00');
});

test('unapproved tutors are not public; admin approves', async ({ browser }) => {
  const guest = await newPage(browser);
  await guest.goto('/tutors');
  await expect(guest.getByRole('link', { name: tutor.name })).toHaveCount(0);

  const admin = await newPage(browser);
  await signIn(admin, E2E_ADMIN.email, E2E_ADMIN.password);
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto('/admin/tutors');
  const card = admin.getByRole('article').filter({ hasText: tutor.email });
  await card.getByRole('button', { name: 'Duyệt & công khai' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Duyệt & công khai' }).click();
  await expect(admin.getByText(`Duyệt & công khai: ${tutor.name}.`)).toBeVisible();

  await guest.reload();
  await expect(guest.getByRole('link', { name: tutor.name })).toBeVisible();
});

test('student finds the tutor by subject and requests a booking', async ({ browser }) => {
  studentPage = await newPage(browser);
  await signUp(studentPage, 'student', student.name, student.email);
  await expect(studentPage).toHaveURL(/\/parent$/);

  await studentPage.getByRole('link', { name: 'Tìm gia sư' }).first().click();
  await studentPage.getByLabel('Môn học').selectOption({ label: 'Toán' });
  await studentPage.getByRole('button', { name: 'Lọc' }).click();
  await expect(studentPage).toHaveURL(/subject=toan/);
  await studentPage.getByRole('link', { name: tutor.name }).click();

  await expect(studentPage.getByRole('heading', { name: tutor.name })).toBeVisible();
  await expect(studentPage.getByText('Asia/Ho_Chi_Minh')).toBeVisible();
  await studentPage.getByRole('button', { name: '18:00–19:00' }).first().click();
  await expect(studentPage.getByText(/Học phí dự kiến/)).toContainText('200.000');
  await studentPage.getByRole('button', { name: 'Gửi yêu cầu đặt lịch' }).click();
  const dialog = studentPage.getByRole('dialog');
  await expect(dialog).toContainText('Chờ xác nhận');
  await dialog.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(studentPage.getByText('Đã gửi yêu cầu đặt lịch')).toBeVisible();

  await studentPage.goto('/student/bookings');
  await expect(studentPage.getByText(`Gia sư: ${tutor.name}`)).toBeVisible();
});

test('tutor confirms the request', async () => {
  await tutorPage.goto('/tutor/bookings');
  await expect(tutorPage.getByText(`Học viên: ${student.name}`)).toBeVisible();
  await tutorPage.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(tutorPage.getByText(/Xác nhận: thành công/)).toBeVisible();
  await tutorPage.getByRole('link', { name: 'Đã xác nhận' }).click();
  await expect(tutorPage.getByText(`Học viên: ${student.name}`)).toBeVisible();
});

test('student cancels after confirming the policy; the slot is offered again', async ({
  browser,
}) => {
  await studentPage.goto('/student/bookings?tab=confirmed');
  await studentPage.getByRole('button', { name: 'Hủy buổi học' }).click();
  const dialog = studentPage.getByRole('dialog');
  await expect(dialog).toContainText('Có thể hủy yêu cầu');
  await dialog.getByRole('button', { name: 'Hủy buổi học' }).click();
  await expect(studentPage.getByText(/Hủy buổi học: thành công/)).toBeVisible();
  await studentPage.getByRole('link', { name: 'Đã hủy / từ chối' }).click();
  await expect(studentPage.getByText('Đã hủy', { exact: true })).toBeVisible();

  const guest = await newPage(browser);
  await guest.goto('/tutors?subject=toan');
  await guest.getByRole('link', { name: tutor.name }).click();
  await expect(guest.getByRole('button', { name: '18:00–19:00' }).first()).toBeVisible();
});

test('filters with no match show a recoverable empty state', async ({ browser }) => {
  const guest = await newPage(browser);
  await guest.goto('/tutors?subject=lich-su');
  await expect(guest.getByText('Không có gia sư phù hợp')).toBeVisible();
  await guest.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(guest).toHaveURL(/\/tutors$/);
  await expect(guest.getByRole('link', { name: tutor.name })).toBeVisible();
});

test('mobile viewport (375px): key pages fit without horizontal scrolling', async ({ browser }) => {
  const mobile = await newPage(browser, { width: 375, height: 812 });
  for (const path of ['/', '/tutors', '/sign-in', '/sign-up']) {
    await mobile.goto(path);
    await expect(mobile.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(mobile);
  }
  await mobile.goto('/tutors');
  await mobile.getByRole('link', { name: tutor.name }).click();
  await expect(mobile.getByRole('heading', { name: 'Lịch trống' })).toBeVisible();
  await expectNoHorizontalOverflow(mobile);
});

test('new public routes fit a narrow phone and show honest unavailable states', async ({
  browser,
}) => {
  const phone = await newPage(browser, { width: 320, height: 900 });
  for (const path of ['/', '/gioi-thieu', '/dich-vu', '/bang-gia', '/lop-hoc', '/lien-he']) {
    await phone.goto(path);
    await expect(phone.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(phone);
  }
  await phone.goto('/lop-hoc');
  await expect(phone.getByText('Chưa có danh sách lớp để đăng ký trực tuyến.')).toBeVisible();
  await phone.getByRole('button', { name: 'Mở menu' }).click();
  await expect(phone.getByRole('navigation', { name: 'Điều hướng di động' })).toBeVisible();
  await phone
    .getByRole('navigation', { name: 'Điều hướng di động' })
    .getByRole('link', { name: 'Trang chủ' })
    .click();
  await expect(phone).toHaveURL(/\/$/);
});

test('keyboard users can skip to content and reach the search', async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Bỏ qua tới nội dung chính' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('parent, tutor and moderator shells fit 320/768/1280 and support keyboard navigation', async ({
  browser,
}) => {
  const areas = [
    {
      path: '/parent',
      role: 'student',
      productRole: 'parent',
      heading: 'Yêu cầu tìm gia sư',
      nav: 'Điều hướng Phụ huynh',
      target: 'Hồ sơ',
      targetPath: '/parent/profile',
    },
    {
      path: '/tutor/new-classes',
      role: 'tutor',
      productRole: 'tutor',
      heading: 'Lớp mới',
      nav: 'Điều hướng Gia sư',
      target: 'Lớp phù hợp',
      targetPath: '/tutor/matched-classes',
    },
    {
      path: '/admin/requests',
      role: 'admin',
      productRole: 'moderator',
      heading: 'Quản lý yêu cầu',
      nav: 'Điều hướng Kiểm duyệt viên',
      target: 'Lớp học',
      targetPath: '/admin/classes',
    },
  ] as const;

  for (const width of [320, 768, 1280]) {
    for (const area of areas) {
      const page = await newPage(browser, { width, height: 900 });
      await page.route('**/api/v1/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              user: {
                id: 'viewport-user',
                email: 'viewport@example.com',
                displayName: 'Nguyễn An',
                role: area.role,
                productRole: area.productRole,
              },
              csrfToken: 'viewport-csrf',
            },
            meta: { requestId: 'req_viewport' },
          }),
        });
      });
      await page.goto(area.path);
      await expect(page.getByRole('heading', { name: area.heading })).toBeVisible();
      await expect(page.getByRole('navigation', { name: area.nav })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      const link = page.getByRole('navigation', { name: area.nav }).getByRole('link', {
        name: area.target,
      });
      await link.focus();
      await expect(link).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`${area.targetPath}$`));
      await expectNoHorizontalOverflow(page);
      await page.context().close();
    }
  }
});

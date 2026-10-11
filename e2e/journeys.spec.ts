import { expect, test, type Page } from '@playwright/test';
import {
  E2E_ADMIN,
  expectNoHorizontalOverflow,
  newPage,
  signIn,
  signUp,
  uniqueEmail,
} from './support';

type ApiData<T> = { data: T };
type Items<T> = { items: T[]; total: number };
type Versioned = { id: string; version: number };
type ContentDraft = { id: string; editVersion: number };
type Request = Versioned & { status: string };
type Class = Versioned & { code: string; sourceRequestId: string; status: string };
type Assignment = { id: string; classId: string };

async function getData<T>(page: Page, path: string): Promise<T> {
  const response = await page.context().request.get(`/api/v1${path}`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as ApiData<T>).data;
}

async function postData<T>(
  page: Page,
  path: string,
  data: unknown,
  expectedStatus = 201,
): Promise<T> {
  const session = await getData<{ csrfToken: string }>(page, '/me');
  const response = await page.context().request.post(`/api/v1${path}`, {
    data,
    headers: { 'X-CSRF-Token': session.csrfToken },
  });
  expect(response.status(), await response.text()).toBe(expectedStatus);
  return ((await response.json()) as ApiData<T>).data;
}

async function publishContent(
  admin: Page,
  kind: 'terms' | 'contract',
  slug: string,
  title: string,
): Promise<string> {
  // Test-only text lives in the isolated E2E D1; no legal policy is seeded for staging.
  const draft = await postData<ContentDraft>(admin, '/admin/content', {
    kind,
    slug,
    audience: 'tutor',
    title,
    summary: '',
    bodyText: `${title}. Nội dung chỉ dùng trong kiểm thử E2E local D1.`,
  });
  await postData(
    admin,
    `/admin/content/${draft.id}/publish`,
    { editVersion: draft.editVersion },
    200,
  );
  return draft.id;
}

async function publishLocalTermsAndFees(admin: Page): Promise<string> {
  const termsId = await publishContent(
    admin,
    'terms',
    'tutor-responsibility',
    'Điều khoản kiểm thử E2E',
  );
  const quiz = await postData<ContentDraft>(admin, '/admin/terms/quizzes', {
    termsContentRevisionId: termsId,
    questions: [
      {
        id: 'q1',
        prompt: 'Câu hỏi kiểm thử: cần xác nhận điều khoản trước khi ứng tuyển?',
        choices: [
          { id: 'yes', text: 'Đúng' },
          { id: 'no', text: 'Sai' },
        ],
        correctChoiceId: 'yes',
      },
    ],
    minimumCorrect: 1,
  });
  await postData(
    admin,
    `/admin/terms/quizzes/${quiz.id}/publish`,
    { editVersion: quiz.editVersion },
    200,
  );

  const formulas = [
    {
      optionKey: 'first_lesson_percent',
      title: 'E2E buổi đầu',
      rateBasisPoints: 5000,
      depositBasisPoints: null,
    },
    {
      optionKey: 'lesson_multiplier_with_deposit',
      title: 'E2E số buổi và cọc',
      rateBasisPoints: 30000,
      depositBasisPoints: 5000,
    },
    {
      optionKey: 'monthly_percent',
      title: 'E2E học phí tháng',
      rateBasisPoints: 3000,
      depositBasisPoints: null,
    },
  ] as const;
  let selectedFeeId = '';
  for (const formula of formulas) {
    const draft = await postData<Versioned>(admin, '/admin/fee-options', {
      ...formula,
      policyText: `${formula.title}: công thức và tham số chỉ dùng trong kiểm thử local D1.`,
      scopeSubjectId: null,
      scopeMode: null,
      effectiveFrom: null,
      effectiveTo: null,
    });
    await postData(
      admin,
      `/admin/fee-options/${draft.id}/publish`,
      { version: draft.version },
      200,
    );
    if (formula.optionKey === 'first_lesson_percent') selectedFeeId = draft.id;
  }
  return selectedFeeId;
}

test('parent → moderator → tutor → class, private contact, contract and verified report PDF', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const parent = await newPage(browser);
  const tutor = await newPage(browser);
  const admin = await newPage(browser);
  const outsider = await newPage(browser);
  const guest = await newPage(browser);
  const tutorName = `Gia sư E2E ${Date.now()}`;
  const parentName = `Phụ huynh E2E ${Date.now()}`;
  const phone = '0900000001';
  const address = 'Địa chỉ riêng của yêu cầu E2E';

  try {
    await signUp(tutor, 'tutor', tutorName, uniqueEmail('tutor'));
    await tutor.goto('/tutor/profile');
    await tutor.getByLabel('Giới thiệu').fill('Gia sư Toán trong kiểm thử local D1.');
    await tutor.getByLabel('Toán').check();
    await tutor.getByLabel(/Học phí/).fill('200000');
    await tutor.getByLabel('Trực tuyến').check();
    await tutor.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await expect(tutor.getByText('Đã lưu.')).toBeVisible();
    await tutor.getByRole('button', { name: 'Gửi duyệt' }).click();
    await expect(tutor.getByText('Đã gửi hồ sơ để duyệt.')).toBeVisible();

    await signIn(admin, E2E_ADMIN.email, E2E_ADMIN.password);
    expect((await tutor.context().request.get('/api/v1/admin/requests')).status()).toBe(403);
    await admin.goto('/admin/tutors');
    const tutorCard = admin.getByRole('article').filter({ hasText: tutorName });
    await tutorCard.getByRole('button', { name: 'Duyệt & công khai' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Duyệt & công khai' }).click();
    await expect(admin.getByText(`Duyệt & công khai: ${tutorName}.`)).toBeVisible();

    await signUp(parent, 'student', parentName, uniqueEmail('parent'));
    const parentSession = await getData<{ csrfToken: string }>(parent, '/me');
    const legacyBooking = await parent.context().request.post('/api/v1/bookings', {
      data: {},
      headers: { 'X-CSRF-Token': parentSession.csrfToken },
    });
    expect(legacyBooking.status()).toBe(410);
    expect((await legacyBooking.json()).error.code).toBe('LEGACY_BOOKING_CLOSED');
    expect((await parent.context().request.get('/api/v1/bookings')).status()).toBe(200);
    await parent.goto('/parent/request');
    await parent.getByLabel('Môn học').selectOption('subj_math');
    await parent.getByLabel('Lớp học').selectOption('Lớp 10');
    await parent.getByLabel('Mô tả nhu cầu').fill('Cần gia sư Toán trực tuyến buổi tối.');
    await parent.getByRole('button', { name: 'Thứ Hai, 17:30–19:00' }).click();
    await parent.setViewportSize({ width: 320, height: 900 });
    await expectNoHorizontalOverflow(parent);
    await parent.setViewportSize({ width: 1280, height: 900 });
    await parent.getByLabel('Số điện thoại liên hệ').fill(phone);
    await parent.getByLabel('Địa chỉ liên hệ cụ thể').fill(address);
    const send = parent.getByRole('button', { name: 'Gửi yêu cầu' });
    await expect(send).toBeDisabled();
    await parent.getByLabel(/Tôi đồng ý chia sẻ số điện thoại/).check();
    await send.click();
    await expect(parent).toHaveURL(/\/parent\/requests\/[0-9a-f-]+$/);
    await expect(parent.getByText('Đã gửi', { exact: true })).toBeVisible();
    const requests = await getData<Items<Request>>(parent, '/parent/requests?status=submitted');
    expect(requests.total).toBe(1);
    const request = requests.items[0]!;
    expect(request).toBeDefined();
    expect(JSON.stringify(requests)).not.toContain(phone);

    await admin.goto(`/admin/requests?selected=${request.id}`);
    expect((await parent.context().request.get('/api/v1/admin/requests')).status()).toBe(403);
    await expect(admin.getByRole('region', { name: 'Chi tiết yêu cầu' })).toContainText(phone);
    await admin.getByRole('button', { name: 'Tạo lớp từ yêu cầu' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Tạo lớp' }).click();
    await expect(admin.getByText(/Đã tạo bản nháp lớp/)).toBeVisible();
    const drafts = await getData<Items<Class>>(admin, '/admin/classes?status=draft');
    const cls = drafts.items.find((item) => item.sourceRequestId === request.id);
    expect(cls).toBeDefined();
    await admin.goto('/admin/classes?status=draft');
    const classCard = admin.getByRole('article').filter({ hasText: cls!.code });
    await classCard.getByRole('button', { name: 'Xuất bản lớp' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Xuất bản' }).click();
    await expect(admin.getByText(`Đã xuất bản lớp ${cls!.code}.`)).toBeVisible();

    await guest.goto(`/lop-hoc/${cls!.id}`);
    await expect(guest.getByText(new RegExp(`Mã lớp:? ${cls!.code}`))).toBeVisible();
    expect(await guest.locator('body').innerText()).not.toContain(phone);
    expect(await guest.locator('body').innerText()).not.toContain(address);
    const publicClass = await getData<unknown>(guest, `/classes/${cls!.id}`);
    expect(JSON.stringify(publicClass)).not.toContain(phone);
    expect(JSON.stringify(publicClass)).not.toContain(address);

    await tutor.goto(`/tutor/new-classes/${cls!.id}`);
    await expect(
      tutor.getByText('Chưa có đủ ba phương án phí nhận lớp được công bố cho lớp này.'),
    ).toBeVisible();
    const feeId = await publishLocalTermsAndFees(admin);
    await tutor.goto('/tutor/terms');
    await expect(tutor.getByRole('heading', { name: 'Điều khoản kiểm thử E2E' })).toBeVisible();
    await tutor.getByRole('radio', { name: 'Đúng' }).check();
    await tutor.getByRole('button', { name: 'Nộp bài kiểm tra' }).click();
    await expect(tutor.getByText('Bạn đã vượt qua bài kiểm tra.')).toBeVisible();
    await tutor.getByLabel(/Tôi đã đọc và đồng ý với phiên bản/).check();
    await tutor.getByRole('button', { name: 'Xác nhận điều khoản' }).click();
    await expect(tutor.getByText('Đã xác nhận điều khoản hiện hành')).toBeVisible();

    await tutor.goto(`/tutor/new-classes/${cls!.id}`);
    await tutor.getByLabel('Phương án phí nhận lớp').selectOption(feeId);
    await tutor.getByRole('button', { name: 'Gửi đơn ứng tuyển' }).click();
    await expect(tutor.getByText('Đã gửi đơn ứng tuyển')).toBeVisible();
    await admin.goto(`/admin/applications?classId=${cls!.id}`);
    const applicationCard = admin.getByRole('article').filter({ hasText: tutorName });
    await applicationCard.getByRole('button', { name: 'Gán gia sư' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Gán và kích hoạt lớp' }).click();
    await expect(admin.getByText(new RegExp(`Đã gán lớp ${cls!.code}`))).toBeVisible();

    await tutor.goto('/tutor/classes');
    await expect(tutor.getByText(cls!.code, { exact: false })).toBeVisible();
    await expect(tutor.getByText(phone)).toHaveCount(0);
    await tutor.getByRole('button', { name: 'Xem liên hệ phụ huynh' }).click();
    await expect(tutor.getByRole('region', { name: 'Liên hệ phụ huynh' })).toContainText(phone);
    await expect(tutor.getByRole('region', { name: 'Liên hệ phụ huynh' })).toContainText(address);
    const assignments = await getData<Items<Assignment>>(tutor, '/tutor/assignments');
    const assignment = assignments.items.find((item) => item.classId === cls!.id);
    expect(assignment).toBeDefined();
    await signUp(outsider, 'tutor', 'Gia sư khác E2E', uniqueEmail('outsider'));
    const forbidden = await outsider
      .context()
      .request.get(`/api/v1/tutor/assignments/${assignment!.id}/contact`);
    expect([403, 404]).toContain(forbidden.status());

    const contractId = await publishContent(
      admin,
      'contract',
      'tutor-class-contract',
      'Hợp đồng kiểm thử E2E',
    );
    const candidates = await getData<Items<{ assignmentId: string; assignmentVersion: number }>>(
      admin,
      '/admin/contracts/candidates',
    );
    const candidate = candidates.items.find((item) => item.assignmentId === assignment!.id);
    expect(candidate).toBeDefined();
    await postData(admin, `/admin/assignments/${assignment!.id}/contracts`, {
      assignmentVersion: candidate!.assignmentVersion,
      contentRevisionId: contractId,
    });
    await tutor.goto('/tutor/contracts');
    await tutor.getByRole('button', { name: 'Xem hợp đồng' }).click();
    await expect(tutor.getByRole('article', { name: 'Chi tiết hợp đồng' })).toContainText(
      'E2E buổi đầu',
    );
    await tutor.getByLabel(/Tôi đã đọc nội dung hợp đồng phiên bản/).check();
    await tutor.getByRole('button', { name: 'Xác nhận nội dung hợp đồng' }).click();
    await expect(tutor.getByText('Đã ghi nhận xác nhận nội dung hợp đồng của bạn.')).toBeVisible();

    await parent.reload();
    await expect(parent.getByText('Đã gán gia sư')).toBeVisible();
    let releaseReport!: () => void;
    const reportGate = new Promise<void>((resolve) => {
      releaseReport = resolve;
    });
    await admin.route('**/api/v1/admin/reports/overview*', async (route) => {
      await reportGate;
      await route.continue();
    });
    await admin.goto('/admin/reports');
    await expect(admin.getByRole('button', { name: 'In hoặc lưu PDF' })).toHaveCount(0);
    releaseReport();
    const print = admin.getByRole('button', { name: 'In hoặc lưu PDF' });
    await expect(print).toBeVisible();
    await expect(
      admin.getByText('Yêu cầu đã gửi', { exact: true }).locator('..').locator('p').last(),
    ).toHaveText('1');
    await expect(
      admin.getByText('Lớp hoạt động', { exact: true }).locator('..').locator('p').first(),
    ).toHaveText('1');
    const pdf = await admin.pdf({ format: 'A4', printBackground: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(10_000);

    for (const width of [320, 768, 1280]) {
      for (const [page, route] of [
        [parent, '/parent'],
        [tutor, '/tutor/classes'],
        [admin, '/admin/reports'],
      ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
    }
    await guest.setViewportSize({ width: 320, height: 900 });
    for (const route of ['/', '/gioi-thieu', '/dich-vu', '/bang-gia', '/lop-hoc', '/lien-he']) {
      await guest.goto(route);
      await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(guest);
    }
    await guest.goto('/');
    await guest.keyboard.press('Tab');
    await expect(guest.getByRole('link', { name: 'Bỏ qua tới nội dung chính' })).toBeFocused();
    await admin.goto('/admin/settings');
    await expect(admin.getByRole('heading', { name: 'Cài đặt và nội dung' })).toBeVisible();
    await expect(admin.getByRole('link', { name: /Phương án phí Đặt giá trị/ })).toBeVisible();
    await tutor.goto('/tutor/class-history');
    await expect(tutor.getByRole('heading', { name: 'Lịch sử nhận lớp' })).toBeVisible();
    await expect(tutor.getByRole('heading', { name: 'Chưa có lịch sử lớp học' })).toBeVisible();
  } finally {
    await Promise.all(
      [parent, tutor, admin, outsider, guest].map((page) => page.context().close()),
    );
  }
});

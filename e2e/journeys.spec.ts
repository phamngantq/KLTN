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
type OwnRequest = Request & { publishedClassId: string | null; publishedClassCode: string | null };
type Class = Versioned & { code: string; status: string };
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
    await tutor.getByLabel('Lớp 9', { exact: true }).check();
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
    await parent.getByLabel('Họ và tên').fill('Học sinh E2E');
    await expect(parent.getByRole('textbox', { name: 'Khu vực' })).toHaveValue('Hà Nội');
    await expect(parent.getByRole('textbox', { name: 'Khu vực' })).not.toBeEditable();
    await parent.getByRole('combobox', { name: /^Phường\/Xã/ }).selectOption('Phường Cầu Giấy');
    await parent.getByLabel('Môn học').selectOption('subj_math');
    await parent.getByRole('combobox', { name: /^Lớp/ }).selectOption('Lớp 10');
    await expect(parent.getByLabel('Cấp học')).toHaveValue('upper_secondary');
    await parent.getByLabel('Online').check();
    await parent.getByLabel('Số buổi/tuần').fill('2');
    await parent.getByLabel('Yêu cầu đối với gia sư').fill('Cần gia sư Toán trực tuyến buổi tối.');
    await parent.getByRole('button', { name: 'Thứ Hai, 17:30–19:00' }).click();
    await parent.setViewportSize({ width: 320, height: 900 });
    await expectNoHorizontalOverflow(parent);
    await parent.setViewportSize({ width: 1280, height: 900 });
    await parent.getByRole('textbox', { name: /^Số điện thoại/ }).fill(phone);
    await parent.getByLabel('Địa chỉ cụ thể').fill(address);
    const send = parent.getByRole('button', { name: 'Gửi yêu cầu' });
    await expect(parent.getByText(/Họ tên, số điện thoại, khu vực và các ghi chú/)).toBeVisible();
    await expect(parent.getByLabel(/Tôi đồng ý chia sẻ số điện thoại/)).toHaveCount(0);
    await send.click();
    await expect(parent).toHaveURL(/\/parent\/requests\/[0-9a-f-]+$/);
    await expect(parent.getByText('Lớp đang tìm gia sư')).toBeVisible();
    const requests = await getData<Items<Request>>(parent, '/parent/requests?status=sourcing');
    expect(requests.total).toBe(1);
    const request = requests.items[0]!;
    expect(request).toBeDefined();
    // The owner's list shows the student name and phone; the exact address stays detail-only.
    expect(request).toMatchObject({ studentName: 'Học sinh E2E', sessionsPerWeek: 2 });
    expect(JSON.stringify(requests)).not.toContain(address);
    const confirmed = await getData<OwnRequest>(parent, `/parent/requests/${request.id}`);
    expect(confirmed).toMatchObject({
      status: 'sourcing',
      publishedClassId: expect.any(String),
      publishedClassCode: expect.stringMatching(/^LH-[A-F0-9]{12}$/),
    });
    const publicClasses = await getData<Items<Class>>(guest, '/classes?subjectId=subj_math');
    const cls = publicClasses.items.find((item) => item.id === confirmed.publishedClassId);
    expect(cls).toMatchObject({ code: confirmed.publishedClassCode, status: 'open' });

    await admin.goto(`/admin/requests?selected=${request.id}`);
    expect((await parent.context().request.get('/api/v1/admin/requests')).status()).toBe(403);
    await expect(admin.getByRole('region', { name: 'Chi tiết yêu cầu' })).toContainText(phone);

    await guest.goto(`/lop-hoc/${cls!.id}`);
    await expect(guest.getByText(new RegExp(`Mã lớp:? ${cls!.code}`))).toBeVisible();
    expect(await guest.locator('body').innerText()).not.toContain(phone);
    expect(await guest.locator('body').innerText()).not.toContain(address);
    const publicClass = await getData<unknown>(guest, `/classes/${cls!.id}`);
    expect(JSON.stringify(publicClass)).not.toContain(phone);
    expect(JSON.stringify(publicClass)).not.toContain(address);
    expect(JSON.stringify(publicClass)).not.toContain('Học sinh E2E');

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
    const adjustmentDialog = tutor.getByRole('dialog', {
      name: 'Bạn có thể điều chỉnh để dạy lớp này?',
    });
    await expect(adjustmentDialog).toContainText('Dạy khối lớp này dù nằm ngoài khối lớp ưu tiên');
    await expect(adjustmentDialog).toContainText('Lớp 10');
    await tutor.setViewportSize({ width: 320, height: 900 });
    await expectNoHorizontalOverflow(tutor);
    await tutor.keyboard.press('Escape');
    await expect(adjustmentDialog).not.toBeVisible();
    await tutor.setViewportSize({ width: 1280, height: 900 });
    expect((await getData<Items<{ classId: string }>>(tutor, '/tutor/applications')).total).toBe(0);
    expect(
      (await getData<{ preferredGrades: string[] }>(tutor, '/tutor/profile')).preferredGrades,
    ).not.toContain('Lớp 10');
    await tutor.getByRole('button', { name: 'Gửi đơn ứng tuyển' }).click();
    await adjustmentDialog.getByRole('button', { name: 'Cập nhật hồ sơ và gửi đơn' }).click();
    await expect(tutor.getByText('Đã gửi đơn ứng tuyển')).toBeVisible();
    expect(
      (await getData<{ preferredGrades: string[] }>(tutor, '/tutor/profile')).preferredGrades,
    ).toEqual(expect.arrayContaining(['Lớp 9', 'Lớp 10']));
    await admin.goto(`/admin/applications?classId=${cls!.id}`);
    const applicationCard = admin.getByRole('article').filter({ hasText: tutorName });
    await applicationCard.getByRole('button', { name: 'Gán gia sư' }).click();
    await admin.getByRole('dialog').getByLabel('Học phí đã chốt (VNĐ/buổi)').fill('180000');
    await admin
      .getByRole('dialog')
      .getByLabel('Tôi xác nhận phụ huynh và gia sư đã thống nhất mức học phí này.')
      .check();
    await admin.getByRole('dialog').getByRole('button', { name: 'Gán và kích hoạt lớp' }).click();
    await expect(admin.getByText(new RegExp(`Đã gán lớp ${cls!.code}`))).toBeVisible();

    await tutor.goto('/tutor/classes');
    await expect(tutor.getByText(cls!.code, { exact: false })).toBeVisible();
    await expect(tutor.getByText(/180\.000\s*₫\/buổi/).first()).toBeVisible();
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
    await expect(tutor.getByRole('article', { name: 'Chi tiết hợp đồng' })).toContainText(
      /180\.000\s*₫\/buổi/,
    );
    await tutor.getByLabel(/Tôi đã đọc nội dung hợp đồng phiên bản/).check();
    await tutor.getByRole('button', { name: 'Xác nhận nội dung hợp đồng' }).click();
    await expect(tutor.getByText('Đã ghi nhận xác nhận nội dung hợp đồng của bạn.')).toBeVisible();

    await parent.reload();
    await expect(parent.getByText('Đã gán gia sư')).toBeVisible();
    await expect(parent.getByText(/180\.000\s*₫\/buổi/).first()).toBeVisible();
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
    await expect(admin.getByRole('link', { name: /Bảng giá & phí/ })).toBeVisible();
    await tutor.goto('/tutor/class-history');
    await expect(tutor.getByRole('heading', { name: 'Lịch sử nhận lớp' })).toBeVisible();
    await expect(tutor.getByRole('heading', { name: 'Chưa có lịch sử lớp học' })).toBeVisible();
  } finally {
    await Promise.all(
      [parent, tutor, admin, outsider, guest].map((page) => page.context().close()),
    );
  }
});

test('tutor contract → public offer → parent join → private contact → completion', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const tutor = await newPage(browser);
  const admin = await newPage(browser);
  const guest = await newPage(browser);
  const parent = await newPage(browser);
  const tutorName = `Gia sư mở lớp E2E ${Date.now()}`;
  const tutorEmail = uniqueEmail('offer-tutor');
  const privateArea = 'Long Biên, Hà Nội';
  const privatePhone = '0900000099';
  const parentPhone = '0900000098';
  const learningNeeds = 'Học sinh cần luyện tập phương trình bậc hai trong E2E.';
  const teachingArea = 'Cầu Giấy, Hà Nội';

  try {
    await signUp(tutor, 'tutor', tutorName, tutorEmail);
    await tutor.goto('/tutor/profile');
    await tutor.getByLabel('Giới thiệu').fill('Gia sư Toán đăng lớp tìm học viên trong E2E.');
    await tutor.getByLabel('Toán').check();
    await tutor.getByLabel(/Học phí/).fill('200000');
    await tutor.getByLabel('Trực tiếp').check();
    await tutor.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await expect(tutor.getByText('Đã lưu.')).toBeVisible();
    await tutor.getByRole('button', { name: 'Gửi duyệt' }).click();
    await expect(tutor.getByText('Đã gửi hồ sơ để duyệt.')).toBeVisible();

    await signIn(admin, E2E_ADMIN.email, E2E_ADMIN.password);
    await admin.goto('/admin/tutors');
    const tutorCard = admin.getByRole('article').filter({ hasText: tutorName });
    await tutorCard.getByRole('button', { name: 'Duyệt & công khai' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Duyệt & công khai' }).click();
    await expect(admin.getByText(`Duyệt & công khai: ${tutorName}.`)).toBeVisible();

    await tutor.goto('/tutor/offers/new');
    await tutor.getByLabel('Môn học').selectOption('subj_math');
    await tutor.getByLabel('Lớp học').selectOption('Lớp 10');
    await tutor.getByLabel('Hình thức dạy').selectOption('offline');
    await tutor.getByLabel('Khu vực chung').fill(privateArea);
    await tutor.getByLabel('Học phí đề xuất (VNĐ/buổi)').fill('220000');
    await tutor.getByLabel('Số điện thoại liên hệ').fill(privatePhone);
    await tutor.getByRole('button', { name: 'Lưu bản nháp' }).click();
    await expect(tutor).toHaveURL(/\/tutor\/offers\/[0-9a-f-]+$/);
    const offerId = tutor.url().split('/').at(-1)!;
    await expect(tutor.getByText('Bản nháp')).toBeVisible();
    expect((await guest.context().request.get(`/api/v1/tutor-offers/${offerId}`)).status()).toBe(
      404,
    );

    const contractId = await publishContent(
      admin,
      'contract',
      'tutor-student-offer-contract',
      'Hợp đồng đăng lớp E2E',
    );
    await tutor.reload();
    await expect(tutor.getByText('Hợp đồng đăng lớp E2E · phiên bản 1')).toBeVisible();
    await tutor.getByLabel(/Tôi đã đọc và đồng ý hợp đồng phiên bản/).check();
    await tutor.getByLabel(/Tôi đồng ý cho phụ huynh có yêu cầu/).check();
    await tutor.getByRole('button', { name: 'Xác nhận hợp đồng và gửi duyệt' }).click();
    await expect(tutor.getByText('Đã gửi lớp và hợp đồng để kiểm duyệt.')).toBeVisible();
    const submitted = await getData<{
      status: string;
      version: number;
      contractRevisionId: string;
      acknowledgedAt: string;
    }>(tutor, `/tutor/offers/${offerId}`);
    expect(submitted).toMatchObject({
      status: 'pending',
      version: 2,
      contractRevisionId: contractId,
    });
    expect(submitted.acknowledgedAt).toBeTruthy();
    expect((await guest.context().request.get(`/api/v1/tutor-offers/${offerId}`)).status()).toBe(
      404,
    );

    await admin.goto('/admin/tutor-offers?status=pending');
    await expect(admin.getByRole('heading', { name: 'Duyệt lớp tìm học viên' })).toBeVisible();
    await admin.getByRole('button', { name: 'Xem hợp đồng và duyệt' }).click();
    await expect(admin.getByRole('dialog')).toContainText('Hợp đồng đăng lớp E2E');
    await admin.getByRole('dialog').getByRole('button', { name: 'Duyệt và công bố' }).click();
    await expect(admin.getByText('Đã duyệt hợp đồng và công bố lớp tìm học viên.')).toBeVisible();

    const publicOffer = await getData<{
      id: string;
      tutorDisplayName: string;
      subjectName: string;
      area: string | null;
      proposedTuitionPerSessionMinor: number;
    }>(guest, `/tutor-offers/${offerId}`);
    expect(publicOffer).toMatchObject({
      id: offerId,
      tutorDisplayName: tutorName,
      subjectName: 'Toán',
      area: null,
      proposedTuitionPerSessionMinor: 220_000,
    });
    expect(JSON.stringify(publicOffer)).not.toContain(tutorEmail);
    expect(JSON.stringify(publicOffer)).not.toContain(privatePhone);
    expect(JSON.stringify(publicOffer)).not.toContain(privateArea);
    const listings = await getData<Items<{ id: string }>>(guest, '/tutor-offers');
    expect(listings.items.some((item) => item.id === offerId)).toBe(true);
    await guest.goto('/lop-tim-hoc-vien');
    await expect(guest.getByRole('heading', { name: 'Lớp tìm học viên' })).toBeVisible();
    await expect(guest.getByText(`Gia sư ${tutorName}`)).toBeVisible();
    await guest.goto(`/lop-tim-hoc-vien/${offerId}`);
    await expect(guest.getByRole('heading', { name: 'Toán · Lớp 10' })).toBeVisible();
    await expect(guest.getByText('Đang tìm học viên')).toBeVisible();
    const body = await guest.locator('body').innerText();
    expect(body).not.toContain(tutorEmail);
    expect(body).not.toContain(privatePhone);
    expect(body).not.toContain(privateArea);

    await signUp(
      parent,
      'student',
      `Phụ huynh tham gia E2E ${Date.now()}`,
      uniqueEmail('offer-parent'),
    );
    await parent.goto(`/parent/lop-tim-hoc-vien/${offerId}`);
    await parent.getByRole('textbox', { name: 'Nhu cầu học tập' }).fill(learningNeeds);
    await parent.getByLabel('Khu vực học chung').fill(teachingArea);
    await parent.getByLabel('Số điện thoại liên hệ riêng').fill(parentPhone);
    await parent.getByLabel(/Tôi đồng ý chia sẻ lớp học, nhu cầu học tập/).check();
    await parent.getByLabel(/Tôi đồng ý chia sẻ số điện thoại của tôi với gia sư đăng lớp/).check();
    await parent.getByRole('button', { name: 'Gửi yêu cầu tham gia lớp' }).click();
    await expect(parent.getByText('Đã gửi yêu cầu tham gia lớp')).toBeVisible();
    const parentJoins = await getData<Items<Versioned & { status: string }>>(
      parent,
      '/parent/tutor-offer-joins',
    );
    const join = parentJoins.items.find((item) => item.status === 'submitted');
    expect(join).toBeDefined();
    const joinId = join!.id;
    const tutorJoins = await getData<
      Items<{ id: string; learningNeeds: string; teachingArea: string }>
    >(tutor, `/tutor/offers/${offerId}/join-requests`);
    expect(tutorJoins.items).toContainEqual(
      expect.objectContaining({ id: joinId, learningNeeds, teachingArea }),
    );
    expect(JSON.stringify(tutorJoins)).not.toContain(parentPhone);
    expect(
      (
        await parent.context().request.get(`/api/v1/parent/tutor-offer-joins/${joinId}/contact`)
      ).status(),
    ).toBe(409);
    expect(
      (
        await tutor
          .context()
          .request.get(`/api/v1/tutor/offers/${offerId}/join-requests/${joinId}/contact`)
      ).status(),
    ).toBe(404);
    await tutor.goto(`/tutor/offers/${offerId}`);
    await expect(tutor.getByText(learningNeeds)).toBeVisible();
    await expect(tutor.getByText(`Khu vực chung: ${teachingArea}`)).toBeVisible();
    expect(await tutor.locator('body').innerText()).not.toContain(parentPhone);

    await admin.goto('/admin/tutor-offer-joins?status=submitted');
    await expect(
      admin.getByRole('heading', { name: 'Yêu cầu tham gia lớp tìm học viên' }),
    ).toBeVisible();
    await admin
      .getByRole('article')
      .filter({ hasText: learningNeeds })
      .getByRole('button', { name: 'Duyệt yêu cầu' })
      .click();
    const joinReview = admin.getByRole('dialog');
    await expect(joinReview).toContainText(parentPhone);
    await expect(joinReview).toContainText(privatePhone);
    await joinReview.getByLabel('Học phí đã chốt (VNĐ/buổi)').fill('210000');
    await joinReview.getByLabel(/Tôi xác nhận phụ huynh và gia sư đã thống nhất/).check();
    await joinReview.getByRole('button', { name: 'Duyệt yêu cầu' }).click();
    await expect(admin.getByText(/Đã duyệt yêu cầu với học phí đã chốt/)).toBeVisible();
    const approvedJoin = await getData<
      Versioned & { status: string; agreedTuitionPerSessionMinor: number }
    >(admin, `/admin/tutor-offer-joins/${joinId}`);
    expect(approvedJoin).toMatchObject({
      status: 'approved',
      agreedTuitionPerSessionMinor: 210_000,
    });
    expect(
      await getData<{ phone: string }>(parent, `/parent/tutor-offer-joins/${joinId}/contact`),
    ).toEqual({ phone: privatePhone });
    expect(
      await getData<{ phone: string }>(
        tutor,
        `/tutor/offers/${offerId}/join-requests/${joinId}/contact`,
      ),
    ).toEqual({ phone: parentPhone });
    await parent.goto(`/parent/tutor-offer-joins/${joinId}`);
    await expect(parent.getByText(/210\.000\s*₫\/buổi/)).toBeVisible();
    await parent.getByRole('button', { name: 'Xem số điện thoại gia sư' }).click();
    await expect(parent.getByRole('link', { name: privatePhone })).toBeVisible();
    await tutor.reload();
    await tutor.getByRole('button', { name: 'Xem số điện thoại phụ huynh' }).click();
    await expect(tutor.getByRole('link', { name: parentPhone })).toBeVisible();

    await admin.goto('/admin/tutor-offer-joins?status=approved');
    await admin
      .getByRole('article')
      .filter({ hasText: learningNeeds })
      .getByRole('button', { name: 'Hoàn tất lớp' })
      .click();
    await admin.getByRole('dialog').getByLabel('Lý do hoàn tất').fill('Buổi học E2E đã hoàn tất.');
    await admin.getByRole('dialog').getByRole('button', { name: 'Xác nhận hoàn tất' }).click();
    await expect(admin.getByText('Đã ghi nhận hoàn tất lớp.')).toBeVisible();
    const completedJoin = await getData<Versioned & { status: string }>(
      admin,
      `/admin/tutor-offer-joins/${joinId}`,
    );
    expect(completedJoin.status).toBe('completed');
    expect(
      (
        await parent.context().request.get(`/api/v1/parent/tutor-offer-joins/${joinId}/contact`)
      ).status(),
    ).toBe(409);
    expect(
      (
        await tutor
          .context()
          .request.get(`/api/v1/tutor/offers/${offerId}/join-requests/${joinId}/contact`)
      ).status(),
    ).toBe(404);
    await parent.reload();
    await expect(parent.getByText('Đã hoàn tất', { exact: true }).first()).toBeVisible();
    await expect(parent.getByRole('button', { name: 'Xem số điện thoại gia sư' })).toHaveCount(0);
    for (const width of [320, 768] as const) {
      for (const [page, route] of [
        [guest, `/lop-tim-hoc-vien/${offerId}`],
        [parent, `/parent/tutor-offer-joins/${joinId}`],
        [tutor, `/tutor/offers/${offerId}`],
        [admin, '/admin/tutor-offer-joins?status=completed'],
      ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
    }
  } finally {
    await Promise.all([tutor, admin, guest, parent].map((page) => page.context().close()));
  }
});

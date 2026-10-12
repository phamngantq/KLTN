import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type {
  AdminComplaintSummary,
  ComplaintCounts,
  ComplaintDetail,
  OwnComplaintSummary,
} from '../../src/shared/schemas/complaints';
import type { PublishedContent } from '../../src/shared/schemas/content';
import type { Page } from '../../src/shared/schemas/discovery';
import type { LearnerPriceGuide, LearnerPriceItem } from '../../src/shared/schemas/pricing';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

const NOW = '2026-10-12T00:00:00.000Z';

async function moderator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

async function create(session: Session, body: Record<string, unknown>) {
  const response = await api(
    '/complaints',
    jsonInit('POST', { classId: null, ...body }, session, {
      'Idempotency-Key': crypto.randomUUID(),
    }),
  );
  return response;
}

async function data<T>(response: Response): Promise<T> {
  return (await response.json<ApiSuccess<T>>()).data;
}

describe('learner complaints: drafts, sending, deletion and filters', () => {
  it('keeps drafts private, edits and sends them with version checks, and deletes only drafts', async () => {
    const learner = await register('parent');
    const other = await register('parent');
    const admin = await moderator();

    const draftResponse = await create(learner, {
      title: 'Yêu cầu hủy hợp đồng',
      body: 'Gia đình chuyển nhà, muốn hủy hợp đồng.',
      submit: false,
    });
    expect(draftResponse.status).toBe(201);
    const draft = await data<ComplaintDetail>(draftResponse);
    expect(draft).toMatchObject({ status: 'draft', submittedAt: null, version: 1 });

    // Drafts never reach the moderator queue or detail.
    const queue = await data<Page<AdminComplaintSummary>>(
      await api('/admin/complaints', { headers: { Cookie: admin.cookie } }),
    );
    expect(queue.items.some((item) => item.id === draft.id)).toBe(false);
    expect(
      (await api(`/admin/complaints/${draft.id}`, { headers: { Cookie: admin.cookie } })).status,
    ).toBe(404);
    expect(
      (await api('/admin/complaints?status=draft', { headers: { Cookie: admin.cookie } })).status,
    ).toBe(422);

    // Other users cannot edit, send or delete it.
    const path = `/complaints/${draft.id}`;
    expect(
      (
        await api(
          path,
          jsonInit(
            'PATCH',
            { classId: null, title: draft.title, body: draft.body, version: 1 },
            other,
          ),
        )
      ).status,
    ).toBe(404);

    const edited = await data<ComplaintDetail>(
      await api(
        path,
        jsonInit(
          'PATCH',
          {
            classId: null,
            title: 'Yêu cầu hủy hợp đồng do thay đổi kế hoạch',
            body: 'Gia đình có kế hoạch di chuyển, muốn hủy hợp đồng và hoàn cọc.',
            version: 1,
          },
          learner,
        ),
      ),
    );
    expect(edited).toMatchObject({ version: 2, status: 'draft' });
    const stale = await api(`${path}/submit`, jsonInit('POST', { version: 1 }, learner));
    expect(stale.status).toBe(409);

    const sent = await data<ComplaintDetail>(
      await api(`${path}/submit`, jsonInit('POST', { version: 2 }, learner)),
    );
    expect(sent.status).toBe('submitted');
    expect(sent.submittedAt).toBeTruthy();
    expect(
      (
        await api(
          path,
          jsonInit(
            'PATCH',
            { classId: null, title: edited.title, body: edited.body, version: 3 },
            learner,
          ),
        )
      ).status,
    ).toBe(409);
    expect((await api(path, jsonInit('DELETE', { version: 3 }, learner))).status).toBe(409);
    const visible = await data<Page<AdminComplaintSummary>>(
      await api('/admin/complaints', { headers: { Cookie: admin.cookie } }),
    );
    expect(visible.items.some((item) => item.id === draft.id)).toBe(true);

    const second = await data<ComplaintDetail>(
      await create(learner, {
        title: 'Bản nháp cần xóa',
        body: 'Nội dung nháp sẽ được xóa.',
        submit: false,
      }),
    );
    expect(
      (await api(`/complaints/${second.id}`, jsonInit('DELETE', { version: 1 }, other))).status,
    ).toBe(404);
    expect(
      (await api(`/complaints/${second.id}`, jsonInit('DELETE', { version: 1 }, learner))).status,
    ).toBe(200);
    expect(
      (await api(`/complaints/${second.id}`, { headers: { Cookie: learner.cookie } })).status,
    ).toBe(404);
    await expect(
      env.DB.prepare('DELETE FROM complaints WHERE id = ?').bind(draft.id).run(),
    ).rejects.toThrow(/COMPLAINT_DELETE_INVALID/);
  });

  it('counts by status and filters by group, keyword and local date', async () => {
    const learner = await register('parent');
    await create(learner, {
      title: 'Nháp về lịch học',
      body: 'Lịch học chưa phù hợp.',
      submit: false,
    });
    const sent = await data<ComplaintDetail>(
      await create(learner, { title: 'Gia sư đến muộn', body: 'Gia sư đến muộn nhiều buổi.' }),
    );
    const counts = await data<ComplaintCounts>(
      await api('/complaints/counts', { headers: { Cookie: learner.cookie } }),
    );
    expect(counts).toEqual({ draft: 1, submitted: 1, in_review: 0, resolved: 0 });

    async function list(query: string) {
      const response = await api(`/complaints?${query}`, { headers: { Cookie: learner.cookie } });
      expect(response.status).toBe(200);
      return data<Page<OwnComplaintSummary>>(response);
    }
    expect((await list('group=draft')).items.map((item) => item.title)).toEqual([
      'Nháp về lịch học',
    ]);
    const processing = await list('group=processing');
    expect(processing.items.map((item) => item.id)).toEqual([sent.id]);
    expect(processing.items[0]?.body).toBe('Gia sư đến muộn nhiều buổi.');
    expect((await list(`q=${encodeURIComponent('muộn')}`)).total).toBe(1);
    expect((await list(`q=${encodeURIComponent(sent.code)}`)).total).toBe(1);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(),
    );
    expect((await list(`from=${today}&to=${today}`)).total).toBe(2);
    expect((await list('to=2020-01-01')).total).toBe(0);
    expect(
      (await api('/complaints?group=unknown', { headers: { Cookie: learner.cookie } })).status,
    ).toBe(422);
  });

  it('caps open complaints when a draft is sent later', async () => {
    const learner = await register('parent');
    for (let i = 0; i < 10; i++) {
      expect(
        (await create(learner, { title: `Khiếu nại số ${i}`, body: 'Nội dung khiếu nại mẫu.' }))
          .status,
      ).toBe(201);
    }
    const draft = await data<ComplaintDetail>(
      await create(learner, {
        title: 'Khiếu nại thứ mười một',
        body: 'Nội dung nháp.',
        submit: false,
      }),
    );
    const response = await api(
      `/complaints/${draft.id}/submit`,
      jsonInit('POST', { version: 1 }, learner),
    );
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('COMPLAINT_QUOTA_EXCEEDED');
  });
});

describe('learner handbook and reference prices', () => {
  async function publishArticle(
    adminId: string,
    slug: string,
    title: string,
    category: string | null,
  ) {
    await env.DB.prepare(
      `INSERT INTO content_revisions (id, kind, slug, audience, revision, edit_version, status,
         title, summary, body_text, category, author_name, created_by, published_by,
         published_at, created_at, updated_at)
       VALUES (?, 'blog', ?, 'public', 1, 1, 'published', ?, 'Tóm tắt', 'Nội dung bài viết mẫu',
         ?, 'Đỗ Hằng', ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), slug, title, category, adminId, adminId, NOW, NOW, NOW)
      .run();
  }

  it('filters published learner articles by category and keyword', async () => {
    const admin = await moderator();
    const tag = crypto.randomUUID().slice(0, 8);
    await publishArticle(
      admin.userId,
      `phu-huynh-chon-${tag}`,
      `Chọn gia sư ${tag}`,
      'choosing_tutor',
    );
    await publishArticle(admin.userId, `phu-huynh-thi-${tag}`, `Ôn thi ${tag}`, 'exam_prep');

    async function list(query: string) {
      const response = await api(`/content?kind=blog&slugPrefix=phu-huynh-&${query}`);
      expect(response.status).toBe(200);
      return data<Page<PublishedContent>>(response);
    }
    const byCategory = await list(`category=exam_prep&q=${tag}`);
    expect(byCategory.items.map((item) => item.title)).toEqual([`Ôn thi ${tag}`]);
    expect(byCategory.items[0]).toMatchObject({ category: 'exam_prep', authorName: 'Đỗ Hằng' });
    expect((await list(`q=${encodeURIComponent(`Chọn gia sư ${tag}`)}`)).total).toBe(1);
    expect((await api('/content?kind=blog&category=unknown')).status).toBe(422);
  });

  it('keeps published category and byline immutable and rejects a category on non-blog content', async () => {
    const admin = await moderator();
    const slug = `phu-huynh-khoa-${crypto.randomUUID().slice(0, 8)}`;
    await publishArticle(admin.userId, slug, 'Bài đã công bố', 'skills');
    await expect(
      env.DB.prepare("UPDATE content_revisions SET category = 'motivation' WHERE slug = ?")
        .bind(slug)
        .run(),
    ).rejects.toThrow(/immutable/);
    const response = await api(
      '/admin/content',
      jsonInit(
        'POST',
        {
          kind: 'faq',
          slug: `faq-${crypto.randomUUID().slice(0, 8)}`,
          audience: 'public',
          title: 'Câu hỏi',
          summary: '',
          bodyText: 'Trả lời',
          category: 'skills',
        },
        admin,
      ),
    );
    expect(response.status).toBe(422);
  });

  it('serves only published learner price guides with subject names', async () => {
    const insert = (
      id: string,
      dimension: string,
      tutorType: string | null,
      subjectId: string | null,
      status: string,
    ) =>
      env.DB.prepare(
        `INSERT INTO learner_price_guides (id, dimension, tutor_type, subject_id, education_level,
           min_price_minor, max_price_minor, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'upper_secondary', 200000, 300000, ?, ?, ?)`,
      )
        .bind(id, dimension, tutorType, subjectId, status, NOW, NOW)
        .run();
    await insert(crypto.randomUUID(), 'tutor_type', 'teacher', null, 'published');
    await insert(crypto.randomUUID(), 'subject', null, 'subj_math', 'published');
    await insert(crypto.randomUUID(), 'subject', null, 'subj_physics', 'draft');
    await expect(
      insert(crypto.randomUUID(), 'subject', 'teacher', 'subj_math', 'published'),
    ).rejects.toThrow(/CHECK/);
    await expect(
      insert(crypto.randomUUID(), 'tutor_type', 'teacher', null, 'published'),
    ).rejects.toThrow(/UNIQUE/);
    const guides = await data<LearnerPriceGuide[]>(await api('/pricing/learner-guides'));
    expect(guides.find((guide) => guide.subjectId === 'subj_math')).toMatchObject({
      dimension: 'subject',
      subjectName: 'Toán',
      educationLevel: 'upper_secondary',
      minPriceMinor: 200_000,
    });
    expect(guides.some((guide) => guide.subjectId === 'subj_physics')).toBe(false);
    expect(guides.find((guide) => guide.tutorType === 'teacher')?.dimension).toBe('tutor_type');
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function upload(session: Session, complaintId: string, file: File) {
  const form = new FormData();
  form.set('file', file);
  return api(`/complaints/${complaintId}/attachments`, {
    method: 'POST',
    body: form,
    headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken },
  });
}

describe('complaint evidence attachments', () => {
  it('accepts signed images or PDFs on own drafts and freezes them once sent', async () => {
    const learner = await register('parent');
    const other = await register('parent');
    const admin = await moderator();
    const draft = await data<ComplaintDetail>(
      await create(learner, {
        title: 'Lịch học bị đổi',
        body: 'Lịch học bị đổi không báo.',
        submit: false,
      }),
    );

    // The declared type is ignored; the signature decides.
    const fake = await upload(
      learner,
      draft.id,
      new File(['<script>'], 'x.png', { type: 'image/png' }),
    );
    expect(fake.status).toBe(422);
    expect(await errorCode(fake)).toBe('COMPLAINT_ATTACHMENT_INVALID');
    const tooBig = await upload(
      learner,
      draft.id,
      new File([PNG, new Uint8Array(1_600_000)], 'lon.png', { type: 'image/png' }),
    );
    expect([413, 422]).toContain(tooBig.status);
    expect((await upload(other, draft.id, new File([PNG], 'a.png'))).status).toBe(404);
    expect((await upload(learner, draft.id, new File([], 'a.png'))).status).toBe(422);
    const noCsrf = await api(`/complaints/${draft.id}/attachments`, {
      method: 'POST',
      body: (() => {
        const form = new FormData();
        form.set('file', new File([PNG], 'a.png'));
        return form;
      })(),
      headers: { Cookie: learner.cookie },
    });
    expect(noCsrf.status).toBe(403);

    const first = await upload(
      learner,
      draft.id,
      new File([PNG], '../../lich hoc.jpg', { type: 'image/jpeg' }),
    );
    expect(first.status).toBe(201);
    const meta = await data<{ id: string; fileName: string; contentType: string }>(first);
    expect(meta).toMatchObject({ fileName: 'lich hoc.png', contentType: 'image/png' });
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect((await upload(learner, draft.id, new File([pdf], 'bien-ban.pdf'))).status).toBe(201);
    expect((await upload(learner, draft.id, new File([PNG], 'b.png'))).status).toBe(201);
    expect((await upload(learner, draft.id, new File([PNG], 'c.png'))).status).toBe(422);

    const detail = await data<ComplaintDetail>(
      await api(`/complaints/${draft.id}`, { headers: { Cookie: learner.cookie } }),
    );
    expect(detail.attachments.map((item) => item.fileName)).toEqual([
      'lich hoc.png',
      'bien-ban.pdf',
      'b.png',
    ]);
    const own = await api(`/complaints/${draft.id}/attachments/${meta.id}`, {
      headers: { Cookie: learner.cookie },
    });
    expect(own.status).toBe(200);
    expect(own.headers.get('Content-Type')).toBe('image/png');
    expect(own.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(PNG);
    const pdfId = detail.attachments[1]!.id;
    const pdfDownload = await api(`/complaints/${draft.id}/attachments/${pdfId}`, {
      headers: { Cookie: learner.cookie },
    });
    expect(pdfDownload.headers.get('Content-Disposition')).toMatch(/^attachment;/);
    expect(
      (
        await api(`/complaints/${draft.id}/attachments/${meta.id}`, {
          headers: { Cookie: other.cookie },
        })
      ).status,
    ).toBe(404);
    // Moderators cannot open evidence of an unsent draft.
    expect(
      (
        await api(`/admin/complaints/${draft.id}/attachments/${meta.id}`, {
          headers: { Cookie: admin.cookie },
        })
      ).status,
    ).toBe(404);

    const removed = await api(
      `/complaints/${draft.id}/attachments/${detail.attachments[2]!.id}`,
      jsonInit('DELETE', {}, learner),
    );
    expect(removed.status).toBe(200);

    await api(`/complaints/${draft.id}/submit`, jsonInit('POST', { version: 1 }, learner));
    expect((await upload(learner, draft.id, new File([PNG], 'd.png'))).status).toBe(409);
    expect(
      (await api(`/complaints/${draft.id}/attachments/${meta.id}`, jsonInit('DELETE', {}, learner)))
        .status,
    ).toBe(409);
    const adminDetail = await data<{ attachments: { id: string }[] }>(
      await api(`/admin/complaints/${draft.id}`, { headers: { Cookie: admin.cookie } }),
    );
    expect(adminDetail.attachments).toHaveLength(2);
    expect(
      (
        await api(`/admin/complaints/${draft.id}/attachments/${meta.id}`, {
          headers: { Cookie: admin.cookie },
        })
      ).status,
    ).toBe(200);
    await expect(
      env.DB.prepare(
        `INSERT INTO complaint_attachments (id, complaint_id, file_name, content_type, size_bytes, data, created_at)
         VALUES (?, ?, 'x.png', 'image/png', 1, X'00', ?)`,
      )
        .bind(crypto.randomUUID(), draft.id, NOW)
        .run(),
    ).rejects.toThrow(/COMPLAINT_ATTACHMENT_INVALID/);
  });
});

describe('grouped learner price items', () => {
  it('serves published items ordered by group and position', async () => {
    const insert = (group: string, label: string, order: number, status = 'published') =>
      env.DB.prepare(
        `INSERT INTO learner_price_items (id, group_key, label, min_price_minor, max_price_minor,
           sort_order, status, created_at, updated_at) VALUES (?, ?, ?, 100000, 200000, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), group, label, order, status, NOW, NOW)
        .run();
    const tag = crypto.randomUUID().slice(0, 6);
    await insert('language', `Tiếng Nhật ${tag}`, 1);
    await insert('talent', `Piano ${tag}`, 2);
    await insert('talent', `Vẽ ${tag}`, 1);
    await insert('primary', `Ẩn ${tag}`, 1, 'draft');
    await expect(insert('talent', `Vẽ ${tag}`, 3)).rejects.toThrow(/UNIQUE/);
    await expect(insert('sports', `Bơi ${tag}`, 1)).rejects.toThrow(/CHECK/);
    const items = await data<LearnerPriceItem[]>(await api('/pricing/learner-items'));
    const mine = items.filter((item) => item.label.endsWith(tag)).map((item) => item.label);
    expect(mine).toEqual([`Vẽ ${tag}`, `Piano ${tag}`, `Tiếng Nhật ${tag}`]);
  });
});

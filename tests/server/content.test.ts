import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { AdminContent, PublishedContent } from '../../src/shared/schemas/content';
import type { Page } from '../../src/shared/schemas/discovery';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

const BODY = {
  title: 'Hướng dẫn chọn gia sư',
  summary: 'Thông tin được kiểm duyệt trước khi công bố.',
  bodyText: 'Bước 1: Xem yêu cầu.\n\nBước 2: Trao đổi về lịch học.',
};

async function moderator(): Promise<Session> {
  const session = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(session.userId).run();
  return session;
}

async function draft(admin: Session, overrides: Record<string, unknown> = {}) {
  const response = await api(
    '/admin/content',
    jsonInit(
      'POST',
      {
        kind: 'guide',
        slug: `guide-${crypto.randomUUID().slice(0, 8)}`,
        audience: 'public',
        ...BODY,
        ...overrides,
      },
      admin,
    ),
  );
  expect(response.status).toBe(201);
  return (await response.json<ApiSuccess<AdminContent>>()).data;
}

async function publish(admin: Session, item: AdminContent) {
  const response = await api(
    `/admin/content/${item.id}/publish`,
    jsonInit('POST', { editVersion: item.editVersion }, admin),
  );
  expect(response.status).toBe(200);
  return (await response.json<ApiSuccess<AdminContent>>()).data;
}

describe('moderated content publishing', () => {
  it('requires a public blog category that can appear in the matching listing', async () => {
    const admin = await moderator();
    const bare = await api(
      '/admin/content',
      jsonInit(
        'POST',
        { kind: 'blog', slug: 'sample-article', audience: 'public', ...BODY },
        admin,
      ),
    );
    expect(bare.status).toBe(422);
    const privateArticle = await api(
      '/admin/content',
      jsonInit(
        'POST',
        { kind: 'blog', slug: 'phu-huynh-sample-article', audience: 'parent', ...BODY },
        admin,
      ),
    );
    expect(privateArticle.status).toBe(422);
    const slug = `phu-huynh-${crypto.randomUUID().slice(0, 8)}`;
    const article = await publish(
      admin,
      await draft(admin, { kind: 'blog', slug, audience: 'public' }),
    );
    const listing = await api('/content?kind=blog&slugPrefix=phu-huynh-&audience=public');
    expect(listing.status).toBe(200);
    const page = (await listing.json<ApiSuccess<Page<PublishedContent>>>()).data;
    expect(page.items).toContainEqual(expect.objectContaining({ id: article.id, slug }));
  });

  it('serves approved initial copy and still permits moderator revisions', async () => {
    const contactResponse = await api('/content/page/contact');
    expect(contactResponse.status).toBe(200);
    const contact = (await contactResponse.json<ApiSuccess<PublishedContent>>()).data;
    expect(contact.bodyText).toContain('Thanh Xuân, Hà Nội');
    expect(contact.bodyText).not.toContain('Giờ làm việc');
    const pricingResponse = await api('/content/page/pricing');
    expect(pricingResponse.status).toBe(200);
    const pricing = (await pricingResponse.json<ApiSuccess<PublishedContent>>()).data;
    expect(pricing.summary).toContain('Phụ huynh miễn phí');
    expect(pricing.bodyText).not.toContain('50%');
    const serviceResponse = await api('/content?kind=service');
    const servicePage = (await serviceResponse.json<ApiSuccess<Page<PublishedContent>>>()).data;
    expect(servicePage.items).toContainEqual(expect.objectContaining({ slug: 'tim-gia-su' }));
    expect((await api('/content/guide/gui-yeu-cau?audience=parent')).status).toBe(401);
    const parent = await register('parent');
    expect(
      (
        await api('/content/guide/gui-yeu-cau?audience=parent', {
          headers: { Cookie: parent.cookie },
        })
      ).status,
    ).toBe(200);
    const admin = await moderator();
    const source = (
      await (
        await api(`/admin/content/${contact.id}`, { headers: { Cookie: admin.cookie } })
      ).json<ApiSuccess<AdminContent>>()
    ).data;
    const revised = await api(
      `/admin/content/${source.id}/revise`,
      jsonInit('POST', { editVersion: source.editVersion }, admin),
    );
    expect(revised.status).toBe(201);
    const draftCopy = (await revised.json<ApiSuccess<AdminContent>>()).data;
    expect(draftCopy).toMatchObject({
      slug: 'contact',
      revision: 2,
      status: 'draft',
      revisedFromId: source.id,
    });
  });

  it('hides drafts, enforces RBAC/CSRF, and keeps only published content public', async () => {
    const admin = await moderator();
    const tutor = await register('tutor');
    const payload = { kind: 'page', slug: 'contact', audience: 'public', ...BODY };
    expect((await api('/admin/content', jsonInit('POST', payload))).status).toBe(401);
    expect((await api('/admin/content', jsonInit('POST', payload, tutor))).status).toBe(403);
    expect(
      (
        await api(
          '/admin/content',
          jsonInit('POST', payload, admin, {
            'X-CSRF-Token': '',
          }),
        )
      ).status,
    ).toBe(403);
    const item = await draft(admin);
    expect(item).toMatchObject({ status: 'draft', editVersion: 1, revision: 1 });
    expect((await api(`/content/guide/${item.slug}`)).status).toBe(404);
    const listing = await api('/content?kind=guide&audience=public');
    expect(listing.status).toBe(200);
    const page = (await listing.json<ApiSuccess<Page<PublishedContent>>>()).data;
    expect(page.items.some((entry) => entry.id === item.id)).toBe(false);
    const adminListing = await api('/admin/content?status=draft', {
      headers: { Cookie: admin.cookie },
    });
    expect(adminListing.status).toBe(200);
    expect((await adminListing.json<ApiSuccess<Page<AdminContent>>>()).data.items).toContainEqual(
      expect.objectContaining({ id: item.id }),
    );
    const wrongVersion = await api(
      `/admin/content/${item.id}/publish`,
      jsonInit('POST', { editVersion: 99 }, admin),
    );
    expect(wrongVersion.status).toBe(409);
    const published = await publish(admin, item);
    expect(published).toMatchObject({ status: 'published', revision: 1, editVersion: 2 });
    expect(published.publishedAt).toBeTruthy();
    const publicResponse = await api(`/content/guide/${item.slug}`);
    expect(publicResponse.status).toBe(200);
    expect((await publicResponse.json<ApiSuccess<PublishedContent>>()).data).toMatchObject({
      id: item.id,
      bodyText: BODY.bodyText,
    });
    const audit = await env.DB.prepare(
      "SELECT action FROM audit_logs WHERE target_type = 'content_revision' AND target_id = ? ORDER BY created_at",
    )
      .bind(item.id)
      .all<{ action: string }>();
    expect(audit.results.map((entry) => entry.action)).toEqual([
      'content.created',
      'content.published',
    ]);
  });

  it('revises through a draft without mutating published history and retires old copy atomically', async () => {
    const admin = await moderator();
    const first = await publish(admin, await draft(admin));
    expect(
      (
        await api(
          `/admin/content/${first.id}`,
          jsonInit('PATCH', { ...BODY, editVersion: first.editVersion }, admin),
        )
      ).status,
    ).toBe(409);
    const reviseResponse = await api(
      `/admin/content/${first.id}/revise`,
      jsonInit('POST', { editVersion: first.editVersion }, admin),
    );
    expect(reviseResponse.status).toBe(201);
    const second = (await reviseResponse.json<ApiSuccess<AdminContent>>()).data;
    expect(second).toMatchObject({
      status: 'draft',
      revision: first.revision + 1,
      revisedFromId: first.id,
    });
    const stalePublish = await api(
      `/admin/content/${second.id}/publish`,
      jsonInit('POST', { editVersion: 99 }, admin),
    );
    expect(stalePublish.status).toBe(409);
    expect((await api(`/content/guide/${first.slug}`)).status).toBe(200);
    const staleEdit = await api(
      `/admin/content/${second.id}`,
      jsonInit('PATCH', { ...BODY, editVersion: 99 }, admin),
    );
    expect(staleEdit.status).toBe(409);
    const editResponse = await api(
      `/admin/content/${second.id}`,
      jsonInit(
        'PATCH',
        { ...BODY, bodyText: 'Nội dung phiên bản mới.', editVersion: second.editVersion },
        admin,
      ),
    );
    expect(editResponse.status).toBe(200);
    const edited = (await editResponse.json<ApiSuccess<AdminContent>>()).data;
    expect(edited.editVersion).toBe(2);
    const next = await publish(admin, edited);
    const old = (
      await (
        await api(`/admin/content/${first.id}`, { headers: { Cookie: admin.cookie } })
      ).json<ApiSuccess<AdminContent>>()
    ).data;
    expect(old).toMatchObject({ status: 'retired', bodyText: BODY.bodyText });
    const publicNow = (
      await (await api(`/content/guide/${first.slug}`)).json<ApiSuccess<PublishedContent>>()
    ).data;
    expect(publicNow).toMatchObject({
      id: next.id,
      revision: 2,
      bodyText: 'Nội dung phiên bản mới.',
    });
    await expect(
      env.DB.prepare('UPDATE content_revisions SET body_text = ? WHERE id = ?')
        .bind('Changed', first.id)
        .run(),
    ).rejects.toThrow();
    const retired = await api(
      `/admin/content/${next.id}/retire`,
      jsonInit('POST', { editVersion: next.editVersion }, admin),
    );
    expect(retired.status).toBe(200);
    expect((await api(`/content/guide/${first.slug}`)).status).toBe(404);
    expect(
      (
        await api(
          `/admin/content/${first.id}/revise`,
          jsonInit('POST', { editVersion: old.editVersion }, admin),
        )
      ).status,
    ).toBe(409);
  });

  it('validates audience and fixed tutor policy slugs without exposing them to other actors', async () => {
    const admin = await moderator();
    const parent = await register('parent');
    const tutor = await register('tutor');
    const terms = await publish(
      admin,
      await draft(admin, {
        kind: 'terms',
        slug: 'tutor-responsibility',
        audience: 'tutor',
        title: 'Điều khoản gia sư',
        bodyText: 'Nội dung điều khoản do kiểm duyệt viên công bố.',
      }),
    );
    const contract = await publish(
      admin,
      await draft(admin, {
        kind: 'contract',
        slug: 'tutor-class-contract',
        audience: 'tutor',
        title: 'Hợp đồng nhận lớp',
        bodyText: 'Nội dung hợp đồng do kiểm duyệt viên công bố.',
      }),
    );
    for (const item of [terms, contract]) {
      const path = `/content/${item.kind}/${item.slug}?audience=tutor`;
      expect((await api(path)).status).toBe(401);
      expect((await api(path, { headers: { Cookie: parent.cookie } })).status).toBe(403);
      const own = await api(path, { headers: { Cookie: tutor.cookie } });
      expect(own.status).toBe(200);
      expect((await own.json<ApiSuccess<PublishedContent>>()).data).toMatchObject({
        id: item.id,
        revision: item.revision,
      });
    }
    expect((await api('/content?kind=terms&audience=tutor')).status).toBe(401);
    const wrongQuery = await api('/content?kind=unknown');
    expect(wrongQuery.status).toBe(422);
    expect(await errorCode(wrongQuery)).toBe('VALIDATION_ERROR');
    const invalidCreate = await api(
      '/admin/content',
      jsonInit(
        'POST',
        {
          kind: 'page',
          slug: 'Bad/Slug',
          audience: 'public',
          title: 'Invalid',
          summary: '',
          bodyText: '<script>alert(1)</script>',
        },
        admin,
      ),
    );
    expect(invalidCreate.status).toBe(422);
  });
});

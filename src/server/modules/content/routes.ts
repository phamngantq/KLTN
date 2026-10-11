import { Hono } from 'hono';
import {
  CONTENT_KINDS,
  adminContentListSchema,
  contentTransitionSchema,
  createContentSchema,
  editContentSchema,
  publicContentDetailSchema,
  publicContentListSchema,
  type AdminContent,
  type ContentAudience,
  type ContentKind,
  type PublishedContent,
} from '../../../shared/schemas/content';
import type { Page } from '../../../shared/schemas/discovery';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as service from './service';

function kindFromPath(value: string): ContentKind {
  const kind = CONTENT_KINDS.find((item) => item === value);
  if (!kind) throw new AppError(404, 'CONTENT_NOT_FOUND', 'Không tìm thấy nội dung.');
  return kind;
}

function audienceGuard(c: { var: AppEnv['Variables'] }, audience: ContentAudience): void {
  if (audience === 'public') return;
  const auth = c.var.auth;
  if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập.');
  if (
    auth.user.role !== 'admin' &&
    ((audience === 'parent' && auth.user.role !== 'student') ||
      (audience === 'tutor' && auth.user.role !== 'tutor'))
  ) {
    throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền xem nội dung này.');
  }
}

/** Mount at /api/v1/content. Anonymous users see only audience=public. */
export const contentRoutes = new Hono<AppEnv>();

contentRoutes.get('/', async (c) => {
  const query = parseQuery(c, publicContentListSchema);
  audienceGuard(c, query.audience);
  return ok<Page<PublishedContent>>(c, await service.listPublished(c.env.DB, query));
});

contentRoutes.get('/:kind/:slug', async (c) => {
  const kind = kindFromPath(c.req.param('kind'));
  const slug = c.req.param('slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    throw new AppError(404, 'CONTENT_NOT_FOUND', 'Không tìm thấy nội dung.');
  }
  const { audience } = parseQuery(c, publicContentDetailSchema);
  audienceGuard(c, audience);
  return ok<PublishedContent>(c, await service.getPublished(c.env.DB, kind, slug, audience));
});

/** Mount at /api/v1/admin/content. All mutations require an admin session + CSRF. */
export const adminContentRoutes = new Hono<AppEnv>();
adminContentRoutes.use('*', requireRole('admin'));

adminContentRoutes.get('/', async (c) =>
  ok<Page<AdminContent>>(
    c,
    await service.listAdmin(c.env.DB, parseQuery(c, adminContentListSchema)),
  ),
);
adminContentRoutes.get('/:id', async (c) =>
  ok<AdminContent>(c, await service.getAdmin(c.env.DB, c.req.param('id'))),
);
adminContentRoutes.post('/', async (c) =>
  ok<AdminContent>(
    c,
    await service.createDraft(
      c.env.DB,
      authOf(c).user.id,
      await parseJsonBody(c, createContentSchema),
    ),
    201,
  ),
);
adminContentRoutes.patch('/:id', async (c) =>
  ok<AdminContent>(
    c,
    await service.editDraft(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, editContentSchema),
    ),
  ),
);
adminContentRoutes.post('/:id/revise', async (c) => {
  const { editVersion } = await parseJsonBody(c, contentTransitionSchema);
  return ok<AdminContent>(
    c,
    await service.revise(c.env.DB, authOf(c).user.id, c.req.param('id'), editVersion),
    201,
  );
});
adminContentRoutes.post('/:id/publish', async (c) => {
  const { editVersion } = await parseJsonBody(c, contentTransitionSchema);
  return ok<AdminContent>(
    c,
    await service.publish(c.env.DB, authOf(c).user.id, c.req.param('id'), editVersion),
  );
});
adminContentRoutes.post('/:id/retire', async (c) => {
  const { editVersion } = await parseJsonBody(c, contentTransitionSchema);
  return ok<AdminContent>(
    c,
    await service.retire(c.env.DB, authOf(c).user.id, c.req.param('id'), editVersion),
  );
});

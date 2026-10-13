import { Hono } from 'hono';
import {
  confirmTutorSchema,
  createParentRequestSchema,
  parentRequestListSchema,
  submitParentRequestSchema,
  updateParentRequestSchema,
  type OwnParentRequest,
  type LearnerStageCounts,
  type ParentRequestListItem,
} from '../../../shared/schemas/requests';
import type { Page } from '../../../shared/schemas/discovery';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as idempotency from '../idempotency/service';
import * as photos from '../tutors/photos';
import { proposedTutorId } from './requests-repository';
import * as service from './requests-service';

/** Mounted at /api/v1/parent/requests; every projection is scoped to the signed-in parent. */
export const parentRequestRoutes = new Hono<AppEnv>();
parentRequestRoutes.use('*', requireRole('student'));

const CREATE_ENDPOINT = 'POST /parent/requests';

parentRequestRoutes.post('/', async (c) => {
  const input = await parseJsonBody(c, createParentRequestSchema);
  const parentId = authOf(c).user.id;
  const key = c.req.header(idempotency.IDEMPOTENCY_HEADER);
  if (!key) {
    throw new AppError(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Cần Idempotency-Key để tạo yêu cầu.');
  }
  const context = await idempotency.buildContext(parentId, CREATE_ENDPOINT, key, input);
  const claim = await idempotency.claim(c.var.db, context);
  if (claim.kind === 'replay') {
    const request = await service.getOwn(c.var.db, parentId, claim.resultRef);
    c.header('Idempotency-Replayed', 'true');
    return ok<OwnParentRequest>(c, request, 201);
  }
  try {
    const request = await service.createDraft(c.var.db, parentId, input, new Date(), (id) => ({
      before: [idempotency.assertOwnedStatement(c.var.db, context, claim)],
      after: [idempotency.completeStatement(c.var.db, context, claim, id, 201)],
    }));
    return ok<OwnParentRequest>(c, request, 201);
  } catch (error) {
    await idempotency.releaseAfterFailure(c.var.db, context, claim, error);
  }
});

parentRequestRoutes.get('/', async (c) => {
  const query = parseQuery(c, parentRequestListSchema);
  return ok<Page<ParentRequestListItem>>(
    c,
    await service.listOwn(c.var.db, authOf(c).user.id, query),
  );
});

parentRequestRoutes.get('/stage-counts', async (c) =>
  ok<LearnerStageCounts>(c, await service.countOwnStages(c.var.db, authOf(c).user.id)),
);

parentRequestRoutes.post('/:id/confirm-tutor', async (c) => {
  const { version, assignmentId } = await parseJsonBody(c, confirmTutorSchema);
  return ok<OwnParentRequest>(
    c,
    await service.confirmTutor(
      c.var.db,
      authOf(c).user.id,
      c.req.param('id'),
      version,
      assignmentId,
    ),
  );
});

parentRequestRoutes.get('/:id/tutor-photo', async (c) => {
  const tutorId = await proposedTutorId(c.var.db, authOf(c).user.id, c.req.param('id'));
  if (!tutorId) throw new AppError(404, 'PROFILE_PHOTO_NOT_FOUND', 'Chưa có ảnh đại diện.');
  return photos.photoResponse(c.env.DB, tutorId);
});

parentRequestRoutes.get('/:id', async (c) =>
  ok<OwnParentRequest>(c, await service.getOwn(c.var.db, authOf(c).user.id, c.req.param('id'))),
);

parentRequestRoutes.patch('/:id', async (c) => {
  const input = await parseJsonBody(c, updateParentRequestSchema);
  return ok<OwnParentRequest>(
    c,
    await service.updateOwn(c.var.db, authOf(c).user.id, c.req.param('id'), input),
  );
});

parentRequestRoutes.post('/:id/submit', async (c) => {
  const input = await parseJsonBody(c, submitParentRequestSchema);
  return ok<OwnParentRequest>(
    c,
    await service.submitOwn(c.var.db, authOf(c).user.id, c.req.param('id'), input.version),
  );
});

import { Hono } from 'hono';
import type { Page } from '../../../shared/schemas/discovery';
import {
  adminComplaintListSchema,
  complaintVersionSchema,
  createComplaintSchema,
  ownComplaintListSchema,
  updateComplaintDraftSchema,
  resolveComplaintSchema,
  triageComplaintSchema,
  type AdminComplaintDetail,
  type AdminComplaintSummary,
  type ComplaintCounts,
  type ComplaintDetail,
  type OwnComplaintSummary,
} from '../../../shared/schemas/complaints';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as idempotency from '../idempotency/service';
import * as service from './complaints-service';

/** Mounted at /api/v1/complaints. List and detail belong only to the signed-in user. */
export const complaintRoutes = new Hono<AppEnv>();
complaintRoutes.use('*', requireRole('student', 'tutor'));

const CREATE_ENDPOINT = 'POST /complaints';

complaintRoutes.post('/', async (c) => {
  const input = await parseJsonBody(c, createComplaintSchema);
  const userId = authOf(c).user.id;
  const key = c.req.header(idempotency.IDEMPOTENCY_HEADER);
  if (!key)
    throw new AppError(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Cần Idempotency-Key để gửi khiếu nại.');
  const context = await idempotency.buildContext(userId, CREATE_ENDPOINT, key, input);
  const claim = await idempotency.claim(c.var.db, context);
  if (claim.kind === 'replay') {
    c.header('Idempotency-Replayed', 'true');
    return ok<ComplaintDetail>(
      c,
      await service.getOwnComplaint(c.var.db, userId, claim.resultRef),
      201,
    );
  }
  try {
    const complaint = await service.createComplaint(c.var.db, userId, input, (id) => ({
      before: [idempotency.assertOwnedStatement(c.var.db, context, claim)],
      after: [idempotency.completeStatement(c.var.db, context, claim, id, 201)],
    }));
    return ok<ComplaintDetail>(c, complaint, 201);
  } catch (error) {
    await idempotency.releaseAfterFailure(c.var.db, context, claim, error);
  }
});

complaintRoutes.get('/', async (c) =>
  ok<Page<OwnComplaintSummary>>(
    c,
    await service.listOwnComplaints(
      c.var.db,
      authOf(c).user.id,
      parseQuery(c, ownComplaintListSchema),
    ),
  ),
);

complaintRoutes.get('/counts', async (c) =>
  ok<ComplaintCounts>(c, await service.countOwnComplaints(c.var.db, authOf(c).user.id)),
);

complaintRoutes.patch('/:id', async (c) => {
  const input = await parseJsonBody(c, updateComplaintDraftSchema);
  return ok<ComplaintDetail>(
    c,
    await service.updateOwnDraft(c.var.db, authOf(c).user.id, c.req.param('id'), input),
  );
});

complaintRoutes.post('/:id/submit', async (c) => {
  const { version } = await parseJsonBody(c, complaintVersionSchema);
  return ok<ComplaintDetail>(
    c,
    await service.submitOwnDraft(c.var.db, authOf(c).user.id, c.req.param('id'), version),
  );
});

complaintRoutes.delete('/:id', async (c) => {
  const { version } = await parseJsonBody(c, complaintVersionSchema);
  await service.deleteOwnDraft(c.var.db, authOf(c).user.id, c.req.param('id'), version);
  return ok(c, { deleted: true });
});

complaintRoutes.get('/:id', async (c) =>
  ok<ComplaintDetail>(
    c,
    await service.getOwnComplaint(c.var.db, authOf(c).user.id, c.req.param('id')),
  ),
);

/** Mounted at /api/v1/admin/complaints. Every projection is moderator-only. */
export const adminComplaintRoutes = new Hono<AppEnv>();
adminComplaintRoutes.use('*', requireRole('admin'));

adminComplaintRoutes.get('/', async (c) =>
  ok<Page<AdminComplaintSummary>>(
    c,
    await service.listAdminComplaints(c.var.db, parseQuery(c, adminComplaintListSchema)),
  ),
);

adminComplaintRoutes.get('/:id', async (c) =>
  ok<AdminComplaintDetail>(
    c,
    await service.getAdminComplaint(c.var.db, c.req.param('id'), authOf(c).user.id),
  ),
);

adminComplaintRoutes.post('/:id/triage', async (c) => {
  const { version, reason } = await parseJsonBody(c, triageComplaintSchema);
  return ok<AdminComplaintDetail>(
    c,
    await service.triageComplaint(c.var.db, authOf(c).user.id, c.req.param('id'), version, reason),
  );
});

adminComplaintRoutes.post('/:id/resolve', async (c) => {
  const { version, resolution } = await parseJsonBody(c, resolveComplaintSchema);
  return ok<AdminComplaintDetail>(
    c,
    await service.resolveComplaint(
      c.var.db,
      authOf(c).user.id,
      c.req.param('id'),
      version,
      resolution,
    ),
  );
});

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
  COMPLAINT_ATTACHMENT_MAX_BYTES,
  type ComplaintAttachment,
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
import * as attachments from './complaint-attachments';
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

/** Multipart upload of one evidence file ("file") to an own draft. */
complaintRoutes.post('/:id/attachments', async (c) => {
  const length = Number(c.req.header('Content-Length') ?? 0);
  if (length > COMPLAINT_ATTACHMENT_MAX_BYTES + 64 * 1024) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Mỗi tệp tối đa 1,5 MB.');
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cần chọn tệp minh chứng.', [
      { path: 'file', message: 'Cần chọn tệp minh chứng.' },
    ]);
  }
  return ok<ComplaintAttachment>(
    c,
    await attachments.addAttachment(c.env.DB, authOf(c).user.id, c.req.param('id'), file),
    201,
  );
});

complaintRoutes.delete('/:id/attachments/:attachmentId', async (c) => {
  await attachments.removeAttachment(
    c.env.DB,
    authOf(c).user.id,
    c.req.param('id'),
    c.req.param('attachmentId'),
  );
  return ok(c, { deleted: true });
});

complaintRoutes.get('/:id/attachments/:attachmentId', (c) =>
  attachments.downloadAttachment(c.env.DB, c.req.param('id'), c.req.param('attachmentId'), {
    userId: authOf(c).user.id,
  }),
);

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

adminComplaintRoutes.get('/:id/attachments/:attachmentId', (c) =>
  attachments.downloadAttachment(c.env.DB, c.req.param('id'), c.req.param('attachmentId'), {
    moderator: true,
  }),
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

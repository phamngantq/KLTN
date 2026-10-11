import { Hono } from 'hono';
import {
  assignClassSchema,
  cancelClassSchema,
  classLifecycleActionSchema,
  tutorAssignmentListSchema,
  type AdminAssignment,
  type AssignedParentContact,
  type ClassLifecycle,
  type TutorAssignment,
  type TutorAssignmentHistory,
} from '../../../shared/schemas/admin-assignments';
import type { Page } from '../../../shared/schemas/discovery';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import { assignClass, getAssignedContact, listTutorAssignments } from './assignments-service';
import {
  cancelOpenClass,
  getClassLifecycle,
  listTutorAssignmentHistory,
  transitionClass,
} from './lifecycle-service';

/** Mount at /api/v1/admin/classes. */
export const adminAssignmentRoutes = new Hono<AppEnv>();
adminAssignmentRoutes.use('*', requireRole('admin'));
adminAssignmentRoutes.post('/:id/assign', async (c) => {
  const input = await parseJsonBody(c, assignClassSchema);
  return ok<AdminAssignment>(
    c,
    await assignClass(c.var.db, authOf(c).user.id, c.req.param('id'), input),
  );
});
adminAssignmentRoutes.get('/:id/lifecycle', async (c) =>
  ok<ClassLifecycle>(c, await getClassLifecycle(c.env.DB, c.req.param('id'))),
);
for (const action of ['revoke', 'complete'] as const) {
  adminAssignmentRoutes.post(`/:id/${action}`, async (c) => {
    const input = await parseJsonBody(c, classLifecycleActionSchema);
    return ok<ClassLifecycle>(
      c,
      await transitionClass(c.env.DB, authOf(c).user.id, c.req.param('id'), action, input),
    );
  });
}
adminAssignmentRoutes.post('/:id/cancel', async (c) => {
  const input = await parseJsonBody(c, cancelClassSchema);
  return ok<ClassLifecycle>(
    c,
    await cancelOpenClass(c.env.DB, authOf(c).user.id, c.req.param('id'), input),
  );
});

/** Mount at /api/v1/tutor/assignments; no contact in public/class DTOs. */
export const tutorAssignmentRoutes = new Hono<AppEnv>();
tutorAssignmentRoutes.use('*', requireRole('tutor'));
tutorAssignmentRoutes.get('/', async (c) =>
  ok<Page<TutorAssignment>>(
    c,
    await listTutorAssignments(
      c.var.db,
      authOf(c).user.id,
      parseQuery(c, tutorAssignmentListSchema),
    ),
  ),
);
tutorAssignmentRoutes.get('/:id/contact', async (c) =>
  ok<AssignedParentContact>(
    c,
    await getAssignedContact(c.var.db, authOf(c).user.id, c.req.param('id')),
  ),
);
tutorAssignmentRoutes.get('/history', async (c) => {
  const { page, pageSize } = parseQuery(c, tutorAssignmentListSchema);
  return ok<Page<TutorAssignmentHistory>>(
    c,
    await listTutorAssignmentHistory(c.env.DB, authOf(c).user.id, page, pageSize),
  );
});

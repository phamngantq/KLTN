import { Hono } from 'hono';
import {
  exceptionInputSchema,
  putWeeklyAvailabilitySchema,
  type AffectedBookings,
  type ExceptionList,
  type ExceptionSaveResult,
  type WeeklyAvailability,
  type WeeklyAvailabilitySaveResult,
} from '../../../shared/schemas/availability';
import { ok } from '../../lib/respond';
import { parseJsonBody } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Mounted at /api/v1/tutor/availability. Tutors manage only their own schedule. */
export const tutorAvailabilityRoutes = new Hono<AppEnv>();

tutorAvailabilityRoutes.use('*', requireRole('tutor'));

tutorAvailabilityRoutes.get('/', async (c) => {
  const data = await service.getWeeklyAvailability(c.var.db, authOf(c).user.id);
  return ok<WeeklyAvailability>(c, data);
});

tutorAvailabilityRoutes.put('/', async (c) => {
  const input = await parseJsonBody(c, putWeeklyAvailabilitySchema);
  const data = await service.putWeeklyAvailability(c.var.db, authOf(c).user.id, input);
  return ok<WeeklyAvailabilitySaveResult>(c, data);
});

tutorAvailabilityRoutes.get('/exceptions', async (c) =>
  ok<ExceptionList>(c, await service.listExceptions(c.var.db, authOf(c).user.id)),
);

tutorAvailabilityRoutes.post('/exceptions', async (c) => {
  const input = await parseJsonBody(c, exceptionInputSchema);
  return ok<ExceptionSaveResult>(
    c,
    await service.createException(c.var.db, authOf(c).user.id, input),
    201,
  );
});

tutorAvailabilityRoutes.patch('/exceptions/:id', async (c) => {
  const input = await parseJsonBody(c, exceptionInputSchema);
  const data = await service.updateException(c.var.db, authOf(c).user.id, c.req.param('id'), input);
  return ok<ExceptionSaveResult>(c, data);
});

tutorAvailabilityRoutes.delete('/exceptions/:id', async (c) => {
  const data = await service.deleteException(c.var.db, authOf(c).user.id, c.req.param('id'));
  return ok<{ deleted: true } & AffectedBookings>(c, data);
});

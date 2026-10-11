import { Hono } from 'hono';
import {
  putWeeklyAvailabilitySchema,
  type WeeklyAvailability,
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
  return ok<WeeklyAvailability>(c, data);
});

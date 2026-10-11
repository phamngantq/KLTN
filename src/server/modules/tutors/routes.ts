import { Hono } from 'hono';
import {
  updateTutorProfileSchema,
  type Subject,
  type TutorProfile,
} from '../../../shared/schemas/tutors';
import { ok } from '../../lib/respond';
import { parseJsonBody } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Mounted at /api/v1/subjects — public catalogue. */
export const subjectRoutes = new Hono<AppEnv>();

subjectRoutes.get('/', async (c) => ok<Subject[]>(c, await service.listSubjects(c.var.db)));

/** Mounted at /api/v1/tutor/profile — the signed-in tutor's own profile only. */
export const tutorProfileRoutes = new Hono<AppEnv>();

tutorProfileRoutes.use('*', requireRole('tutor'));

tutorProfileRoutes.get('/', async (c) =>
  ok<TutorProfile | null>(c, await service.getOwnProfile(c.var.db, authOf(c).user.id)),
);

tutorProfileRoutes.patch('/', async (c) => {
  const input = await parseJsonBody(c, updateTutorProfileSchema);
  return ok<TutorProfile>(c, await service.updateOwnProfile(c.var.db, authOf(c).user.id, input));
});

tutorProfileRoutes.post('/submit', async (c) =>
  ok<TutorProfile>(c, await service.submitForReview(c.var.db, authOf(c).user.id)),
);

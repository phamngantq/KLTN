import { Hono } from 'hono';
import {
  updateTutorProfileSchema,
  type Subject,
  type TutorDocument,
  type TutorProfile,
} from '../../../shared/schemas/tutors';
import { ok } from '../../lib/respond';
import { parseJsonBody } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as documents from './documents';
import * as photos from './photos';
import * as service from './service';

/** Mounted at /api/v1/subjects — public catalogue. */
export const subjectRoutes = new Hono<AppEnv>();

subjectRoutes.get('/', async (c) => ok<Subject[]>(c, await service.listSubjects(c.var.db)));

/** Mounted at /api/v1/tutor/profile — the signed-in tutor's own profile only. */
export const tutorProfileRoutes = new Hono<AppEnv>();

tutorProfileRoutes.use('*', requireRole('tutor'));

tutorProfileRoutes.get('/', async (c) =>
  ok<TutorProfile | null>(c, await service.getOwnProfile(c.var.db, authOf(c).user.id, c.env.DB)),
);

tutorProfileRoutes.patch('/', async (c) => {
  const input = await parseJsonBody(c, updateTutorProfileSchema);
  return ok<TutorProfile>(
    c,
    await service.updateOwnProfile(c.var.db, authOf(c).user.id, input, new Date(), c.env.DB),
  );
});

/** Own avatar: multipart "file" (JPG, PNG or WebP, at most 1 MB). */
tutorProfileRoutes.post('/photo', async (c) => {
  await photos.savePhoto(c.env.DB, authOf(c).user.id, await photos.photoFromRequest(c.req.raw));
  return ok(c, { saved: true });
});
tutorProfileRoutes.delete('/photo', async (c) => {
  await photos.deletePhoto(c.env.DB, authOf(c).user.id);
  return ok(c, { deleted: true });
});
tutorProfileRoutes.get('/photo', (c) => photos.photoResponse(c.env.DB, authOf(c).user.id));

/** Citizen-ID photos and credentials: multipart "file" plus "kind" (at most 1.5 MB). */
tutorProfileRoutes.post('/documents', async (c) => {
  const { file, kind } = await documents.documentFromRequest(c.req.raw);
  return ok<TutorDocument>(
    c,
    await documents.saveDocument(c.env.DB, authOf(c).user.id, kind, file),
    201,
  );
});
tutorProfileRoutes.delete('/documents/:id', async (c) => {
  await documents.deleteDocument(c.env.DB, authOf(c).user.id, c.req.param('id'));
  return ok(c, { deleted: true });
});
tutorProfileRoutes.get('/documents/:id', (c) =>
  documents.documentResponse(c.env.DB, authOf(c).user.id, c.req.param('id')),
);

tutorProfileRoutes.post('/submit', async (c) =>
  ok<TutorProfile>(c, await service.submitForReview(c.var.db, authOf(c).user.id)),
);

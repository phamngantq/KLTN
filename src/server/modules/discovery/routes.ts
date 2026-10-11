import { Hono } from 'hono';
import { tutorSearchSchema, type Page, type PublicTutor } from '../../../shared/schemas/discovery';
import { ok } from '../../lib/respond';
import { parseQuery } from '../../lib/validate';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Mounted at /api/v1/tutors — public, read-only. */
export const discoveryRoutes = new Hono<AppEnv>();

discoveryRoutes.get('/', async (c) => {
  const query = parseQuery(c, tutorSearchSchema);
  return ok<Page<PublicTutor>>(c, await service.searchTutors(c.var.db, query));
});

discoveryRoutes.get('/:slug{[a-z0-9-]{1,80}}', async (c) =>
  ok<PublicTutor>(c, await service.getPublicTutor(c.var.db, c.req.param('slug'))),
);

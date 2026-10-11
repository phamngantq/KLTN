import { Hono } from 'hono';
import { slotQuerySchema, type SlotList } from '../../../shared/schemas/availability';
import { tutorSearchSchema, type Page, type PublicTutor } from '../../../shared/schemas/discovery';
import { ok } from '../../lib/respond';
import { parseQuery } from '../../lib/validate';
import type { AppEnv } from '../../types';
import { listSlots } from '../slots/service';
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

/** Bookable slots of a publicly listed tutor (404 otherwise — no schedule leak for hidden tutors). */
discoveryRoutes.get('/:id{[0-9a-f-]{36}}/slots', async (c) => {
  const query = parseQuery(c, slotQuerySchema);
  const tutor = await service.getPublicTutorById(c.var.db, c.req.param('id'));
  return ok<SlotList>(c, await listSlots(c.var.db, tutor.id, query));
});

import { Hono } from 'hono';
import type { Page } from '../../../shared/schemas/discovery';
import {
  noTutorQuerySchema,
  reportRangeSchema,
  type AdminReportOverview,
  type ConversionReport,
  type NoTutorClass,
  type ParentDashboard,
  type RevenueReport,
  type TutorDashboard,
} from '../../../shared/schemas/reports';
import { ok } from '../../lib/respond';
import { parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Only aggregated, verified D1 state; no mock revenue or user contact. */
export const adminReportRoutes = new Hono<AppEnv>();
adminReportRoutes.use('*', requireRole('admin'));
adminReportRoutes.get('/overview', async (c) =>
  ok<AdminReportOverview>(c, await service.overview(c.env.DB, parseQuery(c, reportRangeSchema))),
);
adminReportRoutes.get('/conversion', async (c) =>
  ok<ConversionReport>(c, await service.conversion(c.env.DB, parseQuery(c, reportRangeSchema))),
);
adminReportRoutes.get('/no-tutor', async (c) =>
  ok<Page<NoTutorClass>>(
    c,
    await service.noTutorClasses(c.env.DB, parseQuery(c, noTutorQuerySchema)),
  ),
);
adminReportRoutes.get('/revenue', (c) =>
  ok<RevenueReport>(c, service.revenue(parseQuery(c, reportRangeSchema))),
);

export const parentDashboardRoutes = new Hono<AppEnv>();
parentDashboardRoutes.get('/', requireRole('student'), async (c) =>
  ok<ParentDashboard>(c, await service.parentDashboard(c.env.DB, authOf(c).user.id)),
);

export const tutorDashboardRoutes = new Hono<AppEnv>();
tutorDashboardRoutes.get('/', requireRole('tutor'), async (c) =>
  ok<TutorDashboard>(c, await service.tutorDashboard(c.env.DB, authOf(c).user.id)),
);

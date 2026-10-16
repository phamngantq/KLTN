import { Hono } from 'hono';
import type { Page } from '../../../shared/schemas/discovery';
import {
  acceptTermsSchema,
  acknowledgeContractSchema,
  acknowledgeTermsSchema,
  adminContractListSchema,
  contractListSchema,
  createQuizSchema,
  editQuizSchema,
  issueContractSchema,
  publishQuizSchema,
  submitQuizSchema,
  type AdminTermsQuiz,
  type AdminContractCandidate,
  placementFeeSchema,
  type ClassContractRecord,
  type TutorQuizAttempt,
  type TutorTerms,
  type TutorTermsAcknowledgement,
  type TutorTermsQuiz,
} from '../../../shared/schemas/terms-contracts';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import { rateLimit } from '../../middleware/rate-limit';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Mounted at /api/v1/tutor. No answer keys or other tutors' records leave this router. */
export const tutorTermsContractRoutes = new Hono<AppEnv>();
tutorTermsContractRoutes.use('*', requireRole('tutor'));
tutorTermsContractRoutes.get('/terms', async (c) =>
  ok<TutorTerms>(c, await service.getTutorTerms(c.env.DB, authOf(c).user.id)),
);
tutorTermsContractRoutes.post('/terms/consent', async (c) =>
  ok<TutorTerms>(
    c,
    await service.acceptTerms(
      c.env.DB,
      authOf(c).user.id,
      await parseJsonBody(c, acceptTermsSchema),
    ),
  ),
);
tutorTermsContractRoutes.get('/terms/quiz', async (c) =>
  ok<TutorTermsQuiz>(c, await service.getTutorQuiz(c.env.DB, authOf(c).user.id)),
);
tutorTermsContractRoutes.post(
  '/terms/attempts',
  rateLimit('BOOKING_LIMITER', (c) => authOf(c).user.id),
  async (c) =>
    ok<TutorQuizAttempt>(
      c,
      await service.submitAttempt(
        c.env.DB,
        authOf(c).user.id,
        await parseJsonBody(c, submitQuizSchema),
      ),
      201,
    ),
);
tutorTermsContractRoutes.post('/terms/acknowledgements', async (c) =>
  ok<TutorTermsAcknowledgement>(
    c,
    await service.acknowledgeTerms(
      c.env.DB,
      authOf(c).user.id,
      await parseJsonBody(c, acknowledgeTermsSchema),
    ),
    201,
  ),
);
tutorTermsContractRoutes.get('/contracts', async (c) => {
  const { page, pageSize } = parseQuery(c, contractListSchema);
  return ok<Page<ClassContractRecord>>(
    c,
    await service.listTutorContracts(c.env.DB, authOf(c).user.id, page, pageSize),
  );
});
tutorTermsContractRoutes.get('/contracts/:id', async (c) =>
  ok<ClassContractRecord>(
    c,
    await service.getContract(c.env.DB, c.req.param('id'), authOf(c).user.id),
  ),
);
tutorTermsContractRoutes.post('/contracts/:id/acknowledge', async (c) =>
  ok<ClassContractRecord>(
    c,
    await service.acknowledgeContract(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, acknowledgeContractSchema),
    ),
  ),
);

/** Mounted at /api/v1/admin. Quiz answers are visible only to moderators. */
export const adminTermsContractRoutes = new Hono<AppEnv>();
adminTermsContractRoutes.use('*', requireRole('admin'));
adminTermsContractRoutes.get('/terms/quizzes', async (c) =>
  ok<AdminTermsQuiz[]>(c, await service.listAdminQuizzes(c.env.DB)),
);
adminTermsContractRoutes.get('/terms/quizzes/:id', async (c) =>
  ok<AdminTermsQuiz>(c, await service.getAdminQuiz(c.env.DB, c.req.param('id'))),
);
adminTermsContractRoutes.post('/terms/quizzes', async (c) =>
  ok<AdminTermsQuiz>(
    c,
    await service.createQuiz(c.env.DB, authOf(c).user.id, await parseJsonBody(c, createQuizSchema)),
    201,
  ),
);
adminTermsContractRoutes.patch('/terms/quizzes/:id', async (c) =>
  ok<AdminTermsQuiz>(
    c,
    await service.editQuiz(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, editQuizSchema),
    ),
  ),
);
adminTermsContractRoutes.post('/terms/quizzes/:id/publish', async (c) => {
  const { editVersion } = await parseJsonBody(c, publishQuizSchema);
  return ok<AdminTermsQuiz>(
    c,
    await service.publishQuiz(c.env.DB, authOf(c).user.id, c.req.param('id'), editVersion),
  );
});
adminTermsContractRoutes.post('/assignments/:id/contracts', async (c) =>
  ok<ClassContractRecord>(
    c,
    await service.issueContract(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, issueContractSchema),
    ),
    201,
  ),
);
adminTermsContractRoutes.post('/contracts/:id/placement-fee', async (c) => {
  const { amountMinor } = await parseJsonBody(c, placementFeeSchema);
  return ok<ClassContractRecord>(
    c,
    await service.recordPlacementFee(c.env.DB, authOf(c).user.id, c.req.param('id'), amountMinor),
  );
});

adminTermsContractRoutes.get('/contracts/candidates', async (c) => {
  const { page, pageSize } = parseQuery(c, contractListSchema);
  return ok<Page<AdminContractCandidate>>(
    c,
    await service.listAdminContractCandidates(c.env.DB, page, pageSize),
  );
});
adminTermsContractRoutes.get('/contracts', async (c) =>
  ok<Page<ClassContractRecord>>(
    c,
    await service.listAdminContracts(c.env.DB, parseQuery(c, adminContractListSchema)),
  ),
);
adminTermsContractRoutes.get('/contracts/:id', async (c) =>
  ok<ClassContractRecord>(c, await service.getContract(c.env.DB, c.req.param('id'))),
);

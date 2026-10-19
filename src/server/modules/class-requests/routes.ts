import { Hono } from 'hono';
import {
  acceptProposalSchema,
  classRequestPageSchema,
  declineProposalSchema,
  proposalListSchema,
  reportTransferSchema,
  type PaymentInstructions,
  type CompletedAcceptance,
  type CompletedClassDetail,
  type IntroductionLetter,
  type TutorProposalItem,
} from '../../../shared/schemas/class-requests';
import type { Page } from '../../../shared/schemas/discovery';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as service from './service';
import type { PaymentEnv } from './service';

/** Mounted at /api/v1/tutor/class-requests; every read is scoped to the signed-in tutor. */
export const tutorClassRequestRoutes = new Hono<AppEnv>();
tutorClassRequestRoutes.use('*', requireRole('tutor'));

tutorClassRequestRoutes.get('/proposals', async (c) =>
  ok<Page<TutorProposalItem>>(
    c,
    await service.listProposals(c.env.DB, authOf(c).user.id, parseQuery(c, proposalListSchema)),
  ),
);
tutorClassRequestRoutes.get('/proposals/:id', async (c) =>
  ok<TutorProposalItem>(
    c,
    await service.getProposal(c.env.DB, authOf(c).user.id, c.req.param('id')),
  ),
);
tutorClassRequestRoutes.get('/proposals/:id/payment', async (c) =>
  ok<PaymentInstructions>(
    c,
    await service.getProposalPayment(
      c.env.DB,
      c.env as PaymentEnv,
      authOf(c).user.id,
      c.req.param('id'),
    ),
  ),
);
tutorClassRequestRoutes.post('/proposals/:id/accept', async (c) => {
  const { termsAgreed } = await parseJsonBody(c, acceptProposalSchema);
  return ok<TutorProposalItem>(
    c,
    await service.respondToProposal(c.env.DB, authOf(c).user.id, c.req.param('id'), {
      accept: true,
      termsAgreed,
    }),
  );
});
tutorClassRequestRoutes.post('/proposals/:id/decline', async (c) => {
  const { reason } = await parseJsonBody(c, declineProposalSchema);
  return ok<TutorProposalItem>(
    c,
    await service.respondToProposal(c.env.DB, authOf(c).user.id, c.req.param('id'), {
      accept: false,
      reason,
    }),
  );
});
tutorClassRequestRoutes.get('/completed', async (c) => {
  const { page, pageSize } = parseQuery(c, classRequestPageSchema);
  return ok<Page<CompletedAcceptance>>(
    c,
    await service.listCompleted(c.env.DB, authOf(c).user.id, page, pageSize),
  );
});
tutorClassRequestRoutes.get('/acceptances/:assignmentId/payment', async (c) =>
  ok<PaymentInstructions>(
    c,
    await service.getPaymentInstructions(
      c.env.DB,
      c.env as PaymentEnv,
      authOf(c).user.id,
      c.req.param('assignmentId'),
    ),
  ),
);
tutorClassRequestRoutes.post('/acceptances/:assignmentId/payment/agree', async (c) => {
  await parseJsonBody(c, reportTransferSchema);
  return ok<PaymentInstructions>(
    c,
    await service.agreeContract(
      c.env.DB,
      c.env as PaymentEnv,
      authOf(c).user.id,
      c.req.param('assignmentId'),
    ),
  );
});
tutorClassRequestRoutes.post('/acceptances/:assignmentId/payment/report', async (c) => {
  await parseJsonBody(c, reportTransferSchema);
  return ok<PaymentInstructions>(
    c,
    await service.reportTransfer(
      c.env.DB,
      c.env as PaymentEnv,
      authOf(c).user.id,
      c.req.param('assignmentId'),
    ),
  );
});
tutorClassRequestRoutes.get('/acceptances/:assignmentId/detail', async (c) =>
  ok<CompletedClassDetail>(
    c,
    await service.getCompletedDetail(c.env.DB, authOf(c).user.id, c.req.param('assignmentId')),
  ),
);
tutorClassRequestRoutes.get('/acceptances/:assignmentId/letter', async (c) =>
  ok<IntroductionLetter>(
    c,
    await service.getIntroductionLetter(c.env.DB, authOf(c).user.id, c.req.param('assignmentId')),
  ),
);

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import { addDays, localToUtc, todayIn, weekdayOf } from '../../src/shared/time';
import type { CreateParentRequestInput } from '../../src/shared/schemas/requests';
import { createDb } from '../../src/server/db/client';
import * as idempotency from '../../src/server/modules/idempotency/service';
import * as bookingService from '../../src/server/modules/bookings/service';
import * as requestService from '../../src/server/modules/parents/requests-service';
import { api, createPublicTutor, jsonInit, register } from './helpers';

const db = createDb(env.DB);

function execute(claim: idempotency.Claim): idempotency.ExecuteClaim {
  if (claim.kind !== 'execute') throw new Error('Expected a fresh claim');
  return claim;
}

async function superseded(actorId: string, endpoint: string, body: unknown) {
  const ctx = await idempotency.buildContext(
    actorId,
    endpoint,
    `lease-${crypto.randomUUID()}`,
    body,
  );
  const first = execute(await idempotency.claim(db, ctx));
  const second = execute(
    await idempotency.claim(
      db,
      ctx,
      new Date(Date.now() + idempotency.STALE_PROCESSING_MS + 2_000),
    ),
  );
  expect(second.attemptId).not.toBe(first.attemptId);
  return { ctx, first, second };
}

function batchStatements(ctx: idempotency.IdempotencyContext, attempt: idempotency.ExecuteClaim) {
  return (id: string) => ({
    before: [idempotency.assertOwnedStatement(db, ctx, attempt)],
    after: [idempotency.completeStatement(db, ctx, attempt, id, 201)],
  });
}

describe('fenced idempotency attempts', () => {
  it('rolls back a superseded booking batch before its booking, slot claims or audit commit', async () => {
    const date = addDays(todayIn('Asia/Ho_Chi_Minh'), 5);
    const tutor = await createPublicTutor();
    await api(
      '/tutor/availability',
      jsonInit(
        'PUT',
        { rules: [{ weekday: weekdayOf(date), start: '08:00', end: '21:00' }] },
        tutor,
      ),
    );
    const parent = await register('parent');
    const body = {
      tutorId: tutor.userId,
      startUtc: localToUtc(date, 18 * 60, 'Asia/Ho_Chi_Minh').toISOString(),
      durationMinutes: 60,
    } as const;
    const { ctx, first, second } = await superseded(parent.userId, 'POST /bookings', body);

    let failed: unknown;
    try {
      await bookingService.createBooking(
        db,
        parent.userId,
        body,
        new Date(),
        batchStatements(ctx, first),
      );
    } catch (error) {
      failed = error;
    }
    expect(failed).toBeDefined();
    await expect(idempotency.releaseAfterFailure(db, ctx, first, failed)).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_CLAIM_LOST',
    });
    const bookingCount = await env.DB.prepare(
      'SELECT count(*) AS n FROM bookings WHERE student_id = ?',
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    const claimCount = await env.DB.prepare(
      'SELECT count(*) AS n FROM booking_slot_claims WHERE tutor_id = ?',
    )
      .bind(tutor.userId)
      .first<{ n: number }>();
    expect(bookingCount?.n).toBe(0);
    expect(claimCount?.n).toBe(0);
    const bookingAudit = await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_logs WHERE actor_id = ? AND action = 'booking.created'",
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    expect(bookingAudit?.n).toBe(0);
    expect(await idempotency.isOwned(db, ctx, second)).toBe(true);
    await idempotency.release(db, ctx, first);
    expect(await idempotency.isOwned(db, ctx, second)).toBe(true);

    const created = await bookingService.createBooking(
      db,
      parent.userId,
      body,
      new Date(),
      batchStatements(ctx, second),
    );
    await idempotency.release(db, ctx, first);
    const replay = await idempotency.claim(db, ctx);
    expect(replay).toEqual({ kind: 'replay', resultRef: created.id });
    const finalCount = await env.DB.prepare(
      'SELECT count(*) AS n FROM bookings WHERE student_id = ?',
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    expect(finalCount?.n).toBe(1);
  });

  it('rolls back a superseded parent request without an orphan private row or audit', async () => {
    const parent = await register('parent');
    const body: CreateParentRequestInput = {
      subjectId: 'subj_math',
      grade: 'Lớp 10',
      mode: 'online',
      area: null,
      expectedBudgetMinor: null,
      description: 'Tìm gia sư Toán.',
      schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
      contactPhone: '0912345678',
      contactAddress: null,
    };
    const { ctx, first, second } = await superseded(parent.userId, 'POST /parent/requests', body);

    let failed: unknown;
    try {
      await requestService.createDraft(
        db,
        parent.userId,
        body,
        new Date(),
        batchStatements(ctx, first),
      );
    } catch (error) {
      failed = error;
    }
    expect(failed).toBeDefined();
    await expect(idempotency.releaseAfterFailure(db, ctx, first, failed)).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_CLAIM_LOST',
    });
    const count = await env.DB.prepare(
      'SELECT count(*) AS n FROM parent_requests WHERE parent_user_id = ?',
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
    const privateCount = await env.DB.prepare(
      'SELECT count(*) AS n FROM parent_request_private WHERE request_id IN (SELECT id FROM parent_requests WHERE parent_user_id = ?)',
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    const requestAudit = await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_logs WHERE actor_id = ? AND action = 'parent_request.created'",
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    expect(privateCount?.n).toBe(0);
    expect(requestAudit?.n).toBe(0);
    expect(await idempotency.isOwned(db, ctx, second)).toBe(true);
    await idempotency.release(db, ctx, first);
    expect(await idempotency.isOwned(db, ctx, second)).toBe(true);

    const created = await requestService.createDraft(
      db,
      parent.userId,
      body,
      new Date(),
      batchStatements(ctx, second),
    );
    await idempotency.release(db, ctx, first);
    const replay = await idempotency.claim(db, ctx);
    expect(replay).toEqual({ kind: 'replay', resultRef: created.id });
    const finalCount = await env.DB.prepare(
      'SELECT count(*) AS n FROM parent_requests WHERE parent_user_id = ?',
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    expect(finalCount?.n).toBe(1);
  });

  it('lets only one caller take over the same stale claim', async () => {
    const parent = await register('parent');
    const ctx = await idempotency.buildContext(
      parent.userId,
      'POST /parent/requests',
      `lease-${crypto.randomUUID()}`,
      { subjectId: 'subj_math' },
    );
    const first = execute(await idempotency.claim(db, ctx));
    const takeoverTime = new Date(Date.now() + idempotency.STALE_PROCESSING_MS + 2_000);
    const outcomes = await Promise.allSettled([
      idempotency.claim(db, ctx, takeoverTime),
      idempotency.claim(db, ctx, takeoverTime),
    ]);
    const winners = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const losers = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const winner = winners[0];
    const loser = losers[0];
    if (!winner || winner.status !== 'fulfilled' || !loser || loser.status !== 'rejected') {
      throw new Error('Expected one takeover winner and one loser');
    }
    expect(loser.reason).toMatchObject({ status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' });
    const newest = execute(winner.value);
    expect(newest.attemptId).not.toBe(first.attemptId);
    await idempotency.release(db, ctx, first);
    expect(await idempotency.isOwned(db, ctx, newest)).toBe(true);
  });

  it('creates one request for concurrent HTTP retries with the same key', async () => {
    const parent = await register('parent');
    const body: CreateParentRequestInput = {
      subjectId: 'subj_math',
      grade: 'Lớp 10',
      mode: 'online',
      area: null,
      expectedBudgetMinor: null,
      description: 'Tìm gia sư Toán.',
      schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
      contactPhone: '0912345678',
      contactAddress: null,
    };
    const key = `lease-${crypto.randomUUID()}`;
    const create = () =>
      api('/parent/requests', jsonInit('POST', body, parent, { 'Idempotency-Key': key }));
    const responses = await Promise.all([create(), create(), create()]);
    const ids = new Set<string>();
    for (const response of responses) {
      if (response.status === 201) {
        ids.add((await response.json<ApiSuccess<OwnParentRequest>>()).data.id);
      } else {
        expect(response.status).toBe(409);
        expect((await response.json<{ error: { code: string } }>()).error.code).toBe(
          'IDEMPOTENCY_IN_PROGRESS',
        );
      }
    }
    expect(ids.size).toBe(1);
    const count = await env.DB.prepare(
      'SELECT count(*) AS n FROM parent_requests WHERE parent_user_id = ?',
    )
      .bind(parent.userId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
    const replay = await create();
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    expect((await replay.json<ApiSuccess<OwnParentRequest>>()).data.id).toBe([...ids][0]);
  });
});

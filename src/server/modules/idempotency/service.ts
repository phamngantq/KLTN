/**
 * Idempotency-Key handling for critical mutations. Each processing attempt owns a UUID lease in
 * result_ref; completion replaces it with the durable result ID in the SAME batch as the mutation.
 * Keys are scoped by (actor, endpoint, key).
 */
import { and, eq, exists, not, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { idempotencyKeys } from '../../db/schema';
import { sha256Hex } from '../../lib/crypto';
import { AppError } from '../../lib/errors';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const TTL_MS = 24 * 60 * 60 * 1000;
/** A 'processing' row older than this is considered abandoned (e.g. isolate crashed). */
export const STALE_PROCESSING_MS = 60_000;

const keySchema = z.string().regex(/^[A-Za-z0-9_.:-]{8,255}$/);

export interface IdempotencyContext {
  actorId: string;
  endpoint: string;
  key: string;
  requestHash: string;
}

export type Claim = { kind: 'execute'; attemptId: string } | { kind: 'replay'; resultRef: string };

export type ExecuteClaim = Extract<Claim, { kind: 'execute' }>;

/** Deterministic JSON (sorted keys) of an already-validated payload. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function buildContext(
  actorId: string,
  endpoint: string,
  rawKey: string,
  payload: unknown,
): Promise<IdempotencyContext> {
  if (!keySchema.safeParse(rawKey).success) {
    throw new AppError(
      422,
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key không hợp lệ (8–255 ký tự a-z, 0-9, _ . : -).',
    );
  }
  return { actorId, endpoint, key: rawKey, requestHash: await sha256Hex(canonical(payload)) };
}

const pk = (ctx: IdempotencyContext) =>
  and(
    eq(idempotencyKeys.actorId, ctx.actorId),
    eq(idempotencyKeys.endpoint, ctx.endpoint),
    eq(idempotencyKeys.idempotencyKey, ctx.key),
  );

async function tryInsert(
  db: Db,
  ctx: IdempotencyContext,
  now: Date,
  attemptId: string,
): Promise<boolean> {
  const rows = await db
    .insert(idempotencyKeys)
    .values({
      actorId: ctx.actorId,
      endpoint: ctx.endpoint,
      idempotencyKey: ctx.key,
      requestHash: ctx.requestHash,
      status: 'processing',
      resultRef: attemptId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.idempotencyKey });
  return rows.length === 1;
}

/** Decides whether this request executes the mutation or replays a stored result. */
export async function claim(db: Db, ctx: IdempotencyContext, now = new Date()): Promise<Claim> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptId = crypto.randomUUID();
    if (await tryInsert(db, ctx, now, attemptId)) return { kind: 'execute', attemptId };

    const row = await db.select().from(idempotencyKeys).where(pk(ctx)).get();
    if (!row) continue; // deleted concurrently (failed attempt released it) — try again

    if (row.expiresAt <= now.toISOString()) {
      await db
        .delete(idempotencyKeys)
        .where(and(pk(ctx), eq(idempotencyKeys.expiresAt, row.expiresAt)));
      continue;
    }
    if (row.requestHash !== ctx.requestHash) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key đã được dùng cho một yêu cầu khác.',
      );
    }
    if (row.status === 'completed' && row.resultRef)
      return { kind: 'replay', resultRef: row.resultRef };

    if (Date.parse(row.createdAt) + STALE_PROCESSING_MS < now.getTime()) {
      // Compare-and-set takeover of an abandoned attempt: only one caller can win.
      const taken = await db
        .update(idempotencyKeys)
        .set({ createdAt: now.toISOString(), resultRef: attemptId })
        .where(
          and(
            pk(ctx),
            eq(idempotencyKeys.status, 'processing'),
            eq(idempotencyKeys.createdAt, row.createdAt),
          ),
        )
        .returning({ key: idempotencyKeys.idempotencyKey });
      if (taken.length === 1) return { kind: 'execute', attemptId };
    }
    throw new AppError(
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      'Yêu cầu đang được xử lý. Vui lòng thử lại sau giây lát.',
    );
  }
  throw new AppError(
    409,
    'IDEMPOTENCY_IN_PROGRESS',
    'Yêu cầu đang được xử lý. Vui lòng thử lại sau giây lát.',
  );
}

const owned = (db: Db, ctx: IdempotencyContext, attempt: ExecuteClaim) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(idempotencyKeys)
      .where(
        and(
          pk(ctx),
          eq(idempotencyKeys.requestHash, ctx.requestHash),
          eq(idempotencyKeys.status, 'processing'),
          eq(idempotencyKeys.resultRef, attempt.attemptId),
        ),
      ),
  );

/**
 * Put this FIRST in the mutation batch. The statement inserts zero rows for the owning attempt.
 * If its lease was taken over/deleted/completed, it deliberately inserts an invalid status. The
 * idempotency_keys CHECK constraint then aborts the entire D1 transaction, including the mutation.
 * A conditional UPDATE alone would affect zero rows and silently leave an orphan result.
 */
export function assertOwnedStatement(
  db: Db,
  ctx: IdempotencyContext,
  attempt: ExecuteClaim,
): BatchItem<'sqlite'> {
  return db.insert(idempotencyKeys).select(
    sql`SELECT ${ctx.actorId}, ${ctx.endpoint}, ${ctx.key}, ${ctx.requestHash},
        'invalid', NULL, NULL, '', '' WHERE ${not(owned(db, ctx, attempt))}`,
  );
}

export async function isOwned(
  db: Db,
  ctx: IdempotencyContext,
  attempt: ExecuteClaim,
): Promise<boolean> {
  const row = await db
    .select({ key: idempotencyKeys.idempotencyKey })
    .from(idempotencyKeys)
    .where(
      and(
        pk(ctx),
        eq(idempotencyKeys.requestHash, ctx.requestHash),
        eq(idempotencyKeys.status, 'processing'),
        eq(idempotencyKeys.resultRef, attempt.attemptId),
      ),
    )
    .get();
  return !!row;
}

/** Statement that marks the key completed; include it in the mutation's batch for atomicity. */
export function completeStatement(
  db: Db,
  ctx: IdempotencyContext,
  attempt: ExecuteClaim,
  resultRef: string,
  status: number,
): BatchItem<'sqlite'> {
  return db
    .update(idempotencyKeys)
    .set({ status: 'completed', resultRef, responseStatus: status })
    .where(
      and(
        pk(ctx),
        eq(idempotencyKeys.status, 'processing'),
        eq(idempotencyKeys.resultRef, attempt.attemptId),
      ),
    );
}

/** Frees the key after a failed attempt so the client may retry with it. */
export async function release(
  db: Db,
  ctx: IdempotencyContext,
  attempt: ExecuteClaim,
): Promise<void> {
  await db
    .delete(idempotencyKeys)
    .where(
      and(
        pk(ctx),
        eq(idempotencyKeys.status, 'processing'),
        eq(idempotencyKeys.resultRef, attempt.attemptId),
      ),
    );
}

/** Converts a failed, superseded attempt into a retryable conflict without touching its successor. */
export async function releaseAfterFailure(
  db: Db,
  ctx: IdempotencyContext,
  attempt: ExecuteClaim,
  error: unknown,
): Promise<never> {
  if (!(await isOwned(db, ctx, attempt))) {
    throw new AppError(
      409,
      'IDEMPOTENCY_CLAIM_LOST',
      'Yêu cầu đã được tiếp quản bởi lần thử khác. Vui lòng thử lại.',
    );
  }
  await release(db, ctx, attempt);
  throw error;
}

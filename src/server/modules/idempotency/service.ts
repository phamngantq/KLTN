/**
 * Idempotency-Key handling for critical mutations (POST /bookings).
 * Row lifecycle: processing → completed (written in the SAME batch as the mutation) or deleted on
 * failure so a retry can run again. Keys are scoped by (actor, endpoint, key).
 */
import { and, eq } from 'drizzle-orm';
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

export type Claim = { kind: 'execute' } | { kind: 'replay'; resultRef: string };

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

async function tryInsert(db: Db, ctx: IdempotencyContext, now: Date): Promise<boolean> {
  const rows = await db
    .insert(idempotencyKeys)
    .values({
      actorId: ctx.actorId,
      endpoint: ctx.endpoint,
      idempotencyKey: ctx.key,
      requestHash: ctx.requestHash,
      status: 'processing',
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
    if (await tryInsert(db, ctx, now)) return { kind: 'execute' };

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
        .set({ createdAt: now.toISOString() })
        .where(
          and(
            pk(ctx),
            eq(idempotencyKeys.status, 'processing'),
            eq(idempotencyKeys.createdAt, row.createdAt),
          ),
        )
        .returning({ key: idempotencyKeys.idempotencyKey });
      if (taken.length === 1) return { kind: 'execute' };
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

/** Statement that marks the key completed; include it in the mutation's batch for atomicity. */
export function completeStatement(
  db: Db,
  ctx: IdempotencyContext,
  resultRef: string,
  status: number,
): BatchItem<'sqlite'> {
  return db
    .update(idempotencyKeys)
    .set({ status: 'completed', resultRef, responseStatus: status })
    .where(and(pk(ctx), eq(idempotencyKeys.status, 'processing')));
}

/** Frees the key after a failed attempt so the client may retry with it. */
export async function release(db: Db, ctx: IdempotencyContext): Promise<void> {
  await db.delete(idempotencyKeys).where(and(pk(ctx), eq(idempotencyKeys.status, 'processing')));
}
